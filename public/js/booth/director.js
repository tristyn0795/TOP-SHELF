// Live commentary: turns engine events and snapshots into booth lines.
// Priorities decide what gets said; low-value calls expire quickly so the booth
// stays on top of the play instead of narrating the past.
import { linesIn } from '/shared/booth-lines.js';

const TAG_CALL = { 'ONE-TIMER': 'g_goal_onetimer', 'TOP SHELF': 'g_goal_topshelf', 'FIVE HOLE': 'g_goal_fivehole', WRAPAROUND: 'g_goal_wrap', SLAPPER: 'g_goal_slap' };
const now = () => performance.now();

export class Director {
  /** o: { voice, teams: [teamId of engine team 0, teamId of engine team 1], playoff } */
  constructor(o) {
    this.voice = o.voice;
    this.teams = o.teams;
    this.playoff = !!o.playoff;
    this.q = [];
    this.recent = new Map();
    this.playing = null;
    this.lastEnd = now();
    this.lastFacePer = 0;
    this.flags = {};
    this.phase = null;
    this.banT = -1;
    this.speed = 1;
    this.quiet = false;
  }

  pick(cat) {
    const lines = linesIn(cat);
    if (!lines.length) return null;
    const recent = this.recent.get(cat) || [];
    const fresh = lines.filter((l) => !recent.includes(l.id));
    const line = (fresh.length ? fresh : lines)[Math.floor(Math.random() * (fresh.length || lines.length))];
    recent.push(line.id);
    while (recent.length > Math.min(3, lines.length - 1)) recent.shift();
    this.recent.set(cat, recent);
    return line;
  }

  push(cat, pri, slots = {}, follow = [], chance = 1) {
    if (this.quiet || Math.random() > chance) return;
    this.q.push({ cat, pri, slots, follow, at: now() });
  }

  slot(engineTeam) { return { team: this.teams[engineTeam] }; }

  // Called with each batch of engine events and the snapshot taken right after them.
  onEvents(evs, snap) {
    if (!evs?.length || this.quiet) return;
    for (const e of evs) this.event(e, snap);
    this.pump();
  }

  event(e, snap) {
    switch (e.type) {
      case 'faceoff': {
        if (snap.per === this.lastFacePer || snap.ph === 'shootout') break;
        this.lastFacePer = snap.per;
        if (snap.per === 1) this.push('g_open', 80);
        else if (snap.per === 2) this.push('g_period2', 80);
        else if (snap.per === 3) this.push('g_period3', 80);
        else this.push(this.playoff ? 'g_ot_playoff' : 'g_ot_start', 85);
        break;
      }
      case 'shot':
        if (snap.ph === 'shootout') break;
        if (e.slap) this.push('g_slap', 25, {}, [], 0.8);
        else this.push('g_shot', 20, {}, [], 0.55);
        break;
      case 'save':
        if (e.so) this.push('g_so_stop', 70);
        else if (e.big) this.push('g_save_big', 60, {}, [{ cat: 'e_save_big', chance: 0.45 }]);
        else this.push('g_save', 18, {}, [], 0.45);
        break;
      case 'post':
        this.push(e.bar ? 'g_bar' : 'g_post', 60);
        break;
      case 'goal': this.goal(e, snap); break;
      case 'hit':
        if (e.big) this.push('g_hit_big', 50, {}, [{ cat: 'e_hit', chance: 0.35 }], 0.9);
        break;
      case 'steal':
        this.push('g_steal', 15, {}, [], 0.35);
        break;
      case 'penalty': {
        const k = `g_pen_${String(e.kind || '').toLowerCase()}`;
        this.push(linesIn(k).length ? k : 'g_penalty', 70, {}, [
          { cat: 'g_pp', slots: this.slot(1 - e.team) },
          { cat: 'e_penalty', chance: 0.4 },
        ]);
        break;
      }
      case 'penaltyEnd':
        if (!snap.box[0].length && !snap.box[1].length) this.push('g_pp_end', 30, {}, [], 0.8);
        break;
      case 'whistle':
        if (snap.ban && snap.ban.text === 'ICING') this.push('g_icing', 30, {}, [], 0.8);
        break;
      case 'horn':
        if (snap.per === 1) this.push('g_end1', 90, {}, [{ cat: 'e_intermission', chance: 0.9 }]);
        else if (snap.per === 2) this.push('g_end2', 90, {}, [{ cat: 'e_intermission', chance: 0.9 }]);
        break;
      case 'final': {
        const w = snap.sc[0] > snap.sc[1] ? 0 : 1;
        this.clear(95);
        this.push('g_final', 95, {}, [{ cat: 'g_final_team', slots: this.slot(w) }]);
        break;
      }
      default:
        break;
    }
  }

  goal(e, snap) {
    if (e.so) { this.push('g_so_score', 70); return; }
    const t = e.team, o = 1 - t;
    const after = snap.sc, before = after.slice();
    before[t] = Math.max(0, before[t] - 1);
    const tags = e.tags || [];
    this.clear(100);
    this.cut();
    const slots = this.slot(t);
    if (tags.includes('OT')) {
      this.push('g_ot_winner', 100, {}, [{ cat: 'g_ot_team', slots }, { cat: 'e_replay' }]);
      return;
    }
    const tagged = tags.map((x) => TAG_CALL[x]).find(Boolean);
    const call = tagged && Math.random() < 0.65 ? tagged : 'g_goal';
    let ctx;
    if (before[0] + before[1] === 0) ctx = 'g_goal_first';
    else if (after[t] === after[o]) ctx = 'g_goal_tie';
    else if (after[t] - after[o] === 1) ctx = 'g_goal_ahead';
    else if (after[t] > after[o]) ctx = 'g_goal_more';
    const follow = [];
    if (tags.includes('SHG')) follow.push({ cat: 'g_goal_shg' });
    else if (tags.includes('PPG') && Math.random() < 0.5) follow.push({ cat: 'g_goal_ppg' });
    if (ctx) follow.push({ cat: ctx, slots });
    follow.push({ cat: tags.includes('ONE-TIMER') ? 'e_replay_onetimer' : 'e_replay', chance: 0.85 });
    this.push(call, 100, {}, follow);
  }

  clear(minPri) {
    this.q = this.q.filter((x) => x.pri >= minPri);
  }

  // Called every rendered frame.
  onFrame(snap, opts = {}) {
    const speed = opts.speed || 1;
    if (speed !== this.speed) {
      this.speed = speed;
      if (speed > 1) this.silence(true);
      else this.silence(false);
    }
    if (this.quiet || !snap) return;
    // Phase-driven calls.
    if (snap.ph !== this.phase) {
      if (snap.ph === 'shootout' && !this.flags.so) { this.flags.so = true; this.clear(90); this.push('g_so_start', 85); }
      this.phase = snap.ph;
    }
    if (snap.ph === 'shootout' && snap.ban && snap.ban.t !== this.banT && /SHOOTER$/.test(snap.ban.sub || '')) {
      this.banT = snap.ban.t;
      this.push('g_so_shooter', 60);
    }
    // Late in a close (or not so close) third period.
    if (snap.per === 3 && !snap.ot && snap.ph === 'play') {
      const diff = Math.abs(snap.sc[0] - snap.sc[1]);
      if (snap.clk <= 120 && !this.flags.late2) { this.flags.late2 = true; this.push('g_late2', 40); }
      if (snap.clk <= 60 && !this.flags.late1) {
        this.flags.late1 = true;
        if (diff === 0) this.push('g_late_tied', 45);
        else if (diff === 1) this.push('g_late_close', 45);
        else if (diff >= 3) this.push('e_late_blowout', 45);
      }
    }
    // Fill quiet stretches.
    if (snap.ph === 'play' && !this.playing && !this.q.length && now() - this.lastEnd > 7000) {
      this.push(Math.random() < 0.55 ? 'g_flow' : 'e_filler', 5);
      this.lastEnd = now();
    }
    this.pump();
  }

  pump() {
    const t = now();
    this.q = this.q.filter((x) => (x.pri >= 50 ? t - x.at < 6000 : t - x.at < 1500));
    if (!this.q.length) return;
    this.q.sort((a, b) => b.pri - a.pri || a.at - b.at);
    const top = this.q[0];
    if (this.playing) {
      if (top.pri >= 90 && this.playing.pri < 90) this.cut();
      return;
    }
    if (top.pri < 50 && t - this.lastEnd < 2500) return;
    this.q.shift();
    this.play(top);
  }

  play(item) {
    const line = this.pick(item.cat);
    if (!line) return;
    const job = { pri: item.pri };
    this.playing = job;
    this.voice.say(line, item.slots).then(() => {
      if (this.playing === job) this.playing = null;
      this.lastEnd = now();
      if (!this.quiet && !job.cut) {
        for (const f of item.follow) {
          if (f.chance != null && Math.random() > f.chance) continue;
          this.q.push({ cat: f.cat, pri: item.pri - 1, slots: f.slots || {}, follow: [], at: now() });
        }
      }
      this.pump();
    });
  }

  // Interrupt the current line (and drop its follow-ups).
  cut() {
    if (this.playing) this.playing.cut = true;
    this.voice.stop();
  }

  silence(on) {
    this.quiet = on;
    if (on) { this.q = []; this.voice.stop(); this.playing = null; }
  }

  stop() { this.silence(true); }
}
