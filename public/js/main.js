// TOP SHELF app shell: menus, franchise hub, exhibition, online lobby.
import { TEAMS, PERKS, CONFERENCES } from '/shared/teams.js';
import * as L from '/shared/league.js';
import { rand } from '/shared/rng.js';
import { Input, mountTouch } from './input.js';
import { Audio } from './audio.js';
import { load, save, remove } from './storage.js';
import { LocalGame, OnlineGame } from './game-client.js';

const $app = document.getElementById('app');
const $ = (sel) => document.querySelector(sel);
const input = new Input();
const audio = new Audio();
const EXH = L.buildTeams(1994);

const app = {
  league: load('franchise'),
  prefs: Object.assign({ periodLen: 180, difficulty: 'pro', penalties: true, icing: true, replays: true }, load('prefs', {})),
  game: null,
  net: null,
  cur: null,
  tab: 'home',
  pick: null,
  newLg: { seasonLength: 32, seriesLen: 7 },
  exh: { a: 0, b: 16, mode: '1p', home: 1 },
  online: { team: 0 },
};

const PERIODS = [[120, '2 MIN'], [180, '3 MIN'], [300, '5 MIN'], [480, '8 MIN'], [600, '10 MIN'], [1200, '20 MIN']];
const DIFFS = [['rookie', 'ROOKIE'], ['pro', 'PRO'], ['allstar', 'ALL-STAR']];
const ONOFF = [[true, 'ON'], [false, 'OFF']];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const crest = (tid, size = '') => {
  const t = TEAMS[tid];
  return `<span class="crest ${size}" style="--p:${t.primary};--s:${t.secondary}"><b>${t.abbr}</b></span>`;
};
const rec = (r) => `${r.w}-${r.l}-${r.otl}`;
const mmss = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
const isFranchise = (sp) => !!app.league && sp.rosters === app.league.teams;
const pct = (n, d) => (d ? (n / d).toFixed(3).replace(/^0/, '') : '-');

function persist() { if (app.league) save('franchise', app.league); }
function savePrefs() { save('prefs', app.prefs); }

function stopGame() {
  if (app.game) { app.game.destroy(); app.game = null; }
  input.active = false;
  input.onPause = null;
  document.removeEventListener('keydown', speedKey);
}

function screen(fn) {
  stopGame();
  app.cur = fn;
  render();
}

function render() {
  const out = app.cur();
  $app.className = out.cls || '';
  $app.innerHTML = out.html;
  out.after?.();
}

function seg(k, scope, options, cur) {
  return `<div class="seg">${options.map(([v, l]) => `<button data-act="set" data-scope="${scope}" data-k="${k}" data-v="${v}" class="${String(v) === String(cur) ? 'on' : ''}">${l}</button>`).join('')}</div>`;
}

// ---------------------------------------------------------------- actions

const A = {};
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  audio.unlock();
  if (!el) return;
  const fn = A[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  audio.play('blip');
  fn(el.dataset, el);
});

A.set = (d) => {
  const obj = { league: app.league?.settings, exh: app.exh, newLg: app.newLg, online: app.online }[d.scope] || app.prefs;
  let v = d.v;
  if (v === 'true') v = true;
  else if (v === 'false') v = false;
  else if (v !== '' && !isNaN(+v)) v = +v;
  obj[d.k] = v;
  if (d.scope === 'league') persist();
  else savePrefs();
  render();
};
A.home = () => screen(titleScreen);
A.howto = () => screen(howtoScreen);
A.mute = () => { audio.setMuted(!audio.muted); render(); };

// ---------------------------------------------------------------- title

function titleScreen() {
  const lg = app.league;
  const cont = lg
    ? `<button class="primary big" data-act="continue">CONTINUE<small>${TEAMS[lg.userTeam].name.toUpperCase()} · ${lg.year} · ${rec(lg.teams[lg.userTeam].rec)}</small></button>`
    : '';
  return {
    cls: 'title',
    html: `
    <div class="title-screen">
      <div class="logo">
        <div class="logo-puck"></div>
        <h1><span>TOP</span><span>SHELF</span></h1>
        <p class="sub">RETRO HOCKEY IN YOUR BROWSER</p>
      </div>
      <p class="tagline">32 teams. 82 games. One cup. Pass, one-time it, go top shelf.</p>
      <div class="menu">
        ${cont}
        <button class="${lg ? '' : 'primary big'}" data-act="newFranchise">${lg ? 'NEW FRANCHISE' : 'FRANCHISE'}<small>RUN A TEAM THROUGH A SEASON</small></button>
        <button data-act="exhibition">QUICK GAME<small>1P · 2P · CPU VS CPU</small></button>
        <button data-act="online">PLAY ONLINE<small>CHALLENGE A FRIEND WITH A ROOM CODE</small></button>
        <button data-act="howto">HOW TO PLAY</button>
      </div>
      <div class="foot">
        <button class="ghost" data-act="mute">SOUND: ${audio.muted ? 'OFF' : 'ON'}</button>
        <span>All teams, players and leagues are fictional.</span>
      </div>
    </div>`,
  };
}

A.continue = () => { app.tab = 'home'; screen(hubScreen); };

// ---------------------------------------------------------------- team picker / new franchise

function teamGrid(selected, act) {
  return CONFERENCES.map((c, ci) => `
    <section class="conf">
      <h2>${c.name.toUpperCase()} CONFERENCE</h2>
      <div class="divs">
        ${c.divisions.map((d, di) => `
          <div class="division">
            <h3>${d.toUpperCase()}</h3>
            <div class="tgrid">
              ${TEAMS.filter((t) => t.conf === ci && t.div === di).map((t) => `
                <button class="tcard ${selected === t.id ? 'sel' : ''}" data-act="${act}" data-id="${t.id}" style="--p:${t.primary};--s:${t.secondary}">
                  ${crest(t.id)}
                  <span class="tn">${t.name.toUpperCase()}</span>
                  <span class="tl">${esc(t.tagline)}</span>
                  <span class="tp">${PERKS[t.perk].name}</span>
                </button>`).join('')}
            </div>
          </div>`).join('')}
      </div>
    </section>`).join('');
}

function newFranchiseScreen() {
  const n = app.newLg, p = app.prefs;
  const sel = app.pick;
  return {
    html: `
    <div class="page">
      <header class="bar"><button class="ghost" data-act="home">◀ MENU</button><h1>NEW FRANCHISE</h1><span></span></header>
      <div class="panel settings">
        <div class="row"><label>SEASON</label>${seg('seasonLength', 'newLg', L.SEASON_LENGTHS.map((x) => [x, x + ' GAMES']), n.seasonLength)}</div>
        <div class="row"><label>PLAYOFF SERIES</label>${seg('seriesLen', 'newLg', L.SERIES_LENGTHS.map((x) => [x, 'BEST OF ' + x]), n.seriesLen)}</div>
        <div class="row"><label>PERIOD LENGTH</label>${seg('periodLen', 'prefs', PERIODS, p.periodLen)}</div>
        <div class="row"><label>DIFFICULTY</label>${seg('difficulty', 'prefs', DIFFS, p.difficulty)}</div>
      </div>
      <h2 class="pick-h">CHOOSE YOUR TEAM <small>You coach them. The CPU runs the other 31.</small></h2>
      ${teamGrid(sel, 'pickTeam')}
      <div class="sticky-go ${sel == null ? 'hidden' : ''}">
        ${sel != null ? `${crest(sel)} <span>${TEAMS[sel].name.toUpperCase()} · ${PERKS[TEAMS[sel].perk].name.toUpperCase()}: ${esc(PERKS[TEAMS[sel].perk].desc)}</span>` : ''}
        <button class="primary" data-act="createLeague">START FRANCHISE ▶</button>
      </div>
    </div>`,
  };
}

A.newFranchise = () => { app.pick = null; screen(newFranchiseScreen); };
A.pickTeam = (d) => { app.pick = +d.id; audio.play('select'); render(); };
A.createLeague = () => {
  if (app.pick == null) return;
  if (app.league && !confirm('Start a new franchise? Your current save will be replaced.')) return;
  app.league = L.createLeague({
    userTeam: app.pick, seasonLength: app.newLg.seasonLength, seriesLen: app.newLg.seriesLen,
    periodLen: app.prefs.periodLen, difficulty: app.prefs.difficulty, penalties: app.prefs.penalties, icing: app.prefs.icing,
  });
  persist();
  app.tab = 'home';
  screen(hubScreen);
};

// ---------------------------------------------------------------- franchise hub

const TABS = [['home', 'HOME'], ['schedule', 'SCHEDULE'], ['standings', 'STANDINGS'], ['roster', 'ROSTER'], ['leaders', 'LEADERS'], ['news', 'NEWS'], ['settings', 'SETTINGS']];

function phaseLabel(lg) {
  if (lg.phase === 'season') return `${lg.year} · GAME ${Math.min(lg.day + 1, lg.schedule.length)} OF ${lg.schedule.length}`;
  if (lg.phase === 'playoffs') return `${lg.year} PLAYOFFS · ${L.ROUND_NAMES[lg.playoffs.rounds[lg.playoffs.cur].length].toUpperCase()}`;
  return `${lg.year} · SEASON COMPLETE`;
}

function hubScreen() {
  const lg = app.league;
  if (!lg) return titleScreen();
  const T = TEAMS[lg.userTeam];
  const me = lg.teams[lg.userTeam];
  const body = { home: hubHome, schedule: hubSchedule, standings: hubStandings, roster: hubRoster, leaders: hubLeaders, news: hubNews, settings: hubSettings }[app.tab](lg);
  return {
    html: `
    <div class="page hub" style="--p:${T.primary};--s:${T.secondary}">
      <header class="teambar">
        <button class="ghost" data-act="home">◀</button>
        ${crest(lg.userTeam, 'lg')}
        <div class="tb-name"><h1>${T.name.toUpperCase()}</h1><span>${rec(me.rec)} · ${me.rec.pts} PTS · ${phaseLabel(lg)}</span></div>
      </header>
      <nav class="tabs">${TABS.map(([k, l]) => `<button data-act="tab" data-t="${k}" class="${app.tab === k ? 'on' : ''}">${l}</button>`).join('')}</nav>
      <main>${body}</main>
    </div>`,
  };
}

A.tab = (d) => { app.tab = d.t; render(); };

function nextGameCard(lg) {
  if (lg.phase === 'done') {
    const ch = lg.playoffs.champion;
    return `<div class="card champ">
      <div class="label">${lg.year} TOP SHELF CUP CHAMPIONS</div>
      <div class="ng-teams">${crest(ch, 'xl')}</div>
      <h2>${TEAMS[ch].name.toUpperCase()}</h2>
      <p>${ch === lg.userTeam ? 'YOUR TEAM HOISTS THE CUP!' : 'Better luck next season.'}</p>
      <div class="btnrow"><button class="primary" data-act="nextSeason">START ${lg.year + 1} SEASON ▶</button></div>
    </div>`;
  }
  const g = L.userGameToday(lg);
  if (!g) {
    return `<div class="card"><div class="label">YOUR SEASON IS OVER</div><p>The playoffs roll on without you.</p>
      <div class="btnrow"><button data-act="simDay">SIM DAY</button><button class="primary" data-act="simEnd">SIM TO CHAMPION</button></div></div>`;
  }
  let label;
  if (lg.phase === 'season') label = `GAME ${lg.day + 1} OF ${lg.schedule.length}`;
  else {
    const s = g.series;
    label = `${L.ROUND_NAMES[lg.playoffs.rounds[lg.playoffs.cur].length].toUpperCase()} · GAME ${s.games.length + 1} · ${TEAMS[s.hi].abbr} ${s.w[0]}-${s.w[1]} ${TEAMS[s.lo].abbr}`;
  }
  const r = (id) => (lg.phase === 'season' ? rec(lg.teams[id].rec) : `${lg.teams[id].rec.pts} PTS`);
  return `<div class="card nextgame">
    <div class="label">${label}</div>
    <div class="ng-teams">
      <div>${crest(g.a, 'xl')}<b>${TEAMS[g.a].name.toUpperCase()}</b><span>${r(g.a)}</span></div>
      <em>AT</em>
      <div>${crest(g.h, 'xl')}<b>${TEAMS[g.h].name.toUpperCase()}</b><span>${r(g.h)}</span></div>
    </div>
    <div class="arena">${esc(TEAMS[g.h].arena).toUpperCase()}</div>
    <div class="btnrow">
      <button class="primary" data-act="play">PLAY GAME</button>
      <button data-act="watch">WATCH</button>
      <button data-act="simDay">SIM GAME</button>
    </div>
  </div>`;
}

function standingsTable(rows, opts = {}) {
  return `<table class="tbl stand">
    <thead><tr><th class="l">${opts.title || 'TEAM'}</th><th>GP</th><th>W</th><th>L</th><th>OTL</th><th>PTS</th>${opts.mini ? '' : '<th>GF</th><th>GA</th><th>DIFF</th><th>STRK</th>'}</tr></thead>
    <tbody>${rows.map((t, i) => {
      const r = t.rec;
      return `<tr class="${t.id === app.league.userTeam ? 'me' : ''} ${opts.cut && i === opts.cut - 1 ? 'cut' : ''}">
        <td class="l">${crest(t.id, 'sm')} ${TEAMS[t.id].name}</td><td>${r.gp}</td><td>${r.w}</td><td>${r.l}</td><td>${r.otl}</td><td><b>${r.pts}</b></td>
        ${opts.mini ? '' : `<td>${r.gf}</td><td>${r.ga}</td><td>${r.gf - r.ga > 0 ? '+' : ''}${r.gf - r.ga}</td><td>${r.streak || '-'}</td>`}
      </tr>`;
    }).join('')}</tbody></table>`;
}

function leaderList(lg, stat, title, fmt = (v) => v, n = 5) {
  const rows = L.leaders(lg, stat, n).filter((r) => r.v > 0 || stat === 'gaa');
  return `<div class="leaders"><h4>${title}</h4>${rows.length ? rows.map((r) => `
    <div class="lrow ${r.tid === lg.userTeam ? 'me' : ''}">${crest(r.tid, 'sm')}<span>${esc(r.p.first[0])}. ${esc(r.p.name)}</span><b>${fmt(r.v)}</b></div>`).join('') : '<p class="muted">Leaders show up after the first games.</p>'}</div>`;
}

function hubHome(lg) {
  const T = TEAMS[lg.userTeam];
  const div = L.standings(lg, (t) => t.conf === T.conf && t.div === T.div);
  const sims = lg.phase === 'season'
    ? `<button data-act="simWeek">SIM WEEK</button><button data-act="simPlayoffs">SIM TO PLAYOFFS</button><button data-act="simEnd">SIM TO CHAMPION</button>`
    : lg.phase === 'playoffs' ? `<button data-act="simEnd">SIM TO CHAMPION</button>` : '';
  const recent = [];
  for (let d = lg.day - 1; d >= 0 && recent.length < 5 && lg.phase === 'season'; d--) {
    const g = lg.schedule[d].find((x) => x.h === lg.userTeam || x.a === lg.userTeam);
    if (g?.res) recent.push(g);
  }
  return `
    <div class="grid2">
      <div>${nextGameCard(lg)}
        ${sims ? `<div class="btnrow sims">${sims}</div>` : ''}
        <div class="card"><div class="label">LATEST NEWS</div>${lg.news.slice(0, 5).map((n) => `<p class="news">${esc(n.text)}</p>`).join('')}</div>
      </div>
      <div>
        <div class="card"><div class="label">${T.divName.toUpperCase()} DIVISION</div>${standingsTable(div, { mini: true })}</div>
        ${recent.length ? `<div class="card"><div class="label">RECENT</div>${recent.map((g) => resultLine(lg, g)).join('')}</div>` : ''}
        <div class="card"><div class="label">LEAGUE LEADERS</div><div class="lgrid">${leaderList(lg, 'pts', 'POINTS')}${leaderList(lg, 'g', 'GOALS')}</div></div>
      </div>
    </div>`;
}

function resultLine(lg, g) {
  const me = lg.userTeam;
  const home = g.h === me;
  const opp = home ? g.a : g.h;
  if (!g.res) return `<div class="rline"><span class="muted">${home ? 'VS' : '@'}</span>${crest(opp, 'sm')}<span>${TEAMS[opp].name}</span><b class="muted">-</b></div>`;
  const my = home ? g.res.hs : g.res.as, their = home ? g.res.as : g.res.hs;
  const w = my > their;
  return `<div class="rline"><span class="muted">${home ? 'VS' : '@'}</span>${crest(opp, 'sm')}<span>${TEAMS[opp].name}</span>
    <b class="${w ? 'win' : 'loss'}">${w ? 'W' : g.res.dec === 'REG' ? 'L' : 'OTL'} ${my}-${their}${g.res.dec !== 'REG' ? ' ' + g.res.dec : ''}</b></div>`;
}

function hubSchedule(lg) {
  const rows = lg.schedule.map((day, i) => {
    const g = day.find((x) => x.h === lg.userTeam || x.a === lg.userTeam);
    return `<div class="sline ${i === lg.day && lg.phase === 'season' ? 'now' : ''}"><span class="muted">G${i + 1}</span>${resultLine(lg, g)}</div>`;
  });
  let po = '';
  if (lg.playoffs) {
    for (const round of lg.playoffs.rounds) for (const s of round) {
      if (s.hi !== lg.userTeam && s.lo !== lg.userTeam) continue;
      po += s.games.map((g, i) => `<div class="sline"><span class="muted">P${i + 1}</span>${resultLine(lg, { h: g.h, a: g.a, res: g })}</div>`).join('');
    }
  }
  return `<div class="card">${po ? `<div class="label">PLAYOFFS</div>${po}<div class="label">REGULAR SEASON</div>` : ''}${rows.join('')}</div>`;
}

function bracket(lg) {
  if (!lg.playoffs) return '';
  return `<div class="card"><div class="label">PLAYOFF BRACKET</div><div class="bracket">${lg.playoffs.rounds.map((round) => `
    <div class="round"><h4>${L.ROUND_NAMES[round.length].toUpperCase()}</h4>${round.map((s) => `
      <div class="series ${s.hi === lg.userTeam || s.lo === lg.userTeam ? 'me' : ''}">
        <div class="${s.winner === s.hi ? 'won' : s.winner === s.lo ? 'lost' : ''}">${crest(s.hi, 'sm')}${TEAMS[s.hi].abbr}<b>${s.w[0]}</b></div>
        <div class="${s.winner === s.lo ? 'won' : s.winner === s.hi ? 'lost' : ''}">${crest(s.lo, 'sm')}${TEAMS[s.lo].abbr}<b>${s.w[1]}</b></div>
      </div>`).join('')}</div>`).join('')}</div></div>`;
}

function hubStandings(lg) {
  return `${bracket(lg)}<div class="grid2">${CONFERENCES.map((c, ci) => `
    <div class="card"><div class="label">${c.name.toUpperCase()} CONFERENCE · TOP 8 MAKE THE PLAYOFFS</div>
      ${standingsTable(L.standings(lg, (t) => t.conf === ci), { cut: 8, title: 'CONFERENCE' })}
      ${c.divisions.map((d, di) => standingsTable(L.standings(lg, (t) => t.conf === ci && t.div === di), { title: d.toUpperCase() + ' DIVISION' })).join('')}
    </div>`).join('')}</div>`;
}

function hubRoster(lg) {
  const t = lg.teams[lg.userTeam];
  const lineOf = {};
  t.lines.F.forEach((l, i) => l.forEach((id) => (lineOf[id] = `F${i + 1}`)));
  t.lines.D.forEach((l, i) => l.forEach((id) => (lineOf[id] = `D${i + 1}`)));
  const sk = (pos) => t.roster.filter((p) => pos.includes(p.pos)).sort((a, b) => (lineOf[a.id] || 'Z').localeCompare(lineOf[b.id] || 'Z') || L.ovr(b) - L.ovr(a));
  const head = `<tr><th>LINE</th><th>#</th><th class="l">NAME</th><th>POS</th><th>AGE</th><th class="l">TYPE</th><th>OVR</th><th>SPD</th><th>SHT</th><th>ACC</th><th>PAS</th><th>HND</th><th>CHK</th><th>DEF</th><th>GP</th><th>G</th><th>A</th><th>PTS</th><th>PIM</th></tr>`;
  const row = (p) => `<tr><td>${lineOf[p.id] || ''}</td><td>${p.num}</td><td class="l">${esc(p.first)} ${esc(p.name)}</td><td>${p.pos}</td><td>${p.age}</td><td class="l muted">${p.arch}</td>
    <td><b>${L.ovr(p)}</b></td>${['spd', 'sht', 'acc', 'pas', 'hnd', 'chk', 'def'].map((k) => `<td class="r${Math.floor(p.r[k] / 10)}">${p.r[k]}</td>`).join('')}
    <td>${p.s.gp}</td><td>${p.s.g}</td><td>${p.s.a}</td><td><b>${p.s.g + p.s.a}</b></td><td>${p.s.pim}</td></tr>`;
  const goalies = t.roster.filter((p) => p.pos === 'G');
  return `
    <div class="card"><div class="label">FORWARDS</div><div class="scroll"><table class="tbl">${head}${sk(['C', 'LW', 'RW']).map(row).join('')}</table></div></div>
    <div class="card"><div class="label">DEFENSE</div><div class="scroll"><table class="tbl">${head}${sk(['D']).map(row).join('')}</table></div></div>
    <div class="card"><div class="label">GOALIES</div><div class="scroll"><table class="tbl">
      <tr><th></th><th>#</th><th class="l">NAME</th><th>AGE</th><th class="l">TYPE</th><th>OVR</th><th>GK</th><th>REB</th><th>GP</th><th>W</th><th>L</th><th>OTL</th><th>SV%</th><th>SO</th></tr>
      ${goalies.map((p) => `<tr><td>${t.lines.G[0] === p.id ? '<b>STARTER</b>' : `<button class="mini" data-act="starter" data-id="${p.id}">START</button>`}</td>
        <td>${p.num}</td><td class="l">${esc(p.first)} ${esc(p.name)}</td><td>${p.age}</td><td class="l muted">${p.arch}</td><td><b>${L.ovr(p)}</b></td>
        <td>${p.r.gk}</td><td>${p.r.reb}</td><td>${p.s.gp}</td><td>${p.s.w}</td><td>${p.s.l}</td><td>${p.s.otl}</td><td>${pct(p.s.sa - p.s.ga, p.s.sa)}</td><td>${p.s.so}</td></tr>`).join('')}
    </table></div></div>
    <p class="muted center">Lines are set automatically from player ratings. Your team perk: <b>${PERKS[TEAMS[lg.userTeam].perk].name}</b>: ${esc(PERKS[TEAMS[lg.userTeam].perk].desc)}</p>`;
}

A.starter = (d) => {
  const t = app.league.teams[app.league.userTeam];
  t.lines.G = [d.id, t.lines.G.find((x) => x !== d.id)];
  persist();
  render();
};

function hubLeaders(lg) {
  return `<div class="card"><div class="lgrid three">
    ${leaderList(lg, 'pts', 'POINTS', undefined, 10)}${leaderList(lg, 'g', 'GOALS', undefined, 10)}${leaderList(lg, 'a', 'ASSISTS', undefined, 10)}
    ${leaderList(lg, 'svp', 'SAVE %', (v) => v.toFixed(3).replace(/^0/, ''), 10)}${leaderList(lg, 'gaa', 'GA / GAME', (v) => v.toFixed(2), 10)}${leaderList(lg, 'hits', 'HITS', undefined, 10)}
  </div></div>`;
}

function hubNews(lg) {
  return `<div class="card">${lg.news.map((n) => `<p class="news"><span class="muted">${n.year} · DAY ${n.day + 1}</span> ${esc(n.text)}</p>`).join('')}
    ${lg.champions.length ? `<div class="label">CHAMPIONS</div>${lg.champions.map((c) => `<p class="news">${c.year} · ${crest(c.team, 'sm')} ${TEAMS[c.team].name}</p>`).join('')}` : ''}</div>`;
}

function hubSettings(lg) {
  const s = lg.settings;
  return `<div class="card settings">
    <div class="row"><label>PERIOD LENGTH</label>${seg('periodLen', 'league', PERIODS, s.periodLen)}</div>
    <div class="row"><label>DIFFICULTY</label>${seg('difficulty', 'league', DIFFS, s.difficulty)}</div>
    <div class="row"><label>PENALTIES</label>${seg('penalties', 'league', ONOFF, s.penalties)}</div>
    <div class="row"><label>ICING</label>${seg('icing', 'league', ONOFF, s.icing)}</div>
    <div class="row"><label>GOAL REPLAYS</label>${seg('replays', 'prefs', ONOFF, app.prefs.replays)}</div>
    <div class="row"><label>SOUND</label><button data-act="mute">${audio.muted ? 'OFF' : 'ON'}</button></div>
    <div class="row danger"><label>FRANCHISE</label><button data-act="deleteLeague">DELETE SAVE</button></div>
  </div>`;
}

A.deleteLeague = () => {
  if (!confirm('Delete this franchise for good?')) return;
  app.league = null;
  remove('franchise');
  screen(titleScreen);
};

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
A.nextSeason = () => { L.startNextSeason(app.league); persist(); app.tab = 'home'; render(); };

// ---------------------------------------------------------------- franchise games

function franchiseSpec(watch) {
  const lg = app.league;
  const g = L.userGameToday(lg);
  const userHome = g.h === lg.userTeam;
  const opp = userHome ? g.a : g.h;
  const playoff = lg.phase === 'playoffs';
  // Pre-sim the rest of the day so the ticker can show live scores.
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
  return {
    mode: watch ? 'watch' : 'franchise',
    teams: [lg.userTeam, opp],
    homeIdx: userHome ? 0 : 1,
    rosters: lg.teams,
    humans: watch ? [] : [{ team: 0 }],
    cfg: { periodLen: s.periodLen, ot: playoff ? 'playoff' : 'reg', penalties: s.penalties, icing: s.icing, difficulty: s.difficulty },
    pre, ticker,
    label: lg.phase === 'season' ? `GAME ${lg.day + 1} OF ${lg.schedule.length}` : 'PLAYOFFS',
  };
}

A.play = () => { const sp = franchiseSpec(false); sp.onEnd = wrapEnd(sp); screen(() => pregameScreen(sp)); };
A.watch = () => { const sp = franchiseSpec(true); sp.onEnd = wrapEnd(sp); screen(() => pregameScreen(sp)); };

function wrapEnd(sp) {
  const lg = app.league;
  return (res) => {
    L.simDay(lg, res, sp.pre);
    persist();
    screen(() => postgameScreen(res, sp));
  };
}

// ---------------------------------------------------------------- exhibition

function exhibitionScreen() {
  const e = app.exh, p = app.prefs;
  const picker = (k, who) => {
    const id = e[k];
    const t = TEAMS[id];
    const o = L.teamOvr(EXH[id]);
    return `<div class="tpick" style="--p:${t.primary};--s:${t.secondary}">
      <div class="who">${who}</div>
      <div class="tp-row"><button data-act="cycle" data-k="${k}" data-d="-1">◀</button>${crest(id, 'xl')}<button data-act="cycle" data-k="${k}" data-d="1">▶</button></div>
      <h3>${t.name.toUpperCase()}</h3>
      <div class="muted">${esc(t.tagline)}</div>
      <div class="ovr">OFF ${o.off} · DEF ${o.def} · G ${o.gk}</div>
      <div class="perk"><b>${PERKS[t.perk].name.toUpperCase()}</b> ${esc(PERKS[t.perk].desc)}</div>
      <button class="ghost ${e.home === (k === 'a' ? 0 : 1) ? 'on' : ''}" data-act="set" data-scope="exh" data-k="home" data-v="${k === 'a' ? 0 : 1}">${e.home === (k === 'a' ? 0 : 1) ? '★ HOME ICE' : 'SET AS HOME'}</button>
    </div>`;
  };
  const who = e.mode === '2p' ? ['PLAYER 1', 'PLAYER 2'] : e.mode === 'cpu' ? ['CPU', 'CPU'] : ['YOU', 'CPU'];
  return {
    html: `
    <div class="page">
      <header class="bar"><button class="ghost" data-act="home">◀ MENU</button><h1>QUICK GAME</h1><span></span></header>
      <div class="panel settings">
        <div class="row"><label>MODE</label>${seg('mode', 'exh', [['1p', '1P VS CPU'], ['2p', '2 PLAYERS'], ['cpu', 'CPU VS CPU']], e.mode)}</div>
        <div class="row"><label>PERIOD LENGTH</label>${seg('periodLen', 'prefs', PERIODS, p.periodLen)}</div>
        <div class="row"><label>DIFFICULTY</label>${seg('difficulty', 'prefs', DIFFS, p.difficulty)}</div>
        <div class="row"><label>PENALTIES</label>${seg('penalties', 'prefs', ONOFF, p.penalties)}<label>ICING</label>${seg('icing', 'prefs', ONOFF, p.icing)}</div>
      </div>
      <div class="matchup">${picker('a', who[0])}<div class="vs">VS</div>${picker('b', who[1])}</div>
      ${e.mode === '2p' ? `<p class="center muted">P1: WASD + C pass · V shoot · B deke · L-Shift sprint &nbsp;|&nbsp; P2: Arrows + , pass · . shoot · / deke · R-Shift sprint · or plug in two gamepads</p>` : ''}
      <div class="center"><button class="primary big" data-act="startExh">FACE OFF ▶</button></div>
    </div>`,
  };
}

A.exhibition = () => screen(exhibitionScreen);
A.cycle = (d) => {
  let v = (app.exh[d.k] + +d.d + 32) % 32;
  const other = app.exh[d.k === 'a' ? 'b' : 'a'];
  if (v === other) v = (v + +d.d + 32) % 32;
  app.exh[d.k] = v;
  render();
};
A.startExh = () => {
  const e = app.exh, p = app.prefs;
  const humans = e.mode === '2p' ? [{ team: 0 }, { team: 1 }] : e.mode === 'cpu' ? [] : [{ team: 0 }];
  const sp = {
    mode: e.mode === 'cpu' ? 'watch' : 'exhibition',
    teams: [e.a, e.b], homeIdx: e.home, rosters: EXH, humans,
    cfg: { periodLen: p.periodLen, ot: 'reg', penalties: p.penalties, icing: p.icing, difficulty: p.difficulty },
    label: 'EXHIBITION',
  };
  sp.onEnd = (res) => screen(() => postgameScreen(res, sp));
  screen(() => pregameScreen(sp));
};

// ---------------------------------------------------------------- pregame / game / postgame

function controlsHtml(n = 1) {
  if (n === 2) {
    return `<table class="keys"><tr><th></th><th>P1</th><th>P2</th><th>GAMEPAD</th></tr>
      <tr><td>SKATE</td><td>WASD</td><td>ARROWS</td><td>STICK / D-PAD</td></tr>
      <tr><td>PASS · SWITCH</td><td>C</td><td>,</td><td>A</td></tr>
      <tr><td>SHOOT · CHECK</td><td>V</td><td>.</td><td>B</td></tr>
      <tr><td>DEKE · POKE</td><td>B</td><td>/</td><td>X</td></tr>
      <tr><td>SPRINT</td><td>L-SHIFT</td><td>R-SHIFT</td><td>RB / RT</td></tr></table>`;
  }
  return `<table class="keys"><tr><th></th><th>OFFENSE</th><th>DEFENSE</th><th>KEYS</th><th>PAD</th></tr>
    <tr><td>SKATE</td><td colspan="2">move</td><td>WASD / ARROWS</td><td>STICK</td></tr>
    <tr><td>BUTTON 1</td><td>PASS</td><td>SWITCH PLAYER</td><td>J or Z</td><td>A</td></tr>
    <tr><td>BUTTON 2</td><td>SHOOT (hold = slapper)</td><td>BODY CHECK</td><td>K or X</td><td>B</td></tr>
    <tr><td>BUTTON 3</td><td>DEKE</td><td>POKE CHECK</td><td>L or C</td><td>X</td></tr>
    <tr><td>SPRINT</td><td colspan="2">burns energy</td><td>SHIFT / SPACE</td><td>RB / RT</td></tr>
    <tr><td>PAUSE</td><td colspan="2"></td><td>ESC / P</td><td>START</td></tr></table>`;
}

function pregameScreen(sp) {
  const [a, b] = sp.teams;
  const home = sp.teams[sp.homeIdx], away = sp.teams[1 - sp.homeIdx];
  const H = TEAMS[home], Aw = TEAMS[away];
  const perk = (id) => `<p><b>${TEAMS[id].name}</b>: <span class="hl">${PERKS[TEAMS[id].perk].name}</span>, ${esc(PERKS[TEAMS[id].perk].desc)}</p>`;
  const per = PERIODS.find((x) => x[0] === sp.cfg.periodLen)?.[1] || sp.cfg.periodLen + 's';
  return {
    cls: 'pregame-bg',
    html: `
    <div class="pregame">
      <div class="label">${sp.label}${sp.cfg.ot === 'playoff' ? ' · SUDDEN-DEATH OT' : ''}</div>
      <div class="ng-teams">
        <div>${crest(away, 'xl')}<b>${Aw.name.toUpperCase()}</b></div><em>AT</em><div>${crest(home, 'xl')}<b>${H.name.toUpperCase()}</b></div>
      </div>
      <div class="arena-card"><b>${esc(H.arena).toUpperCase()}</b>: home of the ${H.name}. ${per} periods${sp.cfg.periodLen >= 600 ? ` (clock runs ${sp.cfg.periodLen >= 1200 ? 3 : 2}x)` : ''}${sp.cfg.penalties ? '' : ' · penalties off'}${sp.cfg.icing ? '' : ' · icing off'}.</div>
      ${perk(away)}${perk(home)}
      ${sp.humans.length ? `<p class="muted">You control ${sp.humans.length === 2 ? 'both teams' : 'the <b>' + TEAMS[a].name + '</b>'}, attacking <b>up</b> the ice${sp.humans.length === 2 ? ' (P1) and down (P2)' : ''}. Win the draw by pressing PASS or SHOOT as the puck drops.</p>` : '<p class="muted">CPU vs CPU. Press TAB to fast-forward.</p>'}
      ${controlsHtml(sp.humans.length)}
      <div class="btnrow center">
        <button class="ghost" data-act="${isFranchise(sp) ? 'continue' : 'exhibition'}">BACK</button>
        <button class="primary big" data-act="dropPuck">DROP THE PUCK ▶</button>
      </div>
    </div>`,
    after: () => { app.pending = sp; },
  };
}

A.dropPuck = () => { audio.unlock(); launch(app.pending); };

function speedKey(e) {
  if (e.code === 'Tab' && app.game?.cycleSpeed) { e.preventDefault(); app.game.cycleSpeed(); }
}

function gameShell(sp, extra = '') {
  return `<div class="game">
    <div class="stage" id="stage"><canvas id="cv" width="400" height="300"></canvas></div>
    <div class="ticker" id="ticker">${extra}</div>
    <div class="pause hidden" id="pause"><div class="pbox">
      <h2>PAUSED</h2>
      <button class="primary" data-act="resume">RESUME</button>
      ${sp.mode !== 'online' ? `<button data-act="simRest">SIM TO END</button>` : ''}
      <button data-act="quitGame">${sp.mode === 'online' ? 'LEAVE GAME' : isFranchise(sp) ? 'SIM TO END & EXIT' : 'QUIT TO MENU'}</button>
      <button class="ghost" data-act="toggleMuteInGame">SOUND: ${audio.muted ? 'OFF' : 'ON'}</button>
      ${controlsHtml(sp.humans?.length || 1)}
    </div></div>
  </div>`;
}

function fit() {
  const st = $('#stage'), cv = $('#cv');
  if (!st || !cv) return;
  const w = st.clientWidth, h = st.clientHeight;
  // Portrait screens get a taller rink view; the vertical scroller suits them.
  const ih = Math.max(300, Math.min(640, Math.round((400 * h) / w)));
  app.game?.r?.resize(ih);
  cv.height = ih;
  let s = Math.min(w / 400, h / ih);
  if (s >= 2) s = Math.floor(s);
  cv.style.width = Math.floor(400 * s) + 'px';
  cv.style.height = Math.floor(ih * s) + 'px';
}
window.addEventListener('resize', fit);

function launch(sp) {
  stopGame();
  app.cur = null;
  app.spec = sp;
  $app.className = 'ingame';
  $app.innerHTML = gameShell(sp);
  input.setPlayers(sp.humans.length === 2 ? 2 : 1);
  input.active = true;
  const g = new LocalGame({
    canvas: $('#cv'), input, audio,
    teams: sp.teams.map((id, i) => L.gameTeam(sp.rosters, id, i === sp.homeIdx)),
    teamDefs: sp.teams.map((id) => TEAMS[id]),
    homeIdx: sp.homeIdx, cfg: sp.cfg, humans: sp.humans, replays: app.prefs.replays,
    onEnd: (res) => sp.onEnd(res),
    onTick: (snap) => tick(snap, sp),
  });
  app.game = g;
  input.onPause = () => togglePause();
  if (!sp.humans.length) document.addEventListener('keydown', speedKey);
  if (sp.humans.length && mountTouch($('.game'), input)) $('.game').classList.add('has-touch');
  fit();
  g.start();
}

let lastTick = 0;
function tick(snap, sp) {
  const now = performance.now();
  if (now - lastTick < 500) return;
  lastTick = now;
  const el = $('#ticker');
  if (!el) return;
  if (!sp.ticker || !sp.ticker.length) {
    el.innerHTML = sp.mode === 'online' ? `<span class="tk">ONLINE · ROOM ${esc(sp.code || '')}</span>` : `<span class="tk">${esc(sp.label)} · ${TEAMS[sp.teams[1 - sp.homeIdx]].abbr} AT ${TEAMS[sp.teams[sp.homeIdx]].abbr}</span>`;
    return;
  }
  const final = snap.ph === 'final';
  const prog = final ? 1 : snap.per > 3 ? 0.999 : Math.min(0.999, (snap.per - 1 + (1 - snap.clk / sp.cfg.periodLen)) / 3);
  el.innerHTML = `<span class="tk live">LIVE</span>` + sp.ticker.map((t) => {
    const sc = t.marks.map((m) => m.filter((f) => f <= prog).length);
    const done = final;
    const lbl = done ? `FINAL${t.res.decision !== 'REG' ? '/' + t.res.decision : ''}` : ['1ST', '2ND', '3RD'][Math.min(2, Math.floor(prog * 3))];
    return `<span class="tk">${TEAMS[t.a].abbr} <b>${sc[1]}</b> ${TEAMS[t.h].abbr} <b>${sc[0]}</b> <i>${lbl}</i></span>`;
  }).join('');
}

function togglePause() {
  const g = app.game;
  if (!g || !$('#pause')) return;
  const p = $('#pause').classList.toggle('hidden');
  if (g.setPaused) g.setPaused(!p);
}
A.resume = () => togglePause();
A.toggleMuteInGame = (d, el) => { audio.setMuted(!audio.muted); el.textContent = `SOUND: ${audio.muted ? 'OFF' : 'ON'}`; };
A.simRest = () => {
  const g = app.game, sp = app.spec;
  if (!g?.simToEnd) return;
  $('#pause .pbox').innerHTML = '<h2>SIMULATING…</h2>';
  g.simToEnd((res) => sp.onEnd(res));
};
A.quitGame = () => {
  const sp = app.spec;
  if (sp.mode === 'online') { leaveOnline(); return; }
  if (isFranchise(sp)) { A.simRest(); return; }
  screen(titleScreen);
};

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
  const perH = [...Array(nPer)].map((_, i) => (i < 3 ? ['1ST', '2ND', '3RD'][i] : 'OT'));
  const stars = threeStars(res, sp);
  const name = (tid, pid) => {
    const p = sp.rosters[tid].roster.find((x) => x.id === pid);
    return p ? `${p.first[0]}. ${p.name}` : '?';
  };
  const winner = res.score[0] > res.score[1] ? 0 : 1;
  const buttons = sp.mode === 'online'
    ? `<button class="primary" data-act="rematch">REMATCH</button><button data-act="leaveOnline">LEAVE</button>`
    : isFranchise(sp)
      ? `<button class="primary" data-act="continue">CONTINUE ▶</button>`
      : `<button class="primary" data-act="again">PLAY AGAIN</button><button data-act="exhibition">CHANGE TEAMS</button><button class="ghost" data-act="home">MENU</button>`;
  app.lastSpec = sp;
  return {
    cls: 'post-bg',
    html: `
    <div class="page post">
      <div class="label center">FINAL${res.decision !== 'REG' ? ' / ' + res.decision : ''}</div>
      <div class="final-score">
        ${order.map((i) => `<div class="fs ${i === winner ? 'w' : ''}">${crest(ids[i], 'xl')}<b>${TEAMS[ids[i]].name.toUpperCase()}</b><span class="big-score">${res.score[i]}</span></div>`).join('<em>-</em>')}
      </div>
      <div class="grid2">
        <div class="card">
          <div class="label">BOX SCORE</div>
          <table class="tbl"><tr><th class="l"></th>${perH.map((p) => `<th>${p}</th>`).join('')}${res.decision === 'SO' ? '<th>SO</th>' : ''}<th>T</th></tr>
          ${order.map((i) => `<tr><td class="l">${crest(ids[i], 'sm')} ${TEAMS[ids[i]].abbr}</td>${perH.map((_, p) => `<td>${res.perScore[i][p] || 0}</td>`).join('')}${res.decision === 'SO' ? `<td>${i === winner ? 1 : 0}</td>` : ''}<td><b>${res.score[i]}</b></td></tr>`).join('')}</table>
          <table class="tbl stats">
            <tr><th class="l"></th>${order.map((i) => `<th>${TEAMS[ids[i]].abbr}</th>`).join('')}</tr>
            <tr><td class="l">SHOTS</td>${order.map((i) => `<td>${res.shots[i]}</td>`).join('')}</tr>
            <tr><td class="l">POWER PLAY</td>${order.map((i) => `<td>${res.ppg[i]}/${res.ppo[i]}</td>`).join('')}</tr>
            <tr><td class="l">PIM</td>${order.map((i) => `<td>${res.pim[i]}</td>`).join('')}</tr>
            <tr><td class="l">HITS</td>${order.map((i) => `<td>${res.hits[i]}</td>`).join('')}</tr>
            <tr><td class="l">FACEOFFS</td>${order.map((i) => `<td>${res.fow[i]}</td>`).join('')}</tr>
          </table>
        </div>
        <div class="card">
          <div class="label">THREE STARS</div>
          ${stars.map((s, n) => `<div class="star"><span class="stars">${'★'.repeat(n + 1)}</span>${crest(s.tid, 'sm')}<b>${esc(s.p.first[0])}. ${esc(s.p.name)}</b><span class="muted">${s.line}</span></div>`).join('')}
          <div class="label">SCORING</div>
          ${res.goals.length ? res.goals.map((g) => `<div class="goal">
            <span class="muted">${g.per <= 3 ? ['1ST', '2ND', '3RD'][g.per - 1] : 'OT'}${g.clock ? ' ' + mmss(sp.cfg.periodLen - g.clock > 0 && g.per <= 3 ? sp.cfg.periodLen - g.clock : Math.max(0, g.clock)) : ''}</span>
            ${crest(ids[g.team], 'sm')}
            <span>${g.pid ? esc(name(ids[g.team], g.pid)) : 'OWN GOAL'}${g.a.length ? ` <span class="muted">(${g.a.map((a) => esc(name(ids[g.team], a))).join(', ')})</span>` : ''}</span>
            ${g.tags.map((t) => `<em class="tag">${t}</em>`).join('')}
          </div>`).join('') : '<p class="muted">No goals.</p>'}
          ${res.so ? `<div class="label">SHOOTOUT</div><p>${res.so.log.map((l) => `${TEAMS[ids[l.team]].abbr} ${esc(name(ids[l.team], l.pid))} ${l.goal ? '✔' : '✘'}`).join(' · ')}</p>` : ''}
        </div>
      </div>
      <div class="btnrow center">${buttons}</div>
    </div>`,
  };
}

A.again = () => {
  const sp = app.lastSpec;
  screen(() => pregameScreen(sp));
};

// ---------------------------------------------------------------- online

function wsUrl() {
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

function netSend(m) {
  if (app.net && app.net.readyState === 1) app.net.send(JSON.stringify(m));
}

function netConnect(onOpen) {
  if (app.net && app.net.readyState <= 1) { if (app.net.readyState === 1) onOpen(); else app.net.addEventListener('open', onOpen, { once: true }); return; }
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
    if (app.spec?.mode === 'online' && app.game) { stopGame(); onlineNotice('Connection lost.'); }
  });
  ws.addEventListener('error', () => onlineNotice('Could not reach the game server.'));
}

function onlineLobby() {
  const o = app.online;
  return {
    html: `
    <div class="page">
      <header class="bar"><button class="ghost" data-act="home">◀ MENU</button><h1>PLAY ONLINE</h1><span></span></header>
      ${o.notice ? `<div class="card notice">${esc(o.notice)}</div>` : ''}
      <div class="card">
        <div class="label">1 · PICK YOUR TEAM</div>
        <div class="crest-grid">${TEAMS.map((t) => `<button class="cg ${o.team === t.id ? 'sel' : ''}" data-act="onlineTeam" data-id="${t.id}" title="${t.name}">${crest(t.id)}</button>`).join('')}</div>
        <p class="center"><b>${TEAMS[o.team].name.toUpperCase()}</b> · ${PERKS[TEAMS[o.team].perk].name}: ${esc(PERKS[TEAMS[o.team].perk].desc)}</p>
      </div>
      <div class="grid2">
        <div class="card">
          <div class="label">2A · HOST A GAME</div>
          <div class="row"><label>PERIODS</label>${seg('periodLen', 'prefs', PERIODS.slice(0, 4), app.prefs.periodLen)}</div>
          <p class="muted">You get a 4-letter room code to send to a friend.</p>
          <button class="primary" data-act="createRoom">CREATE ROOM</button>
        </div>
        <div class="card">
          <div class="label">2B · JOIN A FRIEND</div>
          <input id="code" class="code-in" maxlength="4" placeholder="CODE" autocomplete="off" spellcheck="false">
          <button class="primary" data-act="joinRoom">JOIN ROOM</button>
        </div>
      </div>
    </div>`,
  };
}

function onlineNotice(msg) {
  app.online.notice = msg;
  if (!app.game) screen(onlineLobby);
}

A.online = () => { app.online.notice = ''; screen(onlineLobby); };
A.onlineTeam = (d) => { app.online.team = +d.id; render(); };
A.createRoom = () => {
  netConnect(() => netSend({ t: 'create', team: app.online.team, cfg: { periodLen: Math.min(480, app.prefs.periodLen) } }));
};
A.joinRoom = () => {
  const code = ($('#code')?.value || '').toUpperCase().trim();
  if (code.length !== 4) { onlineNotice('Room codes are 4 letters.'); return; }
  netConnect(() => netSend({ t: 'join', code, team: app.online.team }));
};

function waitingScreen(code) {
  return {
    html: `<div class="page center waiting">
      <div class="label">ROOM CODE</div>
      <div class="room-code">${esc(code)}</div>
      <p>Send this code to a friend. They pick PLAY ONLINE → JOIN.</p>
      <p class="muted blink">WAITING FOR OPPONENT…</p>
      <button class="ghost" data-act="leaveOnline">CANCEL</button>
    </div>`,
  };
}

function onNet(m) {
  switch (m.t) {
    case 'created':
      app.online.code = m.code;
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
      app.online.notice = '';
      screen(() => waitingScreen(app.online.code || ''));
      break;
    case 'left':
      stopGame();
      onlineNotice('Your opponent left the game.');
      break;
    case 'error':
      onlineNotice(m.msg || 'Something went wrong.');
      break;
    default:
      break;
  }
}

function launchOnline(m) {
  stopGame();
  app.online.code = m.code;
  const sp = {
    mode: 'online', teams: m.teams, homeIdx: m.homeIdx, rosters: EXH, humans: [{ team: m.side }],
    cfg: m.cfg, label: 'ONLINE', code: m.code,
  };
  app.spec = sp;
  app.cur = null;
  $app.className = 'ingame';
  $app.innerHTML = gameShell(sp);
  input.setPlayers(1);
  input.active = true;
  const g = new OnlineGame({
    canvas: $('#cv'), input, audio, send: netSend, side: m.side,
    teamDefs: m.teams.map((id) => TEAMS[id]), homeIdx: m.homeIdx,
    onTick: (snap) => tick(snap, sp),
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
  screen(onlineLobby);
}
A.leaveOnline = () => leaveOnline();
A.rematch = () => netSend({ t: 'rematch' });

// ---------------------------------------------------------------- how to play

function howtoScreen() {
  return {
    html: `
    <div class="page howto">
      <header class="bar"><button class="ghost" data-act="home">◀ MENU</button><h1>HOW TO PLAY</h1><span></span></header>
      <div class="card"><div class="label">CONTROLS</div>${controlsHtml(1)}
        <p class="muted">Two players on one keyboard: P1 WASD + C/V/B + Left Shift, P2 Arrows + , . / + Right Shift. Gamepads work too, and phones get on-screen controls.</p></div>
      <div class="grid2">
        <div class="card"><div class="label">ON OFFENSE</div>
          <p><b>Tap shoot</b> for a quick wrist shot. <b>Hold shoot</b> to wind up a slap shot. Watch the meter, but you skate slowly while you load it.</p>
          <p><b>One-timer:</b> press shoot while your pass is still travelling. The receiver fires on arrival before the goalie can get across.</p>
          <p><b>Aim:</b> hold left or right as you release to pick a post. Shots that hit the top of the net are <b>TOP SHELF</b>.</p>
          <p><b>Deke</b> to sidestep a check or poke. Carry it behind the net and come out the other side for a <b>wraparound</b>.</p>
        </div>
        <div class="card"><div class="label">ON DEFENSE</div>
          <p><b>Switch</b> takes control of the skater closest to the puck.</p>
          <p><b>Body check</b> lunges forward. Flatten the puck carrier and the puck is loose. Hitting someone without the puck is interference.</p>
          <p><b>Poke check</b> stabs at the puck. Miss and catch the skater instead, and that's 2 minutes for hooking or tripping.</p>
        </div>
        <div class="card"><div class="label">THE RULES</div>
          <p>Three periods. Tied after regulation: 3-on-3 sudden-death overtime, then a <b>shootout</b>. In the playoffs, overtime is 5-on-5 until somebody scores.</p>
          <p>A win is 2 points, an overtime or shootout loss is 1. The top 8 in each conference make the playoffs.</p>
          <p>Penalties are 2-minute minors (scaled to the period length). A power-play goal frees the penalized player. Icing brings the puck back to your zone, and the icing team can't change lines. As in the classics, there is no offside.</p>
        </div>
        <div class="card"><div class="label">LINES & ENERGY</div>
          <p>Each team rolls 4 forward lines and 3 defense pairs. Skating and sprinting drain the energy bar under your player, and tired legs are slow legs.</p>
          <p>Lines change at whistles, and tired skaters swap on the fly from the bench. Every team has a <b>perk</b>: Cannon, Brick Wall, Snipers, Sandpaper, and more.</p>
        </div>
      </div>
    </div>`,
  };
}

// ---------------------------------------------------------------- boot
screen(titleScreen);
