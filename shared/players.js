// Players: archetypes, rating generation and overall ratings.
import { rand, randInt, gauss, pick } from './rng.js';
import { FIRST, LAST } from './names.js';

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
export const blankStats = (pos) => (pos === 'G' ? blankGoalie() : blankSkater());

export function ovr(p) {
  const r = p.r;
  if (p.pos === 'G') return Math.round(r.gk * 0.75 + r.reb * 0.25);
  if (p.pos === 'D') return Math.round((r.def * 1.5 + r.chk + r.spd + r.pas + r.sht * 0.7 + r.hnd * 0.6 + r.end * 0.3) / 6.1);
  return Math.round((r.sht * 1.2 + r.acc * 1.2 + r.pas + r.hnd + r.spd + r.def * 0.5 + r.chk * 0.3 + r.end * 0.3) / 6.5);
}

export function genPlayer(st, teamId, idx, pos, base, nums) {
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

