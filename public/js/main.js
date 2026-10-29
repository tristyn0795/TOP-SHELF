// TOP SHELF front end: a 16-bit console-style shell around the game.
// Every screen is a set of pixel "windows" driven by a cursor (keyboard, gamepad, mouse or touch).
import { TEAMS, PERKS, CONFERENCES } from '/shared/teams.js';
import * as L from '/shared/league.js';
import { rand } from '/shared/rng.js';
import { Input, mountTouch } from './input.js';
import { Audio } from './audio.js';
import { load, save, remove } from './storage.js';
import { LocalGame, OnlineGame } from './game-client.js';
import { Nav } from './menu.js';
import { crest, crestURL } from './crest.js';
import { drawText } from './render.js';

const $app = document.getElementById('app');
const $ = (sel) => document.querySelector(sel);
const input = new Input();
const audio = new Audio();
const EXH = L.buildTeams(1994);
const CODE_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const app = {
  league: load('franchise'),
  prefs: Object.assign({ periodLen: 180, difficulty: 'pro', penalties: true, icing: true, replays: true }, load('prefs', {})),
  game: null,
  attract: null,
  paused: false,
  net: null,
  cur: null,
  titleOpen: false,
  sel: { season: 0, away: 0, home: 16, online: 0 },
  newLg: { seasonLength: 32, seriesLen: 7, seed: null, preview: null },
  exh: { ctrlA: 'p1', ctrlH: 'cpu' },
  online: { step: 'team', code: ['A', 'A', 'A', 'A'], notice: '', onlinePeriod: 180 },
  pg: {},
  prefer: null,
  optReturn: null,
};

const PERIODS = [[120, '2 MIN'], [180, '3 MIN'], [300, '5 MIN'], [480, '8 MIN'], [600, '10 MIN'], [1200, '20 MIN']];
const OPTS = {
  periodLen: PERIODS,
  onlinePeriod: PERIODS.slice(0, 4),
  difficulty: [['rookie', 'ROOKIE'], ['pro', 'PRO'], ['allstar', 'ALL-STAR']],
  penalties: [[true, 'ON'], [false, 'OFF']],
  icing: [[true, 'ON'], [false, 'OFF']],
  replays: [[true, 'ON'], [false, 'OFF']],
  muted: [[false, 'ON'], [true, 'OFF']],
  seasonLength: L.SEASON_LENGTHS.map((x) => [x, `${x} GAMES`]),
  seriesLen: L.SERIES_LENGTHS.map((x) => [x, `BEST OF ${x}`]),
  ctrlA: [['cpu', 'CPU'], ['p1', 'PLAYER 1'], ['p2', 'PLAYER 2']],
  ctrlH: [['cpu', 'CPU'], ['p1', 'PLAYER 1'], ['p2', 'PLAYER 2']],
};

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const rec = (r) => `${r.w}-${r.l}-${r.otl}`;
const mmss = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
const pct = (n, d) => (d ? (n / d).toFixed(3).replace(/^0/, '') : '-');
const isFranchise = (sp) => !!app.league && sp.rosters === app.league.teams;
const T = (id) => TEAMS[id];
const ORD = ['1ST', '2ND', '3RD'];

function persist() { if (app.league) save('franchise', app.league); }
function savePrefs() { save('prefs', app.prefs); }

// ---------------------------------------------------------------- building blocks

const win = (title, body, cls = '', style = '') =>
  `<section class="win ${cls}" ${style}>${title ? `<h2>${title}</h2>` : ''}${body}</section>`;

const mi = (act, label, sub = '', extra = '') =>
  `<button class="mi" data-act="${act}" ${extra}>${label}${sub ? `<small>${sub}</small>` : ''}</button>`;

const btn = (act, label, extra = '', cls = '') => `<button class="btn ${cls}" data-act="${act}" ${extra}>${label}</button>`;

function opt(label, scope, k, cur) {
  const choices = OPTS[k];
  const i = Math.max(0, choices.findIndex(([v]) => String(v) === String(cur)));
  return `<button class="opt" data-act="optStep" data-scope="${scope}" data-k="${k}" data-left="optBack" data-right="optStep">
    <span class="ol">${label}</span><span class="ov"><i>◀</i> ${choices[i][1]} <i>▶</i></span></button>`;
}

function bars(r) {
  const rows = [['OFFENSE', r.off], ['DEFENSE', r.def], ['GOALTENDING', r.gk], ['SKATING', r.spd], ['CHECKING', r.chk], ['OVERALL', r.all]];
  return `<div class="bars">${rows.map(([l, v]) => `<div class="bar"><span>${l}</span><i style="--v:${barPct(v)}%"></i><b>${v}</b></div>`).join('')}</div>`;
}
const barPct = (v) => Math.max(6, Math.min(100, Math.round(((v - 55) / 37) * 100)));

function teamLine(id, cls = '') {
  return `<span class="tline ${cls}">${crest(T(id), 'sm')}<span>${esc(T(id).city)}</span></span>`;
}

// ---------------------------------------------------------------- navigation + rendering

const A = {};
const nav = new Nav({
  run: (act, el, d) => A[act]?.(d, el),
  sound: (n) => audio.play(n),
  isActive: () => !app.game || app.paused,
});

document.addEventListener('click', (e) => {
  audio.unlock();
  const el = e.target.closest('[data-act]');
  if (!el) return;
  let act = el.dataset.act;
  if (el.classList.contains('opt') && e.target.closest('.ov i:first-child')) act = 'optBack';
  const fn = A[act];
  if (!fn) return;
  e.preventDefault();
  audio.play('select');
  fn(el.dataset, el);
});
window.addEventListener('keydown', (e) => {
  audio.unlock();
  if (app.cur === titleScreen && !app.titleOpen && !e.repeat && !['Tab', 'ShiftLeft', 'ShiftRight'].includes(e.code)) {
    e.preventDefault();
    e.stopImmediatePropagation();
    A.pressStart();
  }
}, true);

function stopGame() {
  if (app.game) { app.game.destroy(); app.game = null; }
  app.paused = false;
  input.active = false;
  input.onPause = null;
  document.removeEventListener('keydown', speedKey);
}

function screen(fn) {
  stopGame();
  if (fn !== titleScreen) stopAttract();
  app.cur = fn;
  render();
}

function render() {
  const out = app.cur();
  $app.className = out.cls || '';
  $app.innerHTML = out.html;
  out.after?.();
  nav.onFocus = out.onFocus || null;
  nav.refresh({ back: out.back || null, page: out.page || null, prefer: app.prefer || out.prefer || null });
  app.prefer = null;
}

// ---------------------------------------------------------------- options

function scopeObj(scope) {
  return { league: app.league?.settings, exh: app.exh, newLg: app.newLg, online: app.online, prefs: app.prefs }[scope];
}

function stepOpt(d, dir, el) {
  if (d.scope === 'audio') {
    audio.setMuted(!audio.muted);
    if (app.cur) render();
    else if (el) el.querySelector('.ov').innerHTML = `<i>◀</i> ${audio.muted ? 'OFF' : 'ON'} <i>▶</i>`;
    return;
  }
  const obj = scopeObj(d.scope);
  const choices = OPTS[d.k];
  const i = choices.findIndex(([v]) => String(v) === String(obj[d.k]));
  obj[d.k] = choices[(i + dir + choices.length) % choices.length][0];
  if (d.k === 'ctrlA' || d.k === 'ctrlH') {
    const other = d.k === 'ctrlA' ? 'ctrlH' : 'ctrlA';
    if (obj[d.k] !== 'cpu' && obj[other] === obj[d.k]) obj[other] = obj[d.k] === 'p1' ? 'p2' : 'p1';
  }
  if (d.scope === 'league') persist();
  else if (d.scope === 'prefs') savePrefs();
  audio.play('blip');
  render();
}
A.optStep = (d, el) => stepOpt(d, 1, el);
A.optBack = (d, el) => stepOpt(d, -1, el);

// ---------------------------------------------------------------- attract / title

const SILENT = { crowd() {}, events() {}, play() {} };
const NO_INPUT = { read: () => [], onAny: null };

function fitAttract() {
  if (!app.attract) return;
  const ih = Math.max(300, Math.min(640, Math.round((400 * innerHeight) / innerWidth)));
  app.attract.r.resize(ih);
}

function startAttract() {
  document.body.classList.add('attract-on');
  if (app.attract) return;
  const cv = document.getElementById('attract');
  const run = () => {
    const a = Math.floor(Math.random() * 32);
    let b = Math.floor(Math.random() * 31);
    if (b >= a) b++;
    const g = new LocalGame({
      canvas: cv, input: NO_INPUT, audio: SILENT,
      teams: [L.gameTeam(EXH, a, false), L.gameTeam(EXH, b, true)], teamDefs: [T(a), T(b)], homeIdx: 1,
      cfg: { periodLen: 120 }, humans: [], replays: false,
      onEnd: () => { if (app.attract === g) { g.destroy(); app.attract = null; run(); } },
    });
    app.attract = g;
    g.start();
    fitAttract();
  };
  run();
}

function stopAttract() {
  document.body.classList.remove('attract-on');
  if (app.attract) { app.attract.destroy(); app.attract = null; }
}

function drawLogo() {
  const c = $('#logo');
  if (!c) return;
  const g = c.getContext('2d');
  g.clearRect(0, 0, c.width, c.height);
  const x = c.width / 2;
  drawText(g, 'TOP SHELF', x + 3, 5, '#000000', 3, 'center');
  drawText(g, 'TOP SHELF', x + 1, 3, '#e8202c', 3, 'center');
  drawText(g, 'TOP SHELF', x, 2, '#f8e000', 3, 'center');
  g.save();
  g.beginPath(); g.rect(0, 0, c.width, 12); g.clip();
  drawText(g, 'TOP SHELF', x, 2, '#ffffff', 3, 'center');
  g.restore();
  // stick + puck underline
  g.fillStyle = '#000';
  g.fillRect(20, 29, 120, 3);
  g.fillStyle = '#c8a165';
  g.fillRect(20, 28, 116, 2);
  g.fillStyle = '#1a1a1a';
  g.fillRect(136, 28, 12, 3);
  g.fillRect(156, 28, 6, 3);
}

function titleScreen() {
  const lg = app.league;
  const items = [];
  if (lg) items.push(mi('continue', 'CONTINUE SEASON', `${esc(T(lg.userTeam).fullName)} · ${rec(lg.teams[lg.userTeam].rec)}`, 'data-default="1"'));
  items.push(
    mi('newSeason', 'NEW SEASON', 'TAKE OVER A CLUB'),
    mi('exhibition', 'EXHIBITION', 'ONE GAME · 1P · 2P · CPU'),
    mi('online', 'ONLINE', 'CHALLENGE A FRIEND BY CODE'),
    mi('howto', 'INSTRUCTIONS'),
    mi('options', 'OPTIONS'),
  );
  return {
    cls: 'scr-title',
    html: `
      <div class="title-ui">
        <canvas id="logo" width="170" height="34"></canvas>
        <div class="subtitle">PRO HOCKEY · 32 CLUBS · ONE SILVER CUP</div>
        ${app.titleOpen
          ? win('MAIN MENU', `<div class="menu-list">${items.join('')}</div>`, 'title-menu')
          : `<button class="press-start" data-act="pressStart"><span class="blink">PRESS START</span></button>`}
        <div class="legal">© 2026 TOP SHELF · ALL CLUBS AND PLAYERS FICTIONAL · NOT AFFILIATED WITH ANY LEAGUE</div>
      </div>`,
    after: () => { drawLogo(); startAttract(); },
    back: app.titleOpen ? () => { app.titleOpen = false; render(); } : null,
  };
}

A.pressStart = () => { audio.unlock(); audio.play('select'); app.titleOpen = true; render(); };
A.home = () => { app.titleOpen = true; screen(titleScreen); };
A.continue = () => screen(seasonScreen);
window.addEventListener('resize', () => { fitAttract(); fit(); });

// ---------------------------------------------------------------- team select

function teamPanel(slot, label, rosters, confirmAct, extra = '') {
  const id = app.sel[slot];
  const t = T(id);
  const r = L.teamRatings(rosters[id]);
  return win(label, `
    <div class="tp-top">
      <button class="arrow" data-act="teamStep" data-slot="${slot}" data-d="-1">◀</button>
      <button class="tp-main" data-act="${confirmAct}" data-slot="${slot}" data-left="teamPrev" data-right="teamNext">
        ${crest(t, 'xl')}
      </button>
      <button class="arrow" data-act="teamStep" data-slot="${slot}" data-d="1">▶</button>
    </div>
    <div class="tp-city">${esc(t.city).toUpperCase()}</div>
    <div class="tp-name">${esc(t.name).toUpperCase()}</div>
    <div class="tp-arena">${esc(t.arena).toUpperCase()} · ${t.confName.toUpperCase()} CONF.</div>
    ${bars(r)}
    <div class="tp-spec"><span>SPECIALTY</span><b>${PERKS[t.perk].name.toUpperCase()}</b><small>${esc(PERKS[t.perk].desc)}</small></div>
    ${extra}`, 'team-panel', `style="--p:${t.primary};--s:${t.secondary}"`);
}

function strip(slot) {
  return `<div class="strip">${TEAMS.map((t) => `<button class="sc ${app.sel[slot] === t.id ? 'on' : ''}" data-act="teamJump" data-slot="${slot}" data-id="${t.id}" title="${esc(t.fullName)}"><img src="${crestURL(t)}" alt="${t.abbr}"></button>`).join('')}</div>`;
}

function stepTeam(slot, d) {
  let v = (app.sel[slot] + d + 32) % 32;
  const other = slot === 'away' ? 'home' : slot === 'home' ? 'away' : null;
  if (other && v === app.sel[other]) v = (v + d + 32) % 32;
  app.sel[slot] = v;
  audio.play('blip');
  render();
}
A.teamStep = (d) => stepTeam(d.slot, +d.d);
A.teamPrev = (d) => stepTeam(d.slot, -1);
A.teamNext = (d) => stepTeam(d.slot, 1);
A.teamJump = (d) => {
  const other = d.slot === 'away' ? 'home' : d.slot === 'home' ? 'away' : null;
  if (other && +d.id === app.sel[other]) return;
  app.sel[d.slot] = +d.id;
  app.prefer = `.tp-main[data-slot="${d.slot}"]`;
  render();
};

// ---------------------------------------------------------------- new season

function previewLeague() {
  if (!app.newLg.preview) {
    app.newLg.seed = (Math.random() * 4294967296) >>> 0;
    app.newLg.preview = L.createLeague({ userTeam: 0, seed: app.newLg.seed });
  }
  return app.newLg.preview;
}

function seasonTeamScreen() {
  const pv = previewLeague();
  return {
    html: `
      <header class="topbar"><h1>NEW SEASON</h1><span>STEP 1 OF 2 · CHOOSE YOUR CLUB</span></header>
      <div class="pick-one">${teamPanel('season', 'SELECT CLUB', pv.teams, 'seasonOpts')}</div>
      ${strip('season')}
      <div class="btnrow">${btn('seasonOpts', 'CONFIRM ▶', '', 'red')}${btn('home', 'BACK')}</div>`,
    back: A.home,
    prefer: '.tp-main',
  };
}

function seasonOptsScreen() {
  const n = app.newLg, p = app.prefs, t = T(app.sel.season);
  return {
    html: `
      <header class="topbar"><h1>NEW SEASON</h1><span>STEP 2 OF 2 · SEASON SETUP</span></header>
      <div class="cols">
        ${win('YOUR CLUB', `<div class="club-sum">${crest(t, 'lg')}<div><b>${esc(t.fullName).toUpperCase()}</b><small>${t.divName.toUpperCase()} DIVISION · ${PERKS[t.perk].name.toUpperCase()}</small></div></div>
          <p class="note">You're behind the bench. Play your games, sim the ones you don't want to, and chase the Silver Cup.</p>`)}
        ${win('SEASON SETUP', `
          ${opt('SEASON', 'newLg', 'seasonLength', n.seasonLength)}
          ${opt('PLAYOFF SERIES', 'newLg', 'seriesLen', n.seriesLen)}
          ${opt('PERIOD LENGTH', 'prefs', 'periodLen', p.periodLen)}
          ${opt('DIFFICULTY', 'prefs', 'difficulty', p.difficulty)}
          ${opt('PENALTIES', 'prefs', 'penalties', p.penalties)}
          ${opt('ICING', 'prefs', 'icing', p.icing)}
          <div class="btnrow">${btn('createLeague', 'START SEASON ▶', '', 'red default')}${btn('newSeason', 'BACK')}</div>`)}
      </div>`,
    back: () => screen(seasonTeamScreen),
  };
}

A.newSeason = () => {
  if (app.cur !== seasonOptsScreen) app.newLg.preview = null;
  screen(seasonTeamScreen);
};
A.seasonOpts = () => screen(seasonOptsScreen);
A.createLeague = () => {
  if (app.league && !confirm('Start a new season? Your current season save will be replaced.')) return;
  app.league = L.createLeague({
    userTeam: app.sel.season, seed: app.newLg.seed, seasonLength: app.newLg.seasonLength, seriesLen: app.newLg.seriesLen,
    periodLen: app.prefs.periodLen, difficulty: app.prefs.difficulty, penalties: app.prefs.penalties, icing: app.prefs.icing,
  });
  app.newLg.preview = null;
  persist();
  screen(seasonScreen);
};

// ---------------------------------------------------------------- season menu

function phaseLabel(lg) {
  if (lg.phase === 'season') return `${lg.year} · GAME ${Math.min(lg.day + 1, lg.schedule.length)} OF ${lg.schedule.length}`;
  if (lg.phase === 'playoffs') return `${lg.year} PLAYOFFS · ${L.ROUND_NAMES[lg.playoffs.rounds[lg.playoffs.cur].length].toUpperCase()}`;
  return `${lg.year} · SEASON OVER`;
}

function nextLabel(lg, g) {
  if (lg.phase === 'season') return `GAME ${lg.day + 1} OF ${lg.schedule.length}`;
  const s = g.series;
  return `${L.ROUND_NAMES[lg.playoffs.rounds[lg.playoffs.cur].length].toUpperCase()} · GAME ${s.games.length + 1} · SERIES ${T(s.hi).abbr} ${s.w[0]}-${s.w[1]} ${T(s.lo).abbr}`;
}

function miniStand(lg) {
  const me = T(lg.userTeam);
  const rows = L.standings(lg, (t) => t.conf === me.conf && t.div === me.div);
  return `<table class="tbl"><tr><th class="l">${me.divName.toUpperCase()}</th><th>GP</th><th>W</th><th>L</th><th>OT</th><th>PTS</th></tr>
    ${rows.map((t) => `<tr class="${t.id === lg.userTeam ? 'me' : ''}"><td class="l">${teamLine(t.id)}</td><td>${t.rec.gp}</td><td>${t.rec.w}</td><td>${t.rec.l}</td><td>${t.rec.otl}</td><td><b>${t.rec.pts}</b></td></tr>`).join('')}</table>`;
}

function resultRow(lg, g) {
  const me = lg.userTeam, home = g.h === me, opp = home ? g.a : g.h;
  if (!g.res) return `<div class="rrow"><em>${home ? 'VS' : 'AT'}</em>${teamLine(opp)}<b class="dim">-</b></div>`;
  const my = home ? g.res.hs : g.res.as, their = home ? g.res.as : g.res.hs, w = my > their;
  return `<div class="rrow"><em>${home ? 'VS' : 'AT'}</em>${teamLine(opp)}<b class="${w ? 'good' : 'bad'}">${w ? 'W' : g.res.dec === 'REG' ? 'L' : 'OTL'} ${my}-${their}${g.res.dec !== 'REG' ? ' ' + g.res.dec : ''}</b></div>`;
}

function userGames(lg) {
  return lg.schedule.map((day) => day.find((x) => x.h === lg.userTeam || x.a === lg.userTeam));
}

function leaderRows(lg, stat, n, fmt = (v) => v) {
  const rows = L.leaders(lg, stat, n).filter((r) => r.v > 0 || stat === 'gaa');
  if (!rows.length) return '<p class="note">No stats yet. Play some games!</p>';
  return `<table class="tbl">${rows.map((r, i) => `<tr class="${r.tid === lg.userTeam ? 'me' : ''}"><td>${i + 1}</td><td class="l">${crest(T(r.tid), 'sm')} ${esc(r.p.first[0])}. ${esc(r.p.name).toUpperCase()}</td><td>${T(r.tid).abbr}</td><td><b>${fmt(r.v)}</b></td></tr>`).join('')}</table>`;
}

function bracketHtml(lg, round) {
  return `<div class="bracket">${round.map((s) => `
    <div class="series ${s.hi === lg.userTeam || s.lo === lg.userTeam ? 'me' : ''}">
      <div class="${s.winner === s.hi ? 'won' : s.winner === s.lo ? 'lost' : ''}">${crest(T(s.hi), 'sm')} ${T(s.hi).abbr}<b>${s.w[0]}</b></div>
      <div class="${s.winner === s.lo ? 'won' : s.winner === s.hi ? 'lost' : ''}">${crest(T(s.lo), 'sm')} ${T(s.lo).abbr}<b>${s.w[1]}</b></div>
    </div>`).join('')}</div>`;
}

function preview(kind) {
  const lg = app.league;
  const g = L.userGameToday(lg);
  switch (kind) {
    case 'next': {
      if (!g) return '';
      const r = (id) => (lg.phase === 'season' ? rec(lg.teams[id].rec) : `${lg.teams[id].rec.pts} PTS`);
      return `<div class="pv-label">${nextLabel(lg, g)}</div>
        <div class="vs-mini">
          <div>${crest(T(g.a), 'lg')}<b>${esc(T(g.a).city).toUpperCase()}</b><small>${esc(T(g.a).name).toUpperCase()} · ${r(g.a)}</small></div>
          <em>AT</em>
          <div>${crest(T(g.h), 'lg')}<b>${esc(T(g.h).city).toUpperCase()}</b><small>${esc(T(g.h).name).toUpperCase()} · ${r(g.h)}</small></div>
        </div>
        <p class="note center">${esc(T(g.h).arena).toUpperCase()}</p>`;
    }
    case 'out': return `<div class="pv-label">ELIMINATED</div><p class="note">The playoffs carry on without you. Sim ahead to see who lifts the Silver Cup.</p>`;
    case 'champ': {
      const ch = lg.playoffs?.champion;
      return ch == null ? '' : `<div class="pv-label">${lg.year} SILVER CUP CHAMPIONS</div><div class="center">${crest(T(ch), 'xl')}<p><b>${esc(T(ch).fullName).toUpperCase()}</b></p><p class="note">${ch === lg.userTeam ? 'YOUR CLUB WON IT ALL!' : 'Next season starts with every player a year older.'}</p></div>`;
    }
    case 'recent': {
      const done = userGames(lg).filter((x) => x?.res).slice(-6).reverse();
      return `<div class="pv-label">RECENT RESULTS</div>${done.length ? done.map((x) => resultRow(lg, x)).join('') : '<p class="note">No games played yet.</p>'}`;
    }
    case 'standings':
      return `<div class="pv-label">DIVISION RACE</div>${miniStand(lg)}`;
    case 'schedule': {
      const up = userGames(lg).slice(lg.day, lg.day + 6);
      return `<div class="pv-label">UP NEXT</div>${up.length ? up.map((x) => resultRow(lg, x)).join('') : '<p class="note">Regular season complete.</p>'}`;
    }
    case 'roster': {
      const t = lg.teams[lg.userTeam];
      const top = t.roster.filter((p) => p.pos !== 'G').sort((a, b) => b.s.g + b.s.a - (a.s.g + a.s.a) || L.ovr(b) - L.ovr(a)).slice(0, 6);
      const gk = t.roster.find((p) => p.id === t.lines.G[0]);
      return `<div class="pv-label">YOUR TOP PLAYERS</div><table class="tbl">${top.map((p) => `<tr><td>#${p.num}</td><td class="l">${esc(p.first[0])}. ${esc(p.name).toUpperCase()}</td><td>${p.pos}</td><td>${L.ovr(p)}</td><td><b>${p.s.g + p.s.a} PTS</b></td></tr>`).join('')}</table>
        <p class="note">STARTING GOALIE: #${gk.num} ${esc(gk.name).toUpperCase()} (${L.ovr(gk)})</p>`;
    }
    case 'leaders': return `<div class="pv-label">POINTS LEADERS</div>${leaderRows(lg, 'pts', 6)}`;
    case 'news': return `<div class="pv-label">NEWS WIRE</div>${lg.news.slice(0, 5).map((n) => `<p class="news">${esc(n.text)}</p>`).join('')}`;
    case 'bracket': return lg.playoffs ? `<div class="pv-label">${L.ROUND_NAMES[lg.playoffs.rounds[lg.playoffs.cur].length].toUpperCase()}</div>${bracketHtml(lg, lg.playoffs.rounds[lg.playoffs.cur])}` : preview('standings');
    case 'options': return `<div class="pv-label">OPTIONS</div><p class="note">Period length, difficulty, penalties, icing, sound and replays.</p>`;
    case 'exit': return `<div class="pv-label">SAVE & EXIT</div><p class="note">Your season is saved in this browser after every game.</p>`;
    default: return '';
  }
}

function seasonScreen() {
  const lg = app.league;
  if (!lg) return titleScreen();
  const t = T(lg.userTeam), me = lg.teams[lg.userTeam];
  const g = L.userGameToday(lg);
  const items = [];
  if (lg.phase === 'done') items.push(mi('nextSeason', 'START NEXT SEASON', '', 'data-preview="champ"'));
  if (g) {
    items.push(mi('play', 'PLAY NEXT GAME', '', 'data-preview="next"'), mi('watch', 'WATCH NEXT GAME', '', 'data-preview="next"'), mi('simDay', 'SIM NEXT GAME', '', 'data-preview="next"'));
  } else if (lg.phase !== 'done') items.push(mi('simDay', 'SIM NEXT DAY', '', 'data-preview="out"'));
  if (lg.phase === 'season') items.push(mi('simWeek', 'SIM 7 DAYS', '', 'data-preview="recent"'), mi('simPlayoffs', 'SIM TO PLAYOFFS', '', 'data-preview="standings"'));
  if (lg.phase !== 'done') items.push(mi('simEnd', 'SIM TO FINAL', '', 'data-preview="bracket"'));
  items.push(
    mi('pages', 'STANDINGS', '', 'data-k="standings" data-preview="standings"'),
    mi('pages', 'SCHEDULE', '', 'data-k="schedule" data-preview="schedule"'),
    mi('pages', 'ROSTER & LINES', '', 'data-k="roster" data-preview="roster"'),
    mi('pages', 'LEAGUE LEADERS', '', 'data-k="leaders" data-preview="leaders"'),
    mi('pages', 'NEWS WIRE', '', 'data-k="news" data-preview="news"'),
    mi('options', 'OPTIONS', '', 'data-preview="options"'),
    mi('home', 'SAVE & EXIT', '', 'data-preview="exit"'),
  );
  return {
    html: `
      <header class="statusbar" style="--p:${t.primary};--s:${t.secondary}">
        ${crest(t, 'lg')}
        <div><h1>${esc(t.fullName).toUpperCase()}</h1><span>${rec(me.rec)} · ${me.rec.pts} PTS · ${phaseLabel(lg)}</span></div>
      </header>
      <div class="season-grid">
        ${win('SEASON MENU', `<div class="menu-list">${items.join('')}</div>`, 'season-menu')}
        ${win('', '<div id="preview"></div>', 'preview-win')}
      </div>`,
    back: A.home,
    onFocus: (el) => {
      const pv = $('#preview');
      if (pv && el.dataset.preview) pv.innerHTML = preview(el.dataset.preview);
    },
  };
}

function simUntil(cond) {
  const lg = app.league;
  let guard = 0;
  while (cond(lg) && guard++ < 400) L.simDay(lg);
  persist();
  render();
}
A.simDay = () => { let n = 0; simUntil((lg) => lg.phase !== 'done' && n++ < 1); };
A.simWeek = () => { let n = 0; simUntil((lg) => lg.phase === 'season' && n++ < 7); };
A.simPlayoffs = () => simUntil((lg) => lg.phase === 'season');
A.simEnd = () => simUntil((lg) => lg.phase !== 'done');
A.nextSeason = () => { L.startNextSeason(app.league); persist(); render(); };

// ---------------------------------------------------------------- paged stat screens

function chunk(arr, n) {
  const out = [];
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n));
  return out.length ? out : [[]];
}

function standTable(lg, rows, cut) {
  return `<div class="scroll"><table class="tbl"><tr><th class="l">CLUB</th><th>GP</th><th>W</th><th>L</th><th>OTL</th><th>PTS</th><th>GF</th><th>GA</th><th>DIFF</th><th>STRK</th></tr>
    ${rows.map((t, i) => { const r = t.rec; return `<tr class="${t.id === lg.userTeam ? 'me' : ''} ${cut && i === cut - 1 ? 'cut' : ''}"><td class="l">${teamLine(t.id)}</td><td>${r.gp}</td><td>${r.w}</td><td>${r.l}</td><td>${r.otl}</td><td><b>${r.pts}</b></td><td>${r.gf}</td><td>${r.ga}</td><td>${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td><td>${r.streak || '-'}</td></tr>`; }).join('')}</table></div>`;
}

function rosterTable(t, players, lineOf) {
  return `<div class="scroll"><table class="tbl"><tr><th>LN</th><th>#</th><th class="l">NAME</th><th>POS</th><th>AGE</th><th>OVR</th><th>SPD</th><th>SHT</th><th>ACC</th><th>PAS</th><th>HND</th><th>CHK</th><th>DEF</th><th>GP</th><th>G</th><th>A</th><th>PTS</th></tr>
    ${players.map((p) => `<tr><td>${lineOf[p.id] || ''}</td><td>${p.num}</td><td class="l">${esc(p.first[0])}. ${esc(p.name).toUpperCase()} <small class="dim">${p.arch.toUpperCase()}</small></td><td>${p.pos}</td><td>${p.age}</td><td><b>${L.ovr(p)}</b></td>
      ${['spd', 'sht', 'acc', 'pas', 'hnd', 'chk', 'def'].map((k) => `<td class="r${Math.floor(p.r[k] / 10)}">${p.r[k]}</td>`).join('')}<td>${p.s.gp}</td><td>${p.s.g}</td><td>${p.s.a}</td><td><b>${p.s.g + p.s.a}</b></td></tr>`).join('')}</table></div>`;
}

const PAGES = {
  standings(lg) {
    const pages = CONFERENCES.map((c, ci) => ({ title: `${c.name.toUpperCase()} CONFERENCE`, html: standTable(lg, L.standings(lg, (t) => t.conf === ci), 8) + '<p class="note">TOP 8 IN EACH CONFERENCE MAKE THE PLAYOFFS.</p>' }));
    CONFERENCES.forEach((c, ci) => c.divisions.forEach((d, di) => pages.push({ title: `${d.toUpperCase()} DIVISION`, html: standTable(lg, L.standings(lg, (t) => t.conf === ci && t.div === di)) })));
    if (lg.playoffs) lg.playoffs.rounds.forEach((round) => pages.push({ title: L.ROUND_NAMES[round.length].toUpperCase(), html: bracketHtml(lg, round) }));
    return pages;
  },
  schedule(lg) {
    const games = userGames(lg).map((g, i) => `<div class="srow ${i === lg.day && lg.phase === 'season' ? 'now' : ''}"><em>G${i + 1}</em>${resultRow(lg, g)}</div>`);
    const pages = chunk(games, 12).map((c, i) => ({ title: `REGULAR SEASON ${i + 1}`, html: c.join('') }));
    if (lg.playoffs) {
      const po = [];
      for (const round of lg.playoffs.rounds) for (const s of round) {
        if (s.hi !== lg.userTeam && s.lo !== lg.userTeam) continue;
        s.games.forEach((g, i) => po.push(`<div class="srow"><em>P${i + 1}</em>${resultRow(lg, { h: g.h, a: g.a, res: g })}</div>`));
      }
      if (po.length) pages.push({ title: 'PLAYOFFS', html: po.join('') });
    }
    return pages;
  },
  roster(lg) {
    const t = lg.teams[lg.userTeam];
    const lineOf = {};
    t.lines.F.forEach((l, i) => l.forEach((id) => (lineOf[id] = `F${i + 1}`)));
    t.lines.D.forEach((l, i) => l.forEach((id) => (lineOf[id] = `D${i + 1}`)));
    const by = (pos) => t.roster.filter((p) => pos.includes(p.pos)).sort((a, b) => (lineOf[a.id] || 'Z').localeCompare(lineOf[b.id] || 'Z') || L.ovr(b) - L.ovr(a));
    const P = Object.fromEntries(t.roster.map((p) => [p.id, p]));
    const nm = (id) => `#${P[id].num} ${esc(P[id].name).toUpperCase()}`;
    return [
      { title: 'FORWARDS', html: rosterTable(t, by(['C', 'LW', 'RW']), lineOf) },
      { title: 'DEFENSE', html: rosterTable(t, by(['D']), lineOf) },
      {
        title: 'GOALIES',
        html: `<div class="scroll"><table class="tbl"><tr><th></th><th>#</th><th class="l">NAME</th><th>AGE</th><th>OVR</th><th>GK</th><th>REB</th><th>GP</th><th>W</th><th>L</th><th>OTL</th><th>SV%</th><th>SO</th></tr>
          ${t.roster.filter((p) => p.pos === 'G').map((p) => `<tr><td>${t.lines.G[0] === p.id ? '<b>STARTER</b>' : btn('starter', 'START', `data-id="${p.id}"`, 'mini')}</td><td>${p.num}</td><td class="l">${esc(p.first)} ${esc(p.name).toUpperCase()}</td><td>${p.age}</td><td><b>${L.ovr(p)}</b></td><td>${p.r.gk}</td><td>${p.r.reb}</td><td>${p.s.gp}</td><td>${p.s.w}</td><td>${p.s.l}</td><td>${p.s.otl}</td><td>${pct(p.s.sa - p.s.ga, p.s.sa)}</td><td>${p.s.so}</td></tr>`).join('')}</table></div>`,
      },
      {
        title: 'LINES',
        html: `<div class="lines">${t.lines.F.map((l, i) => `<div><em>F${i + 1}</em>${l.map(nm).join(' · ')}</div>`).join('')}${t.lines.D.map((l, i) => `<div><em>D${i + 1}</em>${l.map(nm).join(' · ')}</div>`).join('')}</div>
          <p class="note">Lines are set from player ratings. The power play sends out F1 and D1. SPECIALTY: ${PERKS[T(lg.userTeam).perk].name.toUpperCase()}, ${esc(PERKS[T(lg.userTeam).perk].desc)}</p>`,
      },
    ];
  },
  leaders(lg) {
    return [
      ['POINTS', 'pts'], ['GOALS', 'g'], ['ASSISTS', 'a'], ['HITS', 'hits'],
      ['SAVE PERCENTAGE', 'svp', (v) => v.toFixed(3).replace(/^0/, '')], ['GOALS AGAINST / GAME', 'gaa', (v) => v.toFixed(2)], ['GOALIE WINS', 'w'],
    ].map(([title, stat, fmt]) => ({ title, html: leaderRows(lg, stat, 10, fmt) }));
  },
  news(lg) {
    const items = lg.news.map((n) => `<p class="news"><em>${n.year} D${n.day + 1}</em> ${esc(n.text)}</p>`);
    if (lg.champions.length) items.push(`<p class="news"><em>CUP</em> ${lg.champions.map((c) => `${c.year}: ${esc(T(c.team).fullName)}`).join(' · ')}</p>`);
    return chunk(items, 10).map((c, i) => ({ title: `NEWS WIRE ${i + 1}`, html: c.join('') }));
  },
};

function pagerScreen(kind) {
  return () => {
    const pages = PAGES[kind](app.league);
    const n = pages.length;
    const i = Math.min(app.pg[kind] || 0, n - 1);
    return {
      html: `
        <section class="win pager">
          <h2 class="pager-h">${btn('pgStep', '◀', 'data-d="-1"', 'mini')}<span>${pages[i].title}</span><small>${i + 1}/${n}</small>${btn('pgStep', '▶', 'data-d="1"', 'mini')}</h2>
          ${pages[i].html}
        </section>
        <div class="btnrow">${btn('seasonBack', 'BACK', '', 'default')}<span class="hint">◀ ▶ TO FLIP PAGES</span></div>`,
      back: A.seasonBack,
      page: (d) => { app.pg[kind] = (i + d + n) % n; audio.play('blip'); render(); },
    };
  };
}

A.pages = (d) => { app.pgKind = d.k; screen(pagerScreen(d.k)); };
A.pgStep = (d) => { const k = app.pgKind; const n = PAGES[k](app.league).length; app.pg[k] = ((app.pg[k] || 0) + +d.d + n) % n; render(); };
A.seasonBack = () => { app.prefer = app.pgKind ? `.mi[data-k="${app.pgKind}"]` : null; screen(seasonScreen); };
A.starter = (d) => {
  const t = app.league.teams[app.league.userTeam];
  t.lines.G = [d.id, t.lines.G.find((x) => x !== d.id)];
  persist();
  render();
};

// ---------------------------------------------------------------- franchise games

function franchiseSpec(watch) {
  const lg = app.league;
  const g = L.userGameToday(lg);
  const userHome = g.h === lg.userTeam;
  const opp = userHome ? g.a : g.h;
  const playoff = lg.phase === 'playoffs';
  // Sim the rest of the day up front so intermission boards can show other scores.
  const pre = {}, ticker = [];
  for (const x of L.todaysGames(lg)) {
    if (x.h === g.h && x.a === g.a) continue;
    const res = L.simGame(lg, x.h, x.a, playoff);
    pre[`${x.h}-${x.a}`] = res;
    const st = { seed: res.shots[0] * 31 + res.shots[1] };
    const marks = [[], []];
    res.goals.forEach((gl) => marks[gl.team].push(gl.per > 3 ? 1 : (gl.per - 1 + rand(st)) / 3));
    if (res.decision === 'SO') marks[res.score[0] > res.score[1] ? 0 : 1].push(1);
    ticker.push({ h: x.h, a: x.a, res, marks });
  }
  const s = lg.settings;
  const sp = {
    mode: watch ? 'watch' : 'franchise',
    teams: [lg.userTeam, opp],
    homeIdx: userHome ? 0 : 1,
    rosters: lg.teams,
    humans: watch ? [] : [{ team: 0 }],
    who: watch ? ['CPU', 'CPU'] : ['YOU', 'CPU'],
    cfg: { periodLen: s.periodLen, ot: playoff ? 'playoff' : 'reg', penalties: s.penalties, icing: s.icing, difficulty: s.difficulty },
    pre, ticker,
    label: nextLabel(lg, g),
  };
  sp.onEnd = (res) => {
    L.simDay(lg, res, pre);
    persist();
    screen(() => postgameScreen(res, sp));
  };
  return sp;
}

A.play = () => { const sp = franchiseSpec(false); screen(() => versusScreen(sp)); };
A.watch = () => { const sp = franchiseSpec(true); screen(() => versusScreen(sp)); };

function boardRows(sp, snap) {
  if (!sp.ticker?.length) return null;
  const prog = Math.min(1, snap.per / 3);
  return sp.ticker.map((t) => {
    const sc = t.marks.map((m) => m.filter((f) => f <= prog + 1e-9).length);
    const final = prog >= 1;
    return {
      a: T(t.a).abbr, as: sc[1], h: T(t.h).abbr, hs: sc[0],
      status: final ? `FINAL${t.res.decision !== 'REG' ? '/' + t.res.decision : ''}` : `${ORD[snap.per - 1]} INT`,
    };
  });
}

// ---------------------------------------------------------------- exhibition

function exhibitionScreen() {
  const e = app.exh, p = app.prefs;
  const ctl = (k) => opt('CONTROL', 'exh', k, e[k]);
  return {
    html: `
      <header class="topbar"><h1>EXHIBITION</h1><span>PICK THE CLUBS · PICK WHO PLAYS</span></header>
      <div class="cols two">
        ${teamPanel('away', 'AWAY', EXH, 'faceOff', ctl('ctrlA'))}
        ${teamPanel('home', 'HOME', EXH, 'faceOff', ctl('ctrlH'))}
      </div>
      ${win('GAME SETUP', `<div class="opt-grid">
        ${opt('PERIOD LENGTH', 'prefs', 'periodLen', p.periodLen)}
        ${opt('DIFFICULTY', 'prefs', 'difficulty', p.difficulty)}
        ${opt('PENALTIES', 'prefs', 'penalties', p.penalties)}
        ${opt('ICING', 'prefs', 'icing', p.icing)}</div>
        <p class="note">Set CONTROL to PLAYER 1 / PLAYER 2 on either club. Two players share the keyboard (P1: WASD + C V B, P2: arrows + , . /) or use two gamepads. CPU on both sides is a demo game; TAB fast-forwards.</p>`)}
      <div class="btnrow">${btn('faceOff', 'FACE OFF ▶', '', 'red')}${btn('home', 'BACK')}</div>`,
    back: A.home,
    prefer: '.tp-main[data-slot="away"]',
  };
}

A.exhibition = () => {
  if (app.sel.away === app.sel.home) app.sel.home = (app.sel.away + 16) % 32;
  screen(exhibitionScreen);
};
A.faceOff = () => {
  const e = app.exh, p = app.prefs;
  const sides = [{ id: app.sel.away, c: e.ctrlA, home: false }, { id: app.sel.home, c: e.ctrlH, home: true }];
  const hum = sides.filter((s) => s.c !== 'cpu');
  let order;
  if (hum.length === 2) order = e.ctrlA === 'p1' ? sides : [sides[1], sides[0]];
  else if (hum.length === 1) order = hum[0] === sides[0] ? sides : [sides[1], sides[0]];
  else order = sides;
  const label = (s) => (s.c === 'cpu' ? 'CPU' : hum.length === 2 ? (s.c === 'p1' ? 'P1' : 'P2') : 'YOU');
  const sp = {
    mode: hum.length ? 'exhibition' : 'watch',
    teams: order.map((s) => s.id),
    homeIdx: order.findIndex((s) => s.home),
    rosters: EXH,
    humans: hum.length === 2 ? [{ team: 0 }, { team: 1 }] : hum.length ? [{ team: 0 }] : [],
    who: order.map(label),
    cfg: { periodLen: p.periodLen, ot: 'reg', penalties: p.penalties, icing: p.icing, difficulty: p.difficulty },
    label: 'EXHIBITION',
  };
  sp.onEnd = (res) => screen(() => postgameScreen(res, sp));
  screen(() => versusScreen(sp));
};

// ---------------------------------------------------------------- versus / pregame

function controlsHtml(n = 1) {
  if (n === 2) {
    return `<table class="tbl keys"><tr><th class="l"></th><th>P1</th><th>P2</th><th>GAMEPAD</th></tr>
      <tr><td class="l">SKATE</td><td>WASD</td><td>ARROWS</td><td>STICK</td></tr>
      <tr><td class="l">PASS / SWITCH</td><td>C</td><td>,</td><td>A</td></tr>
      <tr><td class="l">SHOOT / CHECK</td><td>V</td><td>.</td><td>B</td></tr>
      <tr><td class="l">DEKE / POKE</td><td>B</td><td>/</td><td>X</td></tr>
      <tr><td class="l">SPRINT</td><td>L-SHIFT</td><td>R-SHIFT</td><td>RB</td></tr></table>`;
  }
  return `<table class="tbl keys"><tr><th class="l"></th><th>WITH PUCK</th><th>WITHOUT</th><th>KEYS</th><th>PAD</th></tr>
    <tr><td class="l">BUTTON 1</td><td>PASS</td><td>SWITCH</td><td>J / Z</td><td>A</td></tr>
    <tr><td class="l">BUTTON 2</td><td>SHOOT<small>HOLD = SLAPPER</small></td><td>CHECK</td><td>K / X</td><td>B</td></tr>
    <tr><td class="l">BUTTON 3</td><td>DEKE</td><td>POKE</td><td>L / C</td><td>X</td></tr>
    <tr><td class="l">SKATE</td><td colspan="2">ARROWS / WASD</td><td>SHIFT/SPACE SPRINT</td><td>RB</td></tr></table>`;
}

function versusScreen(sp) {
  const home = sp.teams[sp.homeIdx], away = sp.teams[1 - sp.homeIdx];
  const H = T(home), Aw = T(away);
  const ra = L.teamRatings(sp.rosters[away]), rh = L.teamRatings(sp.rosters[home]);
  const who = (id) => sp.who?.[sp.teams.indexOf(id)] || 'CPU';
  const cmp = [['OFFENSE', 'off'], ['DEFENSE', 'def'], ['GOALTENDING', 'gk'], ['SKATING', 'spd'], ['CHECKING', 'chk'], ['OVERALL', 'all']]
    .map(([l, k]) => `<div class="cmp"><b class="${ra[k] >= rh[k] ? 'hi' : ''}">${ra[k]}</b><i class="l" style="--v:${barPct(ra[k])}%"></i><span>${l}</span><i class="r" style="--v:${barPct(rh[k])}%"></i><b class="${rh[k] >= ra[k] ? 'hi' : ''}">${rh[k]}</b></div>`).join('');
  const side = (id, tag) => `<div class="vs-team" style="--p:${T(id).primary}">${crest(T(id), 'xl')}<small>${tag} · ${who(id)}</small><b>${esc(T(id).city).toUpperCase()}</b><span>${esc(T(id).name).toUpperCase()}</span><em>${PERKS[T(id).perk].name.toUpperCase()}</em></div>`;
  const per = PERIODS.find((x) => x[0] === sp.cfg.periodLen)?.[1] || `${sp.cfg.periodLen}S`;
  const fast = sp.cfg.periodLen >= 600 ? ` · CLOCK ${sp.cfg.periodLen >= 1200 ? 3 : 2}X` : '';
  return {
    html: `
      <header class="topbar"><h1>${esc(sp.label)}</h1><span>LIVE FROM ${esc(H.arena).toUpperCase()} · ${esc(H.city).toUpperCase()}</span></header>
      ${win('', `<div class="versus">${side(away, 'AWAY')}<div class="cmps">${cmp}</div>${side(home, 'HOME')}</div>
        <p class="note center">${per} PERIODS${fast}${sp.cfg.ot === 'playoff' ? ' · SUDDEN-DEATH OVERTIME' : ' · 3-ON-3 OT + SHOOTOUT'}${sp.cfg.penalties ? '' : ' · NO PENALTIES'}${sp.cfg.icing ? '' : ' · NO ICING'}</p>
        <p class="note center">${esc(Aw.name)}: ${esc(PERKS[Aw.perk].desc)} &nbsp;|&nbsp; ${esc(H.name)}: ${esc(PERKS[H.perk].desc)}</p>`, 'vs-win')}
      ${sp.humans.length ? win('CONTROLS', `${controlsHtml(sp.humans.length)}<p class="note">${sp.humans.length === 2 ? 'P1 attacks UP the ice, P2 attacks DOWN.' : 'You attack UP the ice.'} Win faceoffs by pressing PASS or SHOOT as the puck drops. One-timer: press SHOOT while your pass is still sliding.</p>`) : win('', '<p class="note center">CPU VS CPU. PRESS TAB TO FAST-FORWARD.</p>')}
      <div class="btnrow">${btn('dropPuck', '<span class="blink">PRESS START TO DROP THE PUCK</span>', '', 'red default')}${btn('vsBack', 'BACK')}</div>`,
    after: () => { app.pending = sp; },
    back: A.vsBack,
  };
}

A.vsBack = () => (isFranchise(app.pending) ? screen(seasonScreen) : screen(exhibitionScreen));
A.dropPuck = () => { audio.unlock(); launch(app.pending); };

// ---------------------------------------------------------------- in game

function speedKey(e) {
  if (e.code === 'Tab' && app.game?.cycleSpeed) { e.preventDefault(); app.game.cycleSpeed(); }
}

function gameShell(sp) {
  return `<div class="game">
    <div class="stage" id="stage"><canvas id="cv" width="400" height="300"></canvas></div>
    <div class="modal hidden" id="pause">${win('PAUSED', `
      <div class="menu-list">
        ${mi('resume', 'RESUME', '', 'data-default="1"')}
        ${sp.mode !== 'online' ? mi('simRest', 'SIM TO END') : ''}
        ${mi('quitGame', sp.mode === 'online' ? 'LEAVE GAME' : isFranchise(sp) ? 'SIM TO END & EXIT' : 'QUIT TO MENU')}
        ${opt('SOUND', 'audio', 'muted', audio.muted)}
      </div>${controlsHtml(sp.humans?.length || 1)}`, 'pause-win')}</div>
  </div>`;
}

function fit() {
  const st = $('#stage'), cv = $('#cv');
  if (!st || !cv) return;
  const w = st.clientWidth, h = st.clientHeight;
  const ih = Math.max(300, Math.min(640, Math.round((400 * h) / w)));
  app.game?.r?.resize(ih);
  cv.height = ih;
  let s = Math.min(w / 400, h / ih);
  if (s >= 2) s = Math.floor(s);
  cv.style.width = Math.floor(400 * s) + 'px';
  cv.style.height = Math.floor(ih * s) + 'px';
}

function launch(sp) {
  stopGame();
  stopAttract();
  app.cur = null;
  app.spec = sp;
  $app.className = 'ingame';
  $app.innerHTML = gameShell(sp);
  input.setPlayers(sp.humans.length === 2 ? 2 : 1);
  input.active = true;
  const g = new LocalGame({
    canvas: $('#cv'), input, audio,
    teams: sp.teams.map((id, i) => L.gameTeam(sp.rosters, id, i === sp.homeIdx)),
    teamDefs: sp.teams.map((id) => T(id)),
    homeIdx: sp.homeIdx, cfg: sp.cfg, humans: sp.humans, replays: app.prefs.replays,
    onEnd: (res) => sp.onEnd(res),
    board: (snap) => boardRows(sp, snap),
  });
  app.game = g;
  input.onPause = () => togglePause();
  if (!sp.humans.length) document.addEventListener('keydown', speedKey);
  if (sp.humans.length && mountTouch($('.game'), input)) $('.game').classList.add('has-touch');
  fit();
  g.start();
}

function togglePause() {
  const g = app.game;
  if (!g || !$('#pause')) return;
  const hidden = $('#pause').classList.toggle('hidden');
  app.paused = !hidden;
  g.setPaused?.(app.paused);
  nav.refresh({ back: null });
}
A.resume = () => togglePause();
A.simRest = () => {
  const g = app.game, sp = app.spec;
  if (!g?.simToEnd) return;
  $('#pause .menu-list').innerHTML = '<p class="note blink">SIMULATING…</p>';
  g.simToEnd((res) => sp.onEnd(res));
};
A.quitGame = () => {
  const sp = app.spec;
  if (sp.mode === 'online') { leaveOnline(); return; }
  if (isFranchise(sp)) { A.simRest(); return; }
  A.home();
};

// ---------------------------------------------------------------- postgame

function threeStars(res, sp) {
  const cands = [];
  res.teamIds.forEach((tid, i) => {
    const roster = sp.rosters[tid].roster;
    for (const [pid, s] of Object.entries(res.players[i] || {})) {
      const p = roster.find((x) => x.id === pid);
      if (!p) continue;
      const v = s.g * 3 + s.a * 2 + s.sog * 0.25 + s.hits * 0.15;
      if (v > 0) cands.push({ p, tid, v, line: `${s.g}G ${s.a}A` });
    }
    const gl = res.goalies[i];
    const g = roster.find((x) => x.id === gl.pid);
    const sv = gl.sa - gl.ga;
    cands.push({ p: g, tid, v: sv * 0.22 - gl.ga * 0.6 + (gl.ga === 0 ? 3 : 0) + (res.score[i] > res.score[1 - i] ? 1 : 0), line: `${sv} SAVES` });
  });
  return cands.sort((a, b) => b.v - a.v).slice(0, 3);
}

function postgameScreen(res, sp) {
  const hi = sp.homeIdx, ai = 1 - hi;
  const ids = res.teamIds;
  const order = [ai, hi];
  const nPer = Math.max(3, ...res.perScore.map((p) => p.length));
  const perH = [...Array(nPer)].map((_, i) => (i < 3 ? ORD[i] : 'OT'));
  const stars = threeStars(res, sp);
  const name = (tid, pid) => {
    const p = sp.rosters[tid].roster.find((x) => x.id === pid);
    return p ? `${p.first[0]}. ${p.name}`.toUpperCase() : '?';
  };
  const winner = res.score[0] > res.score[1] ? 0 : 1;
  const buttons = sp.mode === 'online'
    ? `${btn('rematch', 'REMATCH', '', 'red default')}${btn('leaveOnline', 'LEAVE')}`
    : isFranchise(sp)
      ? btn('continue', 'CONTINUE ▶', '', 'red default')
      : `${btn('again', 'PLAY AGAIN', '', 'red default')}${btn('exhibition', 'CHANGE CLUBS')}${btn('home', 'MAIN MENU')}`;
  const elapsed = (g) => (g.per <= 3 && g.clock ? mmss(sp.cfg.periodLen - g.clock) : '');
  app.lastSpec = sp;
  const around = sp.ticker?.length
    ? win('AROUND THE LEAGUE', `<div class="board">${sp.ticker.map((t) => `<div>${T(t.a).abbr} <b>${t.res.score[1]}</b> ${T(t.h).abbr} <b>${t.res.score[0]}</b>${t.res.decision !== 'REG' ? ` <em>${t.res.decision}</em>` : ''}</div>`).join('')}</div>`)
    : '';
  return {
    html: `
      <header class="topbar"><h1>FINAL${res.decision !== 'REG' ? ' / ' + res.decision : ''}</h1><span>${esc(sp.label)}</span></header>
      ${win('', `<div class="final">${order.map((i) => `<div class="fs ${i === winner ? 'w' : ''}">${crest(T(ids[i]), 'lg')}<div><small>${esc(T(ids[i]).city).toUpperCase()}</small><b>${esc(T(ids[i]).name).toUpperCase()}</b></div><span class="big">${res.score[i]}</span></div>`).join('')}</div>
        <div class="scroll"><table class="tbl"><tr><th class="l"></th>${perH.map((p) => `<th>${p}</th>`).join('')}${res.decision === 'SO' ? '<th>SO</th>' : ''}<th>T</th><th>SOG</th><th>PP</th><th>PIM</th><th>HITS</th><th>FO</th></tr>
        ${order.map((i) => `<tr><td class="l">${T(ids[i]).abbr}</td>${perH.map((_, p) => `<td>${res.perScore[i][p] || 0}</td>`).join('')}${res.decision === 'SO' ? `<td>${i === winner ? 1 : 0}</td>` : ''}<td><b>${res.score[i]}</b></td><td>${res.shots[i]}</td><td>${res.ppg[i]}/${res.ppo[i]}</td><td>${res.pim[i]}</td><td>${res.hits[i]}</td><td>${res.fow[i]}</td></tr>`).join('')}</table></div>`, 'final-win')}
      <div class="cols">
        ${win('THREE STARS', stars.map((s, n) => `<div class="star"><span class="stars">${'★'.repeat(n + 1)}</span>${crest(T(s.tid), 'sm')}<b>${esc(s.p.first[0])}. ${esc(s.p.name).toUpperCase()}</b><small>${s.line}</small></div>`).join(''))}
        ${win('SCORING', (res.goals.length ? res.goals.map((g) => `<div class="goal"><em>${g.per <= 3 ? ORD[g.per - 1] : 'OT'} ${elapsed(g)}</em>${crest(T(ids[g.team]), 'sm')}<span>${g.pid ? esc(name(ids[g.team], g.pid)) : 'OWN GOAL'}${g.a.length ? ` <small>(${g.a.map((a) => esc(name(ids[g.team], a))).join(', ')})</small>` : ''}</span>${g.tags.map((t) => `<i class="tag">${t}</i>`).join('')}</div>`).join('') : '<p class="note">NO GOALS.</p>')
          + (res.so ? `<p class="note">SHOOTOUT: ${res.so.log.map((l) => `${T(ids[l.team]).abbr} ${esc(name(ids[l.team], l.pid))} ${l.goal ? '✔' : '✘'}`).join(' · ')}</p>` : ''))}
      </div>
      ${around}
      <div class="btnrow">${buttons}</div>`,
    back: sp.mode === 'online' ? null : isFranchise(sp) ? A.continue : A.home,
  };
}

A.again = () => { const sp = app.lastSpec; screen(() => versusScreen(sp)); };

// ---------------------------------------------------------------- online

function wsUrl() {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

function netSend(m) {
  if (app.net && app.net.readyState === 1) app.net.send(JSON.stringify(m));
}

function netConnect(onOpen) {
  if (app.net && app.net.readyState <= 1) {
    if (app.net.readyState === 1) onOpen();
    else app.net.addEventListener('open', onOpen, { once: true });
    return;
  }
  const ws = new WebSocket(wsUrl());
  app.net = ws;
  ws.addEventListener('open', onOpen, { once: true });
  ws.addEventListener('message', (e) => {
    let m;
    try { m = JSON.parse(e.data); } catch { return; }
    onNet(m);
  });
  ws.addEventListener('close', () => {
    if (app.net !== ws) return;
    app.net = null;
    if (app.spec?.mode === 'online' && app.game) { stopGame(); onlineNotice('CONNECTION LOST.'); }
  });
  ws.addEventListener('error', () => onlineNotice('COULD NOT REACH THE GAME SERVER.'));
}

function onlineScreen() {
  const o = app.online;
  const notice = o.notice ? win('', `<p class="notice">${esc(o.notice)}</p>`) : '';
  if (o.step === 'team') {
    return {
      html: `
        <header class="topbar"><h1>ONLINE</h1><span>STEP 1 · CHOOSE YOUR CLUB</span></header>${notice}
        <div class="pick-one">${teamPanel('online', 'YOUR CLUB', EXH, 'onlineNext')}</div>
        ${strip('online')}
        <div class="btnrow">${btn('onlineNext', 'CONFIRM ▶', '', 'red')}${btn('home', 'BACK')}</div>`,
      back: A.home,
      prefer: '.tp-main',
    };
  }
  const t = T(app.sel.online);
  const slots = o.code.map((c, i) => `<button class="slot" data-act="codeUp" data-i="${i}" data-up="codeUp" data-down="codeDown" data-type="codeType">${c}</button>`).join('');
  return {
    html: `
      <header class="topbar"><h1>ONLINE</h1><span>STEP 2 · HOST OR JOIN</span></header>${notice}
      ${win('', `<div class="club-sum">${crest(t, 'lg')}<div><b>${esc(t.fullName).toUpperCase()}</b><small>${PERKS[t.perk].name.toUpperCase()}</small></div>${btn('onlineTeam', 'CHANGE', '', 'mini')}</div>`)}
      <div class="cols">
        ${win('HOST A GAME', `${opt('PERIOD LENGTH', 'online', 'onlinePeriod', o.onlinePeriod)}
          <p class="note">You'll get a 4-letter room code to send to a friend.</p>
          <div class="btnrow">${btn('createRoom', 'CREATE ROOM', '', 'red default')}</div>`)}
        ${win('JOIN A GAME', `<div class="slots">${slots}</div>
          <p class="note">UP/DOWN changes a letter, or just type it.</p>
          <input id="codeText" class="code-in" maxlength="4" placeholder="TYPE CODE" autocomplete="off" spellcheck="false" data-enter="joinRoom" value="">
          <div class="btnrow">${btn('joinRoom', 'JOIN ROOM', '', 'red')}</div>`)}
      </div>
      <div class="btnrow">${btn('onlineTeam', 'BACK')}</div>`,
    back: A.onlineTeam,
    after: () => {
      const ci = $('#codeText');
      ci?.addEventListener('input', () => {
        const v = ci.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
        ci.value = v;
        v.split('').forEach((ch, i) => { o.code[i] = ch; const s = document.querySelectorAll('.slot')[i]; if (s) s.textContent = ch; });
      });
    },
  };
}

function onlineNotice(msg) {
  app.online.notice = msg;
  if (!app.game) screen(onlineScreen);
}

function codeStep(d, dir) {
  const i = +d.i, c = app.online.code;
  const k = CODE_LETTERS.indexOf(c[i]);
  c[i] = CODE_LETTERS[(k + dir + CODE_LETTERS.length) % CODE_LETTERS.length];
  app.prefer = `.slot[data-i="${i}"]`;
  render();
}
A.codeUp = (d) => codeStep(d, 1);
A.codeDown = (d) => codeStep(d, -1);
A.codeType = (d) => {
  const i = +d.i;
  app.online.code[i] = d.letter;
  app.prefer = i < 3 ? `.slot[data-i="${i + 1}"]` : '[data-act="joinRoom"]';
  render();
};

A.online = () => { app.online.notice = ''; app.online.step = 'team'; screen(onlineScreen); };
A.onlineNext = () => { app.online.step = 'lobby'; screen(onlineScreen); };
A.onlineTeam = () => { app.online.step = 'team'; screen(onlineScreen); };
A.createRoom = () => {
  netConnect(() => netSend({ t: 'create', team: app.sel.online, cfg: { periodLen: app.online.onlinePeriod } }));
};
A.joinRoom = () => {
  const code = app.online.code.join('');
  netConnect(() => netSend({ t: 'join', code, team: app.sel.online }));
};

function waitingScreen(code) {
  return {
    html: `${win('ROOM CODE', `<div class="room-code">${esc(code)}</div>
      <p class="note center">Send this code to a friend. They choose ONLINE → JOIN A GAME.</p>
      <p class="center blink">WAITING FOR A CHALLENGER…</p>
      <div class="btnrow center">${btn('leaveOnline', 'CANCEL', '', 'default')}</div>`, 'waiting')}`,
    back: () => leaveOnline(),
  };
}

function onNet(m) {
  switch (m.t) {
    case 'created':
      app.online.room = m.code;
      screen(() => waitingScreen(m.code));
      break;
    case 'start':
      launchOnline(m);
      break;
    case 'snap':
      app.game?.onSnap?.(m.s, m.ev);
      break;
    case 'end': {
      const sp = app.spec;
      stopGame();
      screen(() => postgameScreen(m.result, sp));
      break;
    }
    case 'rematchWait':
      screen(() => waitingScreen(app.online.room || ''));
      break;
    case 'left':
      stopGame();
      onlineNotice('YOUR OPPONENT LEFT THE GAME.');
      break;
    case 'error':
      onlineNotice((m.msg || 'Something went wrong.').toUpperCase());
      break;
    default:
      break;
  }
}

function launchOnline(m) {
  stopGame();
  stopAttract();
  app.online.room = m.code;
  const sp = {
    mode: 'online', teams: m.teams, homeIdx: m.homeIdx, rosters: EXH, humans: [{ team: m.side }],
    who: m.side === 0 ? ['YOU', 'RIVAL'] : ['RIVAL', 'YOU'], cfg: m.cfg, label: `ONLINE · ROOM ${m.code}`, code: m.code,
  };
  app.spec = sp;
  app.cur = null;
  $app.className = 'ingame';
  $app.innerHTML = gameShell(sp);
  input.setPlayers(1);
  input.active = true;
  const g = new OnlineGame({
    canvas: $('#cv'), input, audio, send: netSend, side: m.side,
    teamDefs: m.teams.map((id) => T(id)), homeIdx: m.homeIdx,
  });
  app.game = g;
  input.onPause = () => togglePause();
  if (mountTouch($('.game'), input)) $('.game').classList.add('has-touch');
  fit();
  g.start();
}

function leaveOnline() {
  netSend({ t: 'leave' });
  if (app.net) { const n = app.net; app.net = null; n.close(); }
  app.online.notice = '';
  screen(onlineScreen);
}
A.leaveOnline = () => leaveOnline();
A.rematch = () => netSend({ t: 'rematch' });

// ---------------------------------------------------------------- instructions

const HOWTO = [
  ['CONTROLS', () => `${controlsHtml(1)}<p class="note">Two players on one keyboard: P1 uses WASD + C, V, B and left Shift. P2 uses the arrows + comma, period, slash and right Shift. Gamepads plug and play. Phones get a touch stick.</p>`],
  ['WITH THE PUCK', () => `<p><b>TAP SHOOT</b> for a quick wrister. <b>HOLD SHOOT</b> to load a slapper; the meter fills while you glide slower.</p>
    <p><b>ONE-TIMER:</b> hit SHOOT while your pass is still on its way. The receiver fires on arrival, before the goalie can slide across.</p>
    <p><b>PICK YOUR SPOT:</b> hold left or right as you release to aim at a post. Hit the top of the net for a TOP SHELF.</p>
    <p><b>DEKE</b> sidesteps checks and poke checks. Carry it behind the net and tuck it in at the far post for a wraparound.</p>`],
  ['WITHOUT THE PUCK', () => `<p><b>SWITCH</b> jumps to the skater nearest the puck.</p>
    <p><b>CHECK</b> throws your weight forward. Catch the puck carrier and he's flattened and the puck is loose. Lay out someone without the puck and it's interference.</p>
    <p><b>POKE</b> stabs at the puck. Get the stick instead of the puck and you'll sit for hooking or tripping.</p>`],
  ['RULES', () => `<p>Three periods. Tied after regulation? 3-on-3 sudden death, then a shootout. Playoff overtime is 5-on-5 until somebody scores.</p>
    <p>Wins are worth 2 points and overtime losses 1. The top 8 clubs in each conference go to the playoffs, chasing the SILVER CUP.</p>
    <p>Minors put a player in the box and the other side on the power play; a power-play goal frees him. Icing brings the faceoff back to your end, and you can't change lines. No offside.</p>`],
  ['LINES & ENERGY', () => `<p>Four forward lines and three defense pairs. The bar under your skater is his energy: sprinting burns it, and tired legs are slow legs.</p>
    <p>Fresh lines hop on at whistles, and gassed skaters change on the fly. Every club has a SPECIALTY (CANNON, BRICK WALL, SNIPERS, SANDPAPER…) that tilts how it plays.</p>`],
];

function howtoScreen() {
  const n = HOWTO.length, i = app.pg.howto || 0;
  return {
    html: `
      <section class="win pager">
        <h2 class="pager-h">${btn('howStep', '◀', 'data-d="-1"', 'mini')}<span>${HOWTO[i][0]}</span><small>${i + 1}/${n}</small>${btn('howStep', '▶', 'data-d="1"', 'mini')}</h2>
        <div class="prose">${HOWTO[i][1]()}</div>
      </section>
      <div class="btnrow">${btn('home', 'BACK', '', 'default')}<span class="hint">◀ ▶ TO FLIP PAGES</span></div>`,
    back: A.home,
    page: (d) => { app.pg.howto = (i + d + n) % n; audio.play('blip'); render(); },
  };
}
A.howto = () => screen(howtoScreen);
A.howStep = (d) => { app.pg.howto = ((app.pg.howto || 0) + +d.d + HOWTO.length) % HOWTO.length; render(); };

// ---------------------------------------------------------------- options

function optionsScreen() {
  const p = app.prefs, lg = app.league;
  return {
    html: `
      <header class="topbar"><h1>OPTIONS</h1><span>SAVED IN THIS BROWSER</span></header>
      <div class="cols">
        ${win('GAME', `
          ${opt('SOUND', 'audio', 'muted', audio.muted)}
          ${opt('GOAL REPLAYS', 'prefs', 'replays', p.replays)}
          ${opt('PERIOD LENGTH', 'prefs', 'periodLen', p.periodLen)}
          ${opt('DIFFICULTY', 'prefs', 'difficulty', p.difficulty)}
          ${opt('PENALTIES', 'prefs', 'penalties', p.penalties)}
          ${opt('ICING', 'prefs', 'icing', p.icing)}
          <p class="note">These are the defaults for exhibitions and new seasons.</p>`)}
        ${lg ? win(`SEASON · ${esc(T(lg.userTeam).name).toUpperCase()}`, `
          ${opt('PERIOD LENGTH', 'league', 'periodLen', lg.settings.periodLen)}
          ${opt('DIFFICULTY', 'league', 'difficulty', lg.settings.difficulty)}
          ${opt('PENALTIES', 'league', 'penalties', lg.settings.penalties)}
          ${opt('ICING', 'league', 'icing', lg.settings.icing)}
          <div class="btnrow">${btn('deleteLeague', 'DELETE SEASON', '', 'mini')}</div>`) : ''}
      </div>
      <div class="btnrow">${btn('optBackOut', 'BACK', '', 'default')}</div>`,
    back: A.optBackOut,
  };
}
A.options = () => { app.optReturn = app.cur === seasonScreen ? 'season' : 'title'; screen(optionsScreen); };
A.optBackOut = () => (app.optReturn === 'season' && app.league ? screen(seasonScreen) : A.home());
A.deleteLeague = () => {
  if (!confirm('Delete this season for good?')) return;
  app.league = null;
  remove('franchise');
  A.home();
};

// ---------------------------------------------------------------- boot
screen(titleScreen);
