// GM mode: contracts and the salary cap, injuries, game-day lineups, trades and draft
// picks, free agency, and the off-season (re-sign, entry draft, free agency, new season).
// Everything is plain JSON on the league object and runs the same in Node and the browser.
import { rand, randInt, gauss, pick, weightedPick } from './rng.js';
import { TEAMS } from './teams.js';
import { ovr, genPlayer, blankStats } from './players.js';

export const CAP = 88;            // $M
export const FLOOR = 60;
export const ROSTER_MIN = 20;
export const ROSTER_MAX = 26;
export const OFFSEASON_MAX = 32;
export const MIN_POS = { G: 2, D: 6, F: 12 };
export const DEADLINE = 0.75;     // share of the regular season before trades close
export const ENTRY = { sal: 0.9, yrs: 3 };

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const r2 = (v) => Math.round(v * 100) / 100;
export const isF = (p) => p.pos === 'C' || p.pos === 'LW' || p.pos === 'RW';
export const group = (p) => (p.pos === 'G' ? 'G' : p.pos === 'D' ? 'D' : 'F');
export const money = (m) => `$${m.toFixed(m >= 10 ? 1 : 2)}M`;

// ---------------------------------------------------------------- money

export function fairSalary(p) {
  const x = clamp((ovr(p) - 64) / 24, 0, 1);
  let s = 0.75 + 11.25 * x ** 1.7;
  if (p.age <= 22) s *= 0.8;
  if (p.age >= 33) s *= 0.85;
  return r2(Math.max(0.75, s));
}

function contractFor(st, p, markup = 1) {
  const yrs = p.age <= 23 ? randInt(st, 1, 3) : p.age <= 30 ? randInt(st, 1, 5) : randInt(st, 1, 2);
  return { sal: r2(Math.max(0.75, fairSalary(p) * markup * (0.85 + rand(st) * 0.3))), yrs };
}

export function payroll(team) {
  return r2(team.roster.reduce((a, p) => a + (p.contract ? p.contract.sal : 0), 0) + (team.dead || 0));
}
export const capRoom = (lg, team) => r2((lg.cap || CAP) - payroll(team));

export function potGrade(p) {
  const v = (p.scout ?? p.pot ?? ovr(p));
  return v >= 88 ? 'A+' : v >= 83 ? 'A' : v >= 79 ? 'B+' : v >= 75 ? 'B' : v >= 71 ? 'C+' : v >= 67 ? 'C' : 'D';
}

// ---------------------------------------------------------------- roster shape

export function counts(roster) {
  const c = { G: 0, D: 0, F: 0 };
  for (const p of roster) c[group(p)]++;
  return c;
}

export function rosterProblems(roster, max = ROSTER_MAX) {
  const c = counts(roster), out = [];
  if (roster.length > max) out.push(`roster has ${roster.length} players (max ${max})`);
  if (roster.length < ROSTER_MIN) out.push(`roster has ${roster.length} players (min ${ROSTER_MIN})`);
  for (const k of ['G', 'D', 'F']) if (c[k] < MIN_POS[k]) out.push(`needs at least ${MIN_POS[k]} ${{ G: 'goalies', D: 'defensemen', F: 'forwards' }[k]}`);
  return out;
}

// Best possible lines from a roster, for any mix of positions.
export function autoLines(roster) {
  const healthy = roster.filter((p) => !p.inj);
  const pool = healthy.length >= 20 ? healthy : roster;
  const used = new Set();
  const best = (pred, fallback) => {
    let c = pool.filter((p) => !used.has(p.id) && pred(p)).sort((a, b) => ovr(b) - ovr(a))[0];
    if (!c && fallback) c = pool.filter((p) => !used.has(p.id) && fallback(p)).sort((a, b) => ovr(b) - ovr(a))[0];
    if (!c) c = roster.filter((p) => !used.has(p.id) && p.pos !== 'G').sort((a, b) => ovr(b) - ovr(a))[0];
    if (c) used.add(c.id);
    return c ? c.id : null;
  };
  const G = [best((p) => p.pos === 'G', () => false), best((p) => p.pos === 'G', () => false)];
  if (!G[1]) G[1] = G[0];
  const F = [], D = [];
  for (let i = 0; i < 4; i++) F.push([best((p) => p.pos === 'C', isF), best((p) => p.pos === 'LW', isF), best((p) => p.pos === 'RW', isF)]);
  for (let i = 0; i < 3; i++) D.push([best((p) => p.pos === 'D', isF), best((p) => p.pos === 'D', isF)]);
  return { F, D, G };
}

export const lineIds = (lines) => [...lines.F.flat(), ...lines.D.flat(), ...lines.G];

// Keep the user's lines but replace anyone who is no longer on the roster (or listed twice).
export function repairLines(team) {
  const ids = new Set(team.roster.map((p) => p.id));
  const seen = new Set();
  const all = lineIds(team.lines || { F: [], D: [], G: [] });
  const bad = !team.lines || all.length !== 20 || all.some((id) => !ids.has(id) || (seen.has(id) ? true : (seen.add(id), false)));
  if (!bad) return team.lines;
  const fresh = autoLines(team.roster);
  if (!team.lines) return (team.lines = fresh);
  // keep valid assignments, refill the rest from players not already used
  const used = new Set();
  const keep = (id) => (id && ids.has(id) && !used.has(id) ? (used.add(id), id) : null);
  const lines = { F: team.lines.F.map((l) => l.map(keep)), D: team.lines.D.map((l) => l.map(keep)), G: team.lines.G.map(keep) };
  const bench = team.roster.filter((p) => !used.has(p.id)).sort((a, b) => ovr(b) - ovr(a));
  const fill = (pred) => { const i = bench.findIndex(pred); const p = i >= 0 ? bench.splice(i, 1)[0] : bench.shift(); return p ? p.id : null; };
  lines.G = lines.G.map((id) => id || fill((p) => p.pos === 'G'));
  lines.D = lines.D.map((l) => l.map((id) => id || fill((p) => p.pos === 'D')));
  lines.F = lines.F.map((l) => l.map((id) => id || fill(isF)));
  if (lineIds(lines).some((id) => !id)) return (team.lines = fresh);
  return (team.lines = lines);
}

// The lineup that actually dresses tonight: injured players are swapped for healthy extras.
export function gameLineup(team) {
  if (!team.roster.some((p) => p.inj)) return { roster: team.roster, lines: repairLines(team) };
  const lines = JSON.parse(JSON.stringify(repairLines(team)));
  const byId = Object.fromEntries(team.roster.map((p) => [p.id, p]));
  const inLines = new Set(lineIds(lines));
  const bench = team.roster.filter((p) => !p.inj && !inLines.has(p.id)).sort((a, b) => ovr(b) - ovr(a));
  const sub = (id, pred, fb) => {
    if (!byId[id].inj) return id;
    let i = bench.findIndex(pred);
    if (i < 0 && fb) i = bench.findIndex(fb);
    return i >= 0 ? bench.splice(i, 1)[0].id : id; // nobody healthy: the injured player dresses
  };
  // goalies: healthy ones first (backup moves up), an injured one only as the last resort
  const gs = [...lines.G, ...bench.filter((p) => p.pos === 'G').map((p) => p.id)];
  const healthyG = gs.filter((id) => !byId[id].inj);
  lines.G = [...healthyG, ...gs.filter((id) => byId[id].inj)].slice(0, 2);
  for (const id of lines.G) { const i = bench.findIndex((p) => p.id === id); if (i >= 0) bench.splice(i, 1); }
  lines.D = lines.D.map((l) => l.map((id) => sub(id, (p) => p.pos === 'D', (p) => p.pos !== 'G')));
  lines.F = lines.F.map((l) => l.map((id) => sub(id, isF, (p) => p.pos !== 'G')));
  return { roster: team.roster, lines };
}

export function freeNumber(team, want) {
  const used = new Set(team.roster.map((p) => p.num));
  if (!used.has(want)) return want;
  for (let n = 2; n < 99; n++) if (!used.has(n)) return n;
  return want;
}

// ---------------------------------------------------------------- setup + migration

function newId(lg) {
  lg.nextPid = (lg.nextPid || 1) + 1;
  return `p${lg.nextPid}`;
}

function addPot(st, p) {
  const o = ovr(p);
  p.pot = p.age <= 21 ? o + randInt(st, 4, 18) : p.age <= 24 ? o + randInt(st, 0, 10) : p.age <= 27 ? o + randInt(st, 0, 3) : o;
  p.pot = clamp(p.pot, o, 97);
}

function makeFreeAgent(lg, st, base) {
  const pos = pick(st, ['C', 'LW', 'RW', 'C', 'LW', 'RW', 'D', 'D', 'D', 'G']);
  const p = genPlayer(st, 'fa', 0, pos, base + gauss(st) * 4, new Set());
  p.id = newId(lg);
  p.age = randInt(st, 22, 34);
  addPot(st, p);
  p.inj = 0;
  p.ask = askFor(st, p);
  return p;
}

export function askFor(st, p, markup = 1.05) {
  const c = contractFor(st, p, markup);
  return { sal: c.sal, yrs: p.age >= 32 ? 1 : c.yrs };
}

function addPicks(lg, year) {
  for (const t of TEAMS) for (const round of [1, 2]) lg.picks.push({ year, round, from: t.id, owner: t.id });
}

// Adds GM data to a league (new or from an older save). Idempotent.
export function upgradeLeague(lg) {
  if (lg.version >= 2) return lg;
  const st = { seed: (lg.seed ^ 0x9e3779b9) >>> 0 };
  lg.cap = CAP;
  lg.nextPid = lg.nextPid || 1;
  for (const t of lg.teams) {
    t.dead = 0;
    // spares so injuries can be covered: 13 forwards and 7 defensemen
    for (const [k, pos] of [['F', 'C'], ['D', 'D']]) {
      while (counts(t.roster)[k] < MIN_POS[k] + 1) {
        const p = genPlayer(st, t.id, 0, pos, 60 + rand(st) * 6, new Set(t.roster.map((x) => x.num)));
        p.id = newId(lg);
        t.roster.push(p);
      }
    }
    for (const p of t.roster) {
      if (p.pot == null) addPot(st, p);
      if (!p.contract) p.contract = contractFor(st, p);
      p.inj = p.inj || 0;
    }
    // every club starts spending close to the cap, like the real thing
    const target = lg.cap * (0.75 + rand(st) * 0.17);
    for (let i = 0; i < 4; i++) {
      const f = target / payroll(t);
      for (const p of t.roster) p.contract.sal = r2(clamp(p.contract.sal * f, 0.75, 14));
    }
  }
  lg.freeAgents = lg.freeAgents || [];
  for (let i = 0; i < 30; i++) lg.freeAgents.push(makeFreeAgent(lg, st, 60 + rand(st) * 8));
  lg.picks = [];
  addPicks(lg, lg.year);
  addPicks(lg, lg.year + 1);
  lg.offseason = null;
  lg.version = 2;
  return lg;
}

// ---------------------------------------------------------------- injuries

export function healDay(lg, teamIds) {
  for (const tid of teamIds) for (const p of lg.teams[tid].roster) if (p.inj > 0) p.inj--;
}

export function rollInjuries(lg, tids, news) {
  const st = { seed: lg.seed };
  for (const tid of tids) {
    if (rand(st) > 0.04) continue;
    const t = lg.teams[tid];
    const dressed = new Set(lineIds(gameLineup(t).lines));
    const pool = t.roster.filter((p) => dressed.has(p.id) && !p.inj);
    if (!pool.length) continue;
    const p = weightedPick(st, pool, (x) => (x.pos === 'G' ? 0.3 : 1 + (x.s.hits || 0) * 0.02));
    p.inj = randInt(st, 1, 15);
    if (tid === lg.userTeam || ovr(p) >= 80) news?.(`INJURY: ${p.first} ${p.name} (${TEAMS[tid].abbr}) is out ${p.inj} game${p.inj > 1 ? 's' : ''}.`);
  }
  lg.seed = st.seed;
}

// ---------------------------------------------------------------- trades

export function playerValue(p) {
  const o = ovr(p);
  const upside = p.age <= 24 ? Math.max(0, (p.pot || o) - o) * 0.6 : 0;
  let v = Math.max(0, o + upside - 55) ** 2 / 10;
  v *= p.age <= 24 ? 1.1 : p.age <= 29 ? 1 : p.age <= 32 ? 0.8 : 0.55;
  if (p.contract) v += (fairSalary(p) - p.contract.sal) * Math.min(3, p.contract.yrs) * 1.5;
  if (p.inj > 10) v *= 0.8;
  return Math.max(0.5, Math.round(v * 10) / 10);
}

function standingRank(lg, tid) {
  const order = lg.teams.slice().sort((a, b) => b.rec.pts - a.rec.pts || a.rec.gp - b.rec.gp);
  return order.findIndex((t) => t.id === tid); // 0 = best
}

export function pickValue(lg, pk) {
  const r = standingRank(lg, pk.from) / (TEAMS.length - 1); // 1 = worst team = best pick
  let v = pk.round === 1 ? 12 + r * 28 : 3 + r * 6;
  if (pk.year > lg.year) v *= 0.85;
  return Math.round(v * 10) / 10;
}

export const pickLabel = (pk) => `${pk.year} ${pk.round === 1 ? '1ST' : '2ND'} (${TEAMS[pk.from].abbr})`;
export const pickKey = (pk) => `${pk.year}-${pk.round}-${pk.from}`;

export function tradesOpen(lg) {
  if (lg.phase === 'offseason') return true;
  if (lg.phase !== 'season') return false;
  return lg.day < Math.floor(lg.schedule.length * DEADLINE);
}

/**
 * offer: { a, b, aPlayers:[ids], bPlayers:[ids], aPicks:[keys], bPicks:[keys] }
 * Team a proposes; team b (the CPU) decides. Returns { ok, reason, give, get }.
 */
export function evaluateTrade(lg, offer) {
  const A = lg.teams[offer.a], B = lg.teams[offer.b];
  const aP = A.roster.filter((p) => offer.aPlayers.includes(p.id));
  const bP = B.roster.filter((p) => offer.bPlayers.includes(p.id));
  const aK = lg.picks.filter((k) => k.owner === offer.a && offer.aPicks.includes(pickKey(k)));
  const bK = lg.picks.filter((k) => k.owner === offer.b && offer.bPicks.includes(pickKey(k)));
  const get = aP.reduce((s, p) => s + playerValue(p), 0) + aK.reduce((s, k) => s + pickValue(lg, k), 0);
  const give = bP.reduce((s, p) => s + playerValue(p), 0) + bK.reduce((s, k) => s + pickValue(lg, k), 0);
  const res = { ok: false, reason: '', get: Math.round(get), give: Math.round(give) };
  if (!tradesOpen(lg)) { res.reason = lg.phase === 'season' ? 'The trade deadline has passed.' : 'Trades are closed during the playoffs.'; return res; }
  if (!aP.length && !aK.length && !bP.length && !bK.length) { res.reason = 'Add players or picks to the deal.'; return res; }
  const max = lg.phase === 'offseason' ? OFFSEASON_MAX : ROSTER_MAX;
  const after = (team, out, inn) => team.roster.filter((p) => !out.includes(p)).concat(inn);
  const aAfter = after(A, aP, bP), bAfter = after(B, bP, aP);
  const short = (roster) => { const c = counts(roster); return ['G', 'D', 'F'].find((k) => c[k] < MIN_POS[k]); };
  const word = { G: 'a backup goalie', D: 'enough defensemen', F: 'enough forwards' };
  if (short(bAfter)) { res.reason = `They'd be left without ${word[short(bAfter)]}.`; return res; }
  if (short(aAfter)) { res.reason = `You'd be left without ${word[short(aAfter)]}.`; return res; }
  if (bAfter.length > max) { res.reason = `Their roster would be over ${max} players.`; return res; }
  if (aAfter.length > max) { res.reason = `Your roster would be over ${max} players. Release someone first.`; return res; }
  const pay = (team, roster) => roster.reduce((s, p) => s + p.contract.sal, 0) + (team.dead || 0);
  const cap = lg.cap || CAP;
  if (pay(B, bAfter) > cap && pay(B, bAfter) > payroll(B)) { res.reason = "They'd be over the salary cap."; return res; }
  if (pay(A, aAfter) > cap && pay(A, aAfter) > payroll(A)) { res.reason = "You'd be over the salary cap."; return res; }
  const star = bP.reduce((m, p) => (playerValue(p) > (m ? playerValue(m) : 0) ? p : m), null);
  const need = give * (star && ovr(star) >= 84 ? 1.2 : 1.05) + 1;
  if (get < need) {
    res.reason = star ? `Not enough value for #${star.num} ${star.name}.` : 'Not enough value for those picks.';
    return res;
  }
  res.ok = true;
  res.reason = 'Deal!';
  return res;
}

export function executeTrade(lg, offer) {
  const A = lg.teams[offer.a], B = lg.teams[offer.b];
  const move = (from, to, ids) => {
    for (const id of ids) {
      const i = from.roster.findIndex((p) => p.id === id);
      if (i < 0) continue;
      const [p] = from.roster.splice(i, 1);
      p.num = freeNumber(to, p.num);
      to.roster.push(p);
    }
  };
  move(A, B, offer.aPlayers);
  move(B, A, offer.bPlayers);
  for (const k of lg.picks) {
    if (k.owner === offer.a && offer.aPicks.includes(pickKey(k))) k.owner = offer.b;
    else if (k.owner === offer.b && offer.bPicks.includes(pickKey(k))) k.owner = offer.a;
  }
  repairLines(A);
  repairLines(B);
  if (B.id !== lg.userTeam) B.lines = autoLines(B.roster);
  if (A.id !== lg.userTeam) A.lines = autoLines(A.roster);
}

// What would the CPU want added to make this work? Returns an asset label or null.
export function suggestAdd(lg, offer) {
  const A = lg.teams[offer.a];
  const ev = evaluateTrade(lg, offer);
  if (ev.ok) return null;
  const options = [
    ...A.roster.filter((p) => !offer.aPlayers.includes(p.id)).map((p) => ({ kind: 'p', id: p.id, v: playerValue(p), label: `#${p.num} ${p.name}` })),
    ...lg.picks.filter((k) => k.owner === offer.a && !offer.aPicks.includes(pickKey(k))).map((k) => ({ kind: 'k', id: pickKey(k), v: pickValue(lg, k), label: pickLabel(k) })),
  ].sort((x, y) => x.v - y.v);
  for (const o of options) {
    const trial = { ...offer, aPlayers: o.kind === 'p' ? [...offer.aPlayers, o.id] : offer.aPlayers, aPicks: o.kind === 'k' ? [...offer.aPicks, o.id] : offer.aPicks };
    if (evaluateTrade(lg, trial).ok) return o;
  }
  return null;
}

// ---------------------------------------------------------------- free agency

export function signFreeAgent(lg, tid, pid, offerSal) {
  const t = lg.teams[tid];
  const i = lg.freeAgents.findIndex((p) => p.id === pid);
  if (i < 0) return { ok: false, reason: 'That player already signed elsewhere.' };
  const p = lg.freeAgents[i];
  const sal = offerSal ?? p.ask.sal;
  const max = lg.phase === 'offseason' ? OFFSEASON_MAX : ROSTER_MAX;
  if (t.roster.length >= max) return { ok: false, reason: `Your roster is full (${max}). Release someone first.` };
  if (sal > capRoom(lg, t)) return { ok: false, reason: `Not enough cap room (${money(capRoom(lg, t))} left).` };
  if (sal < p.ask.sal) {
    const st = { seed: lg.seed + p.num * 7 };
    const ratio = sal / p.ask.sal;
    if (ratio < 0.8 || rand(st) > (ratio - 0.8) * 5) return { ok: false, reason: `${p.name} wants ${money(p.ask.sal)}. Offer refused.` };
  }
  lg.freeAgents.splice(i, 1);
  p.contract = { sal: Math.round(sal * 100) / 100, yrs: p.ask.yrs };
  delete p.ask;
  p.num = freeNumber(t, p.num);
  p.s = p.s || blankStats(p.pos);
  p.ps = p.ps || blankStats(p.pos);
  t.roster.push(p);
  if (tid !== lg.userTeam) t.lines = autoLines(t.roster);
  else repairLines(t);
  return { ok: true, reason: `${p.first} ${p.name} signs for ${money(p.contract.sal)} x ${p.contract.yrs}.`, player: p };
}

export function releaseCost(p) {
  return Math.round((p.contract.sal / 3) * 100) / 100;
}

export function releasePlayer(lg, tid, pid) {
  const t = lg.teams[tid];
  const i = t.roster.findIndex((p) => p.id === pid);
  if (i < 0) return { ok: false, reason: 'Not on your roster.' };
  const p = t.roster[i];
  const c = counts(t.roster);
  if (c[group(p)] - 1 < MIN_POS[group(p)]) return { ok: false, reason: `You need at least ${MIN_POS[group(p)]} at that position.` };
  const cost = releaseCost(p);
  t.roster.splice(i, 1);
  t.dead = Math.round(((t.dead || 0) + cost) * 100) / 100;
  p.ask = askFor({ seed: lg.seed + i }, p, 0.9);
  delete p.contract;
  p.inj = 0;
  lg.freeAgents.push(p);
  repairLines(t);
  return { ok: true, reason: `${p.first} ${p.name} released. ${money(cost)} stays on your cap this season.` };
}

// CPU clubs keep legal, healthy rosters: sign the best affordable fit, shed extras.
export function cpuMaintain(lg) {
  const max = lg.phase === 'offseason' ? OFFSEASON_MAX : ROSTER_MAX;
  for (const t of lg.teams) {
    if (t.id === lg.userTeam) continue;
    const healthy = t.roster.filter((p) => !p.inj);
    const c = counts(healthy);
    for (const k of ['G', 'D', 'F']) {
      let need = MIN_POS[k] - c[k];
      while (need-- > 0) {
        const room = capRoom(lg, t);
        const fa = lg.freeAgents.filter((p) => group(p) === k && p.ask.sal <= room).sort((a, b) => ovr(b) - ovr(a))[0];
        if (fa && t.roster.length < max) { signFreeAgent(lg, t.id, fa.id); continue; }
        callUp(lg, t, k);
      }
    }
    while (t.roster.length > max) {
      const out = t.roster.filter((p) => counts(t.roster)[group(p)] > MIN_POS[group(p)] && !p.inj).sort((a, b) => playerValue(a) - playerValue(b))[0];
      if (!out) break;
      releasePlayer(lg, t.id, out.id);
    }
    t.lines = autoLines(t.roster);
  }
}

// Fill a club's roster to the minimums: best affordable free agents first, then call-ups.
export function autoFill(lg, tid) {
  const t = lg.teams[tid];
  const signed = [];
  const need = () => {
    const c = counts(t.roster);
    const k = ['G', 'D', 'F'].find((g) => c[g] < MIN_POS[g]);
    return k || (t.roster.length < ROSTER_MIN ? 'F' : null);
  };
  for (let guard = 0, k = need(); k && guard < 30; guard++, k = need()) {
    const room = capRoom(lg, t);
    const fa = lg.freeAgents.filter((p) => group(p) === k && p.ask.sal <= room).sort((a, b) => ovr(b) - ovr(a))[0];
    if (fa) { signFreeAgent(lg, tid, fa.id); signed.push(`${fa.first} ${fa.name} (${fa.pos})`); }
    else { callUp(lg, t, k); const p = t.roster[t.roster.length - 1]; signed.push(`${p.first} ${p.name} (${p.pos}, call-up)`); }
  }
  repairLines(t);
  return signed;
}

// Nobody affordable in free agency: promote a minimum-salary player from the minors.
function callUp(lg, t, k) {
  const st = { seed: lg.seed + t.roster.length * 17 + t.id };
  const pos = k === 'G' ? 'G' : k === 'D' ? 'D' : pick(st, ['C', 'LW', 'RW']);
  const p = genPlayer(st, t.id, 0, pos, 57 + rand(st) * 5, new Set(t.roster.map((x) => x.num)));
  p.id = newId(lg);
  p.age = randInt(st, 20, 26);
  addPot(st, p);
  p.inj = 0;
  p.contract = { sal: 0.75, yrs: 1 };
  t.roster.push(p);
}

// Now and then two CPU clubs swap players of the same position at similar value.
export function cpuTrades(lg, news) {
  if (!tradesOpen(lg) || lg.phase !== 'season') return;
  const st = { seed: lg.seed + lg.day * 31 };
  if (rand(st) > 0.08) return;
  const cpu = lg.teams.filter((t) => t.id !== lg.userTeam);
  const A = pick(st, cpu), B = pick(st, cpu.filter((t) => t !== A));
  const g = pick(st, ['F', 'F', 'D']);
  const pa = pick(st, A.roster.filter((p) => group(p) === g));
  const pb = B.roster.filter((p) => group(p) === g).sort((x, y) => Math.abs(playerValue(x) - playerValue(pa)) - Math.abs(playerValue(y) - playerValue(pa)))[0];
  if (!pa || !pb || Math.abs(playerValue(pa) - playerValue(pb)) > playerValue(pa) * 0.25) return;
  const offer = { a: A.id, b: B.id, aPlayers: [pa.id], bPlayers: [pb.id], aPicks: [], bPicks: [] };
  const back = { a: B.id, b: A.id, aPlayers: [pb.id], bPlayers: [pa.id], aPicks: [], bPicks: [] };
  const relaxed = (o) => { const e = evaluateTrade(lg, o); return e.ok || /value/.test(e.reason); };
  if (!relaxed(offer) || !relaxed(back)) return;
  executeTrade(lg, offer);
  news?.(`TRADE: ${TEAMS[A.id].city} send ${pa.first} ${pa.name} to ${TEAMS[B.id].city} for ${pb.first} ${pb.name}.`);
}

// ---------------------------------------------------------------- off-season

function develop(st, p) {
  const o = ovr(p);
  let d;
  if (p.age < 24) d = clamp(((p.pot || o) - o) * (0.25 + rand(st) * 0.25), 0, 8);
  else if (p.age < 29) d = randInt(st, -1, 2);
  else if (p.age < 32) d = randInt(st, -3, 0);
  else d = randInt(st, -5, -1);
  for (const k of Object.keys(p.r)) p.r[k] = Math.round(clamp(p.r[k] + d + gauss(st) * 0.8, 30, 99));
  p.age++;
  p.pot = Math.max(p.pot || 0, ovr(p));
}

function draftOrder(lg) {
  // non-playoff teams worst-first, then playoff teams by elimination round, champion last
  const po = lg.playoffs;
  const exitRound = {};
  if (po) po.rounds.forEach((round, ri) => round.forEach((s) => { const loser = s.winner === s.hi ? s.lo : s.hi; exitRound[loser] = ri + 1; }));
  if (po?.champion != null) exitRound[po.champion] = 99;
  const sorted = lg.teams.slice().sort((a, b) => (exitRound[a.id] || 0) - (exitRound[b.id] || 0) || a.rec.pts - b.rec.pts || a.rec.w - b.rec.w);
  return sorted.map((t) => t.id);
}

function genProspects(lg, st) {
  const out = [];
  for (let i = 0; i < 80; i++) {
    const pos = pick(st, ['C', 'LW', 'RW', 'C', 'LW', 'RW', 'D', 'D', 'D', 'G']);
    const p = genPlayer(st, 'dr', 0, pos, 52 + rand(st) * 14, new Set());
    p.id = newId(lg);
    p.age = randInt(st, 18, 19);
    p.pot = clamp(Math.round(ovr(p) + 4 + rand(st) ** 1.9 * 22), ovr(p) + 4, 96);
    p.scout = clamp(Math.round(p.pot + gauss(st) * 4), 40, 99); // what your scouts think
    p.inj = 0;
    out.push(p);
  }
  return out.sort((a, b) => b.scout - a.scout);
}

// Season over: age/develop players, retire veterans, collect expiring deals, set up the draft.
export function beginOffseason(lg, news) {
  const st = { seed: lg.seed };
  const year = lg.year;
  const off = { step: 'resign', expiring: [], order: [], slot: 0, pool: [], log: [] };
  for (const t of lg.teams) {
    t.dead = 0;
    for (const p of [...t.roster]) {
      develop(st, p);
      p.inj = 0;
      if (p.age >= 38 || (p.age >= 35 && rand(st) < 0.35)) {
        t.roster.splice(t.roster.indexOf(p), 1);
        if (t.id === lg.userTeam || ovr(p) >= 78) news?.(`${p.first} ${p.name} (${TEAMS[t.id].abbr}) retires at ${p.age}.`);
        continue;
      }
      p.contract.yrs--;
      if (p.contract.yrs <= 0) {
        if (t.id === lg.userTeam) { p.ask = askFor(st, p, 1.1); off.expiring.push(p.id); }
        else if (playerValue(p) > 8 && p.age < 34 && rand(st) < 0.75) p.contract = contractFor(st, p);
        else { t.roster.splice(t.roster.indexOf(p), 1); p.ask = askFor(st, p); delete p.contract; lg.freeAgents.push(p); }
      }
    }
  }
  for (const p of lg.freeAgents) develop(st, p);
  lg.freeAgents = lg.freeAgents.filter((p) => p.age < 37);
  // draft: 2 rounds in order, honouring traded picks
  const order = draftOrder(lg);
  for (const round of [1, 2]) {
    for (const from of order) {
      const pk = lg.picks.find((k) => k.year === year && k.round === round && k.from === from);
      off.order.push({ round, from, owner: pk ? pk.owner : from, pid: null });
    }
  }
  off.pool = genProspects(lg, st);
  lg.seed = st.seed;
  lg.phase = 'offseason';
  lg.offseason = off;
  return off;
}

export function resignPlayer(lg, pid) {
  const t = lg.teams[lg.userTeam], off = lg.offseason;
  const p = t.roster.find((x) => x.id === pid);
  if (!p || !off.expiring.includes(pid)) return { ok: false, reason: 'Not an expiring contract.' };
  const newPay = payroll(t) - p.contract.sal + p.ask.sal; // the old deal counts until a decision is made
  if (newPay > (lg.cap || CAP)) return { ok: false, reason: `That would put you ${money(newPay - (lg.cap || CAP))} over the cap.` };
  p.contract = { sal: p.ask.sal, yrs: p.ask.yrs };
  delete p.ask;
  off.expiring = off.expiring.filter((x) => x !== pid);
  return { ok: true, reason: `${p.name} re-signs: ${money(p.contract.sal)} x ${p.contract.yrs}.` };
}

export function letGo(lg, pid) {
  const t = lg.teams[lg.userTeam], off = lg.offseason;
  const i = t.roster.findIndex((x) => x.id === pid);
  if (i < 0) return;
  const [p] = t.roster.splice(i, 1);
  delete p.contract;
  lg.freeAgents.push(p);
  off.expiring = off.expiring.filter((x) => x !== pid);
}

export function finishResign(lg) {
  for (const pid of [...lg.offseason.expiring]) letGo(lg, pid);
  lg.offseason.step = 'draft';
}

function addDraftee(lg, tid, p) {
  const t = lg.teams[tid];
  delete p.scout;
  p.contract = { ...ENTRY };
  p.num = freeNumber(t, randInt({ seed: lg.seed + p.num }, 2, 98));
  p.s = blankStats(p.pos);
  p.ps = blankStats(p.pos);
  t.roster.push(p);
}

export function currentPick(lg) {
  const off = lg.offseason;
  return off && off.step === 'draft' ? off.order[off.slot] || null : null;
}

export function draftPlayer(lg, pid) {
  const off = lg.offseason, slot = currentPick(lg);
  if (!slot) return null;
  const i = off.pool.findIndex((p) => p.id === pid);
  if (i < 0) return null;
  const [p] = off.pool.splice(i, 1);
  slot.pid = p.id;
  slot.name = `${p.first} ${p.name}`;
  slot.pos = p.pos;
  addDraftee(lg, slot.owner, p);
  off.log.unshift(`R${slot.round} #${off.slot + 1}: ${TEAMS[slot.owner].abbr} take ${p.first} ${p.name} (${p.pos})`);
  off.slot++;
  if (off.slot >= off.order.length) off.step = 'fa';
  return p;
}

function cpuPickId(lg, tid) {
  const st = { seed: lg.seed + lg.offseason.slot * 13 };
  const t = lg.teams[tid];
  const c = counts(t.roster);
  const pool = lg.offseason.pool.slice(0, 8);
  const score = (p) => p.scout + (c[group(p)] < MIN_POS[group(p)] + 1 ? 4 : 0) + gauss(st) * 3;
  return pool.sort((a, b) => score(b) - score(a))[0].id;
}

// Run CPU picks until it's the user's turn (or the draft ends). auto=true also picks for the user.
export function simDraft(lg, auto = false) {
  while (lg.offseason.step === 'draft') {
    const slot = currentPick(lg);
    if (slot.owner === lg.userTeam && !auto) return;
    draftPlayer(lg, cpuPickId(lg, slot.owner));
  }
}

export function openFreeAgency(lg) {
  lg.offseason.step = 'fa';
  cpuMaintain(lg);
}

// Close the off-season. Returns { ok, reason } (the user's roster must be legal).
export function startNewSeason(lg, makeSchedule, blankRec, news) {
  const t = lg.teams[lg.userTeam];
  const probs = rosterProblems(t.roster);
  if (probs.length) return { ok: false, reason: `Fix your roster first: ${probs.join(', ')}.` };
  if (payroll(t) > (lg.cap || CAP)) return { ok: false, reason: `You're over the cap by ${money(payroll(t) - (lg.cap || CAP))}.` };
  const st = { seed: lg.seed };
  lg.phase = 'season';
  cpuMaintain(lg);
  lg.year++;
  for (const team of lg.teams) {
    team.dead = 0;
    for (const p of team.roster) { p.s = blankStats(p.pos); p.ps = blankStats(p.pos); }
    team.rec = blankRec();
    if (team.id !== lg.userTeam) team.lines = autoLines(team.roster);
    else repairLines(team);
  }
  lg.picks = lg.picks.filter((k) => k.year >= lg.year);
  addPicks(lg, lg.year + 1);
  lg.freeAgents = lg.freeAgents.concat(lg.offseason.pool.slice(0, 10).map((p) => { delete p.scout; p.ask = askFor(st, p, 0.8); return p; }));
  lg.freeAgents = lg.freeAgents.sort((a, b) => ovr(b) - ovr(a)).slice(0, 60);
  lg.offseason = null;
  lg.schedule = makeSchedule(st, lg.settings.seasonLength);
  lg.seed = st.seed;
  lg.day = 0;
  lg.playoffs = null;
  news?.(`Opening night of the ${lg.year} season.`);
  return { ok: true };
}
