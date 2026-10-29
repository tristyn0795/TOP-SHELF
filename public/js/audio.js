// Synthesized retro arena audio (WebAudio, no sample files).
import { load, save } from './storage.js';

const NOTE = (n) => 440 * Math.pow(2, (n - 69) / 12);

export class Audio {
  constructor() {
    this.ctx = null;
    this.muted = load('muted', false);
    this.crowdGain = null;
  }

  unlock() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.6;
    this.master.connect(this.ctx.destination);
    // Crowd runs through a duck stage so the booth can be heard; voices get their own bus.
    this.duckNode = this.ctx.createGain();
    this.duckNode.connect(this.master);
    this.voiceBus = this.ctx.createGain();
    this.voiceBus.gain.value = 1.5;
    this.voiceBus.connect(this.master);
    const len = this.ctx.sampleRate * 2;
    this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  setMuted(m) {
    this.muted = m;
    save('muted', m);
    if (this.master) this.master.gain.value = m ? 0 : 0.6;
  }

  get t() { return this.ctx.currentTime; }

  env(node, peak, a, dcy, t0 = this.t) {
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + a + dcy);
    node.connect(g);
    g.connect(this.master);
    return g;
  }

  tone(type, f, peak, a, dcy, t0 = this.t, f2 = null) {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + a + dcy);
    this.env(o, peak, a, dcy, t0);
    o.start(t0);
    o.stop(t0 + a + dcy + 0.05);
    return o;
  }

  burst(fType, freq, q, peak, a, dcy, t0 = this.t) {
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = fType; f.frequency.value = freq; f.Q.value = q;
    s.connect(f);
    this.env(f, peak, a, dcy, t0);
    s.start(t0, Math.random() * 1.5);
    s.stop(t0 + a + dcy + 0.05);
  }

  crowd(on) {
    if (!this.ctx) return;
    if (on && !this.crowdSrc) {
      const s = this.ctx.createBufferSource();
      s.buffer = this.noise; s.loop = true;
      const f = this.ctx.createBiquadFilter();
      f.type = 'bandpass'; f.frequency.value = 520; f.Q.value = 0.6;
      this.crowdGain = this.ctx.createGain();
      this.crowdGain.gain.value = 0.03;
      s.connect(f); f.connect(this.crowdGain); this.crowdGain.connect(this.duckNode);
      s.start();
      this.crowdSrc = s;
    } else if (!on && this.crowdSrc) {
      this.crowdSrc.stop();
      this.crowdSrc = null;
    }
  }

  duck(on) {
    if (!this.duckNode) return;
    this.duckNode.gain.setTargetAtTime(on ? 0.3 : 1, this.ctx.currentTime, 0.08);
  }

  roar(level = 0.2, dur = 3) {
    if (!this.crowdGain) return;
    const g = this.crowdGain.gain;
    g.cancelScheduledValues(this.t);
    g.setValueAtTime(g.value, this.t);
    g.linearRampToValueAtTime(level, this.t + 0.15);
    g.linearRampToValueAtTime(0.03, this.t + dur);
  }

  organ(notes, step = 0.14) {
    let t0 = this.t + 0.02;
    for (const [n, len] of notes) {
      if (n) {
        this.tone('square', NOTE(n), 0.05, 0.01, step * len * 0.9, t0);
        this.tone('triangle', NOTE(n - 12), 0.06, 0.01, step * len * 0.9, t0);
      }
      t0 += step * len;
    }
  }

  play(name, o = {}) {
    if (!this.ctx || this.muted) return;
    switch (name) {
      case 'pass': this.tone('square', 900, 0.06, 0.002, 0.04); this.burst('highpass', 3000, 1, 0.08, 0.002, 0.03); break;
      case 'pickup': this.tone('square', 600, 0.025, 0.002, 0.03); break;
      case 'shot':
        this.burst('bandpass', o.slap ? 1300 : 2200, 1.2, o.slap ? 0.6 : 0.35, 0.002, o.slap ? 0.12 : 0.06);
        this.tone('square', o.slap ? 160 : 260, 0.12, 0.002, 0.06);
        this.roar(0.07, 1.2);
        break;
      case 'save': this.burst('lowpass', 700, 1, 0.5, 0.002, 0.1); this.tone('sine', 180, 0.2, 0.002, 0.1, this.t, 90); break;
      case 'post': this.tone('sine', 1760, 0.25, 0.002, 0.7); this.tone('sine', 2637, 0.12, 0.002, 0.5); this.roar(0.12, 1.5); break;
      case 'hit':
        this.tone('sine', o.big ? 110 : 140, o.big ? 0.6 : 0.35, 0.002, 0.22, this.t, 40);
        this.burst('lowpass', 400, 1, o.big ? 0.6 : 0.3, 0.002, 0.15);
        if (o.big) this.roar(0.14, 1.6);
        break;
      case 'boards': this.tone('sine', 120, 0.25, 0.002, 0.12, this.t, 60); this.burst('lowpass', 300, 1, 0.2, 0.002, 0.08); break;
      case 'poke': this.burst('highpass', 2500, 1, 0.1, 0.002, 0.04); break;
      case 'steal': this.tone('square', 500, 0.05, 0.002, 0.05); this.tone('square', 750, 0.05, 0.002, 0.05, this.t + 0.05); break;
      case 'whistle': {
        const o1 = this.tone('sine', 2900, 0.12, 0.01, 0.42);
        const lfo = this.ctx.createOscillator(); const lg = this.ctx.createGain();
        lfo.frequency.value = 38; lg.gain.value = 140; lfo.connect(lg); lg.connect(o1.frequency);
        lfo.start(); lfo.stop(this.t + 0.5);
        break;
      }
      case 'horn': {
        for (const f of [110, 138.6, 164.8, 220]) {
          const osc = this.tone('sawtooth', f, 0.12, 0.05, 2.4);
          osc.detune.value = (Math.random() - 0.5) * 12;
        }
        this.roar(0.3, 4.5);
        break;
      }
      case 'buzzer': this.tone('square', 180, 0.12, 0.01, 1.1); this.tone('square', 182, 0.1, 0.01, 1.1); break;
      case 'drop': this.tone('square', 1200, 0.04, 0.002, 0.03); break;
      case 'charge': this.organ([[67, 1], [72, 1], [76, 1], [79, 2], [0, 0.5], [76, 1], [79, 3]]); break;
      case 'letsgo': this.organ([[60, 1], [60, 1], [0, 1], [60, 1], [60, 1], [0, 1], [64, 1], [67, 2]], 0.13); break;
      case 'blip': this.tone('square', 660, 0.05, 0.002, 0.05); break;
      case 'select': this.tone('square', 660, 0.05, 0.002, 0.05); this.tone('square', 990, 0.05, 0.002, 0.08, this.t + 0.06); break;
      case 'penalty': this.organ([[64, 1], [60, 1], [55, 3]], 0.16); break;
      default: break;
    }
  }

  // Map engine events to sounds.
  events(evs, ctx = {}) {
    for (const e of evs) {
      switch (e.type) {
        case 'goal': this.play('horn'); break;
        case 'faceoff': if (Math.random() < 0.18) this.play(Math.random() < 0.5 ? 'charge' : 'letsgo'); break;
        case 'horn': this.play('buzzer'); break;
        case 'penalty': this.play('whistle'); setTimeout(() => this.play('penalty'), 500); break;
        case 'final': this.play('buzzer'); this.roar(0.25, 4); break;
        default: this.play(e.type, e);
      }
    }
  }
}
