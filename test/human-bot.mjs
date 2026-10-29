// Drives team 0 through the human input path (edges, counters, aiming) to make sure
// the controls do what the manual says: skate, pass, one-timers, slap shots, checks.
import { createGame, step, byId, DT } from '../shared/engine.js';
import { buildTeams, gameTeam } from '../shared/league.js';

const teams = buildTeams(1994);
const stats = { games: 0, gf: 0, ga: 0, shots: 0, oneT: 0, slaps: 0, passes: 0, checks: 0, hits: 0, foW: 0, foT: 0 };
for (let g = 0; g < 6; g++) {
  const s = createGame({ teams: [gameTeam(teams, g, false), gameTeam(teams, g + 12, true)], humans: [{ team: 0 }], cfg: { periodLen: 180, difficulty: 'pro' }, seed: 77 + g });
  const inp = { mx: 0, my: 0, np: 0, ns: 0, nd: 0, shoot: false, pass: false, sprint: false };
  let hold = 0, plan = null;
  while (s.phase !== 'final') {
    const h = s.humans[0];
    const me = byId(s, h.sk);
    const p = s.puck;
    inp.mx = 0; inp.my = 0; inp.sprint = false;
    if (s.phase === 'faceoff' && s.fo.dropT > 0 && s.time - s.fo.dropT < 0.05) inp.ns++;
    if (me && s.phase === 'play') {
      if (p.owner === me.id) {
        const dx = 80 - me.x, dy = -me.y * 0.5;
        const l = Math.hypot(dx, dy) || 1;
        inp.mx = dx / l; inp.my = dy / l;
        if (hold > 0) { hold -= DT; if (hold <= 0) inp.shoot = false; }
        else if (me.x > 30 && me.x < 45 && Math.random() < 0.02) { inp.shoot = true; inp.ns++; hold = 0.6; }
        else if (me.x > 45 && Math.random() < 0.04) { inp.np++; plan = 'onetimer'; }
        else if (me.x > 60) { inp.ns++; }
      } else {
        if (plan === 'onetimer' && p.pass && p.pass.team === 0) { inp.ns++; plan = null; }
        const dx = p.x - me.x, dy = p.y - me.y, l = Math.hypot(dx, dy) || 1;
        inp.mx = dx / l; inp.my = dy / l;
        const car = byId(s, p.owner);
        if (car && car.team === 1 && l < 5 && Math.random() < 0.05) inp.ns++;
        if (car && car.team === 1 && Math.random() < 0.01) inp.np++;
      }
    }
    step(s, [{ ...inp }], DT);
    for (const e of s.events) {
      if (e.type === 'shot' && e.team === 0) { stats.shots++; if (e.oneTimer) stats.oneT++; if (e.slap) stats.slaps++; }
      if (e.type === 'pass' && e.team === 0) stats.passes++;
      if (e.type === 'lunge') stats.checks++;
      if (e.type === 'hit' && e.team === 0) stats.hits++;
    }
    s.events.length = 0;
  }
  const r = s.result;
  stats.games++; stats.gf += r.score[0]; stats.ga += r.score[1]; stats.foW += r.fow[0]; stats.foT += r.fot;
  console.log(`bot ${r.score[0]} - ${r.score[1]} cpu (${r.decision})  SOG ${r.shots[0]}-${r.shots[1]}`);
}
console.log(stats);
if (!stats.oneT || !stats.slaps || !stats.passes || !stats.hits) { console.error('a control path never fired'); process.exit(1); }
console.log(`faceoff win% with timing: ${(stats.foW / stats.foT * 100).toFixed(0)}%`);
