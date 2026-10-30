// Game loops: LocalGame runs the engine in the browser, OnlineGame renders server snapshots.
import { createGame, step, snapshot, drainEvents, DT } from '/shared/engine.js';
import { Renderer, lerpSnap } from './render.js';

// Screen-space stick -> world-space. Host view: screen up = world +x, screen right = world +y.
export function toWorld(inp, flip) {
  const f = flip ? -1 : 1;
  return { ...inp, mx: -inp.my * f, my: inp.mx * f };
}

export class LocalGame {
  /**
   * o: { canvas, input, audio, teams (engine team descriptors), teamDefs, homeIdx, cfg, humans, seed,
   *      replays, onEnd(result), onTick(snap), board(snap) -> other games' score lines }
   */
  constructor(o) {
    this.o = o;
    this.s = createGame({ teams: o.teams, cfg: o.cfg, humans: o.humans, seed: o.seed });
    this.r = new Renderer(o.canvas, { teams: o.teamDefs, homeIdx: o.homeIdx, flip: false });
    this.buf = [];
    this.replay = null;
    this.replayAt = -1;
    this.paused = false;
    this.speed = 1;
    this.acc = 0;
    this.last = 0;
    this.done = false;
    this.skip = false;
    this.loop = this.loop.bind(this);
  }

  start() {
    this.o.audio.crowd(true);
    this.o.input.onAny = () => { if (this.replay) this.skip = true; };
    this.raf = requestAnimationFrame(this.loop);
  }

  cycleSpeed() { this.speed = this.speed >= 4 ? 1 : this.speed * 2; }

  loop(ts) {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    if (this.o.lite && (this.frame = (this.frame || 0) + 1) % 2) return; // half frame rate for the title demo on slow phones
    const dt = Math.min(0.1, this.last ? (ts - this.last) / 1000 : DT);
    this.last = ts;
    const inputs = this.o.input.read().map((i) => toWorld(i, false));
    if (this.paused) return;
    if (this.replay) { this.stepReplay(dt); return; }
    this.acc += dt * this.speed;
    let n = 0;
    while (this.acc >= DT && n < 10 * this.speed) {
      step(this.s, inputs, DT);
      this.acc -= DT;
      n++;
      const evs = drainEvents(this.s);
      this.handleEvents(evs);
      const sn = snapshot(this.s);
      this.buf.push(sn);
      if (evs.length) this.o.director?.onEvents(evs, sn);
      if (this.buf.length > 330) this.buf.shift();
      if (this.s.phase === 'final' && !this.done) {
        this.done = true;
        this.endTimer = setTimeout(() => this.o.onEnd(this.s.result), 3000);
      }
      if (this.replayAt > 0 && this.s.time >= this.replayAt) {
        this.replayAt = -1;
        if (this.o.replays !== false && this.s.phase === 'goal' && this.speed === 1) {
          this.replay = { frames: this.buf.slice(-280), i: 0 };
          this.skip = false;
          break;
        }
      }
    }
    const snap = this.buf[this.buf.length - 1] || snapshot(this.s);
    const board = snap.ph === 'intermission' && this.o.board ? this.o.board(snap) : null;
    this.r.draw(snap, dt, { speed: this.speed, board });
    this.o.director?.onFrame(snap, { speed: this.speed });
    this.o.onTick?.(snap);
  }

  stepReplay(dt) {
    const rp = this.replay;
    rp.i += dt * 60 * 0.6;
    const f = rp.frames[Math.min(rp.frames.length - 1, Math.floor(rp.i))];
    this.r.draw({ ...f, ban: null }, dt, { replay: true, snapCamera: rp.i < 1 });
    if (rp.i >= rp.frames.length - 1 || this.skip) {
      this.replay = null;
      this.skip = false;
    }
  }

  handleEvents(evs) {
    if (!evs.length) return;
    this.o.audio.events(evs);
    this.o.onEvents?.(evs);
    for (const e of evs) {
      if (e.type === 'goal') {
        this.r.setExcited(e.so ? 1.5 : 3);
        if (!e.so) this.replayAt = this.s.time + 1.1;
      }
    }
  }

  setPaused(p) { this.paused = p; this.last = 0; }

  // Finish the game with the CPU in charge, in chunks so the page stays responsive.
  simToEnd(done) {
    this.paused = true;
    this.o.director?.stop();
    this.s.humans = [];
    const chunk = () => {
      if (this.destroyed) return;
      let n = 0;
      while (this.s.phase !== 'final' && n < 4000) { step(this.s, [], DT); this.s.events.length = 0; n++; }
      if (this.s.phase === 'final') { this.done = true; done(this.s.result); }
      else setTimeout(chunk, 0);
    };
    chunk();
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    clearTimeout(this.endTimer);
    this.o.director?.stop();
    this.o.audio.crowd(false);
    this.o.input.onAny = null;
  }
}

export class OnlineGame {
  /** o: { canvas, input, audio, send(msg), side, teamDefs, homeIdx, onTick } */
  constructor(o) {
    this.o = o;
    this.flip = o.side === 1;
    this.r = new Renderer(o.canvas, { teams: o.teamDefs, homeIdx: o.homeIdx, flip: this.flip });
    this.snaps = [];
    this.last = 0;
    this.lastSent = '';
    this.lastSendT = 0;
    this.loop = this.loop.bind(this);
  }

  start() {
    this.o.audio.crowd(true);
    this.raf = requestAnimationFrame(this.loop);
  }

  onSnap(s, ev) {
    this.snaps.push({ at: performance.now(), s });
    if (this.snaps.length > 40) this.snaps.shift();
    if (ev && ev.length) {
      this.o.director?.onEvents(ev, s);
      this.o.audio.events(ev);
      this.o.onEvents?.(ev);
      if (ev.some((e) => e.type === 'goal')) this.r.setExcited(3);
    }
  }

  loop(ts) {
    if (this.destroyed) return;
    this.raf = requestAnimationFrame(this.loop);
    const dt = Math.min(0.1, this.last ? (ts - this.last) / 1000 : DT);
    this.last = ts;
    const inp = toWorld(this.o.input.read()[0], this.flip);
    const key = JSON.stringify(inp);
    if (key !== this.lastSent || ts - this.lastSendT > 250) {
      this.o.send({ t: 'input', i: inp });
      this.lastSent = key;
      this.lastSendT = ts;
    }
    if (!this.snaps.length) return;
    const rt = performance.now() - 75;
    let a = this.snaps[0], b = this.snaps[this.snaps.length - 1];
    for (let i = this.snaps.length - 1; i > 0; i--) {
      if (this.snaps[i - 1].at <= rt) { a = this.snaps[i - 1]; b = this.snaps[i]; break; }
    }
    const span = b.at - a.at;
    const t = span > 0 ? Math.max(0, Math.min(1, (rt - a.at) / span)) : 1;
    const snap = lerpSnap(a.s, b.s, t);
    this.r.draw(snap, dt, {});
    this.o.director?.onFrame(snap);
    this.o.onTick?.(snap);
  }

  destroy() {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.o.director?.stop();
    this.o.audio.crowd(false);
  }
}
