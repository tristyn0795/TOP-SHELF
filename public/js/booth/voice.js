// Plays booth lines: recorded clips when they exist (studio takes in this browser first,
// then /voice/<id>.mp3 from the server), otherwise the browser's text-to-speech as a
// stand-in, otherwise captions only. Always shows a caption.
import { VOICES, teamClipId, teamClipText } from '/shared/booth-lines.js';
import * as idb from './idb.js';

const readMs = (text) => 350 + text.length * 62;

export class Voice {
  /** prefs: object read live for { tts, captions } */
  constructor(audio, prefs) {
    this.audio = audio;
    this.prefs = prefs;
    this.server = new Set();
    this.local = new Set();
    this.cache = new Map();
    this.token = 0;
    this.speakingWho = null;
    this.pending = null;
    this.src = null;
    this.lastSource = null; // 'clip' | 'tts' | 'caption' (for debugging/tests)
    this.ttsVoices = { mick: null, eddie: null };
    this.cap = null;
  }

  async init() {
    try {
      const r = await fetch('/voice/index.json', { cache: 'no-cache' });
      if (r.ok) this.server = new Set(await r.json());
    } catch { /* offline: no server clips */ }
    await this.refreshLocal();
    if ('speechSynthesis' in window) {
      this.pickVoices();
      speechSynthesis.addEventListener?.('voiceschanged', () => this.pickVoices());
    }
  }

  async refreshLocal() {
    this.local = new Set(await idb.keys('takes'));
    this.cache.clear();
  }

  has(id) { return this.local.has(id) || this.server.has(id); }

  pickVoices() {
    const all = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang));
    if (!all.length) return;
    const find = (re, not) => all.find((v) => re.test(v.name) && v !== not);
    const mick = find(/daniel|alex|david|guy|male|fred|arthur|google uk english male/i) || all[0];
    const eddie = find(/tom|mark|george|aaron|rishi|google us english|ralph/i, mick) || all.find((v) => v !== mick) || mick;
    this.ttsVoices = { mick, eddie };
  }

  // Line + team slots -> playable segments and the caption text.
  resolve(line, slots = {}) {
    const segs = [];
    for (const p of line.parts) {
      if (typeof p === 'string') segs.push({ id: line.id, text: p });
      else {
        const tid = slots[p.slot];
        if (tid == null) continue;
        segs.push({ id: teamClipId(tid, p.nick), text: teamClipText(tid, p.nick) + (p.tail || '') });
      }
    }
    let caption = segs.map((s) => s.text).join(' ').replace(/\s+([?.!,])/g, '$1');
    caption = caption.charAt(0).toUpperCase() + caption.slice(1);
    return { segs, caption };
  }

  async buffer(id) {
    if (this.cache.has(id)) return this.cache.get(id);
    let ab;
    if (this.local.has(id)) {
      const rec = await idb.get('takes', id);
      ab = await rec.blob.arrayBuffer();
    } else {
      const r = await fetch(`/voice/${id}.mp3`);
      if (!r.ok) throw new Error('missing clip');
      ab = await r.arrayBuffer();
    }
    const buf = await this.audio.ctx.decodeAudioData(ab);
    this.cache.set(id, buf);
    return buf;
  }

  // Speak a line. Resolves when it has finished (or was stopped).
  async say(line, slots = {}) {
    this.stop();
    const tok = ++this.token;
    const { segs, caption } = this.resolve(line, slots);
    this.speakingWho = line.who;
    this.showCaption(line.who, caption);
    this.audio.duck(true);
    let used = 'caption';
    for (const seg of segs) {
      if (tok !== this.token) break;
      if (this.has(seg.id) && this.audio.ctx && !this.audio.muted) {
        try {
          await this.playBuffer(await this.buffer(seg.id), tok);
          used = 'clip';
          continue;
        } catch { /* fall through to TTS */ }
      }
      if (this.prefs.tts !== false && !this.audio.muted && 'speechSynthesis' in window && speechSynthesis.getVoices().length) {
        await this.speak(seg.text, line.who, tok);
        if (used !== 'clip') used = 'tts';
      } else {
        await this.wait(readMs(seg.text), tok);
      }
    }
    if (tok === this.token) {
      this.lastSource = used;
      this.speakingWho = null;
      this.audio.duck(false);
      this.hideCaption();
    }
  }

  playBuffer(buf, tok) {
    return new Promise((resolve) => {
      if (tok !== this.token) { resolve(); return; }
      const src = this.audio.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.audio.voiceBus || this.audio.master);
      src.onended = () => { if (this.src === src) this.src = null; resolve(); };
      this.src = src;
      this.pending = resolve;
      src.start();
    });
  }

  speak(text, who, tok) {
    return new Promise((resolve) => {
      if (tok !== this.token) { resolve(); return; }
      const u = new SpeechSynthesisUtterance(text);
      const v = this.ttsVoices[who];
      if (v) u.voice = v;
      u.rate = who === 'mick' ? 1.05 : 0.95;
      u.pitch = who === 'mick' ? 0.95 : 0.7;
      let done = false;
      const finish = () => { if (!done) { done = true; clearTimeout(timer); resolve(); } };
      const timer = setTimeout(finish, readMs(text) * 2 + 2500);
      u.onend = finish;
      u.onerror = finish;
      this.pending = finish;
      speechSynthesis.speak(u);
    });
  }

  wait(ms, tok) {
    return new Promise((resolve) => {
      if (tok !== this.token) { resolve(); return; }
      const t = setTimeout(resolve, ms);
      this.pending = () => { clearTimeout(t); resolve(); };
    });
  }

  stop() {
    this.token++;
    if (this.src) { try { this.src.stop(); } catch { /* already stopped */ } this.src = null; }
    if ('speechSynthesis' in window) speechSynthesis.cancel();
    const p = this.pending;
    this.pending = null;
    p?.();
    if (this.speakingWho) this.audio.duck(false);
    this.speakingWho = null;
    this.hideCaption();
  }

  showCaption(who, text) {
    if (this.prefs.captions === false) return;
    if (!this.cap || !document.body.contains(this.cap)) {
      this.cap = document.createElement('div');
      this.cap.className = 'caption hidden';
      this.cap.innerHTML = '<b></b><span></span>';
      document.body.appendChild(this.cap);
    }
    const v = VOICES[who];
    const b = this.cap.querySelector('b'), span = this.cap.querySelector('span');
    b.textContent = v.name;
    b.style.color = v.color;
    this.cap.classList.remove('hidden');
    clearInterval(this.typer);
    let i = 0;
    span.textContent = '';
    this.typer = setInterval(() => {
      i += 2;
      span.textContent = text.slice(0, i);
      if (i >= text.length) clearInterval(this.typer);
    }, 30);
  }

  hideCaption() {
    clearInterval(this.typer);
    this.cap?.classList.add('hidden');
  }
}
