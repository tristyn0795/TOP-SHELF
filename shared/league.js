// Franchise mode: rosters, schedule, quick sim, standings, playoffs, leaders.
// All state is plain JSON so it can live in localStorage.
import { rand, randInt, gauss, pick, shuffle, poisson, weightedPick, newSeed } from './rng.js';
import { TEAMS, effRatings } from './teams.js';
import { FIRST, LAST } from './names.js';

export const SEASON_LENGTHS = [16, 32, 41, 82];
export const SERIES_LENGTHS = [1, 3, 5, 7];
const N = TEAMS.length;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

const ARCH = {
  F: ['Sniper', 'Playmaker', 'Power Fwd', 'Two-Way', 'Speedster', 'Grinder'],
  D: ['Offensive', 'Stay-Home', 'Two-Way', 'Bruiser'],
  G: ['Butterfly', 'Hybrid', 'Standup'],
};
const ARCH_BUMP = {
  Sniper: { sht: 6, acc: 8, def: -6 },
  Playmaker: { pas: 8, hnd: 6, chk: -6 },
  'Power Fwd': { chk: 10, sht: 4, spd: -4 },
  'Two-Way': { def: 8, end: 4, sht: -3 },
  Speedster: { spd: 10, hnd: 3, chk: -6 },
  Grinder: { chk: 8, end: 8, hnd: -6, acc: -4 },
  Offensive: { sht: 6, pas: 6, def: -6 },
  'Stay-Home': { def: 8, chk: 4, pas: -5 },
  Bruiser: { chk: 12, spd: -4, hnd: -4 },
  Butterfly: { gk: 2, reb: -2 },
  Hybrid: {},
  Standup: { reb: 4, gk: -2 },
};

const blankSkater = () => ({ gp: 0, g: 0, a: 0, pts: 0, sog: 0, hits: 0, pim: 0 });
const blankGoalie = () => ({ gp: 0, w: 0, l: 0, otl: 0, sa: 0, ga: 0, so: 0 });
const blankStats = (pos) => (pos === 'G' ? blankGoalie() : blankSkater());

export function ovr(p) {
  const r = p.r;
  if (p.pos === 'G') return Math.round(r.gk * 0.75 + r.reb * 0.25);
  if (p.pos === 'D') return Math.round((r.def * 1.5 + r.chk + r.spd + r.pas + r.sht * 0.7 + r.hnd * 0.6 + r.end * 0.3) / 6.1);
  return Math.round((r.sht * 1.2 + r.acc * 1.2 + r.pas + r.hnd + r.spd + r.def * 0.5 + r.chk * 0.3 + r.end * 0.3) / 6.5);
}

function genPlayer(st, teamId, idx, pos, base, nums) {
  const v = (b = 0) => base + b + gauss(st) * 5;
  let r;
  const arch = pick(st, ARCH[pos === 'G' ? 'G' : pos === 'D' ? 'D' : 'F']);
  if (pos === 'G') r = { gk: v(), reb: v(-2) };
  else {
    r = { spd: v(), sht: v(), acc: v(), pas: v(), hnd: v(), chk: v(-4), def: v(-3), end: v(), fo: v(-6) };
    if (pos === 'D') { r.def += 9; r.chk += 6; r.acc -= 7; r.hnd -= 5; r.sht += 2; r.fo = 35 + rand(st) * 15; }
    if (pos === 'C') { r.fo += 12; r.pas += 4; }
    if (pos === 'LW' || pos === 'RW') { r.acc += 4; r.sht += 3; r.fo -= 8; }
  }
  for (const [k, b] of Object.entries(ARCH_BUMP[arch])) if (r[k] != null) r[k] += b;
  for (const k of Object.keys(r)) r[k] = Math.round(clamp(r[k], 30, 99));
  let num;
  do { num = pos === 'G' ? pick(st, [1, 29, 30, 31, 33, 35, 37, 39, 40, 41]) : randInt(st, 2, 98); } while (nums.has(num));
  nums.add(num);
  return {
    id: `${teamId}-${idx}`, first: pick(st, FIRST), name: pick(st, LAST), num, pos,
    age: randInt(st, 19, 35), arch, r, s: blankStats(pos), ps: blankStats(pos),
  };
}

export function generateRoster(st, teamId, strength) {
  const top = 70 + strength * 13;
  const nums = new Set();
  const out = [];
  let i = 0;
  [0, 5, 9, 13].forEach((drop) => {
    for (const pos of ['C', 'LW', 'RW']) out.push(genPlayer(st, teamId, i++, pos, top - drop, nums));
  });
  [1, 6, 11].forEach((drop) => {
    out.push(genPlayer(st, teamId, i++, 'D', top - drop, nums));
    out.push(genPlayer(st, teamId, i++, 'D', top - drop, nums));
  });
  out.push(genPlayer(st, teamId, i++, 'G', top + 2 + rand(st) * 4, nums));
  out.push(genPlayer(st, teamId, i++, 'G', top - 8, nums));
  return out;
}

export function autoLines(roster) {
  const by = (pos) => roster.filter((p) => p.pos === pos).sort((a, b) => ovr(b) - ovr(a));
  const C = by('C'), LW = by('LW'), RW = by('RW'), D = by('D'), G = by('G');
  return {
    F: [0, 1, 2, 3].map((i) => [C[i].id, LW[i].id, RW[i].id]),
    D: [0, 1, 2].map((i) => [D[i * 2].id, D[i * 2 + 1].id]),
    G: [G[0].id, G[1].id],
  };
}

// Rosters for every team from a fixed seed (exhibition + online use these).
export function buildTeams(seed = 1994) {
  const st = { seed };
  return TEAMS.map((t) => {
    const strength = rand(st);
    const roster = generateRoster(st, t.id, strength);
    return { id: t.id, roster, lines: autoLines(roster), rec: blankRec() };
  });
}

const blankRec = () => ({ gp: 0, w: 0, l: 0, otl: 0, pts: 0, gf: 0, ga: 0, streak: '', l10: [] });

export function teamOvr(team) {
  const top = (pos, n) => team.roster.filter((p) => p.pos === pos).map(ovr).sort((a, b) => b - a).slice(0, n);
  const f = [...top('C', 3), ...top('LW', 3), ...top('RW', 3)];
  const d = top('D', 4);
  const g = top('G', 1);
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  return { off: Math.round(avg(f)), def: Math.round(avg(d)), gk: g[0], all: Math.round(avg(f) * 0.45 + avg(d) * 0.3 + g[0] * 0.25) };
}

// Engine team descriptor.
export function gameTeam(teams, tid, home) {
  const t = teams[tid];
  return { team: TEAMS[tid], roster: t.roster, lines: t.lines, home };
}

// ---------------------------------------------------------------- league lifecycle

export function createLeague(o) {
  const seed = (o.seed ?? newSeed()) >>> 0;
  const st = { seed };
  const settings = {
    seasonLength: o.seasonLength ?? 32, periodLen: o.periodLen ?? 180, difficulty: o.difficulty ?? 'pro',
    penalties: o.penalties ?? true, icing: o.icing ?? true, seriesLen: o.seriesLen ?? 7,
  };
  const teams = TEAMS.map((t) => {
    const roster = generateRoster(st, t.id, rand(st));
    return { id: t.id, roster, lines: autoLines(roster), rec: blankRec() };
  });
  const league = {
    version: 1, seed: st.seed, userTeam: o.userTeam, year: 2026, settings, teams,
    schedule: makeSchedule(st, settings.seasonLength), day: 0, phase: 'season', playoffs: null, news: [], champions: [],
  };
  addNews(league, `Welcome to the ${TEAMS[o.userTeam].name}. ${settings.seasonLength} games, 16 playoff spots, one cup.`);
  return league;
}

function makeSchedule(st, n) {
  const ids = shuffle(st, [...Array(N).keys()]);
  const rounds = [];
  const arr = ids.slice();
  for (let r = 0; r < N - 1; r++) {
    const pairs = [];
    for (let i = 0; i < N / 2; i++) {
      const a = arr[i], b = arr[N - 1 - i];
      pairs.push((r + i) % 2 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    arr.splice(1, 0, arr.pop());
  }
  const order = shuffle(st, [...rounds.keys()]);
  const days = [];
  for (let d = 0; d < n; d++) {
    const cyc = Math.floor(d / (N - 1));
    const rd = rounds[order[d % (N - 1)]];
    days.push(rd.map(([h, a]) => (cyc % 2 ? { h: a, a: h, res: null } : { h, a, res: null })));
  }
  return days;
}

function addNews(league, text) {
  league.news.unshift({ year: league.year, day: league.day, text });
  if (league.news.length > 60) league.news.length = 60;
}

export function startNextSeason(league) {
  const st = { seed: league.seed };
  league.year++;
  for (const t of league.teams) {
    for (const p of t.roster) {
      const delta = p.age < 24 ? randInt(st, 0, 4) : p.age < 29 ? randInt(st, -1, 2) : p.age < 33 ? randInt(st, -3, 0) : randInt(st, -5, -1);
      for (const k of Object.keys(p.r)) p.r[k] = Math.round(clamp(p.r[k] + delta + gauss(st), 30, 99));
      p.age++;
      if (p.age > 37) { // retire and replace with a prospect
        const fresh = genPlayer(st, t.id, p.id.split('-')[1], p.pos, 64 + rand(st) * 8, new Set(t.roster.map((x) => x.num)));
        fresh.id = p.id; fresh.age = randInt(st, 19, 22);
        Object.assign(p, fresh);
      }
      p.s = blankStats(p.pos);
      p.ps = blankStats(p.pos);
    }
    t.lines = autoLines(t.roster);
    t.rec = blankRec();
  }
  league.schedule = makeSchedule(st, league.settings.seasonLength);
  league.seed = st.seed;
  league.day = 0;
  league.phase = 'season';
  league.playoffs = null;
  addNews(league, `The ${league.year} season is underway.`);
}

// ---------------------------------------------------------------- quick sim

function power(league, tid) {
  const t = league.teams[tid];
  const perk = TEAMS[tid].perk;
  const P = Object.fromEntries(t.roster.map((p) => [p.id, effRatings(p.r, perk)]));
  const fw = [0.38, 0.3, 0.2, 0.12], dw = [0.45, 0.35, 0.2];
  let off = 0, fdef = 0;
  t.lines.F.forEach((l, i) => {
    const o = l.reduce((a, id) => { const r = P[id]; return a + (r.sht + r.acc + r.pas + r.hnd + r.spd) / 5; }, 0) / 3;
    const d = l.reduce((a, id) => a + P[id].def, 0) / 3;
    off += o * fw[i]; fdef += d * fw[i];
  });
  let doff = 0, ddef = 0;
  t.lines.D.forEach((l, i) => {
    doff += l.reduce((a, id) => a + (P[id].sht + P[id].pas) / 2, 0) / 2 * dw[i];
    ddef += l.reduce((a, id) => a + (P[id].def + P[id].chk) / 2, 0) / 2 * dw[i];
  });
  const g = P[t.lines.G[0]];
  return { off: off * 0.85 + doff * 0.15, def: ddef * 0.6 + fdef * 0.4, gk: g.gk * 0.8 + g.reb * 0.2 };
}

export function simGame(league, h, a, playoff = false) {
  const st = { seed: league.seed };
  const ph = power(league, h), pa = power(league, a);
  const lam = (o, d, g, home) => 2.95 * Math.exp(0.05 * (o.off - 72) - 0.03 * (d.def - 72) - 0.05 * (g.gk - 80)) * (home ? 1.04 : 0.96);
  const lh = lam(ph, pa, pa, true), la = lam(pa, ph, ph, false);
  const score = [poisson(st, lh), poisson(st, la)];
  let decision = 'REG';
  const goalsBy = [[], []];
  for (const i of [0, 1]) for (let n = 0; n < score[i]; n++) goalsBy[i].push(1 + Math.floor(rand(st) * 3));
  if (score[0] === score[1]) {
    const pH = lh / (lh + la);
    if (playoff || rand(st) < 0.62) {
      decision = 'OT';
      const w = rand(st) < pH ? 0 : 1;
      score[w]++;
      goalsBy[w].push(4);
    } else {
      decision = 'SO';
      const w = rand(st) < 0.5 + (ph.gk - pa.gk) / 200 ? 0 : 1;
      score[w]++;
      goalsBy[w].push(0); // shootout winner: counted in the score, credited to nobody
    }
  }
  const ids = [h, a];
  const result = {
    teamIds: ids, score, decision, shots: [0, 0], hits: [0, 0], pim: [0, 0], ppg: [0, 0], ppo: [0, 0],
    fow: [0, 0], fot: 0, perScore: [[0, 0, 0], [0, 0, 0]], goals: [], players: [{}, {}], goalies: [], so: null,
  };
  for (const i of [0, 1]) {
    const t = league.teams[ids[i]];
    const stats = result.players[i];
    const skaters = t.roster.filter((p) => p.pos !== 'G');
    for (const p of skaters) stats[p.id] = { g: 0, a: 0, sog: 0, hits: 0, pim: 0 };
    const lineOf = {};
    t.lines.F.forEach((l, li) => l.forEach((id) => (lineOf[id] = li)));
    t.lines.D.forEach((l, li) => l.forEach((id) => (lineOf[id] = li)));
    const lw = [1.3, 1.0, 0.7, 0.4];
    const scoreW = (p) => Math.max(1, (p.r.sht + p.r.acc + p.r.hnd) / 3 - 50) ** 1.5 * lw[lineOf[p.id] ?? 3] * (p.pos === 'D' ? 0.35 : 1);
    const assistW = (p) => Math.max(1, (p.r.pas + p.r.hnd) / 2 - 50) ** 1.3 * lw[lineOf[p.id] ?? 3] * (p.pos === 'D' ? 0.7 : 1);
    for (const per of goalsBy[i]) {
      if (per === 0) continue;
      const sc = weightedPick(st, skaters, scoreW);
      const na = rand(st) < 0.1 ? 0 : rand(st) < 0.35 ? 1 : 2;
      const as = [];
      for (let n = 0; n < na; n++) {
        const pool = skaters.filter((p) => p !== sc && !as.includes(p.id));
        as.push(weightedPick(st, pool, assistW).id);
      }
      stats[sc.id].g++;
      stats[sc.id].sog++;
      for (const x of as) stats[x].a++;
      result.goals.push({ team: i, pid: sc.id, name: sc.name, num: sc.num, a: as, aNames: as.map((x) => t.roster.find((p) => p.id === x).name), per, clock: 0, tags: per === 4 ? ['OT'] : [] });
      const pi = Math.min(per - 1, 3);
      result.perScore[i][pi] = (result.perScore[i][pi] || 0) + 1;
    }
    const scored = goalsBy[i].filter((x) => x > 0).length;
    const shots = Math.max(scored + 12, Math.round(30 * ((i ? la : lh) / 3) ** 0.5 + gauss(st) * 4));
    result.shots[i] = shots;
    for (let n = scored; n < shots; n++) stats[weightedPick(st, skaters, (p) => p.r.sht - 40).id].sog++;
    const hits = poisson(st, 20);
    result.hits[i] = hits;
    for (let n = 0; n < hits; n++) stats[weightedPick(st, skaters, (p) => p.r.chk - 35).id].hits++;
    const pens = poisson(st, TEAMS[ids[i]].perk === 'DISCIPLINED' ? 1.6 : 3);
    result.pim[i] = pens * 2;
    result.ppo[1 - i] = pens;
    for (let n = 0; n < pens; n++) stats[weightedPick(st, skaters, (p) => p.r.chk - 30).id].pim += 2;
  }
  for (const i of [0, 1]) {
    result.ppg[i] = result.goals.filter((g) => g.team === i && rand(st) < Math.min(0.5, 0.12 * result.ppo[i])).length;
    const realGoals = result.goals.filter((g) => g.team === 1 - i).length;
    result.goalies.push({ pid: league.teams[ids[i]].lines.G[0], sa: result.shots[1 - i], ga: realGoals });
  }
  result.fot = 50 + randInt(st, -8, 8);
  result.fow[0] = Math.round(result.fot * (0.5 + gauss(st) * 0.05));
  result.fow[1] = result.fot - result.fow[0];
  league.seed = st.seed;
  return result;
}

// ---------------------------------------------------------------- applying results

export function applyResult(league, result, playoff) {
  const [t0, t1] = result.teamIds;
  const [s0, s1] = result.score;
  const win = s0 > s1 ? 0 : 1;
  const bucket = playoff ? 'ps' : 's';
  if (!playoff) {
    [t0, t1].forEach((tid, i) => {
      const r = league.teams[tid].rec;
      r.gp++;
      r.gf += result.score[i];
      r.ga += result.score[1 - i];
      let mark;
      if (i === win) { r.w++; mark = 'W'; }
      else if (result.decision === 'REG') { r.l++; mark = 'L'; }
      else { r.otl++; mark = 'O'; }
      r.pts = r.w * 2 + r.otl;
      r.l10.push(mark);
      if (r.l10.length > 10) r.l10.shift();
      const sm = mark === 'O' ? 'L' : mark;
      const cur = r.streak ? r.streak[0] : '';
      r.streak = cur === sm ? sm + (parseInt(r.streak.slice(1), 10) + 1) : sm + '1';
    });
  }
  [t0, t1].forEach((tid, i) => {
    const t = league.teams[tid];
    const map = Object.fromEntries(t.roster.map((p) => [p.id, p]));
    const dressed = new Set([...t.lines.F.flat(), ...t.lines.D.flat()]);
    for (const pid of dressed) map[pid][bucket].gp++;
    for (const [pid, st] of Object.entries(result.players[i] || {})) {
      const p = map[pid];
      if (!p || p.pos === 'G') continue;
      const s = p[bucket];
      s.g += st.g; s.a += st.a; s.pts = s.g + s.a; s.sog += st.sog; s.hits += st.hits; s.pim += st.pim;
    }
    const gl = result.goalies[i];
    const g = map[gl.pid];
    if (g) {
      const s = g[bucket];
      s.gp++; s.sa += gl.sa; s.ga += gl.ga;
      if (i === win) s.w++;
      else if (result.decision === 'REG' || playoff) s.l++;
      else s.otl++;
      if (gl.ga === 0 && i === win) s.so++;
    }
  });
  // news
  const T = (id) => TEAMS[id];
  const hats = {};
  for (const g of result.goals) if (g.pid) hats[g.pid] = (hats[g.pid] || 0) + 1;
  for (const [pid, n] of Object.entries(hats)) {
    if (n >= 3) {
      const tid = result.teamIds[result.goals.find((g) => g.pid === pid).team];
      const p = league.teams[tid].roster.find((x) => x.id === pid);
      addNews(league, `HAT TRICK! ${p.first} ${p.name} (${T(tid).abbr}) scores ${n} against the ${T(result.teamIds[tid === t0 ? 1 : 0]).name}.`);
    }
  }
  if (result.teamIds.includes(league.userTeam)) {
    const ui = result.teamIds.indexOf(league.userTeam);
    const won = ui === win;
    const opp = T(result.teamIds[1 - ui]);
    addNews(league, `${T(league.userTeam).name} ${won ? 'beat' : 'fall to'} the ${opp.name} ${result.score[ui]}-${result.score[1 - ui]}${result.decision !== 'REG' ? ' (' + result.decision + ')' : ''}.`);
  }
  for (const i of [0, 1]) {
    if (result.goalies[i].ga === 0 && i === win) {
      const tid = result.teamIds[i];
      const g = league.teams[tid].roster.find((p) => p.id === result.goalies[i].pid);
      if (rand({ seed: league.seed + result.shots[0] }) < 0.5 || tid === league.userTeam) addNews(league, `Shutout: ${g.first} ${g.name} stops all ${result.goalies[i].sa} for the ${T(tid).name}.`);
    }
  }
}

// ---------------------------------------------------------------- day flow

export function todaysGames(league) {
  if (league.phase === 'season') return (league.schedule[league.day] || []).map((g) => ({ ...g }));
  if (league.phase === 'playoffs') {
    const round = league.playoffs.rounds[league.playoffs.cur];
    return round.filter((s) => s.winner == null).map((s) => {
      const hiHome = homePattern(league.settings.seriesLen)[s.games.length];
      return { h: hiHome ? s.hi : s.lo, a: hiHome ? s.lo : s.hi, res: null, series: s };
    });
  }
  return [];
}

function homePattern(len) {
  return { 1: [1], 3: [1, 0, 1], 5: [1, 1, 0, 0, 1], 7: [1, 1, 0, 0, 1, 0, 1] }[len];
}

export function userGameToday(league) {
  return todaysGames(league).find((g) => g.h === league.userTeam || g.a === league.userTeam) || null;
}

// Play one day. userResult (engine result) is used for the user's game if supplied;
// pre maps "h-a" to results computed earlier (e.g. for the live ticker).
export function simDay(league, userResult = null, pre = null) {
  const playoff = league.phase === 'playoffs';
  const games = todaysGames(league);
  if (!games.length) return [];
  const out = [];
  for (const g of games) {
    let res;
    const isUser = g.h === league.userTeam || g.a === league.userTeam;
    if (isUser && userResult) res = userResult;
    else res = pre?.[`${g.h}-${g.a}`] || simGame(league, g.h, g.a, playoff);
    applyResult(league, res, playoff);
    const hi = res.teamIds.indexOf(g.h);
    const line = { h: g.h, a: g.a, hs: res.score[hi], as: res.score[1 - hi], dec: res.decision };
    out.push(line);
    if (playoff) {
      const s = g.series;
      s.games.push(line);
      const hiWon = (line.hs > line.as ? g.h : g.a) === s.hi;
      s.w[hiWon ? 0 : 1]++;
      const need = Math.ceil(league.settings.seriesLen / 2);
      if (s.w[0] >= need || s.w[1] >= need) {
        s.winner = s.w[0] >= need ? s.hi : s.lo;
        const loser = s.winner === s.hi ? s.lo : s.hi;
        addNews(league, `${TEAMS[s.winner].name} eliminate the ${TEAMS[loser].name}, ${Math.max(...s.w)}-${Math.min(...s.w)}.`);
      }
    } else {
      league.schedule[league.day].find((x) => x.h === g.h && x.a === g.a).res = line;
    }
  }
  if (playoff) advancePlayoffs(league);
  else {
    league.day++;
    if (league.day >= league.schedule.length) startPlayoffs(league);
  }
  return out;
}

// ---------------------------------------------------------------- standings & playoffs

export function standings(league, filter = () => true) {
  return league.teams
    .filter((t) => filter(TEAMS[t.id]))
    .sort((a, b) => {
      const ra = a.rec, rb = b.rec;
      return rb.pts - ra.pts || ra.gp - rb.gp || rb.w - ra.w || rb.gf - rb.ga - (ra.gf - ra.ga) || a.id - b.id;
    });
}

function startPlayoffs(league) {
  league.phase = 'playoffs';
  const round = [];
  for (const c of [0, 1]) {
    const seeds = standings(league, (t) => t.conf === c).slice(0, 8).map((t) => t.id);
    for (const [x, y] of [[0, 7], [3, 4], [2, 5], [1, 6]]) round.push(newSeries(seeds[x], seeds[y], c));
  }
  league.playoffs = { rounds: [round], cur: 0, champion: null };
  const inn = round.some((s) => s.hi === league.userTeam || s.lo === league.userTeam);
  addNews(league, inn ? `PLAYOFFS! The ${TEAMS[league.userTeam].name} are in.` : `The ${TEAMS[league.userTeam].name} miss the playoffs.`);
}

function newSeries(a, b, conf) {
  return { hi: a, lo: b, conf, w: [0, 0], games: [], winner: null };
}

function rankOf(league, tid) {
  return standings(league).findIndex((t) => t.id === tid);
}

function advancePlayoffs(league) {
  const po = league.playoffs;
  const round = po.rounds[po.cur];
  if (round.some((s) => s.winner == null)) return;
  if (round.length === 1) {
    po.champion = round[0].winner;
    league.phase = 'done';
    league.champions.push({ year: league.year, team: po.champion });
    addNews(league, `CHAMPIONS! The ${TEAMS[po.champion].name} win the ${league.year} Top Shelf Cup!`);
    return;
  }
  const next = [];
  for (let i = 0; i < round.length; i += 2) {
    let a = round[i].winner, b = round[i + 1].winner;
    if (rankOf(league, b) < rankOf(league, a)) [a, b] = [b, a];
    next.push(newSeries(a, b, round.length === 2 ? -1 : round[i].conf));
  }
  po.rounds.push(next);
  po.cur++;
}

export function userAlive(league) {
  if (league.phase !== 'playoffs') return league.phase === 'season';
  return league.playoffs.rounds[league.playoffs.cur].some((s) => s.winner == null && (s.hi === league.userTeam || s.lo === league.userTeam));
}

export const ROUND_NAMES = { 8: 'First Round', 4: 'Second Round', 2: 'Conference Finals', 1: 'Cup Final' };

// ---------------------------------------------------------------- leaders

export function leaders(league, stat, n = 10, bucket = 's') {
  const rows = [];
  for (const t of league.teams) {
    for (const p of t.roster) {
      const s = p[bucket];
      if (stat === 'svp' || stat === 'gaa') {
        if (p.pos !== 'G' || s.gp < Math.max(1, Math.floor(league.day * 0.25)) || s.sa === 0) continue;
        rows.push({ p, tid: t.id, v: stat === 'svp' ? (s.sa - s.ga) / s.sa : s.ga / s.gp });
      } else if (stat === 'w' || stat === 'so') {
        if (p.pos !== 'G') continue;
        rows.push({ p, tid: t.id, v: s[stat] });
      } else {
        if (p.pos === 'G') continue;
        rows.push({ p, tid: t.id, v: stat === 'pts' ? s.g + s.a : s[stat] });
      }
    }
  }
  rows.sort((a, b) => (stat === 'gaa' ? a.v - b.v : b.v - a.v));
  return rows.slice(0, n);
}
