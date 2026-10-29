// Keyboard, gamepad and touch input. read(i) returns screen-space input for player i:
// { mx, my, pass, shoot, deke, sprint, np, ns, nd } with press counters so taps are never lost.

const MAPS = {
  solo: {
    up: ['KeyW', 'ArrowUp'], down: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
    pass: ['KeyJ', 'KeyZ'], shoot: ['KeyK', 'KeyX'], deke: ['KeyL', 'KeyC'], sprint: ['ShiftLeft', 'ShiftRight', 'Space'],
  },
  p1: {
    up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'],
    pass: ['KeyC'], shoot: ['KeyV'], deke: ['KeyB'], sprint: ['ShiftLeft'],
  },
  p2: {
    up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    pass: ['Comma', 'Numpad1'], shoot: ['Period', 'Numpad2'], deke: ['Slash', 'Numpad3'], sprint: ['ShiftRight', 'Numpad0'],
  },
};
const ACTIONS = ['pass', 'shoot', 'deke'];
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

  maps() { return this.players === 2 ? [MAPS.p1, MAPS.p2] : [MAPS.solo]; }

  key(e, down) {
    if (!this.active) return;
    if (e.target && /INPUT|SELECT|TEXTAREA/.test(e.target.tagName)) return;
    const code = e.code;
    if (down && (code === 'Escape' || code === 'KeyP')) { this.onPause?.(); e.preventDefault(); return; }
    let used = false;
    this.maps().forEach((m, i) => {
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
    pads.forEach((p, idx) => {
      const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
      let mx = p.axes[0] || 0, my = p.axes[1] || 0;
      if (Math.hypot(mx, my) < 0.25) { mx = 0; my = 0; }
      if (b(14)) mx = -1; if (b(15)) mx = 1; if (b(12)) my = -1; if (b(13)) my = 1;
      const st = { mx, my, pass: b(0), shoot: b(1) || b(3), deke: b(2), sprint: b(5) || b(7) || b(4) || b(6), start: b(9) };
      const prev = this.padPrev[p.index] || {};
      const player = this.players === 2 ? Math.min(idx, 1) : 0;
      for (const act of ACTIONS) if (st[act] && !prev[act]) { this.state[player][CNT[act]]++; this.onAny?.(act); }
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
      const down = (act) => m[act].some((c) => this.keys.has(c));
      let mx = (down('right') ? 1 : 0) - (down('left') ? 1 : 0);
      let my = (down('down') ? 1 : 0) - (down('up') ? 1 : 0);
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

// On-screen joystick + buttons for touch devices.
export function mountTouch(root, input) {
  if (!('ontouchstart' in window) && !(navigator.maxTouchPoints > 0)) return null;
  const el = document.createElement('div');
  el.className = 'touch';
  el.innerHTML = `
    <div class="stick"><div class="knob"></div></div>
    <div class="tbtns">
      <button data-a="sprint">SPRINT</button>
      <button data-a="deke">DEKE<br><small>POKE</small></button>
      <button data-a="pass">PASS<br><small>SWITCH</small></button>
      <button data-a="shoot" class="big">SHOOT<br><small>CHECK</small></button>
    </div>
    <button class="tpause" data-a="pause">II</button>`;
  root.appendChild(el);
  const stick = el.querySelector('.stick'), knob = el.querySelector('.knob');
  let sid = null, c0 = null;
  stick.addEventListener('touchstart', (e) => {
    const t = e.changedTouches[0];
    sid = t.identifier;
    const r = stick.getBoundingClientRect();
    c0 = { x: r.left + r.width / 2, y: r.top + r.height / 2, R: r.width / 2 };
    move(t);
    e.preventDefault();
  }, { passive: false });
  const move = (t) => {
    let dx = (t.clientX - c0.x) / c0.R, dy = (t.clientY - c0.y) / c0.R;
    const l = Math.hypot(dx, dy);
    if (l > 1) { dx /= l; dy /= l; }
    input.touch.mx = Math.abs(dx) < 0.2 ? 0 : dx;
    input.touch.my = Math.abs(dy) < 0.2 ? 0 : dy;
    knob.style.transform = `translate(${dx * 40}px, ${dy * 40}px)`;
  };
  stick.addEventListener('touchmove', (e) => {
    for (const t of e.changedTouches) if (t.identifier === sid) move(t);
    e.preventDefault();
  }, { passive: false });
  const end = (e) => {
    for (const t of e.changedTouches) if (t.identifier === sid) {
      sid = null; input.touch.mx = 0; input.touch.my = 0; knob.style.transform = '';
    }
  };
  stick.addEventListener('touchend', end);
  stick.addEventListener('touchcancel', end);
  el.querySelectorAll('button[data-a]').forEach((b) => {
    const a = b.dataset.a;
    b.addEventListener('touchstart', (e) => {
      e.preventDefault();
      if (a === 'pause') input.onPause?.();
      else input.pressTouch(a);
    }, { passive: false });
    b.addEventListener('touchend', (e) => { e.preventDefault(); if (a !== 'pause') input.releaseTouch(a); }, { passive: false });
  });
  return el;
}
