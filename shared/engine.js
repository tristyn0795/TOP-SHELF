// TOP SHELF game engine. Pure, serializable state; runs in the browser and on the server.
// World units are feet. x runs along the length of the rink (goal lines at ±89), y across it.
// Team 0 always attacks +x, team 1 attacks -x.
import { rand, gauss, newSeed } from './rng.js';
import { effRatings } from './teams.js';

export const R = { L: 100, W: 42.5, CR: 28, GX: 89, BX: 25, NW: 3, ND: 3.4, NH: 4, CREASE: 6, DOTX: 69, DOTY: 22 };
export const DT = 1 / 60;
const G = 32;
const SK_R = 1.4;
const PUCK_R = 0.25;
const STICK = 2.3;
const GOALIE_R = 2.0;
const BENCH_X = [-18, 18];
const BOX_X = [-5, 5];

const hyp = Math.hypot;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const sgnOf = (v) => (v >= 0 ? 1 : -1);
function angDiff(a, b) {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}
const ORD = ['1ST', '2ND', '3RD'];
export const periodName = (per, ot) => (per <= 3 ? ORD[per - 1] : per === 4 ? 'OT' : `${per - 3}OT`);

// ---------------------------------------------------------------- geometry

// Rounded-rectangle boards. Returns corrected position + inward normal, or null.
export function wallContact(x, y, rad) {
  const cxL = R.L - R.CR, cyL = R.W - R.CR;
  if (Math.abs(x) > cxL && Math.abs(y) > cyL) {
    const cx = sgnOf(x) * cxL, cy = sgnOf(y) * cyL;
    const dx = x - cx, dy = y - cy, d = hyp(dx, dy), lim = R.CR - rad;
    if (d > lim) {
      const nx = -dx / d, ny = -dy / d;
      return { x: cx - nx * lim, y: cy - ny * lim, nx, ny };
    }
    return null;
  }
  if (x > R.L - rad) return { x: R.L - rad, y, nx: -1, ny: 0 };
  if (x < -R.L + rad) return { x: -R.L + rad, y, nx: 1, ny: 0 };
  if (y > R.W - rad) return { x, y: R.W - rad, nx: 0, ny: -1 };
  if (y < -R.W + rad) return { x, y: -R.W + rad, nx: 0, ny: 1 };
  return null;
}

function bounce(o, c, e, f) {
  o.x = c.x; o.y = c.y;
  const vn = o.vx * c.nx + o.vy * c.ny;
  if (vn < 0) {
    o.vx -= (1 + e) * vn * c.nx;
    o.vy -= (1 + e) * vn * c.ny;
    o.vx *= f; o.vy *= f;
  }
}

// Push a circle out of both nets (solid boxes behind the goal lines).
function collideNetBody(o, rad) {
  for (const sg of [-1, 1]) {
    const x0 = sg * R.GX, x1 = sg * (R.GX + R.ND);
    const lo = Math.min(x0, x1) - rad, hi = Math.max(x0, x1) + rad;
    const yl = R.NW + rad;
    if (o.x <= lo || o.x >= hi || Math.abs(o.y) >= yl) continue;
    const pens = [
      [o.x - lo, -1, 0], [hi - o.x, 1, 0], [yl - Math.abs(o.y), 0, sgnOf(o.y)],
    ];
    pens.sort((a, b) => a[0] - b[0]);
    const [p, nx, ny] = pens[0];
    o.x += nx * p; o.y += ny * p;
    const vn = o.vx * nx + o.vy * ny;
    if (vn < 0) { o.vx -= vn * nx; o.vy -= vn * ny; }
  }
}

function segDist(px, py, x1, y1, x2, y2) {
  const sx = x2 - x1, sy = y2 - y1, L2 = sx * sx + sy * sy;
  let t = L2 > 0 ? ((px - x1) * sx + (py - y1) * sy) / L2 : 0;
  t = clamp(t, 0, 1);
  return hyp(px - (x1 + sx * t), py - (y1 + sy * t));
}

// ---------------------------------------------------------------- setup

/**
 * opts.teams: [{ team, roster, lines:{F,D,G}, home }, {...}]  (index 0 attacks +x)
 * opts.humans: [{ team }]  one entry per human controller
 * opts.cfg: { periodLen, periods, ot:'reg'|'playoff'|'none', penalties, icing, difficulty, goalPause }
 */
export function createGame(opts) {
  const cfg = Object.assign(
    { periodLen: 180, periods: 3, ot: 'reg', penalties: true, icing: true, difficulty: 'pro', goalPause: 3.2 },
    opts.cfg || {},
  );
  const humans = opts.humans || [];
  const s = {
    seed: (opts.seed ?? newSeed()) >>> 0,
    cfg, time: 0, phase: 'faceoff', timer: 0, period: 1, clock: cfg.periodLen, ot: false, ot3: false,
    teams: [], skaters: [], goalies: [], puck: null, humans: [], events: [], banner: null,
    nextId: 1, shotSeq: 0, so: null, result: null, lastSave: -9, fo: null, stopAt: null, next: null,
    goals: [], shake: 0,
  };
  // Long periods run an accelerated clock, and play closer to real hockey: the CPU shoots
  // less and goalies tighten up.
  s.clockRate = cfg.clockRate ?? (cfg.periodLen >= 1200 ? 3 : cfg.periodLen >= 600 ? 2 : 1);
  s.pace = clamp(Math.sqrt(180 / (cfg.periodLen / s.clockRate)), 0.4, 1);
  const humanTeams = new Set(humans.map((h) => h.team));
  s.teams = opts.teams.map((t, i) => makeTeam(s, t, i, humanTeams.size > 0 && !humanTeams.has(i)));
  s.humans = humans.map((h) => ({ team: h.team, auto: h.auto !== false, sk: -1, swT: -9, rank: null, prev: {}, inp: {}, edge: {} }));
  s.goalies = [0, 1].map((i) => makeGoalie(s, i));
  s.puck = newPuck();
  setupFaceoff(s, 0, 0);
  s.timer = 2.2;
  const home = s.teams[0].home ? 0 : 1;
  banner(s, '1ST PERIOD', `${s.teams[1 - home].abbr} AT ${s.teams[home].abbr}`, -1, 2.2);
  return s;
}

function makeTeam(s, t, i, cpuVsHuman) {
  const bonus = cpuVsHuman ? ({ rookie: -9, pro: 0, allstar: 5 }[s.cfg.difficulty] ?? 0) : 0;
  const players = {}, energy = {}, stats = {};
  for (const p of t.roster) {
    players[p.id] = { id: p.id, name: p.name, num: p.num, pos: p.pos, r: effRatings(p.r, t.team.perk, bonus) };
    energy[p.id] = 1;
    stats[p.id] = { g: 0, a: 0, sog: 0, hits: 0, pim: 0 };
  }
  return {
    id: t.team.id, abbr: t.team.abbr, name: t.team.name, perk: t.team.perk, home: !!t.home,
    players, lines: t.lines, energy, stats, bonus,
    dir: i === 0 ? 1 : -1, score: 0, shots: 0, hits: 0, pim: 0, ppg: 0, ppo: 0, fow: 0, fot: 0,
    perScore: [0, 0, 0], box: [], returning: [], curF: 0, curD: 0, swapT: 2, noChange: false,
    goalie: { pid: t.lines.G[0], sa: 0, ga: 0 },
  };
}

function makeGoalie(s, t) {
  const team = s.teams[t];
  const p = team.players[team.goalie.pid];
  const sg = -team.dir;
  return {
    team: t, pid: p.id, num: p.num, r: p.r, x: sg * (R.GX - 3), y: 0, a: team.dir > 0 ? 0 : Math.PI,
    down: 0, hold: 0, beatShot: -1, ignoreUntil: 0, reactT: 0.1 + (100 - p.r.gk) * 0.003,
  };
}

function newPuck() {
  return { x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, owner: null, pass: null, shot: null, rel: null, touches: [], lastTeam: -1, defl: 0 };
}

function spawnSkater(s, t, pid, role, x, y) {
  const team = s.teams[t];
  const p = team.players[pid];
  return {
    id: s.nextId++, pid, team: t, role, num: p.num, r: p.r,
    x, y, vx: 0, vy: 0, a: team.dir > 0 ? 0 : Math.PI,
    stun: 0, cd: { pick: 0, chk: 0, poke: 0, deke: 0, ai: 0 },
    charge: -1, aiCharge: 0, oneT: false, dekeT: 0, lungeT: 0, pokeT: 0, ctrl: -1, lastHad: -9,
  };
}

export function byId(s, id) {
  if (id == null) return null;
  for (const k of s.skaters) if (k.id === id) return k;
  return null;
}

function ev(s, type, data) {
  s.events.push(Object.assign({ type }, data));
}

function banner(s, text, sub = '', team = -1, dur = 1.8) {
  s.banner = { text, sub, team, t: s.time, dur };
}

const hasHuman = (s, t) => s.humans.some((h) => h.team === t);

// ---------------------------------------------------------------- lines

function desired(s, t) {
  const mine = Math.min(2, s.teams[t].box.length), theirs = Math.min(2, s.teams[1 - t].box.length);
  if (s.ot3) return clamp(3 + Math.max(0, theirs - mine), 3, 5);
  return Math.max(3, 5 - mine);
}

function roleSet(s, n) {
  if (n >= 5) return ['C', 'LW', 'RW', 'LD', 'RD'];
  if (n === 4) return ['C', 'LW', 'LD', 'RD'];
  return s.ot3 ? ['C', 'LW', 'LD'] : ['C', 'LD', 'RD'];
}

const inBox = (team, pid) => team.box.some((b) => b.pid === pid);
const avgE = (team, ids) => ids.reduce((a, p) => a + team.energy[p], 0) / Math.max(1, ids.length);

function chooseLines(s, t) {
  const team = s.teams[t];
  if (team.noChange) { team.noChange = false; return; }
  const pp = s.teams[1 - t].box.length > team.box.length;
  const fB = [0.16, 0.09, 0.03, -0.03], dB = [0.12, 0.06, 0];
  if (pp && avgE(team, team.lines.F[0]) > 0.55) team.curF = 0;
  else if (avgE(team, team.lines.F[team.curF]) < 0.8) {
    let best = team.curF, bv = -1;
    team.lines.F.forEach((l, i) => { const v = avgE(team, l) + (fB[i] ?? -0.05); if (v > bv) { bv = v; best = i; } });
    team.curF = best;
  }
  if (avgE(team, team.lines.D[team.curD]) < 0.8) {
    let best = team.curD, bv = -1;
    team.lines.D.forEach((l, i) => { const v = avgE(team, l) + (dB[i] ?? -0.05); if (v > bv) { bv = v; best = i; } });
    team.curD = best;
  }
}

function bestBench(s, t, grp, used) {
  const team = s.teams[t];
  const onIce = new Set(s.skaters.filter((k) => k.team === t).map((k) => k.pid));
  let best = null, be = -1;
  for (const pid of team.lines[grp].flat()) {
    if (onIce.has(pid) || inBox(team, pid) || (used && used.has(pid))) continue;
    if (team.energy[pid] > be) { be = team.energy[pid]; best = pid; }
  }
  return best;
}

function composeTeam(s, t) {
  const team = s.teams[t];
  chooseLines(s, t);
  s.skaters = s.skaters.filter((k) => k.team !== t);
  team.returning = [];
  const used = new Set();
  const take = (pid, grp) => {
    if (pid && !inBox(team, pid) && !used.has(pid)) { used.add(pid); return pid; }
    const b = bestBench(s, t, grp, used);
    if (b) used.add(b);
    return b;
  };
  const F = team.lines.F[team.curF], D = team.lines.D[team.curD];
  const slot = { C: F[0], LW: F[1], RW: F[2], LD: D[0], RD: D[1] };
  for (const role of roleSet(s, desired(s, t))) {
    const pid = take(slot[role], role.endsWith('D') ? 'D' : 'F');
    if (pid) s.skaters.push(spawnSkater(s, t, pid, role, 0, 0));
  }
}

// ---------------------------------------------------------------- stoppages

function foSpot(role, dir, fx, fy) {
  const off = { C: [-1.8, 0], LW: [-4, -15], RW: [-4, 15], LD: [-20, -10], RD: [-20, 10] }[role] || [-10, 0];
  let x = fx + off[0] * dir, y = clamp(fy + off[1], -37, 37);
  if (Math.abs(x) > R.GX - 3 && Math.abs(y) < 6) y = sgnOf(y) * 6;
  const c = wallContact(x, y, SK_R + 1);
  if (c) { x = c.x; y = c.y; }
  return [x, y];
}

function setupFaceoff(s, fx, fy) {
  s.phase = 'faceoff';
  s.timer = 1.1;
  s.fo = { x: fx, y: fy, dropT: -1, press: [-9, -9] };
  composeTeam(s, 0);
  composeTeam(s, 1);
  for (const k of s.skaters) {
    const dir = s.teams[k.team].dir;
    [k.x, k.y] = foSpot(k.role, dir, fx, fy);
    k.vx = k.vy = 0;
    k.a = k.role === 'C' ? (dir > 0 ? 0 : Math.PI) : Math.atan2(fy - k.y, fx - k.x);
    k.charge = -1; k.stun = 0; k.oneT = false;
  }
  const p = s.puck;
  Object.assign(p, newPuck(), { x: fx, y: fy });
  for (const g of s.goalies) {
    const sg = -s.teams[g.team].dir;
    g.x = sg * (R.GX - 3); g.y = 0; g.down = 0; g.hold = 0; g.beatShot = -1;
  }
  for (const h of s.humans) {
    const c = s.skaters.find((k) => k.team === h.team && k.role === 'C') || s.skaters.find((k) => k.team === h.team);
    h.sk = c ? c.id : -1;
  }
}

function resolveFaceoff(s) {
  const c = [0, 1].map((t) => s.skaters.find((k) => k.team === t && k.role === 'C') || s.skaters.find((k) => k.team === t));
  let p0 = 0.5 + ((c[0]?.r.fo ?? 50) - (c[1]?.r.fo ?? 50)) / 160;
  for (const t of [0, 1]) {
    const pr = s.fo.press[t];
    if (pr < 0) continue;
    const d = pr - s.fo.dropT;
    const b = d >= -0.2 && d <= 0.25 ? 0.24 : d < -0.2 ? -0.12 : 0;
    p0 += t === 0 ? b : -b;
  }
  const w = rand(s) < clamp(p0, 0.08, 0.92) ? 0 : 1;
  s.teams[w].fow++;
  s.teams[0].fot++; s.teams[1].fot++;
  const p = s.puck;
  p.vx = -s.teams[w].dir * (16 + rand(s) * 8);
  p.vy = (rand(s) - 0.5) * 14;
  if (c[w]) p.touches = [{ pid: c[w].pid, team: w }];
  p.lastTeam = w;
  s.phase = 'play';
  ev(s, 'faceoff', { team: w });
}

function whistle(s, x, y, text = '', sub = '') {
  s.phase = 'whistle';
  s.timer = 1.6;
  s.stopAt = { x, y };
  for (const k of s.skaters) { k.charge = -1; k.lungeT = 0; }
  if (text) banner(s, text, sub, -1, 1.6);
  ev(s, 'whistle');
}

function freeze(s, g) {
  const p = s.puck;
  g.hold = 1.2;
  p.owner = null; p.shot = null; p.pass = null; p.rel = null;
  p.vx = p.vy = p.vz = 0; p.z = 0;
  p.x = g.x + Math.cos(g.a) * 1.2; p.y = g.y + Math.sin(g.a) * 1.2;
  const sg = -s.teams[g.team].dir;
  whistle(s, sg * R.DOTX, sgnOf(p.y) * R.DOTY);
}

function callPenalty(s, k, type) {
  if (!s.cfg.penalties || s.phase !== 'play') return false;
  const team = s.teams[k.team];
  if (team.box.length >= 2) return false;
  const len = Math.max(12, (120 * s.cfg.periodLen) / 1200);
  const name = team.players[k.pid].name;
  team.box.push({ pid: k.pid, num: k.num, name, type, rem: len, len });
  team.pim += 2;
  team.stats[k.pid].pim += 2;
  s.teams[1 - k.team].ppo++;
  ev(s, 'penalty', { team: k.team, kind: type });
  whistle(s, -team.dir * R.DOTX, sgnOf(s.puck.y) * R.DOTY, type, `#${k.num} ${name.toUpperCase()} 2 MIN`);
  return true;
}

// ---------------------------------------------------------------- actions

function releasePuck(s, k) {
  const p = s.puck;
  p.owner = null; p.shot = null; p.pass = null;
  p.rel = { team: k.team, x: k.x, y: k.y };
  k.charge = -1;
}

function laneOpen(s, team, x1, y1, x2, y2) {
  let m = 99;
  for (const o of s.skaters) {
    if (o.team === team || o.stun > 0) continue;
    m = Math.min(m, segDist(o.x, o.y, x1, y1, x2, y2));
  }
  return m;
}

function doPass(s, k, ax, ay, forced) {
  const p = s.puck;
  const team = s.teams[k.team];
  let tgt = forced || null;
  if (!tgt) {
    const hasAim = hyp(ax, ay) > 0.3;
    let ux = hasAim ? ax : Math.cos(k.a), uy = hasAim ? ay : Math.sin(k.a);
    const ul = hyp(ux, uy) || 1; ux /= ul; uy /= ul;
    let best = -1e9;
    for (const m of s.skaters) {
      if (m.team !== k.team || m === k || m.stun > 0) continue;
      const dx = m.x - k.x, dy = m.y - k.y, d = hyp(dx, dy);
      if (d < 5) continue;
      const align = (dx * ux + dy * uy) / d;
      const open = Math.min(laneOpen(s, k.team, p.x, p.y, m.x, m.y), 12);
      const sc = align * (hasAim ? 40 : 18) + open * 1.2 - Math.abs(d - 35) * 0.12 + dx * team.dir * 0.04;
      if (sc > best) { best = sc; tgt = m; }
    }
  }
  const spd = 58 + k.r.pas * 0.3;
  let tx = p.x + Math.cos(k.a) * 30, ty = p.y + Math.sin(k.a) * 30;
  if (tgt) {
    let t = hyp(tgt.x - p.x, tgt.y - p.y) / spd;
    for (let i = 0; i < 2; i++) {
      tx = tgt.x + tgt.vx * t * 0.85 + Math.cos(tgt.a) * 1.2;
      ty = tgt.y + tgt.vy * t * 0.85 + Math.sin(tgt.a) * 1.2;
      t = hyp(tx - p.x, ty - p.y) / spd;
    }
  }
  const ang = Math.atan2(ty - p.y, tx - p.x) + gauss(s) * (1.05 - k.r.pas / 110) * 0.07;
  releasePuck(s, k);
  p.vx = Math.cos(ang) * spd + k.vx * 0.2;
  p.vy = Math.sin(ang) * spd + k.vy * 0.2;
  p.vz = 0; p.z = 0;
  p.pass = { to: tgt ? tgt.id : null, team: k.team, from: k.id, t: s.time, aiDecided: false };
  k.cd.pick = 0.3;
  ev(s, 'pass', { team: k.team });
}

function aiAim(s, k) {
  const g = s.goalies[1 - k.team];
  if (rand(s) < 0.12) return { y: g.y, z: 0.25 };
  const y = g.y > 0.4 ? -2.2 : g.y < -0.4 ? 2.2 : rand(s) < 0.5 ? -2.2 : 2.2;
  return { y, z: null };
}

function doShot(s, k, power, o = {}) {
  const p = s.puck;
  const team = s.teams[k.team];
  const gx = team.dir * R.GX;
  const g = s.goalies[1 - k.team];
  let aimY = o.aimY;
  if (aimY == null) aimY = g.y > 0.4 ? -2.2 : g.y < -0.4 ? 2.2 : rand(s) < 0.5 ? -2.2 : 2.2;
  const slap = power >= 0.25;
  let speed = o.oneTimer ? 82 + k.r.sht * 0.36 : slap ? 66 + k.r.sht * 0.48 * (0.55 + 0.45 * power) : 50 + k.r.sht * 0.36;
  if (slap && team.perk === 'CANNON') speed *= 1.1;
  if (o.oneTimer && team.perk === 'PLAYMAKERS') speed *= 1.05;
  const dist = hyp(gx - p.x, aimY - p.y);
  let err = (1.12 - k.r.acc / 100) * (0.8 + (slap ? power * 1.1 : 0) + (o.oneTimer ? 0.5 : 0)) * (0.55 + dist / 45);
  const yT = aimY + gauss(s) * err * 1.1;
  let zT = o.aimZ ?? (slap ? 0.6 + rand(s) * 2.8 : 0.2 + rand(s) * 3.2);
  zT = Math.max(0, zT + gauss(s) * err * 0.7);
  const dx = gx - p.x, dy = yT - p.y, d = hyp(dx, dy) || 1;
  const T = d / speed;
  const vz = clamp((zT + 0.5 * G * T * T) / T, 0, 30);
  releasePuck(s, k);
  p.vx = (dx / d) * speed; p.vy = (dy / d) * speed; p.vz = vz; p.z = 0.05;
  p.shot = {
    id: ++s.shotSeq, pid: k.pid, team: k.team, t: s.time, speed, oneTimer: !!o.oneTimer,
    rebound: s.time - s.lastSave < 1.2, x0: p.x, y0: p.y, wrap: Math.abs(p.x) > R.GX - 3.5, slap,
  };
  k.cd.pick = s.phase === 'shootout' ? 99 : 0.4;
  if (s.so) s.so.shotFired = true;
  ev(s, 'shot', { slap, team: k.team, oneTimer: !!o.oneTimer });
}

function doCheck(s, k, ux, uy) {
  if (k.cd.chk > 0 || k.stun > 0) return;
  let l = hyp(ux, uy);
  if (l < 0.2) { ux = Math.cos(k.a); uy = Math.sin(k.a); l = 1; }
  ux /= l; uy /= l;
  k.vx += ux * 9; k.vy += uy * 9;
  k.a = Math.atan2(uy, ux);
  k.lungeT = 0.32;
  k.cd.chk = 0.9;
  const team = s.teams[k.team];
  team.energy[k.pid] = Math.max(0, team.energy[k.pid] - 0.02);
  ev(s, 'lunge');
}

function doPoke(s, k) {
  if (k.cd.poke > 0 || k.stun > 0) return;
  k.cd.poke = 0.6;
  k.pokeT = 0.2;
  const p = s.puck;
  const bx = k.x + Math.cos(k.a) * 4.2, by = k.y + Math.sin(k.a) * 4.2;
  const car = byId(s, p.owner);
  ev(s, 'poke');
  if (car && car.team !== k.team) {
    if (hyp(p.x - bx, p.y - by) < 2.8) {
      const ch = clamp(0.42 + (k.r.def - car.r.hnd) / 150 - (car.dekeT > 0 ? 0.3 : 0), 0.12, 0.85);
      if (rand(s) < ch) {
        p.owner = null; p.pass = null; p.shot = null;
        const ux = p.x - k.x, uy = p.y - k.y, ul = hyp(ux, uy) || 1;
        p.vx = car.vx * 0.4 + (ux / ul) * 12; p.vy = car.vy * 0.4 + (uy / ul) * 12;
        car.cd.pick = 0.5; car.charge = -1;
        ev(s, 'steal', { team: k.team });
        return;
      }
    }
    if (hyp(car.x - bx, car.y - by) < 2.6) {
      const pc = 0.035 * (s.teams[k.team].perk === 'DISCIPLINED' ? 0.5 : 1);
      if (rand(s) < pc) {
        const trip = rand(s) < 0.5;
        if (trip) car.stun = 0.8;
        callPenalty(s, k, trip ? 'TRIPPING' : 'HOOKING');
      }
    }
  } else if (!car && p.z < 1.3 && hyp(p.x - bx, p.y - by) < 2.5) {
    p.vx += Math.cos(k.a) * 14; p.vy += Math.sin(k.a) * 14;
  }
}

function doDeke(s, k, side) {
  if (k.cd.deke > 0) return;
  const px = -Math.sin(k.a), py = Math.cos(k.a);
  const imp = 8 + k.r.hnd * 0.06;
  k.vx += px * side * imp; k.vy += py * side * imp;
  k.dekeT = 0.4;
  k.cd.deke = 1.0;
  const team = s.teams[k.team];
  team.energy[k.pid] = Math.max(0, team.energy[k.pid] - 0.02);
  ev(s, 'deke');
}

function takePuck(s, k) {
  const p = s.puck;
  const prevTeam = p.touches[0]?.team;
  const fromMate = p.pass && p.pass.team === k.team;
  const one = k.oneT && fromMate;
  p.owner = k.id; p.pass = null; p.shot = null; p.rel = null;
  p.z = 0; p.vz = 0;
  if (prevTeam !== k.team) {
    p.touches = [];
  }
  // the other team has a new puck carrier (a turnover or one of their passes): put the human
  // on the defender best placed to stop him
  if (p.touches[0]?.pid !== k.pid) for (const h of s.humans) if (h.team !== k.team) autoPick(s, h, k, prevTeam !== k.team);
  if (p.touches[0]?.pid !== k.pid) p.touches.unshift({ pid: k.pid, team: k.team });
  if (p.touches.length > 4) p.touches.length = 4;
  p.lastTeam = k.team;
  k.charge = -1;
  for (const m of s.skaters) m.oneT = false;
  ev(s, 'pickup');
  if (one) doShot(s, k, 0.9, s.humans.some((h) => h.sk === k.id) ? { oneTimer: true } : { oneTimer: true, aimY: aiAim(s, k).y });
}

// ---------------------------------------------------------------- per-step systems

function moveSkater(s, k, mv, dt) {
  const team = s.teams[k.team];
  let mx = mv.mx || 0, my = mv.my || 0;
  let mag = hyp(mx, my);
  if (mag > 1) { mx /= mag; my /= mag; mag = 1; }
  if (k.stun > 0) { k.stun -= dt; mx = my = mag = 0; }
  const e = team.energy[k.pid];
  let top = (21 + k.r.spd * 0.11) * (0.78 + 0.22 * e);
  const sprint = mv.sprint && e > 0.12 && mag > 0.05;
  if (s.puck.owner === k.id) top *= 0.94;
  if (k.charge >= 0) top *= 0.55;
  if (sprint) top *= 1.16;
  // the skater you control is a bit sharper than the CPU's: quicker starts, stops and turns
  const you = k.ctrl >= 0;
  const acc = (26 + k.r.spd * 0.22) * (you ? 1.35 : 1);
  if (k.stun <= 0 && (mag > 0.05 || mv.active)) {
    const tvx = mx * top, tvy = my * top;
    let dvx = tvx - k.vx, dvy = tvy - k.vy;
    const dl = hyp(dvx, dvy);
    const brake = k.vx * tvx + k.vy * tvy < 0 ? (you ? 2.4 : 1.6) : 1;
    const maxDv = acc * dt * brake;
    if (dl > maxDv) { dvx *= maxDv / dl; dvy *= maxDv / dl; }
    if (k.lungeT <= 0 && k.dekeT <= 0) { k.vx += dvx; k.vy += dvy; }
  } else {
    const f = Math.exp(-(k.stun > 0 ? 2.2 : you ? 1.4 : 0.9) * dt);
    k.vx *= f; k.vy *= f;
  }
  k.x += k.vx * dt; k.y += k.vy * dt;
  if (k.stun <= 0 && k.lungeT <= 0) {
    let ta = null;
    if (mag > 0.2) ta = Math.atan2(my, mx);
    else if (hyp(k.vx, k.vy) > 4) ta = Math.atan2(k.vy, k.vx);
    const turn = you ? 15 : 11;
    if (ta != null) k.a += clamp(angDiff(k.a, ta), -turn * dt, turn * dt);
  }
  const sp = hyp(k.vx, k.vy) / 32;
  let drain = (0.006 + 0.014 * sp + (sprint ? 0.03 : 0)) * (1.25 - k.r.end * 0.005);
  if (team.perk === 'GRINDERS') drain *= 0.75;
  team.energy[k.pid] = Math.max(0, e - drain * dt);
}

function hit(s, A, B, nx, ny, rv) {
  A.lungeT = 0;
  if (B.dekeT > 0 && rand(s) < 0.55) {
    A.stun = 0.35;
    ev(s, 'whiff');
    return;
  }
  const power = rv * 1.2 + A.r.chk * 0.45;
  const bal = 30 + B.r.chk * 0.2 + B.r.hnd * 0.15 + B.r.spd * 0.05;
  const roll = power - bal + gauss(s) * 8;
  B.vx += nx * rv * 0.7; B.vy += ny * rv * 0.7;
  A.vx *= 0.4; A.vy *= 0.4;
  const p = s.puck;
  const hadPuck = p.owner === B.id;
  const legal = hadPuck || s.time - B.lastHad < 0.7;
  if (roll > 0) B.stun = 0.8 + Math.min(0.7, roll / 40);
  if (hadPuck && (roll > 0 || rand(s) < 0.35)) {
    p.owner = null;
    p.vx = B.vx + (rand(s) - 0.5) * 16; p.vy = B.vy + (rand(s) - 0.5) * 16;
    B.cd.pick = 0.5; B.charge = -1;
  }
  const team = s.teams[A.team];
  team.hits++;
  team.stats[A.pid].hits++;
  if (roll > 10) s.shake = 0.3;
  ev(s, 'hit', { big: roll > 10, team: A.team });
  const nearBoards = Math.abs(B.y) > 36 || Math.abs(B.x) > 94;
  let pc = legal ? 0.012 + (nearBoards ? 0.02 : 0) : 0.12;
  if (team.perk === 'DISCIPLINED') pc /= 2;
  if (rand(s) < pc) callPenalty(s, A, legal ? (nearBoards ? 'BOARDING' : 'CHARGING') : 'INTERFERENCE');
}

function collideSkaters(s, allowHits) {
  const a = s.skaters;
  for (let i = 0; i < a.length; i++) {
    for (let j = i + 1; j < a.length; j++) {
      const A = a[i], B = a[j];
      let dx = B.x - A.x, dy = B.y - A.y, d = hyp(dx, dy);
      const min = SK_R * 2;
      if (d >= min) continue;
      if (d < 1e-4) { dx = 1; dy = 0; d = 1e-4; }
      const nx = dx / Math.max(d, 1e-4), ny = d < 1e-3 ? 0 : dy / d;
      const ov = (min - d) / 2;
      A.x -= nx * ov; A.y -= ny * ov; B.x += nx * ov; B.y += ny * ov;
      const rv = (A.vx - B.vx) * nx + (A.vy - B.vy) * ny;
      if (allowHits && A.team !== B.team) {
        if (A.lungeT > 0 && rv > 2) { hit(s, A, B, nx, ny, rv); if (s.phase !== 'play') return; continue; }
        if (B.lungeT > 0 && rv > 2) { hit(s, B, A, -nx, -ny, rv); if (s.phase !== 'play') return; continue; }
      }
      if (rv > 0) {
        const imp = rv * 0.5;
        A.vx -= nx * imp; A.vy -= ny * imp; B.vx += nx * imp; B.vy += ny * imp;
      }
    }
  }
  for (const k of a) {
    for (const g of s.goalies) {
      const dx = k.x - g.x, dy = k.y - g.y, d = hyp(dx, dy), min = GOALIE_R + SK_R;
      if (d < min && d > 1e-4) { k.x = g.x + (dx / d) * min; k.y = g.y + (dy / d) * min; }
    }
    collideNetBody(k, SK_R);
    const c = wallContact(k.x, k.y, SK_R);
    if (c) bounce(k, c, 0.25, 0.9);
  }
}

function stepGoalie(s, g, dt) {
  const team = s.teams[g.team];
  const sg = -team.dir, gl = sg * R.GX;
  const p = s.puck;
  if (g.down > 0) g.down -= dt;
  if (g.hold > 0) { g.hold -= dt; return; }
  let tx, ty;
  const shot = p.shot && p.owner == null && p.shot.team !== g.team && p.vx * sg > 0;
  if (shot) {
    tx = g.x; ty = g.y;
    if (s.time - p.shot.t > g.reactT) {
      const t = Math.max(0, (g.x - p.x) / (p.vx || 1e-6));
      ty = clamp(p.y + p.vy * t, -4.5, 4.5);
    }
  } else {
    const ax = p.x - gl, ay = p.y;
    if (ax * -sg < 1) { tx = gl - sg * 1.2; ty = sgnOf(p.y) * 2.4; }
    else {
      const d = hyp(ax, ay) || 1;
      const depth = clamp(1.6 + d * 0.05, 1.6, 4.2);
      tx = gl + (ax / d) * depth; ty = (ay / d) * depth;
    }
  }
  const spd = (9 + g.r.gk * 0.13) * (g.down > 0 ? 0.5 : 1);
  const dx = tx - g.x, dy = ty - g.y, d = hyp(dx, dy);
  if (d > 1e-3) { const m = Math.min(d, spd * dt); g.x += (dx / d) * m; g.y += (dy / d) * m; }
  g.x = gl - sg * clamp((g.x - gl) * -sg, 0.8, 7);
  g.y = clamp(g.y, -6, 6);
  g.a = Math.atan2(p.y - g.y, p.x - g.x);
}

function screens(s, g, shot) {
  let n = 0;
  for (const k of s.skaters) {
    if (k.pid === shot.pid) continue;
    if (hyp(k.x - g.x, k.y - g.y) < 3 || hyp(k.x - shot.x0, k.y - shot.y0) < 4) continue;
    if (segDist(k.x, k.y, shot.x0, shot.y0, g.x, g.y) < 2.2) n++;
  }
  return Math.min(2, n);
}

function goalieContact(s, g, x0, y0) {
  const p = s.puck;
  if (p.z > 5.5 || g.hold > 0 || s.time < g.ignoreUntil) return false;
  const shot = p.shot;
  if (shot && g.beatShot === shot.id) return false;
  const sx = p.x - x0, sy = p.y - y0, L2 = sx * sx + sy * sy;
  const t = L2 > 0 ? clamp(((g.x - x0) * sx + (g.y - y0) * sy) / L2, 0, 1) : 0;
  const d = hyp(g.x - (x0 + sx * t), g.y - (y0 + sy * t));
  const reach = 2.0 + g.r.gk * 0.009;
  if (d > reach) return false;
  const sp = hyp(p.vx, p.vy);
  const sg = -s.teams[g.team].dir;
  if (!shot && sp < 22) {
    if (d < 2.2 && g.down <= 0 && Math.abs(g.x - sg * R.GX) < 8 && s.phase === 'play') { freeze(s, g); return true; }
    return false;
  }
  let ps;
  if (shot && shot.team !== g.team) {
    ps = 0.95 + (g.r.gk - 75) * 0.005;
    ps -= Math.max(0, sp - 70) * 0.0015;
    ps -= Math.max(0, d - 1.5) * 0.09;
    if (p.z > 2.6 && d > 1.0) ps -= 0.06;
    if (shot.oneTimer) ps -= 0.05;
    if (shot.rebound) ps -= 0.1;
    if (g.down > 0) ps -= 0.18;
    const dist = hyp(shot.x0 - sg * R.GX, shot.y0);
    if (dist > 45) ps += 0.05;
    if (dist < 15) ps -= 0.04;
    ps -= screens(s, g, shot) * 0.07;
    ps += (1 - s.pace) * 0.07;
    ps = clamp(ps, 0.3, 0.985);
  } else ps = 0.75;
  if (rand(s) < ps) { save(s, g, shot, sp, d, ps); return true; }
  if (shot) g.beatShot = shot.id;
  else g.ignoreUntil = s.time + 0.3;
  return false;
}

function save(s, g, shot, sp, d, ps) {
  const p = s.puck;
  const team = s.teams[g.team];
  const sg = -team.dir;
  const realShot = shot && shot.team !== g.team;
  if (realShot && s.phase === 'play') {
    const st = s.teams[shot.team];
    st.shots++;
    st.stats[shot.pid].sog++;
    team.goalie.sa++;
  }
  p.rel = null; p.pass = null;
  g.ignoreUntil = s.time + 0.35;
  if (s.phase === 'shootout') {
    deflect(s, g, sp);
    soResult(s, false);
    ev(s, 'save', { team: g.team, big: false });
    return;
  }
  const catchP = (p.z > 1.2 ? 0.45 : 0.3) + g.r.reb / 400 + (sp < 45 ? 0.3 : 0);
  ev(s, 'save', { team: g.team, big: realShot && ps < 0.72 });
  if (realShot && ps < 0.72) banner(s, 'WHAT A SAVE!', `#${g.num}`, g.team, 1.2);
  if (realShot && rand(s) < catchP) { freeze(s, g); return; }
  deflect(s, g, sp);
  if (realShot) { s.lastSave = s.time; g.down = 0.45; }
}

function deflect(s, g, sp) {
  const p = s.puck;
  const sg = -s.teams[g.team].dir;
  const base = sg > 0 ? Math.PI : 0;
  const ang = base + (rand(s) - 0.5) * 2.2;
  const spd = 10 + rand(s) * 22 * (1.2 - g.r.reb / 100) + sp * 0.05;
  p.vx = Math.cos(ang) * spd; p.vy = Math.sin(ang) * spd;
  p.vz = rand(s) * 4; p.z = Math.min(p.z, 1);
  p.x = g.x + Math.cos(ang) * 1.5; p.y = g.y + Math.sin(ang) * 1.5;
  p.shot = null;
}

function scoreGoal(s, team, y, z) {
  const p = s.puck;
  const sg = team === 0 ? 1 : -1;
  const shot = p.shot;
  p.x = sg * (R.GX + 1.6); p.y = clamp(y, -2.5, 2.5); p.z = 0;
  p.vx = p.vy = p.vz = 0; p.owner = null; p.pass = null;
  if (s.phase === 'shootout') { p.shot = null; soResult(s, true); return; }
  const T = s.teams[team], O = s.teams[1 - team];
  const tch = p.touches;
  const scorer = tch[0] && tch[0].team === team ? tch[0] : null;
  const assists = [];
  if (scorer) {
    for (const x of tch.slice(1)) {
      if (x.team !== team) break;
      if (x.pid !== scorer.pid && !assists.includes(x.pid)) assists.push(x.pid);
      if (assists.length >= 2) break;
    }
  }
  const g = s.goalies[1 - team];
  const tags = [];
  if (s.ot) tags.push('OT');
  const pp = O.box.length > T.box.length, sh = T.box.length > O.box.length;
  if (pp) {
    T.ppg++; tags.push('PPG');
    const rel = O.box.shift();
    if (rel) O.returning.push(rel.pid);
  }
  if (sh) tags.push('SHG');
  if (shot?.oneTimer) tags.push('ONE-TIMER');
  if (shot?.wrap) tags.push('WRAPAROUND');
  if (z > 2.7) tags.push('TOP SHELF');
  else if (shot && z < 0.8 && Math.abs(g.y - y) < 0.9) tags.push('FIVE HOLE');
  if (shot?.slap && shot.speed > 100) tags.push('SLAPPER');
  T.score++;
  const pi = Math.min(s.period - 1, 3);
  T.perScore[pi] = (T.perScore[pi] || 0) + 1;
  T.shots++;
  O.goalie.sa++; O.goalie.ga++;
  if (scorer) {
    T.stats[scorer.pid].g++;
    T.stats[scorer.pid].sog++;
    for (const a of assists) T.stats[a].a++;
  }
  const nm = (pid) => T.players[pid].name;
  s.goals.push({
    team, pid: scorer?.pid ?? null, name: scorer ? nm(scorer.pid) : null, num: scorer ? T.players[scorer.pid].num : null,
    a: assists, aNames: assists.map(nm), per: s.period, clock: Math.max(0, Math.round(s.clock)), tags,
  });
  const headline = tags.find((t) => ['ONE-TIMER', 'TOP SHELF', 'FIVE HOLE', 'WRAPAROUND', 'SLAPPER'].includes(t));
  banner(s, headline ? `${headline}!` : 'GOAL!', scorer ? `#${T.players[scorer.pid].num} ${nm(scorer.pid).toUpperCase()}` : 'OWN GOAL', team, 2.8);
  ev(s, 'goal', { team, tags });
  g.down = 1.2;
  p.shot = null;
  s.phase = 'goal';
  s.timer = s.cfg.goalPause;
}

function goalLine(s, x0, y0, z0) {
  const p = s.puck;
  for (const sg of [-1, 1]) {
    const gl = sg * R.GX;
    if (!((x0 - gl) * sg < 0 && (p.x - gl) * sg >= 0)) continue;
    const t = (gl - x0) / (p.x - x0 || 1e-6);
    const y = y0 + (p.y - y0) * t, z = z0 + (p.z - z0) * t;
    const ay = Math.abs(y);
    if (ay < R.NW - PUCK_R && z < R.NH - 0.25) { scoreGoal(s, sg > 0 ? 0 : 1, y, z); return true; }
    if (ay < R.NW + 0.45 && z < R.NH + 0.35) {
      const bar = z > R.NH - 0.5 && ay < R.NW;
      p.x = gl - sg * 0.3;
      p.vx = -p.vx * 0.55;
      p.vy += sgnOf(y) * Math.abs(p.vx) * 0.3;
      if (bar) p.vz = -Math.abs(p.vz) * 0.3;
      if (p.shot) {
        ev(s, 'post', { bar });
        if (s.phase === 'play') banner(s, bar ? 'CROSSBAR!' : 'POST!', '', -1, 1.0);
        p.shot = null;
      }
      continue;
    }
    // Icing: cleared from behind the red line, crosses the goal line untouched.
    const ta = sg > 0 ? 0 : 1;
    const T = s.teams[ta];
    if (s.phase === 'play' && s.cfg.icing && p.rel && p.rel.team === ta && p.rel.x * T.dir < 0 && !s.ot3 &&
      T.box.length <= s.teams[1 - ta].box.length) {
      T.noChange = true;
      whistle(s, -T.dir * R.DOTX, sgnOf(p.rel.y || 1) * R.DOTY, 'ICING', T.abbr);
      return true;
    }
  }
  return false;
}

function netCollidePuck(p, x0, y0) {
  if (p.z >= R.NH) return;
  for (const sg of [-1, 1]) {
    const xi = sg * R.GX, xo = sg * (R.GX + R.ND);
    const inX = (p.x - xi) * sg > 0 && (p.x - xo) * sg < 0.25;
    if (!inX || Math.abs(p.y) > R.NW + PUCK_R) continue;
    if (Math.abs(y0) >= R.NW + PUCK_R - 0.05) { p.y = sgnOf(y0) * (R.NW + PUCK_R + 0.05); p.vy = -p.vy * 0.4; }
    else { p.x = xo + sg * 0.3; p.vx = Math.abs(p.vx) * 0.4 * sg; }
  }
}

function pickups(s) {
  const p = s.puck;
  if (p.owner != null || p.z > 1.3) return;
  let best = null, bd = 1e9;
  for (const k of s.skaters) {
    if (k.stun > 0 || k.cd.pick > 0) continue;
    const bx = k.x + Math.cos(k.a) * STICK, by = k.y + Math.sin(k.a) * STICK;
    const d = Math.min(hyp(p.x - bx, p.y - by), hyp(p.x - k.x, p.y - k.y) + 0.5);
    const reach = p.pass && p.pass.to === k.id ? 3.4 : 2.2;
    if (d < reach && d < bd) { bd = d; best = k; }
  }
  if (!best) return;
  const rel = hyp(p.vx - best.vx, p.vy - best.vy);
  const target = p.pass && p.pass.to === best.id;
  let take = true;
  if (!target) {
    if (rel > 50) take = rand(s) < 0.3;
    else if (rel > 30) take = rand(s) < 0.6;
  }
  if (!take) {
    if (p.defl <= 0) {
      const sp = hyp(p.vx, p.vy);
      const ang = Math.atan2(p.vy, p.vx) + (rand(s) - 0.5) * 1.2;
      p.vx = Math.cos(ang) * sp * 0.55; p.vy = Math.sin(ang) * sp * 0.55;
      p.defl = 0.25;
      if (p.shot && p.shot.team !== best.team) { p.shot = null; ev(s, 'block'); }
    }
    return;
  }
  takePuck(s, best);
}

function stepPuck(s, dt) {
  const p = s.puck;
  if (p.defl > 0) p.defl -= dt;
  if (p.owner != null) {
    const k = byId(s, p.owner);
    if (k && k.stun <= 0) {
      const wob = Math.sin(s.time * 14 + k.id) * 0.35;
      p.x = k.x + Math.cos(k.a) * STICK - Math.sin(k.a) * wob;
      p.y = k.y + Math.sin(k.a) * STICK + Math.cos(k.a) * wob;
      p.z = 0; p.vz = 0; p.vx = k.vx; p.vy = k.vy;
      k.lastHad = s.time;
      const c = wallContact(p.x, p.y, PUCK_R);
      if (c) { p.x = c.x; p.y = c.y; }
      const save = { x: p.x, y: p.y, vx: 0, vy: 0 };
      collideNetBody(save, PUCK_R);
      p.x = save.x; p.y = save.y;
      return;
    }
    p.owner = null;
  }
  const x0 = p.x, y0 = p.y, z0 = p.z;
  p.x += p.vx * dt; p.y += p.vy * dt;
  if (p.z > 0 || p.vz > 0) {
    p.vz -= G * dt; p.z += p.vz * dt;
    if (p.z <= 0) { p.z = 0; p.vz = Math.abs(p.vz) > 4 ? -p.vz * 0.3 : 0; }
  }
  const sp = hyp(p.vx, p.vy);
  if (sp > 0) {
    const ns = Math.max(0, sp - (p.z > 0 ? 0.5 : 3 + sp * 0.1) * dt);
    p.vx *= ns / sp; p.vy *= ns / sp;
  }
  const c = wallContact(p.x, p.y, PUCK_R);
  if (c) {
    if (sp > 30) ev(s, 'boards', { v: sp });
    bounce(p, c, 0.6, 0.92);
    p.pass = null;
    if (p.shot) p.shot = null;
  }
  if (s.phase !== 'play' && s.phase !== 'shootout') return;
  if (goalLine(s, x0, y0, z0)) return;
  netCollidePuck(p, x0, y0);
  for (const g of s.goalies) if (goalieContact(s, g, x0, y0)) break;
  if (s.phase !== 'play' && s.phase !== 'shootout') return;
  pickups(s);
}

// ---------------------------------------------------------------- AI

function seek(k, tx, ty, slow = 6, maxMag = 1) {
  const dx = tx - k.x, dy = ty - k.y, d = hyp(dx, dy);
  if (d < 0.4) return { mx: 0, my: 0, active: true };
  const m = Math.min(maxMag, d / slow);
  return { mx: (dx / d) * m, my: (dy / d) * m, active: true, sprint: false };
}

function clampSpot(x, y) {
  x = clamp(x, -R.GX + 4, R.GX - 4);
  y = clamp(y, -38, 38);
  const c = wallContact(x, y, 3);
  return c ? [c.x, c.y] : [x, y];
}

function supportSpot(s, k) {
  const dir = s.teams[k.team].dir;
  const p = s.puck;
  const PX = p.x * dir, PY = p.y;
  const oz = PX > 18;
  const wob = Math.sin(s.time * 0.8 + k.id * 1.7) * 4;
  let X, Y;
  switch (k.role) {
    case 'C': X = oz ? 64 : PX - 6; Y = oz ? -PY * 0.3 + wob : PY > 0 ? PY - 16 : PY + 16; break;
    case 'LW': X = oz ? 74 : Math.min(PX + 18, 70); Y = oz ? -12 + wob : -20; break;
    case 'RW': X = oz ? 60 : Math.min(PX + 18, 70); Y = oz ? 18 + wob : 20; break;
    case 'LD': X = oz ? 30 : PX - 24; Y = -16 + wob * 0.5; break;
    default: X = oz ? 30 : PX - 24; Y = 16 + wob * 0.5; break;
  }
  if (hyp(X - PX, Y - PY) < 10) Y += Y >= PY ? 8 : -8;
  return clampSpot(X * dir, Y);
}

function defSpot(s, k) {
  const dir = s.teams[k.team].dir;
  const p = s.puck;
  const PX = p.x * dir, PY = p.y;
  let X, Y;
  if (PX < -25) {
    switch (k.role) {
      case 'C': X = -70 + (PX + 89) * 0.2; Y = PY * 0.35; break;
      case 'LD': X = -82; Y = -6 + PY * 0.15; break;
      case 'RD': X = -82; Y = 6 + PY * 0.15; break;
      case 'LW': X = -45; Y = -18 + PY * 0.2; break;
      default: X = -45; Y = 18 + PY * 0.2; break;
    }
  } else {
    const bx = Math.min(PX - 15, 60);
    switch (k.role) {
      case 'C': X = bx; Y = PY * 0.5; break;
      case 'LW': X = bx + 4; Y = -18; break;
      case 'RW': X = bx + 4; Y = 18; break;
      case 'LD': X = Math.min(PX - 35, 40); Y = -12; break;
      default: X = Math.min(PX - 35, 40); Y = 12; break;
    }
    X = Math.max(X, -80);
  }
  return clampSpot(X * dir, Y);
}

function teamRoles(s, t) {
  const p = s.puck;
  const car = byId(s, p.owner);
  const mine = s.skaters.filter((k) => k.team === t);
  const r = { pressure: null, chaser: null, marks: new Map() };
  const net = -s.teams[t].dir * R.GX;
  if (car && car.team !== t) {
    let bd = 1e9;
    for (const k of mine) {
      if (k.stun > 0) continue;
      const goalSide = Math.abs(k.x - net) < Math.abs(car.x - net) ? -4 : 0;
      const d = hyp(k.x - car.x, k.y - car.y) + goalSide;
      if (d < bd) { bd = d; r.pressure = k; }
    }
    const opps = s.skaters.filter((o) => o.team !== t && o !== car);
    const taken = new Set();
    for (const k of mine) {
      if (k === r.pressure) continue;
      const [sx, sy] = defSpot(s, k);
      let bo = null, bdd = 22;
      for (const o of opps) {
        if (taken.has(o.id)) continue;
        const d = hyp(o.x - sx, o.y - sy);
        if (d < bdd) { bdd = d; bo = o; }
      }
      if (bo) { taken.add(bo.id); r.marks.set(k.id, bo); }
    }
  } else if (!car) {
    let bd = 1e9;
    const px = p.x + p.vx * 0.3, py = p.y + p.vy * 0.3;
    for (const k of mine) {
      if (k.stun > 0) continue;
      const d = hyp(k.x - px, k.y - py);
      if (d < bd) { bd = d; r.chaser = k; }
    }
  }
  return r;
}

function bestPassTarget(s, k) {
  const dir = s.teams[k.team].dir;
  const p = s.puck;
  const openOf = (m) => {
    let o = 15;
    for (const q of s.skaters) if (q.team !== k.team) o = Math.min(o, hyp(q.x - m.x, q.y - m.y));
    return o;
  };
  const kX = k.x * dir;
  const mine = (kX > 50 && Math.abs(k.y) < 22 ? 12 : 0) + openOf(k) * 1.2 + 2;
  let best = null, bs = -1e9;
  for (const m of s.skaters) {
    if (m.team !== k.team || m === k || m.stun > 0) continue;
    const d = hyp(m.x - k.x, m.y - k.y);
    if (d < 8 || d > 75) continue;
    if (laneOpen(s, k.team, p.x, p.y, m.x, m.y) < 3) continue;
    const mX = m.x * dir;
    const sc = openOf(m) * 1.2 + (mX - kX) * 0.25 + (mX > 50 && Math.abs(m.y) < 22 ? 12 : 0) - d * 0.05;
    if (sc > bs) { bs = sc; best = m; }
  }
  return best ? { m: best, better: bs > mine } : null;
}

function aiCarrier(s, k, dt) {
  const team = s.teams[k.team], dir = team.dir;
  const gx = dir * R.GX;
  const X = k.x * dir;
  const dNet = hyp(gx - k.x, k.y);
  let opp = null, od = 1e9;
  for (const o of s.skaters) {
    if (o.team === k.team || o.stun > 0) continue;
    const d = hyp(o.x - k.x, o.y - k.y);
    if (d < od) { od = d; opp = o; }
  }
  const ahead = opp && (opp.x - k.x) * dir > -1;
  const pressured = (od < 7 && ahead) || od < 4;
  if (k.charge >= 0) {
    k.charge += dt;
    if (k.charge >= k.aiCharge || od < 5) {
      const aim = aiAim(s, k);
      doShot(s, k, clamp(k.charge / 0.8, 0.3, 1), { aimY: aim.y, aimZ: aim.z ?? undefined });
    }
    return { mx: 0, my: 0, active: true };
  }
  if (k.cd.ai <= 0) {
    k.cd.ai = 0.15 + rand(s) * 0.2;
    const angOk = X > 20 && X < R.GX - 1.5 && Math.abs(k.y) < (R.GX - X) * 1.4 + 4;
    if (angOk) {
      let ps = dNet < 18 ? 0.45 : dNet < 32 ? 0.2 : dNet < 50 ? 0.06 : 0.01;
      if (laneOpen(s, k.team, k.x, k.y, gx, 0) < 2.5) ps *= 0.45;
      if (pressured) ps *= 1.5;
      ps *= s.pace;
      if (rand(s) < ps) {
        if (dNet > 36 && !pressured && rand(s) < 0.65) { k.charge = 0; k.aiCharge = 0.35 + rand(s) * 0.4; }
        else {
          const aim = aiAim(s, k);
          doShot(s, k, dNet > 30 && rand(s) < 0.4 ? 0.35 : 0, { aimY: aim.y, aimZ: aim.z ?? undefined });
        }
        return { mx: 0, my: 0, active: true };
      }
    }
    const best = bestPassTarget(s, k);
    let pp = pressured ? 0.45 : 0.06;
    if (X < -55) pp += 0.25;
    if (best && best.better) pp += 0.25;
    if (best && rand(s) < pp) { doPass(s, k, 0, 0, best.m); return { mx: 0, my: 0, active: true }; }
    if (pressured && k.cd.deke <= 0 && rand(s) < 0.3) doDeke(s, k, rand(s) < 0.5 ? 1 : -1);
  }
  let tx, ty;
  if (X > R.GX - 4 && Math.abs(k.y) < 8) { tx = dir * (R.GX - 6); ty = sgnOf(k.y) * 10; }
  else if (X < 30) { tx = dir * 45; ty = k.y * 0.6; }
  else { tx = dir * (R.GX - 14); ty = clamp(k.y * 0.4, -8, 8); }
  let ux = tx - k.x, uy = ty - k.y;
  let ul = hyp(ux, uy) || 1;
  ux /= ul; uy /= ul;
  for (const o of s.skaters) {
    if (o.team === k.team) continue;
    const dx = k.x - o.x, dy = k.y - o.y, d = hyp(dx, dy);
    if (d < 14 && d > 0.1) { const w = ((14 - d) / 14) * 1.3; ux += (dx / d) * w; uy += (dy / d) * w; }
  }
  if (Math.abs(k.y) > 34) uy -= sgnOf(k.y) * 0.6;
  ul = hyp(ux, uy) || 1;
  return { mx: ux / ul, my: uy / ul, active: true, sprint: od > 15 && team.energy[k.pid] > 0.45 };
}

function aiPressure(s, k, car) {
  const team = s.teams[k.team];
  const net = -team.dir * R.GX;
  const d = hyp(car.x - k.x, car.y - k.y);
  const lead = Math.min(0.5, d / 35);
  let tx = car.x + car.vx * lead, ty = car.y + car.vy * lead;
  if (d > 7) {
    const gx = net - tx, gy = -ty, gd = hyp(gx, gy) || 1;
    tx += (gx / gd) * 3; ty += (gy / gd) * 3;
  }
  const mv = seek(k, tx, ty, 2);
  mv.sprint = d > 12 && team.energy[k.pid] > 0.4;
  if (d < 5.5 && k.cd.ai <= 0) {
    const quick = { rookie: 1.5, pro: 1, allstar: 0.75 }[s.cfg.difficulty] ?? 1;
    k.cd.ai = (0.45 + rand(s) * 0.5) * (team.bonus ? quick : 1);
    const r = rand(s);
    if (r < 0.06 + k.r.chk / 650) doCheck(s, k, car.x - k.x, car.y - k.y);
    else if (r < 0.28 + k.r.def / 600) {
      k.a = Math.atan2(s.puck.y - k.y, s.puck.x - k.x);
      doPoke(s, k);
    }
  }
  return mv;
}

function aiSkater(s, k, roles, dt) {
  const p = s.puck;
  if (k.stun > 0) return { mx: 0, my: 0 };
  const car = byId(s, p.owner);
  if (car === k) return aiCarrier(s, k, dt);
  const dir = s.teams[k.team].dir;
  if (!car && p.pass && p.pass.to === k.id) {
    if (!p.pass.aiDecided) {
      p.pass.aiDecided = true;
      if (!hasHuman(s, k.team) && k.x * dir > 45 && Math.abs(k.y) < 28 && rand(s) < 0.3) k.oneT = true;
    }
    const sp = hyp(p.vx, p.vy) || 1, ux = p.vx / sp, uy = p.vy / sp;
    const t = Math.max(0, (k.x - p.x) * ux + (k.y - p.y) * uy);
    return seek(k, p.x + ux * t, p.y + uy * t, 3, 0.8);
  }
  if (car && car.team === k.team) {
    const [tx, ty] = supportSpot(s, k);
    return seek(k, tx, ty, 8, 0.85);
  }
  if (car) {
    if (roles.pressure === k) return aiPressure(s, k, car);
    const [sx, sy] = defSpot(s, k);
    const o = roles.marks.get(k.id);
    if (o) {
      const net = -dir * R.GX;
      const vx = net - o.x, vy = -o.y, d = hyp(vx, vy) || 1;
      const mx = o.x + (vx / d) * 4, my = o.y + (vy / d) * 4;
      return seek(k, mx * 0.7 + sx * 0.3, my * 0.7 + sy * 0.3, 6);
    }
    return seek(k, sx, sy, 8);
  }
  if (roles.chaser === k) {
    const t = clamp(hyp(p.x - k.x, p.y - k.y) / 30, 0, 0.8);
    const [tx, ty] = clampSpot(p.x + p.vx * t, p.y + p.vy * t);
    const fx = Math.abs(p.x) > R.GX - 4 ? p.x + p.vx * t : tx;
    const mv = seek(k, fx, Math.abs(p.y) > 38 ? p.y : ty, 0.5);
    mv.sprint = true;
    return mv;
  }
  const [tx, ty] = p.lastTeam === k.team ? supportSpot(s, k) : defSpot(s, k);
  return seek(k, tx, ty, 8);
}

// ---------------------------------------------------------------- human

function nearestTo(s, team, x, y, exclude) {
  let best = null, bd = 1e9;
  for (const k of s.skaters) {
    if (k.team !== team || k === exclude) continue;
    const d = hyp(k.x - x, k.y - y) + (k.stun > 0 ? 15 : 0);
    if (d < bd) { bd = d; best = k; }
  }
  return best || exclude || null;
}

// Who should the switch button go to? Defending, the best choice is a skater between the
// carrier and our net, near where the carrier is heading; otherwise whoever is nearest the puck.
function switchAim(s, team) {
  const p = s.puck, car = byId(s, p.owner);
  const dir = s.teams[team].dir;
  const threat = car ? car.team !== team : p.pass ? p.pass.team !== team : (p.lastTeam !== team && p.vx * dir < -8);
  if (!threat) return { defend: false, x: p.x + p.vx * 0.25, y: p.y + p.vy * 0.25 };
  const src = car || p;
  const fx = src.x + src.vx * 0.35, fy = src.y + src.vy * 0.35;
  const nx = -dir * R.GX;
  return { defend: true, car: src, dir, x: fx + (nx - fx) * 0.3, y: fy * 0.7 };
}

function switchScore(k, aim) {
  let d = hyp(k.x - aim.x, k.y - aim.y) + (k.stun > 0 ? 15 : 0);
  if (aim.defend && (k.x - aim.car.x) * -aim.dir <= 0) d += 25;
  return d;
}

function switchRank(s, team) {
  const aim = switchAim(s, team);
  return s.skaters.filter((k) => k.team === team)
    .map((k) => ({ k, d: switchScore(k, aim) }))
    .sort((a, b) => a.d - b.d).map((x) => x.k);
}

const goalSide = (k, aim) => !aim.defend || (k.x - aim.car.x) * -aim.dir > 0;

// Automatic switch when the other team gets a new carrier. A turnover always moves you (as
// before, but to the right man); their passes only move you if auto switch is on and you
// haven't just switched yourself.
function autoPick(s, h, car, turnover) {
  if (!turnover && (!h.auto || s.time - h.swT < 1.5)) return;
  const best = switchRank(s, h.team)[0];
  if (best) h.sk = best.id;
}

function updateControl(s) {
  for (const k of s.skaters) k.ctrl = -1;
  const p = s.puck;
  const car = byId(s, p.owner);
  s.humans.forEach((h, i) => {
    let cur = byId(s, h.sk);
    if (car && car.team === h.team) cur = car;
    else if (h.edge.passP) {
      // first press: the best man (or the next best if you already have him);
      // quick repeat presses walk down the same list, so every skater is reachable
      const burst = s.time - h.swT < 1.0 && h.rank;
      if (!burst) h.rank = switchRank(s, h.team).map((k) => k.id);
      const live = h.rank.filter((id) => byId(s, id));
      let j = live.indexOf(cur?.id);
      j = burst ? (j + 1) % live.length : (j === 0 ? 1 : 0);
      cur = byId(s, live[j % live.length]) || cur;
      h.swT = s.time;
      h.edge.passP = false;
    } else if (h.auto && cur && s.time - h.swT > 1.5) {
      // you've been beaten: hand control to the defender who is still goal-side
      const aim = switchAim(s, h.team);
      if (aim.defend && !goalSide(cur, aim)) {
        const best = switchRank(s, h.team)[0];
        if (best && best !== cur && goalSide(best, aim) && switchScore(best, aim) + 12 < switchScore(cur, aim)) cur = best;
      }
    }
    if (!cur || cur.team !== h.team) cur = switchRank(s, h.team)[0] || nearestTo(s, h.team, p.x, p.y);
    h.sk = cur ? cur.id : -1;
    if (cur) cur.ctrl = i;
  });
}

function humanSkater(s, k, h, dt) {
  const inp = h.inp, e = h.edge, p = s.puck;
  const mx = inp.mx || 0, my = inp.my || 0;
  if (p.owner === k.id) {
    if (e.shootP && k.charge < 0) k.charge = 0;
    if (k.charge >= 0) {
      k.charge = Math.min(1, k.charge + dt);
      if (e.shootR) {
        const aimY = my < -0.3 ? -2.3 : my > 0.3 ? 2.3 : h.assist ? farSide(s, k) : null;
        doShot(s, k, k.charge < 0.18 ? 0 : clamp(k.charge / 0.8, 0.25, 1), { aimY });
      }
    } else if (e.passP) doPass(s, k, mx, my);
    else if (e.dekeP) {
      const cross = Math.cos(k.a) * my - Math.sin(k.a) * mx;
      doDeke(s, k, cross > 0.2 ? 1 : cross < -0.2 ? -1 : rand(s) < 0.5 ? 1 : -1);
    }
  } else {
    k.charge = -1;
    if (e.shootP) {
      const near = p.owner == null && p.z < 1.5 && k.cd.pick <= 0 &&
        hyp(p.x - (k.x + Math.cos(k.a) * STICK), p.y - (k.y + Math.sin(k.a) * STICK)) < 3;
      if (p.owner == null && p.pass && p.pass.team === k.team && p.pass.to != null && p.pass.to !== k.id) {
        const r = byId(s, p.pass.to);
        if (r) r.oneT = true;
      } else if (p.owner == null && p.pass && p.pass.to === k.id) {
        k.oneT = true;
      } else if (near) {
        takePuck(s, k);
        if (p.owner === k.id) doShot(s, k, 0);
      } else if (h.assist) {
        const t = assistTarget(s, k, 12);
        doCheck(s, k, t ? t.x - k.x : mx, t ? t.y - k.y : my);
      } else doCheck(s, k, mx, my);
    }
    if (e.dekeP) {
      const t = h.assist && assistTarget(s, k, 7);
      if (t && t.id === p.owner) k.a = Math.atan2(t.y - k.y, t.x - k.x);
      doPoke(s, k);
    }
  }
  return { mx, my, sprint: !!inp.sprint };
}

// Touch assist (the on-screen stick is imprecise): shots go to the far side of the goalie,
// checks and poke checks home in on a nearby opponent, preferring the puck carrier.
function farSide(s, k) {
  const g = s.goalies[1 - k.team];
  return g.y > 0.3 ? -2.2 : g.y < -0.3 ? 2.2 : k.y > 0 ? -2.2 : 2.2;
}

function assistTarget(s, k, range) {
  let best = null, bd = range;
  for (const o of s.skaters) {
    if (o.team === k.team) continue;
    const d = hyp(o.x - k.x, o.y - k.y) - (o.id === s.puck.owner ? 4 : 0);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

function readInputs(s, inputs) {
  s.humans.forEach((h, i) => {
    const inp = inputs[i] || {};
    const pv = h.prev;
    const cnt = (n) => inp[n] != null && pv[n] != null && inp[n] !== pv[n];
    const shootP = cnt('ns') || (!!inp.shoot && !pv.shoot);
    h.edge = {
      passP: cnt('np') || (!!inp.pass && !pv.pass),
      shootP,
      shootR: !inp.shoot && (!!pv.shoot || shootP),
      dekeP: cnt('nd') || (!!inp.deke && !pv.deke),
    };
    h.inp = inp;
    h.assist = !!inp.as;
    h.prev = { np: inp.np, ns: inp.ns, nd: inp.nd, pass: !!inp.pass, shoot: !!inp.shoot, deke: !!inp.deke };
  });
}

// ---------------------------------------------------------------- game flow

function tickPenalties(s, dt) {
  for (const team of s.teams) {
    if (!team.box.length) continue;
    for (const b of team.box) b.rem -= dt;
    const out = team.box.filter((b) => b.rem <= 0);
    if (out.length) {
      team.box = team.box.filter((b) => b.rem > 0);
      for (const o of out) team.returning.push(o.pid);
      ev(s, 'penaltyEnd', { team: s.teams.indexOf(team) });
    }
  }
}

function ensureCounts(s) {
  for (const t of [0, 1]) {
    const team = s.teams[t];
    const mine = s.skaters.filter((k) => k.team === t);
    const n = desired(s, t);
    if (mine.length < n) {
      const have = new Set(mine.map((k) => k.role));
      const role = roleSet(s, n).find((r) => !have.has(r)) || 'LW';
      let pid = team.returning.shift();
      if (!pid || mine.some((k) => k.pid === pid)) pid = bestBench(s, t, role.endsWith('D') ? 'D' : 'F');
      if (!pid) continue;
      const k = spawnSkater(s, t, pid, role, BOX_X[t], R.W - 2.5);
      k.a = -Math.PI / 2;
      s.skaters.push(k);
    } else if (mine.length > n) {
      const p = s.puck;
      let worst = null, wd = -1;
      for (const k of mine) {
        if (k.role.endsWith('D') || p.owner === k.id || k.ctrl >= 0) continue;
        const d = hyp(k.x - p.x, k.y - p.y);
        if (d > wd) { wd = d; worst = k; }
      }
      if (worst) s.skaters = s.skaters.filter((k) => k !== worst);
    }
  }
}

function onTheFly(s, dt) {
  const p = s.puck;
  for (const t of [0, 1]) {
    const team = s.teams[t];
    team.swapT -= dt;
    if (team.swapT > 0) continue;
    team.swapT = 1.0;
    const defending = p.lastTeam !== t && p.x * team.dir < -25;
    if (defending) continue;
    for (const k of s.skaters) {
      if (k.team !== t || k.ctrl >= 0 || p.owner === k.id) continue;
      if (team.energy[k.pid] >= 0.35 || hyp(p.x - k.x, p.y - k.y) < 40) continue;
      const fresh = bestBench(s, t, k.role.endsWith('D') ? 'D' : 'F');
      if (!fresh || team.energy[fresh] < 0.7) continue;
      const n = spawnSkater(s, t, fresh, k.role, BENCH_X[t], -R.W + 2.5);
      n.a = Math.PI / 2;
      s.skaters = s.skaters.filter((x) => x !== k);
      s.skaters.push(n);
      ev(s, 'change', { team: t });
      break;
    }
  }
}

function benchRecovery(s, dt) {
  const on = new Set(s.skaters.map((k) => k.pid));
  for (const team of s.teams) {
    for (const pid in team.energy) {
      if (!on.has(pid) && team.energy[pid] < 1) team.energy[pid] = Math.min(1, team.energy[pid] + 0.035 * dt);
    }
  }
}

function intermission(s, text, sub = '') {
  s.phase = 'intermission';
  s.timer = 2.8;
  banner(s, text, sub, -1, 2.8);
}

function endPeriod(s) {
  ev(s, 'horn');
  const [a, b] = [s.teams[0].score, s.teams[1].score];
  if (!s.ot) {
    if (s.period < s.cfg.periods) { s.next = 'period'; intermission(s, `END OF ${ORD[s.period - 1]}`); return; }
    if (a !== b || s.cfg.ot === 'none') { finish(s, 'REG'); return; }
    s.next = 'ot';
    intermission(s, 'END OF REGULATION', s.cfg.ot === 'reg' ? '3-ON-3 OVERTIME' : 'SUDDEN DEATH');
    return;
  }
  if (s.cfg.ot === 'reg') { s.next = 'so'; intermission(s, 'END OF OVERTIME', 'SHOOTOUT'); }
  else { s.next = 'ot'; intermission(s, `END OF ${periodName(s.period)}`, 'SUDDEN DEATH'); }
}

function startNext(s) {
  for (const team of s.teams) for (const pid in team.energy) team.energy[pid] = Math.min(1, team.energy[pid] + 0.5);
  if (s.next === 'so') { startShootout(s); return; }
  s.period++;
  if (s.next === 'ot') {
    s.ot = true;
    s.ot3 = s.cfg.ot === 'reg';
    s.clock = s.ot3 ? Math.max(60, Math.round(s.cfg.periodLen * 0.25)) : s.cfg.periodLen;
  } else s.clock = s.cfg.periodLen;
  setupFaceoff(s, 0, 0);
  s.timer = 1.6;
  banner(s, s.ot ? (s.ot3 ? '3-ON-3 OT' : periodName(s.period)) : `${ORD[s.period - 1]} PERIOD`, '', -1, 1.6);
}

function finish(s, decision) {
  s.phase = 'final';
  s.result = buildResult(s, decision);
  const w = s.teams[0].score > s.teams[1].score ? 0 : 1;
  banner(s, 'FINAL', `${s.teams[w].abbr} WINS${decision !== 'REG' ? ' IN ' + decision : ''}`, w, 999);
  ev(s, 'final', { decision });
}

function buildResult(s, decision) {
  return {
    teamIds: s.teams.map((t) => t.id),
    score: s.teams.map((t) => t.score),
    decision,
    shots: s.teams.map((t) => t.shots),
    hits: s.teams.map((t) => t.hits),
    pim: s.teams.map((t) => t.pim),
    ppg: s.teams.map((t) => t.ppg),
    ppo: s.teams.map((t) => t.ppo),
    fow: s.teams.map((t) => t.fow),
    fot: s.teams[0].fot,
    perScore: s.teams.map((t) => t.perScore.slice()),
    goals: s.goals.slice(),
    players: s.teams.map((t) => t.stats),
    goalies: s.teams.map((t) => ({ pid: t.goalie.pid, sa: t.goalie.sa, ga: t.goalie.ga })),
    so: s.so ? { goals: s.so.goals.slice(), log: s.so.log.slice() } : null,
  };
}

// ---------------------------------------------------------------- shootout

function startShootout(s) {
  s.phase = 'shootout';
  s.period = 5;
  s.ot3 = false;
  const order = [0, 1].map((t) => {
    const team = s.teams[t];
    const ids = [...team.lines.F.flat(), ...team.lines.D.flat()];
    const sc = (pid) => { const r = team.players[pid].r; return r.sht + r.acc + r.hnd; };
    return ids.sort((a, b) => sc(b) - sc(a)).slice(0, 6);
  });
  const first = s.teams[0].home ? 1 : 0;
  s.so = { first, turn: first, goals: [0, 0], att: [0, 0], order, log: [], state: 'ready', timer: 1.4, t: 0, shotFired: false, plan: null };
  s.skaters = [];
  banner(s, 'SHOOTOUT', 'BEST OF 3', -1, 1.4);
}

function soSpawn(s) {
  const so = s.so, t = so.turn, team = s.teams[t];
  const pid = so.order[t][so.att[t] % so.order[t].length];
  s.skaters = [];
  const k = spawnSkater(s, t, pid, 'C', -team.dir * 2, 0);
  s.skaters.push(k);
  const p = s.puck;
  Object.assign(p, newPuck(), { x: k.x, y: 0, owner: k.id, touches: [{ pid, team: t }], lastTeam: t });
  for (const g of s.goalies) {
    const sg = -s.teams[g.team].dir;
    g.x = sg * (R.GX - 3); g.y = 0; g.down = 0; g.hold = 0; g.beatShot = -1;
  }
  for (const h of s.humans) h.sk = h.team === t ? k.id : -1;
  so.state = 'attempt'; so.t = 0; so.shotFired = false;
  so.plan = { shootAt: 12 + rand(s) * 16, deke: rand(s) < 0.5, deked: false, lane: (rand(s) - 0.5) * 16 };
  banner(s, `#${k.num} ${team.players[pid].name.toUpperCase()}`, `${team.abbr} SHOOTER`, t, 1.2);
}

function soResult(s, goal) {
  const so = s.so;
  if (so.state !== 'attempt') return;
  const t = so.turn;
  so.att[t]++;
  if (goal) so.goals[t]++;
  const pid = so.order[t][(so.att[t] - 1) % so.order[t].length];
  so.log.push({ team: t, pid, goal });
  so.state = 'result';
  so.timer = 1.8;
  banner(s, goal ? 'SCORES!' : 'STOPPED!', `${s.teams[0].abbr} ${so.goals[0]} - ${so.goals[1]} ${s.teams[1].abbr}`, goal ? t : 1 - t, 1.8);
  ev(s, goal ? 'goal' : 'save', { team: goal ? t : 1 - t, so: true });
}

function soNext(s) {
  const so = s.so;
  const rem = (t) => Math.max(0, 3 - so.att[t]);
  let w = -1;
  if (so.att[0] <= 3 && so.att[1] <= 3) {
    if (so.goals[0] > so.goals[1] + rem(1)) w = 0;
    else if (so.goals[1] > so.goals[0] + rem(0)) w = 1;
  }
  if (w < 0 && so.att[0] === so.att[1] && so.att[0] >= 3 && so.goals[0] !== so.goals[1]) w = so.goals[0] > so.goals[1] ? 0 : 1;
  if (w >= 0) {
    s.teams[w].score++;
    s.skaters = [];
    finish(s, 'SO');
    return;
  }
  so.turn = 1 - so.turn;
  so.state = 'ready';
  so.timer = 0.6;
}

function aiShootout(s, k) {
  const so = s.so, plan = so.plan;
  const dir = s.teams[k.team].dir, gx = dir * R.GX;
  const dNet = hyp(gx - k.x, k.y);
  if (s.puck.owner === k.id) {
    if (plan.deke && !plan.deked && dNet < plan.shootAt + 7) { plan.deked = true; doDeke(s, k, k.y > 0 ? -1 : 1); }
    else if (dNet < plan.shootAt) {
      const aim = aiAim(s, k);
      doShot(s, k, 0, { aimY: aim.y, aimZ: aim.z ?? undefined });
      return { mx: 0, my: 0, active: true };
    }
  }
  const ty = dNet > 40 ? plan.lane : plan.lane * 0.2;
  return seek(k, gx - dir * 6, ty, 4);
}

function soStep(s, dt) {
  const so = s.so;
  for (const g of s.goalies) stepGoalie(s, g, dt);
  if (so.state === 'ready') { so.timer -= dt; if (so.timer <= 0) soSpawn(s); return; }
  if (so.state === 'result') {
    so.timer -= dt;
    glide(s, dt);
    if (so.timer <= 0) soNext(s);
    return;
  }
  so.t += dt;
  const k = s.skaters[0];
  if (!k) return;
  for (const c in k.cd) if (k.cd[c] > 0) k.cd[c] -= dt;
  if (k.dekeT > 0) k.dekeT -= dt;
  updateControl(s);
  const mv = k.ctrl >= 0 ? humanSkater(s, k, s.humans[k.ctrl], dt) : aiShootout(s, k);
  moveSkater(s, k, mv, dt);
  collideSkaters(s, false);
  stepPuck(s, dt);
  if (so.state !== 'attempt') return;
  const p = s.puck;
  const dir = s.teams[k.team].dir;
  const sp = hyp(p.vx, p.vy);
  const fail =
    so.t > 12 ||
    (so.shotFired && p.owner == null && (sp < 8 || p.vx * dir < 0 || p.x * dir > R.GX + 0.5)) ||
    (p.owner === k.id && k.x * dir > R.GX + 1);
  if (fail) soResult(s, false);
}

// ---------------------------------------------------------------- main loop

function glide(s, dt) {
  for (const k of s.skaters) {
    if (k.stun > 0) k.stun -= dt;
    k.lungeT = 0;
    const f = Math.exp(-1.6 * dt);
    k.vx *= f; k.vy *= f;
    k.x += k.vx * dt; k.y += k.vy * dt;
  }
  collideSkaters(s, false);
  const p = s.puck;
  if (p.owner == null && s.phase !== 'goal') {
    p.x += p.vx * dt; p.y += p.vy * dt;
    const f = Math.exp(-2 * dt);
    p.vx *= f; p.vy *= f;
    p.z = Math.max(0, p.z - 4 * dt);
    const c = wallContact(p.x, p.y, PUCK_R);
    if (c) bounce(p, c, 0.5, 0.9);
    collideNetBody(p, PUCK_R);
  } else if (p.owner != null) {
    stepPuck(s, dt);
  }
}

function playStep(s, dt) {
  updateControl(s);
  const roles = [teamRoles(s, 0), teamRoles(s, 1)];
  for (const k of s.skaters) {
    for (const c in k.cd) if (k.cd[c] > 0) k.cd[c] -= dt;
    if (k.dekeT > 0) k.dekeT -= dt;
    if (k.lungeT > 0) k.lungeT -= dt;
    if (k.pokeT > 0) k.pokeT -= dt;
    const mv = k.ctrl >= 0 ? humanSkater(s, k, s.humans[k.ctrl], dt) : aiSkater(s, k, roles[k.team], dt);
    if (s.phase !== 'play') return;
    moveSkater(s, k, mv, dt);
  }
  collideSkaters(s, true);
  if (s.phase !== 'play') return;
  for (const g of s.goalies) stepGoalie(s, g, dt);
  stepPuck(s, dt);
  if (s.phase !== 'play') return;
  tickPenalties(s, dt * s.clockRate);
  benchRecovery(s, dt);
  ensureCounts(s);
  onTheFly(s, dt);
  s.clock -= dt * s.clockRate;
  if (s.clock <= 0) { s.clock = 0; endPeriod(s); }
}

export function step(s, inputs = [], dt = DT) {
  s.time += dt;
  if (s.shake > 0) s.shake = Math.max(0, s.shake - dt);
  readInputs(s, inputs);
  switch (s.phase) {
    case 'faceoff': {
      for (const h of s.humans) if (h.edge.passP || h.edge.shootP) s.fo.press[h.team] = s.time;
      for (const k of s.skaters) { k.vx = k.vy = 0; }
      for (const g of s.goalies) stepGoalie(s, g, dt);
      s.timer -= dt;
      if (s.timer <= 0 && s.fo.dropT < 0) { s.fo.dropT = s.time; ev(s, 'drop'); }
      if (s.fo.dropT >= 0 && s.time - s.fo.dropT >= 0.22) resolveFaceoff(s);
      break;
    }
    case 'play':
      playStep(s, dt);
      break;
    case 'whistle':
      glide(s, dt);
      s.timer -= dt;
      if (s.timer <= 0) setupFaceoff(s, s.stopAt.x, s.stopAt.y);
      break;
    case 'goal':
      glide(s, dt);
      s.timer -= dt;
      if (s.timer <= 0) {
        if (s.ot) finish(s, 'OT');
        else setupFaceoff(s, 0, 0);
      }
      break;
    case 'intermission':
      s.timer -= dt;
      glide(s, dt);
      if (s.timer <= 0) startNext(s);
      break;
    case 'shootout':
      soStep(s, dt);
      break;
    default:
      break;
  }
}

// Run the rest of the game with the CPU controlling everyone.
export function fastForward(s, maxSteps = 3e6) {
  s.humans = [];
  let n = 0;
  while (s.phase !== 'final' && n < maxSteps) {
    step(s, [], DT);
    s.events.length = 0;
    n++;
  }
  return s.result;
}

export function drainEvents(s) {
  const e = s.events;
  s.events = [];
  return e;
}

// Compact, render- and network-friendly view of the state.
export function snapshot(s) {
  const r1 = (v) => Math.round(v * 10) / 10;
  const r2 = (v) => Math.round(v * 100) / 100;
  const p = s.puck;
  return {
    ph: s.phase, per: s.period, ot: s.ot, clk: Math.max(0, Math.ceil(s.clock)), t: r2(s.time),
    sc: [s.teams[0].score, s.teams[1].score],
    sh: [s.teams[0].shots, s.teams[1].shots],
    box: s.teams.map((t) => t.box.map((b) => [b.num, Math.ceil(b.rem)])),
    sk: s.skaters.map((k) => [
      k.id, k.team, r1(k.x), r1(k.y), r2(k.a), k.num,
      (k.stun > 0 ? 1 : 0) | (k.lungeT > 0 ? 2 : 0) | (k.pokeT > 0 ? 4 : 0) | (k.dekeT > 0 ? 8 : 0) | (p.owner === k.id ? 16 : 0),
      Math.round(s.teams[k.team].energy[k.pid] * 9),
      k.charge >= 0 ? r2(Math.min(1, k.charge / 0.8)) : -1,
    ]),
    g: s.goalies.map((g) => [r1(g.x), r1(g.y), r2(g.a), (g.down > 0 ? 1 : 0) | (g.hold > 0 ? 2 : 0), g.num]),
    pk: [r1(p.x), r1(p.y), r1(p.z), p.owner ?? -1],
    ctl: s.humans.map((h) => h.sk),
    ban: s.banner && s.time - s.banner.t < s.banner.dur ? s.banner : null,
    so: s.so ? { g: s.so.goals, log: s.so.log.map((l) => [l.team, l.goal ? 1 : 0]) } : null,
    shk: r2(s.shake),
  };
}
