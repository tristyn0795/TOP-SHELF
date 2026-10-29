// Pre-game and post-game shows: a running order of booth lines, each with an optional
// stat card, played over the animated desk.
import { linesIn } from '/shared/booth-lines.js';
import { TEAMS, PERKS } from '/shared/teams.js';
import { crest, crestURL } from '../crest.js';
import { drawDesk, DESK_W, DESK_H } from './portraits.js';

const T = (id) => TEAMS[id];
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const barPct = (v) => Math.max(6, Math.min(100, Math.round(((v - 55) / 37) * 100)));
const rec = (r) => (r ? `${r.w}-${r.l}-${r.otl}` : '');

// ---------------------------------------------------------------- cards

function cardMatchup(c) {
  const side = (id, tag) => `<div class="sc-team">${crest(T(id), 'lg')}<small>${tag}</small><b>${esc(T(id).city).toUpperCase()}</b><span>${esc(T(id).name).toUpperCase()}</span>${c.recs?.[id] ? `<em>${rec(c.recs[id])}</em>` : ''}</div>`;
  return `<div class="show-card"><h3>${esc(c.label)}</h3><div class="sc-vs">${side(c.away, 'AWAY')}<i>AT</i>${side(c.home, 'HOME')}</div><p>${esc(T(c.home).arena).toUpperCase()}</p></div>`;
}

function cardStakes(c) {
  return `<div class="show-card"><h3>WHAT'S AT STAKE</h3><p class="big">${esc(c.stakes)}</p></div>`;
}

function cardForm(c) {
  const row = (id) => {
    const r = c.recs[id];
    return `<tr><td class="l">${crest(T(id), 'sm')} ${esc(T(id).city).toUpperCase()}</td><td>${rec(r)}</td><td>${r.pts}</td><td>${r.streak || '-'}</td><td>${r.l10.filter((x) => x === 'W').length}-${r.l10.filter((x) => x !== 'W').length}</td><td>${c.divRank[id]}</td></tr>`;
  };
  return `<div class="show-card"><h3>FORM GUIDE</h3><table class="tbl"><tr><th class="l"></th><th>REC</th><th>PTS</th><th>STRK</th><th>L10</th><th>DIV</th></tr>${row(c.away)}${row(c.home)}</table></div>`;
}

function cardTape(c) {
  const ra = c.ratings[c.away], rh = c.ratings[c.home];
  const rows = [['OFFENSE', 'off'], ['DEFENSE', 'def'], ['GOALTENDING', 'gk'], ['SKATING', 'spd'], ['CHECKING', 'chk'], ['OVERALL', 'all']]
    .map(([l, k]) => `<div class="cmp"><b class="${ra[k] >= rh[k] ? 'hi' : ''}">${ra[k]}</b><i class="l" style="--v:${barPct(ra[k])}%"></i><span>${l}</span><i class="r" style="--v:${barPct(rh[k])}%"></i><b class="${rh[k] >= ra[k] ? 'hi' : ''}">${rh[k]}</b></div>`).join('');
  return `<div class="show-card"><h3>TALE OF THE TAPE · ${T(c.away).abbr} VS ${T(c.home).abbr}</h3>${rows}</div>`;
}

function cardKeys(c, id) {
  const p = PERKS[T(id).perk];
  return `<div class="show-card"><h3>KEYS TO THE GAME</h3><div class="sc-key">${crest(T(id), 'lg')}<div><b>${esc(T(id).fullName).toUpperCase()}</b><span>SPECIALTY: ${p.name.toUpperCase()}</span><small>${esc(p.desc)}</small></div></div></div>`;
}

function cardPlayers(c) {
  const col = (id) => {
    const p = c.players[id];
    return `<div class="sc-pl">${crest(T(id), 'sm')} <b>${T(id).abbr}</b>${p.top.map((x) => `<div>#${x.num} ${esc(x.name).toUpperCase()} <em>${x.line}</em></div>`).join('')}<div>G #${p.goalie.num} ${esc(p.goalie.name).toUpperCase()} <em>${p.goalie.line}</em></div></div>`;
  };
  return `<div class="show-card"><h3>PLAYERS TO WATCH</h3><div class="sc-cols">${col(c.away)}${col(c.home)}</div></div>`;
}

function cardFinal(c) {
  const row = (id, i) => `<div class="sc-final ${id === c.winner ? 'w' : ''}">${crest(T(id), 'sm')}<b>${esc(T(id).city).toUpperCase()}</b><span>${c.score[i]}</span></div>`;
  return `<div class="show-card"><h3>FINAL${c.decision !== 'REG' ? ' / ' + c.decision : ''}</h3>${row(c.ids[0], 0)}${row(c.ids[1], 1)}<p>SHOTS ${c.shots[0]}-${c.shots[1]}</p></div>`;
}

function cardStars(c) {
  return `<div class="show-card"><h3>THREE STARS</h3>${c.stars.map((s, n) => `<div class="sc-star"><em>${'★'.repeat(n + 1)}</em>${crest(T(s.tid), 'sm')}<b>${esc(s.name).toUpperCase()}</b><small>${s.line}</small></div>`).join('')}</div>`;
}

function cardBox(c) {
  const [a, b] = c.ids;
  const r = c.res;
  const row = (l, k, f = (i) => r[k][i]) => `<tr><td class="l">${l}</td><td>${f(0)}</td><td>${f(1)}</td></tr>`;
  return `<div class="show-card"><h3>BY THE NUMBERS</h3><table class="tbl"><tr><th class="l"></th><th>${T(a).abbr}</th><th>${T(b).abbr}</th></tr>
    ${row('SHOTS', 'shots')}${row('POWER PLAY', 'ppg', (i) => `${r.ppg[i]}/${r.ppo[i]}`)}${row('HITS', 'hits')}${row('FACEOFFS WON', 'fow')}${row('PIM', 'pim')}</table></div>`;
}

function cardText(title, text) {
  return `<div class="show-card"><h3>${title}</h3><p class="big">${esc(text)}</p></div>`;
}

function cardAround(c) {
  return `<div class="show-card"><h3>AROUND THE LEAGUE</h3><div class="board">${c.around.map((g) => `<div>${T(g.a).abbr} <b>${g.as}</b> ${T(g.h).abbr} <b>${g.hs}</b>${g.dec !== 'REG' ? ` <em>${g.dec}</em>` : ''}</div>`).join('')}</div></div>`;
}

// ---------------------------------------------------------------- running orders

const has = (cat) => linesIn(cat).length > 0;
const step = (cat, slots = {}, card) => ({ cat, slots, card });

/**
 * c: { home, away, label, exhibition, playoff, gameNo, seasonLen, series, recs, divRank, ratings, players, stakes }
 */
export function pregameSteps(c) {
  const s = [];
  s.push(step('pre_open', {}, cardMatchup(c)));
  s.push(step('pre_away', { away: c.away }));
  s.push(step('pre_home', { home: c.home }));
  s.push(step('pre_hello'));
  // stakes
  let stake;
  const sr = c.series;
  if (c.exhibition) stake = step('pre_exhibition');
  else if (c.playoff && sr) {
    const need = Math.ceil(sr.len / 2);
    const [wh, wl] = sr.w;
    const trail = wh < wl ? sr.hi : sr.lo;
    if (sr.final && sr.games === 0) stake = step('pre_final');
    else if (sr.len > 1 && wh === need - 1 && wl === need - 1) stake = step('pre_game7');
    else if (sr.len > 1 && Math.max(wh, wl) === need - 1) stake = step('pre_elimination', { trail });
    else if (sr.games === 0) stake = step(sr.final ? 'pre_final' : 'pre_series_opener');
    else if (wh === wl) stake = step('pre_series_tied');
    else stake = step('pre_series_lead', { lead: wh > wl ? sr.hi : sr.lo });
  } else {
    const early = c.gameNo <= Math.max(3, Math.round(c.seasonLen * 0.15));
    const late = c.gameNo > c.seasonLen * 0.75;
    stake = step(early ? 'pre_early' : late ? 'pre_late' : 'pre_mid');
  }
  stake.card = cardStakes(c);
  s.push(stake);
  // form
  if (!c.exhibition && c.recs) {
    const form = [];
    for (const id of [c.away, c.home]) {
      const st = c.recs[id].streak || '';
      const n = parseInt(st.slice(1), 10) || 0;
      if (st[0] === 'W' && n >= 3) form.push(step('pre_hot', { team: id }));
      else if (st[0] === 'L' && n >= 3) form.push(step('pre_cold', { team: id }));
      else if (c.divRank[id] === 1 && c.recs[id].gp >= 3) form.push(step('pre_leader', { team: id }));
    }
    if (form.length) {
      form[0].card = cardForm(c);
      s.push(...form.slice(0, 2), step('pre_form_eddie'));
    }
  }
  // tale of the tape
  const ra = c.ratings[c.away], rh = c.ratings[c.home];
  let edge;
  if (rh.gk >= 82 && ra.gk >= 82) edge = 'pre_goalie_duel';
  else if (rh.off - ra.off >= 3) edge = 'pre_edge_off_home';
  else if (ra.off - rh.off >= 3) edge = 'pre_edge_off_away';
  else if (rh.gk - ra.gk >= 4) edge = 'pre_edge_g_home';
  else if (ra.gk - rh.gk >= 4) edge = 'pre_edge_g_away';
  else edge = 'pre_edge_even';
  s.push(step('pre_tape', {}, cardTape(c)), step(edge));
  // keys for each club
  for (const id of [c.away, c.home]) {
    const keyCat = `pre_key_${T(id).perk.toLowerCase()}`;
    s.push(step('pre_keys_for', { team: id }, cardKeys(c, id)));
    if (has(keyCat)) s.push(step(keyCat));
  }
  // players + pick + throw
  if (c.players) s.push(step('pre_watch_intro', {}, cardPlayers(c)), step('pre_watch'));
  const diff = rh.all - ra.all;
  s.push(step(diff >= 2 ? 'pre_pick_home' : diff <= -2 ? 'pre_pick_away' : 'pre_pick_even'));
  s.push(step('pre_throw', {}, cardMatchup(c)));
  return s;
}

/**
 * c: { ids, score, winner, loser, decision, res, stars, shots, exhibition, playoff, series, champion,
 *      winnerStreak, comeback, upset, around }
 */
export function postgameSteps(c) {
  const s = [];
  const wi = c.ids.indexOf(c.winner), li = 1 - wi;
  const W = { winner: c.winner };
  const margin = c.score[wi] - c.score[li];
  let result;
  if (c.decision === 'SO') result = 'post_so';
  else if (c.decision === 'OT') result = 'post_ot';
  else if (c.score[li] === 0) result = 'post_shutout';
  else if (c.comeback) result = 'post_comeback';
  else if (c.upset) result = 'post_upset';
  else if (margin >= 3) result = 'post_blowout';
  else if (margin === 1) result = 'post_close';
  else result = 'post_win';
  s.push(step('post_open', {}, cardFinal(c)), step(result, W));
  if (c.stars.length) s.push(step('post_stars', {}, cardStars(c)));
  // Eddie's analysis: up to two takeaways
  const r = c.res;
  const take = [];
  if (r.shots[li] - r.shots[wi] >= 8) take.push('post_e_goalie');
  else if (r.shots[wi] - r.shots[li] >= 8) take.push('post_e_shots');
  if (r.ppg[0] + r.ppg[1] >= 2) take.push('post_e_pp');
  if (r.hits[0] + r.hits[1] >= 45) take.push('post_e_physical');
  if (r.fow[wi] - r.fow[li] >= 8) take.push('post_e_faceoff');
  if (!take.length) take.push('post_e_generic');
  take.slice(0, 2).forEach((cat, i) => s.push(step(cat, {}, i === 0 ? cardBox(c) : undefined)));
  // what it means
  if (c.exhibition) s.push(step('post_exhib'));
  else if (c.playoff && c.series) {
    const sr = c.series;
    if (c.champion) {
      s.push(step('post_champ', W, cardText('SILVER CUP CHAMPIONS', T(c.winner).fullName.toUpperCase())), step('post_e_champ'));
    } else if (sr.winner != null) {
      s.push(step('post_advance', W, cardText('SERIES OVER', `${T(sr.winner).fullName} win the series ${Math.max(...sr.w)}-${Math.min(...sr.w)}`)), step('post_e_elim'));
    } else if (sr.w[0] === sr.w[1]) {
      s.push(step('post_series_tied', {}, cardText('SERIES', `Tied ${sr.w[0]}-${sr.w[1]}`)));
    } else {
      const lead = sr.w[0] > sr.w[1] ? sr.hi : sr.lo;
      s.push(step('post_series_lead', { lead }, cardText('SERIES', `${T(lead).city} lead ${Math.max(...sr.w)}-${Math.min(...sr.w)}`)));
    }
  } else {
    s.push(step(c.winnerStreak >= 3 ? 'post_streak' : 'post_points', W));
  }
  if (c.around?.length) s.push(step('post_around', {}, cardAround(c)));
  s.push(step('post_signoff', {}, cardFinal(c)), step('post_e_signoff'));
  return s;
}

// ---------------------------------------------------------------- the show runner

export class Show {
  /** o: { voice, pick(cat) -> line, steps, teams: [awayId, homeId], title, onDone } */
  constructor(o) {
    this.o = o;
    this.i = -1;
    this.done = false;
    this.t0 = performance.now();
    this.crests = o.teams.map((id) => { const im = new Image(); im.src = crestURL(T(id)); return im; });
    this.loop = this.loop.bind(this);
  }

  mount(canvas, cardEl, progressEl) {
    this.cv = canvas;
    canvas.width = DESK_W;
    canvas.height = DESK_H;
    this.g = canvas.getContext('2d');
    this.g.imageSmoothingEnabled = false;
    this.cardEl = cardEl;
    this.progressEl = progressEl;
    this.raf = requestAnimationFrame(this.loop);
    this.next();
  }

  loop() {
    if (this.done) return;
    this.raf = requestAnimationFrame(this.loop);
    drawDesk(this.g, {
      t: (performance.now() - this.t0) / 1000,
      talking: this.o.voice.speakingWho,
      colors: this.o.teams.map((id) => T(id).primary),
      crests: this.crests,
      title: this.o.title,
    });
  }

  async next() {
    while (!this.done) {
      this.i++;
      const st = this.o.steps[this.i];
      if (!st) { this.finish(); return; }
      if (st.card && this.cardEl) this.cardEl.innerHTML = st.card;
      if (this.progressEl) this.progressEl.style.width = `${Math.round(((this.i + 1) / this.o.steps.length) * 100)}%`;
      const line = this.o.pick(st.cat);
      if (line) await this.o.voice.say(line, st.slots);
      if (this.done) return;
      await new Promise((r) => setTimeout(r, 280));
    }
  }

  skipLine() { this.o.voice.stop(); }

  finish() {
    if (this.done) return;
    this.stop();
    this.o.onDone?.();
  }

  stop() {
    this.done = true;
    cancelAnimationFrame(this.raf);
    this.o.voice.stop();
  }
}

// Random line picker that avoids repeating recent lines within a category.
export function makePicker() {
  const recent = new Map();
  return (cat) => {
    const lines = linesIn(cat);
    if (!lines.length) return null;
    const r = recent.get(cat) || [];
    const fresh = lines.filter((l) => !r.includes(l.id));
    const pool = fresh.length ? fresh : lines;
    const line = pool[Math.floor(Math.random() * pool.length)];
    r.push(line.id);
    while (r.length > lines.length - 1) r.shift();
    recent.set(cat, r);
    return line;
  };
}
