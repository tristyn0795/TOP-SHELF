// Player switching: on a CPU breakaway the switch button reaches the defenders, quick presses
// cycle through every skater, auto switch hands you the goal-side man, and the skater you
// control turns around faster than a CPU one.
import assert from 'node:assert/strict';
import { createGame, step, byId, DT } from '../shared/engine.js';
import { buildTeams, gameTeam } from '../shared/league.js';

const ok = (m) => console.log('✔', m);
const teams = buildTeams(1994);

function setup(auto = true) {
  const s = createGame({ teams: [gameTeam(teams, 0, false), gameTeam(teams, 1, true)], humans: [{ team: 0, auto }], cfg: { periodLen: 180, penalties: false }, seed: 9 });
  let n = 0;
  while (s.phase !== 'play' && n++ < 3000) step(s, [{}], DT);
  assert.equal(s.phase, 'play');
  return s;
}

// Team 0 defends the net at x = -89. A CPU carrier is at the red line skating at it, our two
// D are back, our three forwards are already beaten (behind the carrier).
function breakaway(s) {
  const mine = s.skaters.filter((k) => k.team === 0), theirs = s.skaters.filter((k) => k.team === 1);
  const D = mine.filter((k) => k.role.endsWith('D')), F = mine.filter((k) => !k.role.endsWith('D'));
  const car = theirs.find((k) => k.role === 'C') || theirs[0];
  const place = (k, x, y, vx = 0) => Object.assign(k, { x, y, vx, vy: 0, stun: 0, lungeT: 0, dekeT: 0 });
  place(car, -5, 0, -26);
  theirs.filter((k) => k !== car).forEach((k, i) => place(k, 20 + i * 6, -30 + i * 15, -20));
  D.forEach((k, i) => place(k, -55, i ? 12 : -12));
  F.forEach((k, i) => place(k, 12 + i * 4, -15 + i * 15, -18));
  const p = s.puck;
  Object.assign(p, { owner: car.id, pass: null, shot: null, x: car.x - 2, y: car.y, vx: car.vx, vy: 0 });
  p.touches = [{ pid: car.pid, team: 1 }];
  p.lastTeam = 1;
  return { D, F, car };
}

const press = (s) => { step(s, [{ pass: true }], DT); step(s, [{ pass: false }], DT); return s.humans[0].sk; };

// 1. breakaway: first press goes to a defender, quick presses cycle through everyone
{
  const s = setup(false);
  const { D, F } = breakaway(s);
  s.humans[0].sk = F[0].id;
  s.humans[0].swT = -9;
  const first = press(s);
  assert.ok(D.some((k) => k.id === first), `first switch should pick a defender, got ${byId(s, first)?.role}`);
  const seen = new Set([first]);
  for (let i = 0; i < 4; i++) { for (let j = 0; j < 6; j++) step(s, [{}], DT); seen.add(press(s)); }
  assert.equal(seen.size, 5, `quick presses should visit all 5 skaters, saw ${seen.size}`);
  assert.ok(D.every((k) => seen.has(k.id)), 'both defenders reachable');
  ok(`breakaway: first switch → ${byId(s, first).role}, quick presses visit all ${seen.size} skaters`);
}

// 2. auto switch: beaten forward → goal-side defender; off → you keep your man
for (const auto of [true, false]) {
  const s = setup(auto);
  const { D, F } = breakaway(s);
  s.humans[0].sk = F[1].id;
  s.humans[0].swT = -9;
  step(s, [{}], DT);
  const now = s.humans[0].sk;
  if (auto) {
    assert.ok(D.some((k) => k.id === now), 'auto switch should move a beaten forward to a defender');
    ok(`auto switch ON: beaten ${F[1].role} → ${byId(s, now).role}`);
  } else {
    assert.equal(now, F[1].id, 'auto switch off keeps your skater');
    ok('auto switch OFF: you keep your skater');
  }
}

// 3. a manual switch is never overridden for 1.5 s
{
  const s = setup(true);
  const { F } = breakaway(s);
  s.humans[0].sk = F[0].id;
  s.humans[0].swT = s.time;
  step(s, [{}], DT);
  assert.equal(s.humans[0].sk, F[0].id);
  ok('auto switch waits after you switch yourself');
}

// 4. the CPU passes: you go to the defender for the new carrier
{
  const s = setup(true);
  const { D, car } = breakaway(s);
  const mate = s.skaters.find((k) => k.team === 1 && k !== car);
  Object.assign(mate, { x: -45, y: 30, vx: -10, vy: 0 });
  // our controlled D is goal-side but on the wrong side of the ice
  const far = D.slice().sort((a, b) => a.y - b.y)[0];
  Object.assign(far, { x: -70, y: -30 });
  s.humans[0].sk = far.id;
  s.humans[0].swT = -9;
  const p = s.puck;
  Object.assign(p, { owner: null, pass: { team: 1, to: mate.id }, x: mate.x + Math.cos(mate.a) * 2.3, y: mate.y + Math.sin(mate.a) * 2.3, vx: 0, vy: 0, z: 0 });
  mate.cd.pick = 0;
  let n = 0;
  while (p.owner !== mate.id && n++ < 30) step(s, [{}], DT);
  assert.equal(p.owner, mate.id, 'pass received');
  const now = byId(s, s.humans[0].sk);
  assert.notEqual(now.id, far.id, 'switched off the out-of-play defender');
  ok(`CPU pass: control moved from the far D to ${now.role} (${Math.round(Math.hypot(now.x - mate.x, now.y - mate.y))} ft from the new carrier)`);
}

// 5. the skater you control turns around quickly (CPU-equal physics took ~1.0 s)
{
  const s = setup(false);
  const k = byId(s, s.humans[0].sk);
  const hold = () => { s.puck.owner = k.id; k.y = 0; k.vy = 0; for (const o of s.skaters) if (o !== k) Object.assign(o, { x: 60, y: 30 }); };
  Object.assign(k, { x: -40, y: 0, vx: 0, vy: 0, a: 0 });
  for (let i = 0; i < 120; i++) { step(s, [{ mx: 1, my: 0 }], DT); hold(); k.x = Math.min(k.x, -20); }
  const top = k.vx;
  let t = 0;
  while (k.vx > -top * 0.9 && t < 3) { step(s, [{ mx: -1, my: 0 }], DT); hold(); t += DT; }
  assert.equal(s.humans[0].sk, k.id);
  assert.ok(t < 0.75, `turnaround took ${t.toFixed(2)}s`);
  ok(`turnaround from full speed (${top.toFixed(1)} ft/s) to 90% the other way: ${t.toFixed(2)}s`);
}

console.log('SWITCH CHECKS PASSED');
