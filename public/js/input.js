// Keyboard, gamepad and touch input. read(i) returns screen-space input for player i:
// { mx, my, pass, shoot, deke, sprint, np, ns, nd } with press counters so taps are never lost.
// Key and button bindings are configurable (Options -> Controls) and saved in localStorage.
import { load, save } from './storage.js';

export const ACTIONS_ALL = [
  ['up', 'SKATE UP'], ['down', 'SKATE DOWN'], ['left', 'SKATE LEFT'], ['right', 'SKATE RIGHT'],
  ['pass', 'PASS / SWITCH'], ['shoot', 'SHOOT / CHECK'], ['deke', 'DEKE / POKE'], ['sprint', 'SPRINT'], ['pause', 'PAUSE'],
];
export const PAD_ACTIONS = ACTIONS_ALL.filter(([a]) => !['up', 'down', 'left', 'right'].includes(a));

export const DEFAULT_BINDS = {
  solo: {
    up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    pass: ['KeyJ', 'KeyZ'], shoot: ['KeyK', 'KeyX'], deke: ['KeyL', 'KeyC'], sprint: ['ShiftLeft', 'Space'], pause: ['KeyP', null],
  },
  p1: {
    up: ['KeyW', null], down: ['KeyS', null], left: ['KeyA', null], right: ['KeyD', null],
    pass: ['KeyC', null], shoot: ['KeyV', null], deke: ['KeyB', null], sprint: ['ShiftLeft', null], pause: ['KeyP', null],
  },
  p2: {
    up: ['ArrowUp', null], down: ['ArrowDown', null], left: ['ArrowLeft', null], right: ['ArrowRight', null],
    pass: ['Comma', 'Numpad1'], shoot: ['Period', 'Numpad2'], deke: ['Slash', 'Numpad3'], sprint: ['ShiftRight', 'Numpad0'], pause: [null, null],
  },
  pad: { pass: [0], shoot: [1, 3], deke: [2], sprint: [5, 7, 4, 6], pause: [9] },
};

const clone = (o) => JSON.parse(JSON.stringify(o));
let binds = Object.assign(clone(DEFAULT_BINDS), load('binds', {}));
for (const k of Object.keys(DEFAULT_BINDS)) binds[k] = Object.assign(clone(DEFAULT_BINDS[k]), binds[k] || {});

export const getBinds = () => binds;

export function setKey(scheme, action, slot, code) {
  const m = binds[scheme];
  const prev = m[action][slot];
  if (code) {
    // the key moves here; whatever used it before takes this slot's old key (swap)
    for (const [a, codes] of Object.entries(m)) {
      codes.forEach((c, i) => { if (c === code && !(a === action && i === slot)) m[a][i] = prev || null; });
    }
  }
  m[action][slot] = code || null;
  save('binds', binds);
}

export function setPad(action, button) {
  for (const [a, list] of Object.entries(binds.pad)) {
    if (a !== action && list.includes(button)) binds.pad[a] = list.filter((b) => b !== button);
  }
  binds.pad[action] = button == null ? [] : [button];
  save('binds', binds);
}

export function resetBinds(scheme = null) {
  if (scheme) binds[scheme] = clone(DEFAULT_BINDS[scheme]);
  else binds = clone(DEFAULT_BINDS);
  save('binds', binds);
}

const NAMED = {
  ShiftLeft: 'L-SHIFT', ShiftRight: 'R-SHIFT', ControlLeft: 'L-CTRL', ControlRight: 'R-CTRL', AltLeft: 'L-ALT', AltRight: 'R-ALT',
  Space: 'SPACE', Enter: 'ENTER', Tab: 'TAB', Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']',
  Backslash: '\\', Semicolon: ';', Quote: "'", Comma: ',', Period: '.', Slash: '/', ArrowUp: 'UP', ArrowDown: 'DOWN',
  ArrowLeft: 'LEFT', ArrowRight: 'RIGHT', CapsLock: 'CAPS', MetaLeft: 'L-META', MetaRight: 'R-META',
};
export function keyLabel(code) {
  if (!code) return '—';
  if (NAMED[code]) return NAMED[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit\d$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return 'NUM ' + code.slice(6).replace('Decimal', '.').replace('Enter', 'ENT').toUpperCase();
  return code.toUpperCase();
}
const PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'SELECT', 'START', 'L-STICK', 'R-STICK', 'D-UP', 'D-DOWN', 'D-LEFT', 'D-RIGHT', 'HOME'];
export const padLabel = (i) => (i == null ? '—' : PAD_NAMES[i] || `BTN ${i}`);
export const keysFor = (scheme, action) => binds[scheme][action].filter(Boolean).map(keyLabel).join(' / ') || '—';
export const padFor = (action) => binds.pad[action].map(padLabel).join(' / ') || '—';

// Wait for the next key press. Resolves a code, null (Backspace/Delete = clear), or undefined (Esc = cancel).
export function captureKey() {
  return new Promise((resolve) => {
    const fn = (e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      window.removeEventListener('keydown', fn, true);
      if (e.code === 'Escape') resolve(undefined);
      else if (e.code === 'Backspace' || e.code === 'Delete') resolve(null);
      else resolve(e.code);
    };
    window.addEventListener('keydown', fn, true);
  });
}

// Wait for a newly pressed gamepad button (Esc on the keyboard cancels).
export function capturePad() {
  return new Promise((resolve) => {
    const held = new Set();
    const pads = () => (navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : []);
    for (const p of pads()) p.buttons.forEach((b, i) => { if (b.pressed) held.add(`${p.index}:${i}`); });
    let done = false;
    const esc = (e) => { if (e.code === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); finish(undefined); } };
    const finish = (v) => { if (done) return; done = true; window.removeEventListener('keydown', esc, true); resolve(v); };
    window.addEventListener('keydown', esc, true);
    const poll = () => {
      if (done) return;
      for (const p of pads()) {
        for (let i = 0; i < p.buttons.length; i++) {
          const k = `${p.index}:${i}`;
          if (p.buttons[i].pressed && !held.has(k)) { finish(i); return; }
          if (!p.buttons[i].pressed) held.delete(k);
        }
      }
      requestAnimationFrame(poll);
    };
    poll();
  });
}

const CNT = { pass: 'np', shoot: 'ns', deke: 'nd' };

export class Input {
  constructor() {
    this.keys = new Set();
    this.players = 1;
    this.state = [this.blank(), this.blank()];
    this.padPrev = {};
    this.touch = { mx: 0, my: 0, pass: false, shoot: false, deke: false, sprint: false };
    this.onPause = null;
    this.onAny = null;
    this.active = false;
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => this.keys.clear());
  }

  blank() { return { np: 0, ns: 0, nd: 0 }; }

  setPlayers(n) { this.players = n; }

  maps() { return this.players === 2 ? [binds.p1, binds.p2] : [binds.solo]; }

  key(e, down) {
    if (!this.active) return;
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    const code = e.code;
    const maps = this.maps();
    if (down && !e.repeat && (code === 'Escape' || maps.some((m) => m.pause.includes(code)))) { this.onPause?.(); e.preventDefault(); return; }
    let used = false;
    maps.forEach((m, i) => {
      for (const [act, codes] of Object.entries(m)) {
        if (!codes.includes(code)) continue;
        used = true;
        if (down && !e.repeat && CNT[act]) this.state[i][CNT[act]]++;
      }
    });
    if (down && !e.repeat) this.onAny?.(code);
    if (used || code === 'Tab') e.preventDefault();
    if (down) this.keys.add(code); else this.keys.delete(code);
  }

  pressTouch(act) {
    this.touch[act] = true;
    if (CNT[act]) this.state[0][CNT[act]]++;
    this.onAny?.(act);
  }

  releaseTouch(act) { this.touch[act] = false; }

  pollPads() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const out = [];
    const pb = binds.pad;
    pads.forEach((p, idx) => {
      const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
      const any = (list) => list.some(b);
      let mx = p.axes[0] || 0, my = p.axes[1] || 0;
      if (Math.hypot(mx, my) < 0.25) { mx = 0; my = 0; }
      if (b(14)) mx = -1; if (b(15)) mx = 1; if (b(12)) my = -1; if (b(13)) my = 1;
      const st = { mx, my, pass: any(pb.pass), shoot: any(pb.shoot), deke: any(pb.deke), sprint: any(pb.sprint), start: any(pb.pause) };
      const prev = this.padPrev[p.index] || {};
      const player = this.players === 2 ? Math.min(idx, 1) : 0;
      for (const act of ['pass', 'shoot', 'deke']) if (st[act] && !prev[act]) { this.state[player][CNT[act]]++; this.onAny?.(act); }
      if (st.start && !prev.start) this.onPause?.();
      this.padPrev[p.index] = st;
      out.push({ player, st });
    });
    return out;
  }

  // Call once per frame; returns inputs for each local player in screen space.
  read() {
    const pads = this.pollPads();
    const res = [];
    this.maps().forEach((m, i) => {
      const down = (act) => m[act].some((c) => c && this.keys.has(c));
      const mx = (down('right') ? 1 : 0) - (down('left') ? 1 : 0);
      const my = (down('down') ? 1 : 0) - (down('up') ? 1 : 0);
      const r = { mx, my, pass: down('pass'), shoot: down('shoot'), deke: down('deke'), sprint: down('sprint') };
      for (const { player, st } of pads) {
        if (player !== i) continue;
        if (Math.hypot(st.mx, st.my) > Math.hypot(r.mx, r.my)) { r.mx = st.mx; r.my = st.my; }
        for (const k of ['pass', 'shoot', 'deke', 'sprint']) r[k] = r[k] || st[k];
      }
      if (i === 0) {
        const t = this.touch;
        if (Math.hypot(t.mx, t.my) > Math.hypot(r.mx, r.my)) { r.mx = t.mx; r.my = t.my; }
        for (const k of ['pass', 'shoot', 'deke', 'sprint']) r[k] = r[k] || t[k];
      }
      const l = Math.hypot(r.mx, r.my);
      if (l > 1) { r.mx /= l; r.my /= l; }
      Object.assign(r, this.state[i]);
      res.push({ ...r });
    });
    return res;
  }
}

// On-screen controls for touch devices: a floating thumbstick (it centres wherever your
// thumb lands in the left zone) and an arc of action buttons. Zones are positioned by
// place(), which the game calls with a layout for the current screen / fold state.
export const isTouchDevice = () => 'ontouchstart' in window || navigator.maxTouchPoints > 0;
const clampN = (v, a, b) => Math.max(a, Math.min(b, v));

export function mountTouch(root, input) {
  if (!isTouchDevice()) return null;
  const el = document.createElement('div');
  el.className = 'touch';
  el.innerHTML = `
    <div class="tzone tstick"><div class="tbase"><div class="knob"></div></div><span class="thint">MOVE</span></div>
    <div class="tzone tbtnzone"><div class="tbtns">
      <button data-a="sprint">SPRINT</button>
      <button data-a="deke">DEKE<small>POKE</small></button>
      <button data-a="pass">PASS<small>SWITCH</small></button>
      <button data-a="shoot" class="big">SHOOT<small>CHECK</small></button>
    </div></div>
    <div class="tsys">
      <button data-a="pause" aria-label="Pause">II</button>
      ${document.fullscreenEnabled ? '<button data-a="fs" aria-label="Full screen">FULL</button>' : ''}
    </div>`;
  root.appendChild(el);
  const zone = el.querySelector('.tstick'), base = el.querySelector('.tbase'), knob = el.querySelector('.knob');
  const btnZone = el.querySelector('.tbtnzone'), sys = el.querySelector('.tsys');
  let sid = null, o = null, R = 56;

  const rest = () => {
    sid = null;
    base.classList.remove('on');
    base.style.left = '50%';
    base.style.top = '60%';
    knob.style.transform = '';
    input.touch.mx = 0;
    input.touch.my = 0;
  };
  const move = (t) => {
    let dx = (t.clientX - o.x) / R, dy = (t.clientY - o.y) / R;
    const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    const dead = l < 0.18;
    input.touch.mx = dead ? 0 : dx;
    input.touch.my = dead ? 0 : dy;
    knob.style.transform = `translate(${dx * R}px, ${dy * R}px)`;
  };
  zone.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (sid !== null) return;
    const t = e.changedTouches[0];
    sid = t.identifier;
    const zr = zone.getBoundingClientRect();
    R = clampN(Math.min(zr.width, zr.height) * 0.28, 38, 70);
    o = { x: clampN(t.clientX, zr.left + R, zr.right - R), y: clampN(t.clientY, zr.top + R, zr.bottom - R) };
    base.style.setProperty('--r', `${R}px`);
    base.style.left = `${o.x - zr.left}px`;
    base.style.top = `${o.y - zr.top}px`;
    base.classList.add('on');
    move(t);
  }, { passive: false });
  zone.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of e.changedTouches) if (t.identifier === sid) move(t);
  }, { passive: false });
  const end = (e) => { for (const t of e.changedTouches) if (t.identifier === sid) rest(); };
  zone.addEventListener('touchend', end);
  zone.addEventListener('touchcancel', end);

  el.querySelectorAll('button[data-a]').forEach((b) => {
    const a = b.dataset.a;
    b.addEventListener('touchstart', (e) => {
      e.preventDefault();
      b.classList.add('down');
      if (a === 'pause') input.onPause?.();
      else if (a === 'fs') input.onFullscreen?.();
      else input.pressTouch(a);
    }, { passive: false });
    const up = (e) => {
      e.preventDefault();
      b.classList.remove('down');
      if (a !== 'pause' && a !== 'fs') input.releaseTouch(a);
    };
    b.addEventListener('touchend', up, { passive: false });
    b.addEventListener('touchcancel', up, { passive: false });
  });

  // g: { mode, stick:{x,y,w,h}, btns:{x,y,w,h}, sys:{x,y}, b: button size px }
  el.place = (g) => {
    const set = (n, r) => Object.assign(n.style, { left: `${r.x}px`, top: `${r.y}px`, width: `${r.w}px`, height: `${r.h}px` });
    set(zone, g.stick);
    set(btnZone, g.btns);
    el.style.setProperty('--b', `${g.b}px`);
    Object.assign(sys.style, { left: `${g.sys.x}px`, top: `${g.sys.y}px` });
    el.dataset.mode = g.mode;
    R = clampN(Math.min(g.stick.w, g.stick.h) * 0.28, 38, 70);
    base.style.setProperty('--r', `${R}px`);
    rest();
  };
  rest();
  return el;
}
