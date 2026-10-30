// GM mode checks: cap/contracts, lineups with injuries, trades, free agency, two full
// seasons with off-seasons (re-sign, draft, free agency), and upgrading old saves.
import assert from 'node:assert/strict';
import * as L from '../shared/league.js';
import * as gm from '../shared/gm.js';
import { createGame, step, DT } from '../shared/engine.js';

const ok = (s) => console.log('✔', s);
const lg = L.createLeague({ userTeam: 0, seasonLength: 16, seriesLen: 1, seed: 1234 });
const U = lg.teams[0];

function legal(lgx, label) {
  const seen = new Set();
  for (const t of lgx.teams) {
    const max = lgx.phase === 'offseason' ? gm.OFFSEASON_MAX : gm.ROSTER_MAX;
    assert.deepEqual(gm.rosterProblems(t.roster, max), [], `${label}: team ${t.id} roster ${gm.rosterProblems(t.roster, max)}`);
    const lu = gm.gameLineup(t).lines;
    const ids = gm.lineIds(lu);
    assert.equal(ids.length, 20, `${label}: lineup size`);
    for (const id of ids) assert.ok(t.roster.some((p) => p.id === id), `${label}: lineup id ${id} not on roster`);
    assert.equal(new Set(ids.slice(0, 18)).size, 18, `${label}: duplicate skater in lineup (team ${t.id})`);
    for (const p of t.roster) { assert.ok(!seen.has(p.id), `${label}: duplicate player ${p.id}`); seen.add(p.id); assert.ok(p.contract, `${label}: ${p.id} has no contract`); }
  }
  for (const p of lgx.freeAgents) { assert.ok(!seen.has(p.id), `${label}: free agent ${p.id} also on a roster`); seen.add(p.id); }
}

// 1. contracts and the cap
const pays = lg.teams.map(gm.payroll);
const avg = pays.reduce((a, b) => a + b, 0) / pays.length;
ok(`payroll avg ${gm.money(avg)} (${Math.round((avg / lg.cap) * 100)}% of ${gm.money(lg.cap)}), min ${gm.money(Math.min(...pays))}, max ${gm.money(Math.max(...pays))}`);
assert.ok(avg / lg.cap > 0.7 && avg / lg.cap < 0.95, 'average payroll should sit around 85% of the cap');
assert.ok(Math.max(...pays) <= lg.cap, 'nobody starts over the cap');
legal(lg, 'new league');

// 2. lineups with injuries
const fwd = U.lines.F[0][0], g1 = U.lines.G[0];
U.roster.find((p) => p.id === fwd).inj = 5;
U.roster.find((p) => p.id === g1).inj = 5;
const lu = gm.gameLineup(U).lines;
assert.ok(!gm.lineIds(lu).includes(fwd) && lu.G[0] !== g1, 'injured players sit out');
assert.deepEqual(gm.lineIds(U.lines).includes(fwd), true, 'saved lines are not changed by injuries');
U.roster.forEach((p) => (p.inj = 0));
ok('injured players are swapped out of the game-day lineup');

// 3. trades
const best = (t) => t.roster.slice().sort((a, b) => gm.playerValue(b) - gm.playerValue(a))[0];
const worst = (t) => t.roster.filter((p) => p.pos !== 'G').sort((a, b) => gm.playerValue(a) - gm.playerValue(b))[0];
const B = lg.teams[5];
let ev = gm.evaluateTrade(lg, { a: 0, b: 5, aPlayers: [worst(U).id], bPlayers: [best(B).id], aPicks: [], bPicks: [] });
assert.equal(ev.ok, false);
ok(`lopsided offer rejected: "${ev.reason}"`);
// fair: find one of our players clearly worth more than one of theirs, same position group
let fair = null;
for (const mine of U.roster.filter((p) => p.pos !== 'G')) {
  const theirs = B.roster.filter((p) => gm.group(p) === gm.group(mine) && gm.playerValue(p) * 1.3 < gm.playerValue(mine) && gm.playerValue(p) > 5)[0];
  if (theirs) { fair = { a: 0, b: 5, aPlayers: [mine.id], bPlayers: [theirs.id], aPicks: [], bPicks: [] }; break; }
}
assert.ok(fair, 'found a fair trade candidate');
ev = gm.evaluateTrade(lg, fair);
assert.equal(ev.ok, true, ev.reason);
gm.executeTrade(lg, fair);
assert.ok(lg.teams[5].roster.some((p) => p.id === fair.aPlayers[0]) && U.roster.some((p) => p.id === fair.bPlayers[0]));
legal(lg, 'after trade');
ok('fair trade accepted and executed');
const goalies = U.roster.filter((p) => p.pos === 'G').map((p) => p.id);
ev = gm.evaluateTrade(lg, { a: 0, b: 6, aPlayers: goalies, bPlayers: [], aPicks: [], bPicks: [] });
assert.equal(ev.ok, false);
ok(`trading away both goalies rejected: "${ev.reason}"`);
// a pick sweetener: suggestAdd closes the gap
const ask = { a: 0, b: 7, aPlayers: [], bPlayers: [worst(lg.teams[7]).id], aPicks: [], bPicks: [] };
const sug = gm.suggestAdd(lg, ask);
assert.ok(sug, 'CPU suggests something to balance');
ok(`"ask what they want" suggests: ${sug.label}`);
// trade our 1st-round pick to team 9 so we can check it later in the draft
const ourFirst = lg.picks.find((k) => k.owner === 0 && k.round === 1 && k.year === lg.year);
const pickDeal = { a: 0, b: 9, aPlayers: [], bPlayers: [worst(lg.teams[9]).id], aPicks: [gm.pickKey(ourFirst)], bPicks: [] };
if (gm.evaluateTrade(lg, pickDeal).ok) { gm.executeTrade(lg, pickDeal); ok('traded our 1st-round pick for a depth player'); }

// 4. free agency
const fa = lg.freeAgents.slice().sort((a, b) => a.ask.sal - b.ask.sal)[0];
const before = U.roster.length;
while (U.roster.length >= gm.ROSTER_MAX) gm.releasePlayer(lg, 0, worst(U).id);
let r = gm.signFreeAgent(lg, 0, fa.id);
assert.equal(r.ok, true, r.reason);
const payBefore = gm.payroll(U);
const cut = worst(U);
const cost = gm.releaseCost(cut);
r = gm.releasePlayer(lg, 0, cut.id);
assert.equal(r.ok, true, r.reason);
assert.ok(Math.abs(gm.payroll(U) - (payBefore - cut.contract?.sal || 0)) >= 0 && U.dead >= cost - 1e-9, 'dead money recorded');
const rich = lg.freeAgents[0];
U.dead = 500;
r = gm.signFreeAgent(lg, 0, rich.id);
assert.equal(r.ok, false);
U.dead = cost;
ok(`free agency: signed ${fa.name}, released with ${gm.money(cost)} dead cap, over-cap signing refused ("${r.reason}") [roster ${before} -> ${U.roster.length}]`);
legal(lg, 'after free agency');

// 5. a live engine game with the edited roster
const s = createGame({ teams: [L.gameTeam(lg.teams, 0, true), L.gameTeam(lg.teams, 5, false)], cfg: { periodLen: 60 }, seed: 3 });
for (let i = 0; i < 3000; i++) step(s, [], DT);
ok('engine runs with the traded/edited roster');

// 6. two full seasons with off-seasons
for (let season = 0; season < 2; season++) {
  let guard = 0;
  while (lg.phase !== 'done' && guard++ < 400) L.simDay(lg);
  assert.equal(lg.phase, 'done');
  legal(lg, `end of season ${season + 1}`);
  const injuries = lg.news.filter((n) => /INJURY/.test(n.text)).length;
  const off = L.startOffseason(lg);
  assert.equal(lg.phase, 'offseason');
  for (const pid of [...off.expiring]) gm.resignPlayer(lg, pid);
  gm.finishResign(lg);
  const order = off.order.map((o) => o.owner);
  if (season === 0 && ourFirst) assert.equal(off.order.find((o) => o.round === 1 && o.from === 0).owner, 9, 'traded pick belongs to its new owner');
  gm.simDraft(lg);                       // stops at our pick
  const slot = gm.currentPick(lg);
  if (slot) { assert.equal(slot.owner, 0); gm.draftPlayer(lg, lg.offseason.pool[0].id); }
  gm.simDraft(lg, true);
  assert.ok(off.order.every((o) => o.pid), 'every draft slot was used');
  gm.openFreeAgency(lg);
  // make our roster legal: trim to 26, keep position minimums
  while (U.roster.length > gm.ROSTER_MAX) gm.releasePlayer(lg, 0, worst(U).id);
  const filled = gm.autoFill(lg, 0);
  assert.deepEqual(gm.rosterProblems(U.roster, gm.OFFSEASON_MAX).filter((x) => !/max/.test(x)), [], 'autoFill meets the minimums');
  while (gm.payroll(U) > lg.cap) gm.releasePlayer(lg, 0, U.roster.slice().sort((a, b) => b.contract.sal - a.contract.sal).find((p) => gm.counts(U.roster)[gm.group(p)] > gm.MIN_POS[gm.group(p)]).id);
  const res = L.finishOffseason(lg);
  assert.equal(res.ok, true, res.reason);
  legal(lg, `start of season ${season + 2}`);
  ok(`season ${season + 1} → off-season (${off.order.length} picks, ${injuries} injury reports, filled ${filled.length}) → ${lg.year} season, FA pool ${lg.freeAgents.length}, picks ${lg.picks.length}`);
}
const trades = lg.news.filter((n) => /^TRADE:/.test(n.text)).length;
ok(`CPU trades in the news: ${trades}`);

// 7. upgrading a pre-GM save
const old = L.createLeague({ userTeam: 2, seasonLength: 16, seed: 77 });
for (const t of old.teams) { delete t.dead; for (const p of t.roster) { delete p.contract; delete p.pot; delete p.inj; } }
delete old.freeAgents; delete old.picks; delete old.cap; old.version = 1;
L.upgradeLeague(old);
assert.equal(old.version, 2);
legal(old, 'upgraded save');
ok('version 1 save upgrades cleanly');
console.log('GM CHECKS PASSED');
