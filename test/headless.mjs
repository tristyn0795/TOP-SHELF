// Headless checks: CPU-vs-CPU games through the real engine, plus a full franchise season.
// Usage: node test/headless.mjs [games] [periodSeconds]
import assert from 'node:assert/strict';
import { createGame, step, R, DT } from '../shared/engine.js';
import { buildTeams, gameTeam, createLeague, simDay, todaysGames, standings } from '../shared/league.js';
import { TEAMS } from '../shared/teams.js';

const GAMES = Number(process.argv[2] || 12);
const PERIOD = Number(process.argv[3] || 180);
const teams = buildTeams(1994);

const tot = { goals: 0, shots: 0, saves: 0, ot: 0, so: 0, pens: 0, hits: 0, steps: 0, tags: {}, fo: 0, icing: 0, posts: 0, oneT: 0 };
const phases = {};
const t0 = Date.now();
for (let g = 0; g < GAMES; g++) {
  const a = (g * 7) % 32, b = (g * 13 + 5) % 32 === a ? (a + 1) % 32 : (g * 13 + 5) % 32;
  const s = createGame({
    teams: [gameTeam(teams, a, false), gameTeam(teams, b, true)],
    cfg: { periodLen: PERIOD, ot: 'reg' },
    seed: 1000 + g,
  });
  let n = 0;
  while (s.phase !== 'final') {
    step(s, [], DT);
    for (const e of s.events) {
      if (e.type === 'whistle' && s.banner?.text === 'ICING') tot.icing++;
      if (e.type === 'post') tot.posts++;
      if (e.type === 'shot' && e.oneTimer) tot.oneT++;
    }
    s.events.length = 0;
    phases[s.phase] = (phases[s.phase] || 0) + 1;
    const p = s.puck;
    assert.ok(Number.isFinite(p.x) && Number.isFinite(p.y) && Number.isFinite(p.z), 'puck NaN');
    assert.ok(Math.abs(p.x) <= R.L + 0.5 && Math.abs(p.y) <= R.W + 0.5, `puck outside rink ${p.x},${p.y}`);
    for (const k of s.skaters) {
      assert.ok(Number.isFinite(k.x) && Number.isFinite(k.y), 'skater NaN');
      assert.ok(Math.abs(k.x) <= R.L && Math.abs(k.y) <= R.W, `skater outside ${k.x},${k.y}`);
    }
    if (++n > 60 * (PERIOD * 3 + 1200)) throw new Error('game never ended');
  }
  const r = s.result;
  tot.goals += r.score[0] + r.score[1] - (r.decision === 'SO' ? 1 : 0);
  tot.shots += r.shots[0] + r.shots[1];
  tot.saves += r.goalies[0].sa - r.goalies[0].ga + r.goalies[1].sa - r.goalies[1].ga;
  tot.pens += (r.pim[0] + r.pim[1]) / 2;
  tot.hits += r.hits[0] + r.hits[1];
  tot.fo += r.fot;
  if (r.decision === 'OT') tot.ot++;
  if (r.decision === 'SO') tot.so++;
  for (const gl of r.goals) for (const t of gl.tags) tot.tags[t] = (tot.tags[t] || 0) + 1;
  tot.steps += n;
  console.log(`${TEAMS[a].abbr} ${r.score[0]} - ${r.score[1]} ${TEAMS[b].abbr} ${r.decision.padEnd(3)}  SOG ${r.shots[0]}-${r.shots[1]}  PIM ${r.pim[0]}-${r.pim[1]}  hits ${r.hits[0]}-${r.hits[1]}  FO ${r.fow[0]}/${r.fot}`);
}
const ms = Date.now() - t0;
console.log('\n--- per game averages ---');
console.log(`goals/team ${(tot.goals / GAMES / 2).toFixed(2)}  shots/team ${(tot.shots / GAMES / 2).toFixed(1)}  SV% ${(tot.saves / Math.max(1, tot.saves + tot.goals)).toFixed(3)}`);
console.log(`penalties ${(tot.pens / GAMES).toFixed(1)}  hits ${(tot.hits / GAMES).toFixed(1)}  faceoffs ${(tot.fo / GAMES).toFixed(1)}  icings ${(tot.icing / GAMES).toFixed(1)}  posts ${(tot.posts / GAMES).toFixed(1)}  one-timers ${(tot.oneT / GAMES).toFixed(1)}`);
console.log(`OT ${tot.ot}  SO ${tot.so}  tags ${JSON.stringify(tot.tags)}`);
const ph = Object.entries(phases).map(([k, v]) => `${k} ${((v / tot.steps) * 100).toFixed(1)}%`).join('  ');
console.log(`phases: ${ph}`);
console.log(`engine speed: ${((tot.steps / ms) * 1000 / 60).toFixed(0)}x realtime`);

// Franchise: a full short season and playoffs.
const lg = createLeague({ userTeam: 3, seasonLength: 16, seriesLen: 3, seed: 42 });
let guard = 0;
while (lg.phase !== 'done' && guard++ < 200) simDay(lg);
assert.equal(lg.phase, 'done', 'season should finish');
const st = standings(lg);
const gp = st.reduce((a, t) => a + t.rec.gp, 0);
assert.equal(gp, 32 * 16, 'every team plays every game');
const goalsFor = st.reduce((a, t) => a + t.rec.gf, 0), goalsAg = st.reduce((a, t) => a + t.rec.ga, 0);
assert.equal(goalsFor, goalsAg, 'GF must equal GA league-wide');
console.log(`\nseason ok: champion ${TEAMS[lg.playoffs.champion].name}, top seed ${TEAMS[st[0].id].name} (${st[0].rec.pts} pts), goals/game ${(goalsFor / (32 * 16 / 2)).toFixed(2)}`);
assert.equal(todaysGames(lg).length, 0);
console.log('ALL CHECKS PASSED');
