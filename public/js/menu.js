// Console-style menu navigation: a blinking cursor moved with arrows / d-pad,
// confirm with Enter/Space/A, back with Esc/Backspace/B. Mouse and touch still work.
//
// Elements opt in by having data-act (or class "mi"). Per-element overrides:
//   data-left / data-right / data-up / data-down = action name to run instead of moving.
// Screens can set nav.back (function) and nav.page (function(dir)) for left/right paging.

const DIRS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right' };

export class Nav {
  constructor({ run, sound, isActive }) {
    this.run = run;           // run(actionName, el, dataset)
    this.sound = sound;       // sound(name)
    this.isActive = isActive; // () => bool
    this.cur = null;
    this.key = null;
    this.back = null;
    this.page = null;
    this.onFocus = null;
    this.pad = {};
    this.repeatAt = 0;
    window.addEventListener('keydown', (e) => this.keydown(e));
    document.addEventListener('mousemove', (e) => {
      const el = e.target.closest?.('[data-act], .mi');
      if (el && el !== this.cur && this.items().includes(el)) this.focus(el, false);
    });
    requestAnimationFrame(() => this.pollPads());
  }

  items(root = document) {
    const scope = root.querySelector('.modal:not(.hidden)') || root.getElementById?.('app') || root;
    return [...scope.querySelectorAll('[data-act], .mi')].filter((el) => {
      if (el.disabled || el.closest('.hidden')) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });
  }

  static keyOf(el) {
    return el ? JSON.stringify(el.dataset) + (el.id || '') : null;
  }

  // Call after every render. Keeps the cursor on the "same" item if it still exists.
  // prefer: selector to force; fallback: selector used only when the old cursor item is gone.
  refresh({ back = null, page = null, prefer = null, fallback = null } = {}) {
    this.back = back;
    this.page = page;
    const items = this.items();
    let el = null;
    if (prefer) el = items.find((x) => x.matches(prefer));
    if (!el && this.key) el = items.find((x) => Nav.keyOf(x) === this.key);
    if (!el && fallback) el = items.find((x) => x.matches(fallback));
    if (!el) el = items.find((x) => x.classList.contains('default') || x.dataset.default) || items[0];
    if (el) this.focus(el, false);
    else this.cur = null;
  }

  focus(el, sound = true) {
    if (this.cur) this.cur.classList.remove('nav-focus');
    this.cur = el;
    this.key = Nav.keyOf(el);
    el.classList.add('nav-focus');
    if (el.tagName === 'INPUT') el.focus({ preventScroll: true });
    else if (document.activeElement && document.activeElement.tagName === 'INPUT') document.activeElement.blur();
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView({ block: 'nearest' });
    if (sound) this.sound('blip');
    this.onFocus?.(el);
  }

  move(dir) {
    const el = this.cur && document.contains(this.cur) ? this.cur : null;
    if (el && el.dataset[dir]) { this.run(el.dataset[dir], el, el.dataset); return; }
    if ((dir === 'left' || dir === 'right') && this.page) { this.page(dir === 'left' ? -1 : 1); return; }
    const items = this.items();
    if (!el) { if (items[0]) this.focus(items[0]); return; }
    const a = el.getBoundingClientRect();
    // Edge-based spatial search: distance along the direction, plus the gap between the
    // two boxes across it (0 when they overlap). Ties go to the top-left item.
    const gap = (lo1, hi1, lo2, hi2) => Math.max(0, lo2 - hi1, lo1 - hi2);
    let best = null, bs = Infinity;
    for (const b of items) {
      if (b === el) continue;
      const r = b.getBoundingClientRect();
      let main, side;
      if (dir === 'up') { main = a.top - r.bottom; side = gap(a.left, a.right, r.left, r.right); }
      else if (dir === 'down') { main = r.top - a.bottom; side = gap(a.left, a.right, r.left, r.right); }
      else if (dir === 'left') { main = a.left - r.right; side = gap(a.top, a.bottom, r.top, r.bottom); }
      else { main = r.left - a.right; side = gap(a.top, a.bottom, r.top, r.bottom); }
      if (main < -4) continue;
      const s = Math.max(0, main) + side * 3 + (r.left + r.top) * 0.001;
      if (s < bs) { bs = s; best = b; }
    }
    if (best) this.focus(best);
  }

  activate() {
    const el = this.cur;
    if (!el || !document.contains(el)) return;
    if (el.tagName === 'INPUT') { const go = el.dataset.enter; if (go) this.run(go, el, el.dataset); return; }
    el.click();
  }

  goBack() {
    if (this.back) { this.sound('blip'); this.back(); }
  }

  keydown(e) {
    if (!this.isActive()) return;
    const c = e.code;
    if (e.target && e.target.tagName === 'INPUT') {
      if (c === 'ArrowUp' || c === 'ArrowDown') { e.preventDefault(); this.move(DIRS[c]); }
      else if (c === 'Enter') { e.preventDefault(); this.activate(); }
      else if (c === 'Escape') { e.preventDefault(); this.goBack(); }
      return;
    }
    const typing = !!this.cur?.dataset.type;
    if (typing && /^Key[A-Z]$/.test(c)) {
      e.preventDefault();
      this.run(this.cur.dataset.type, this.cur, { ...this.cur.dataset, letter: c.slice(3) });
      return;
    }
    const dir = c.startsWith('Arrow') || !typing ? DIRS[c] : null;
    if (dir) { e.preventDefault(); this.move(dir); return; }
    if (c === 'Enter' || c === 'Space' || c === 'KeyJ' || c === 'KeyZ') { e.preventDefault(); this.activate(); return; }
    if (c === 'Escape' || c === 'Backspace' || c === 'KeyK' || c === 'KeyX') { e.preventDefault(); this.goBack(); }
  }

  pollPads() {
    requestAnimationFrame(() => this.pollPads());
    if (!navigator.getGamepads || !this.isActive()) return;
    const now = performance.now();
    for (const p of navigator.getGamepads()) {
      if (!p) continue;
      const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
      const ax = p.axes[0] || 0, ay = p.axes[1] || 0;
      const dir = b(12) || ay < -0.6 ? 'up' : b(13) || ay > 0.6 ? 'down' : b(14) || ax < -0.6 ? 'left' : b(15) || ax > 0.6 ? 'right' : null;
      const prev = this.pad[p.index] || {};
      if (dir && (dir !== prev.dir || now > this.repeatAt)) {
        this.move(dir);
        this.repeatAt = now + (dir !== prev.dir ? 380 : 130);
      }
      if ((b(0) || b(9)) && !(prev.a || prev.start)) this.activate();
      if (b(1) && !prev.b) this.goBack();
      this.pad[p.index] = { dir, a: b(0), b: b(1), start: b(9) };
    }
  }
}
