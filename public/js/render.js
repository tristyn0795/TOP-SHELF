// Pixel renderer: NHL '94-style vertical scrolling rink on a 400x300 canvas.
// World +x (team 0's attack) is screen up; world +y is screen right. `flip` rotates 180°.
import { R } from '/shared/engine.js';

export const W = 400, H = 300, S = 4;
const M = 24; // margin above/below the rink in the pre-rendered sheet
const SHEET_H = 200 * S + M * 2;

// ---------------------------------------------------------------- bitmap font (5x7)
const GLYPHS = {
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14],
  D: [30, 17, 17, 17, 17, 17, 30], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 17, 10, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  0: [14, 17, 19, 21, 25, 17, 14], 1: [4, 12, 4, 4, 4, 4, 14], 2: [14, 17, 1, 2, 4, 8, 31],
  3: [31, 2, 4, 2, 1, 17, 14], 4: [2, 6, 10, 18, 31, 2, 2], 5: [31, 16, 30, 1, 1, 17, 14],
  6: [6, 8, 16, 30, 17, 17, 14], 7: [31, 1, 2, 4, 8, 8, 8], 8: [14, 17, 17, 14, 17, 17, 14],
  9: [14, 17, 17, 15, 1, 2, 12],
  ':': [0, 12, 12, 0, 12, 12, 0], '.': [0, 0, 0, 0, 0, 12, 12], '!': [4, 4, 4, 4, 4, 0, 4],
  '-': [0, 0, 0, 31, 0, 0, 0], "'": [4, 4, 8, 0, 0, 0, 0], '#': [10, 10, 31, 10, 31, 10, 10],
  '/': [1, 1, 2, 4, 8, 16, 16], '&': [12, 18, 20, 8, 21, 18, 13], '?': [14, 17, 1, 2, 4, 0, 4],
  '+': [0, 4, 4, 31, 4, 4, 0], ',': [0, 0, 0, 0, 12, 4, 8], '(': [2, 4, 8, 8, 8, 4, 2],
  ')': [8, 4, 2, 2, 2, 4, 8], ' ': [0, 0, 0, 0, 0, 0, 0], '%': [24, 25, 2, 4, 8, 19, 3],
  '*': [0, 4, 21, 14, 21, 4, 0],
};

export function textWidth(str, scale = 1) {
  return str.length * 6 * scale - scale;
}

export function drawText(ctx, str, x, y, color, scale = 1, align = 'left', shadow = null) {
  str = String(str).toUpperCase();
  let x0 = Math.round(align === 'center' ? x - textWidth(str, scale) / 2 : align === 'right' ? x - textWidth(str, scale) : x);
  y = Math.round(y);
  if (shadow) drawText(ctx, str, x0 + scale, y + scale, shadow, scale, 'left');
  ctx.fillStyle = color;
  for (const ch of str) {
    const g = GLYPHS[ch] || GLYPHS['?'];
    for (let r = 0; r < 7; r++) {
      const row = g[r];
      if (!row) continue;
      for (let c = 0; c < 5; c++) if (row & (16 >> c)) ctx.fillRect(x0 + c * scale, y + r * scale, scale, scale);
    }
    x0 += 6 * scale;
  }
}

// ---------------------------------------------------------------- color helpers
function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function shade(h, f) {
  const [r, g, b] = hexToRgb(h);
  const m = (v) => Math.max(0, Math.min(255, Math.round(f >= 0 ? v + (255 - v) * f : v * (1 + f))));
  return `rgb(${m(r)},${m(g)},${m(b)})`;
}
function lum(h) {
  const [r, g, b] = hexToRgb(h);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}
// pick a readable jersey trim against the ice
function jerseyColors(t) {
  const main = t.primary;
  const trim = Math.abs(lum(t.primary) - lum(t.secondary)) < 0.2 ? (lum(main) > 0.5 ? '#111111' : '#ffffff') : t.secondary;
  const body = lum(main) > 0.85 ? shade(main, -0.25) : main;
  return { body, trim, dark: shade(main, -0.45) };
}

// ---------------------------------------------------------------- rink sheet

// world -> sheet pixel (host orientation)
const shX = (y) => 200 + y * S;
const shY = (x) => M + (100 - x) * S;

function iceHalfWidth(x) {
  const ax = Math.abs(x), cxL = R.L - R.CR, cyL = R.W - R.CR;
  if (ax <= cxL) return R.W;
  const d = ax - cxL;
  if (d >= R.CR) return 0;
  return cyL + Math.sqrt(R.CR * R.CR - d * d);
}

function plotCircle(ctx, cx, cy, r, color, fill = false) {
  ctx.fillStyle = color;
  let x = r, y = 0, err = 1 - r;
  while (x >= y) {
    if (fill) {
      ctx.fillRect(cx - x, cy + y, x * 2 + 1, 1); ctx.fillRect(cx - x, cy - y, x * 2 + 1, 1);
      ctx.fillRect(cx - y, cy + x, y * 2 + 1, 1); ctx.fillRect(cx - y, cy - x, y * 2 + 1, 1);
    } else {
      for (const [a, b] of [[x, y], [y, x], [-x, y], [-y, x], [x, -y], [y, -x], [-x, -y], [-y, -x]]) ctx.fillRect(cx + a, cy + b, 1, 1);
    }
    y++;
    if (err < 0) err += 2 * y + 1;
    else { x--; err += 2 * (y - x) + 1; }
  }
}

function buildSheet(home, away, excited) {
  const c = document.createElement('canvas');
  c.width = W; c.height = SHEET_H;
  const g = c.getContext('2d');
  // crowd
  g.fillStyle = '#0d1020';
  g.fillRect(0, 0, W, SHEET_H);
  const palette = [home.primary, home.secondary, home.primary, '#e8e2d0', '#c9a27c', '#8a5a3c', '#f2d7b6', away.primary, '#555b70', '#ffffff'];
  let seed = excited ? 7 : 3;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let y = 2; y < SHEET_H; y += 4) {
    for (let x = 1; x < W; x += 4) {
      const ice = iceHalfWidth(100 - (y - M) / S);
      const inRink = y > M - 6 && y < SHEET_H - M + 6 && Math.abs(x - 200) < ice * S + 8;
      if (inRink) continue;
      if (rnd() < 0.12) continue;
      g.fillStyle = palette[Math.floor(rnd() * palette.length)];
      const jump = excited && rnd() < 0.6 ? -1 : 0;
      g.fillRect(x, y + jump, 3, 2);
      g.fillStyle = '#e9c9a8';
      g.fillRect(x + 1, y - 1 + jump, 1, 1);
    }
  }
  // benches (world y = -42.5 side, screen left) and penalty boxes (right)
  for (const [t, wx] of [[0, -18], [1, 18]]) {
    const col = t === 0 ? home : away;
    g.fillStyle = '#1b2236';
    g.fillRect(2, shY(wx + 12), 24, 24 * S);
    g.fillStyle = col.primary;
    g.fillRect(2, shY(wx + 12), 3, 24 * S);
    g.fillStyle = '#1b2236';
    g.fillRect(W - 26, shY(wx / 3 + 4), 24, 8 * S);
    g.fillStyle = '#7a1020';
    g.fillRect(W - 5, shY(wx / 3 + 4), 3, 8 * S);
  }
  // boards + ice
  for (let py = M - 3; py < SHEET_H - M + 3; py++) {
    const x = 100 - (py - M) / S;
    const hw = iceHalfWidth(Math.max(-100, Math.min(100, x)));
    const edge = Math.abs(x) > 100 ? 0 : hw;
    if (edge <= 0) continue;
    const half = Math.round(edge * S);
    g.fillStyle = '#d7dde8';
    g.fillRect(200 - half - 3, py, half * 2 + 6, 1);
    g.fillStyle = '#f2c94c';
    g.fillRect(200 - half - 1, py, half * 2 + 2, 1);
    g.fillStyle = '#eef5fc';
    g.fillRect(200 - half, py, half * 2, 1);
  }
  // top/bottom board caps
  g.fillStyle = '#d7dde8';
  // ice scratches
  for (let i = 0; i < 900; i++) {
    const x = (rnd() - 0.5) * 2 * 98, y = (rnd() - 0.5) * 2 * 40;
    if (Math.abs(y) > iceHalfWidth(x) - 1) continue;
    g.fillStyle = rnd() < 0.5 ? '#e1ebf5' : '#f8fbff';
    g.fillRect(shX(y), shY(x), rnd() < 0.5 ? 2 : 1, 1);
  }
  const lineAcross = (wx, color, thick) => {
    const hw = iceHalfWidth(wx);
    g.fillStyle = color;
    g.fillRect(Math.round(shX(-hw)), Math.round(shY(wx) - thick / 2), Math.round(hw * 2 * S), thick);
  };
  // center logo
  const logoR = 11 * S;
  plotCircle(g, 200, shY(0), logoR, shade(home.primary, 0.82), true);
  plotCircle(g, 200, shY(0), logoR, shade(home.primary, 0.55));
  drawText(g, home.abbr, 200, shY(0) - 7, shade(home.primary, 0.55), 2, 'center');
  // lines
  lineAcross(0, '#d6283a', 4);
  lineAcross(25, '#2a5bd7', 4);
  lineAcross(-25, '#2a5bd7', 4);
  lineAcross(R.GX, '#d6283a', 1);
  lineAcross(-R.GX, '#d6283a', 1);
  // trapezoids behind nets
  g.fillStyle = '#d6283a';
  for (const sg of [-1, 1]) {
    for (let x = R.GX; x <= 100; x += 0.25) {
      const w = 11 + ((x - R.GX) / (100 - R.GX)) * 3;
      if (Math.abs(w) > iceHalfWidth(sg * x)) break;
      g.fillRect(Math.round(shX(-w)), Math.round(shY(sg * x)), 1, 1);
      g.fillRect(Math.round(shX(w)), Math.round(shY(sg * x)), 1, 1);
    }
  }
  // circles
  plotCircle(g, 200, shY(0), 15 * S, '#2a5bd7');
  plotCircle(g, 200, shY(0), 2, '#2a5bd7', true);
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      const cx = shX(sy * R.DOTY), cy = shY(sx * R.DOTX);
      plotCircle(g, cx, cy, 15 * S, '#d6283a');
      plotCircle(g, cx, cy, 4, '#d6283a', true);
      g.fillStyle = '#d6283a';
      for (const hx of [-1, 1]) for (const hy of [-1, 1]) g.fillRect(cx + hx * 8, cy + hy * 3, hx * 8, 1);
      plotCircle(g, shX(sy * R.DOTY), shY(sx * 20), 4, '#d6283a', true);
    }
  }
  // creases
  for (const sg of [-1, 1]) {
    const gy = shY(sg * R.GX);
    for (let r = 0; r <= R.CREASE * S; r++) {
      const hw = Math.sqrt((R.CREASE * S) ** 2 - r * r);
      const yy = gy + sg * r;
      g.fillStyle = '#8fcaf5';
      g.fillRect(Math.round(200 - hw), yy, Math.round(hw * 2), 1);
    }
    for (let a = 0; a <= Math.PI; a += 0.01) {
      g.fillStyle = '#d6283a';
      g.fillRect(Math.round(200 + Math.cos(a) * R.CREASE * S), Math.round(gy + sg * Math.sin(a) * R.CREASE * S), 1, 1);
    }
  }
  return c;
}

// ---------------------------------------------------------------- renderer

export class Renderer {
  /**
   * meta: { teams: [teamDef0, teamDef1] (team 0 attacks up), homeIdx, flip, ctlColors: ['#ffd400', '#33e0ff'] }
   */
  constructor(canvas, meta) {
    this.c = canvas;
    this.h = H;
    canvas.width = W; canvas.height = H;
    this.g = canvas.getContext('2d');
    this.g.imageSmoothingEnabled = false;
    this.meta = meta;
    this.flip = !!meta.flip;
    this.cx = 0;
    const home = meta.teams[meta.homeIdx ?? 1], away = meta.teams[1 - (meta.homeIdx ?? 1)];
    this.sheets = [buildSheet(home, away, false), buildSheet(home, away, true)];
    this.jc = meta.teams.map(jerseyColors);
    this.trail = [];
    this.stride = new Map();
    this.excite = 0;
    this.t = 0;
    this.ctlColors = meta.ctlColors || ['#ffd400', '#33e0ff'];
  }

  resize(h) {
    if (h === this.h) return;
    this.h = h;
    this.c.height = h;
    this.g.imageSmoothingEnabled = false;
  }

  setExcited(sec) { this.excite = Math.max(this.excite, sec); }

  // world -> screen
  sx(y) { return W / 2 + (this.flip ? -1 : 1) * y * S + this.ox; }
  sy(x) { return this.h / 2 - (this.flip ? -1 : 1) * (x - this.cx) * S + this.oy; }
  // world facing angle -> screen direction vector
  dir(a) { const f = this.flip ? -1 : 1; return [f * Math.sin(a), -f * Math.cos(a)]; }

  draw(snap, dt, opts = {}) {
    const g = this.g;
    this.t += dt;
    if (this.excite > 0) this.excite -= dt;
    // camera follows the puck
    const [px, , ] = snap.pk;
    const lim = 100 + 4 - this.h / 2 / S;
    const target = Math.max(-lim, Math.min(lim, px));
    if (opts.snapCamera) this.cx = target;
    else this.cx += (target - this.cx) * Math.min(1, dt * 6);
    const shk = snap.shk || 0;
    this.ox = shk > 0 ? Math.round((Math.random() - 0.5) * shk * 14) : 0;
    this.oy = shk > 0 ? Math.round((Math.random() - 0.5) * shk * 14) : 0;

    // rink background
    const sheet = this.sheets[this.excite > 0 && Math.floor(this.t * 8) % 2 ? 1 : 0];
    const srcY = Math.round(M + (100 - this.cx) * S - this.h / 2);
    g.save();
    if (this.flip) g.setTransform(-1, 0, 0, -1, W, this.h);
    g.drawImage(sheet, 0, srcY - (this.flip ? -this.oy : this.oy), W, this.h, this.flip ? -this.ox : this.ox, 0, W, this.h);
    g.restore();

    this.drawNets();

    // goalies
    snap.g.forEach((gl, i) => this.drawGoalie(gl, i));

    // skaters (sorted so lower-on-screen draws last)
    const sk = snap.sk.slice().sort((a, b) => this.sy(a[2]) - this.sy(b[2]));
    const ctl = snap.ctl || [];
    for (const k of sk) this.drawSkater(k, ctl.indexOf(k[0]), dt);

    this.drawPuck(snap);
    // a quick ring pops on the skater you just switched to
    this.lastCtl ||= [];
    this.pulse ||= [];
    ctl.forEach((id, ci) => {
      if (this.lastCtl[ci] !== undefined && this.lastCtl[ci] !== id && !opts.replay) this.pulse[ci] = 0.3;
      this.lastCtl[ci] = id;
      if (this.pulse[ci] > 0) this.pulse[ci] -= dt;
    });
    for (const k of sk) {
      const ci = ctl.indexOf(k[0]);
      if (ci >= 0) this.drawMarker(k, ci);
    }
    this.drawHud(snap, opts);
  }

  drawNets() {
    const g = this.g;
    for (const sg of [-1, 1]) {
      const x0 = sg * R.GX, x1 = sg * (R.GX + R.ND);
      const ax = Math.round(Math.min(this.sx(-R.NW), this.sx(R.NW)));
      const bx = Math.round(Math.max(this.sx(-R.NW), this.sx(R.NW)));
      const ay = Math.round(Math.min(this.sy(x0), this.sy(x1)));
      const by = Math.round(Math.max(this.sy(x0), this.sy(x1)));
      if (by < -20 || ay > this.h + 20) continue;
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(ax + 2, ay + 2, bx - ax, by - ay);
      for (let y = ay; y < by; y++) for (let x = ax; x < bx; x++) {
        if ((x + y) % 2 === 0) { g.fillStyle = '#ffffff'; g.fillRect(x, y, 1, 1); }
        else { g.fillStyle = '#b9c3d1'; g.fillRect(x, y, 1, 1); }
      }
      g.fillStyle = '#d0202f';
      g.fillRect(ax - 1, ay, 2, by - ay);
      g.fillRect(bx - 1, ay, 2, by - ay);
      const back = this.sy(x1);
      g.fillRect(ax - 1, Math.round(back) - 1, bx - ax + 2, 2);
    }
  }

  drawSkater(k, ctlIdx, dt) {
    const [id, team, x, y, a, num, flags, energy, charge] = k;
    const g = this.g;
    const X = Math.round(this.sx(y)), Y = Math.round(this.sy(x));
    if (X < -20 || X > W + 20 || Y < -20 || Y > this.h + 20) return;
    const jc = this.jc[team];
    const [dx, dy] = this.dir(a);
    const px = -dy, py = dx; // perpendicular (stick hand side)
    const prev = this.stride.get(id) || { x, y, ph: 0 };
    const moved = Math.hypot(x - prev.x, y - prev.y);
    prev.ph += moved * 0.9;
    prev.x = x; prev.y = y;
    this.stride.set(id, prev);
    const stun = flags & 1;
    // shadow
    g.fillStyle = 'rgba(20,30,60,0.25)';
    g.fillRect(X - 5, Y + 3, 12, 4);
    if (stun) {
      g.fillStyle = jc.body;
      g.fillRect(X - 7, Y - 3, 14, 7);
      g.fillStyle = jc.trim;
      g.fillRect(X - 7, Y, 14, 2);
      g.fillStyle = '#111';
      g.fillRect(X + 5, Y - 2, 4, 4);
      const s = this.t * 8;
      g.fillStyle = '#ffe14d';
      g.fillRect(Math.round(X + Math.cos(s) * 5), Math.round(Y - 6 + Math.sin(s) * 2), 1, 1);
      g.fillRect(Math.round(X - Math.cos(s) * 5), Math.round(Y - 6 - Math.sin(s) * 2), 1, 1);
      return;
    }
    // skates (stride)
    const ph = Math.sin(prev.ph);
    g.fillStyle = '#222';
    g.fillRect(Math.round(X - dx * 4 + px * 3 + dx * ph * 2.5) - 1, Math.round(Y - dy * 4 + py * 3 + dy * ph * 2.5) - 1, 3, 3);
    g.fillRect(Math.round(X - dx * 4 - px * 3 - dx * ph * 2.5) - 1, Math.round(Y - dy * 4 - py * 3 - dy * ph * 2.5) - 1, 3, 3);
    // lunge streaks
    if (flags & 2) {
      g.fillStyle = 'rgba(255,255,255,0.8)';
      for (let i = 1; i <= 3; i++) g.fillRect(Math.round(X - dx * (5 + i * 2) + px * (i - 2) * 2), Math.round(Y - dy * (5 + i * 2) + py * (i - 2) * 2), 2, 1);
    }
    // stick
    const reach = flags & 4 ? 17 : 11;
    const hx = X + px * 4, hy = Y + py * 4;
    const bx = X + dx * reach + px * 3, by = Y + dy * reach + py * 3;
    this.line(hx, hy, bx, by, '#c8a165');
    this.line(hx + 1, hy, bx + 1, by, '#a07a45');
    this.line(bx, by, bx - px * 4, by - py * 4, '#1a1a1a');
    // body
    plotCircle(g, X, Y, 5, '#000000', false);
    plotCircle(g, X, Y, 5, jc.body, true);
    plotCircle(g, X, Y, 5, jc.dark, false);
    g.fillStyle = jc.trim;
    for (const sd of [1, -1]) g.fillRect(Math.round(X + px * 4.5 * sd) - 1, Math.round(Y + py * 4.5 * sd) - 1, 3, 3);
    // helmet
    plotCircle(g, Math.round(X + dx * 0.8), Math.round(Y + dy * 0.8), 3, jc.dark, true);
    g.fillStyle = '#ffffff';
    g.fillRect(Math.round(X + dx * 3) , Math.round(Y + dy * 3), 1, 1);
    g.fillStyle = jc.trim;
    g.fillRect(Math.round(X - dx * 0.5), Math.round(Y - dy * 0.5), 1, 1);
    // slap shot charge meter
    if (charge >= 0) {
      g.fillStyle = '#000';
      g.fillRect(X - 8, Y - 14, 16, 4);
      g.fillStyle = charge > 0.85 ? '#ff3b3b' : '#ffd400';
      g.fillRect(X - 7, Y - 13, Math.round(14 * charge), 2);
    }
  }

  drawMarker(k, ci) {
    const g = this.g;
    const [, , x, y, , num, , energy] = k;
    let X = Math.round(this.sx(y)), Y = Math.round(this.sy(x));
    const col = this.ctlColors[ci] || '#fff';
    const off = X < 4 || X > W - 4 || Y < 4 || Y > this.h - 4;
    if (off) {
      X = Math.max(6, Math.min(W - 6, X)); Y = Math.max(10, Math.min(this.h - 6, Y));
      g.fillStyle = col;
      g.fillRect(X - 3, Y - 3, 6, 6);
      return;
    }
    const pl = this.pulse?.[ci] || 0;
    if (pl > 0) {
      const r = Math.round(5 + (1 - pl / 0.3) * 9);
      g.globalAlpha = Math.min(1, pl / 0.15);
      g.fillStyle = col;
      g.fillRect(X - r, Y - r, r * 2, 1); g.fillRect(X - r, Y + r, r * 2 + 1, 1);
      g.fillRect(X - r, Y - r, 1, r * 2); g.fillRect(X + r, Y - r, 1, r * 2);
      g.globalAlpha = 1;
    }
    const bob = Math.round(Math.sin(this.t * 8));
    // NHL '94 style star under the player
    g.fillStyle = col;
    g.fillRect(X - 2, Y + 8, 5, 1);
    g.fillRect(X, Y + 6, 1, 5);
    // arrow + number above
    g.fillRect(X - 3, Y - 12 + bob, 7, 1);
    g.fillRect(X - 2, Y - 11 + bob, 5, 1);
    g.fillRect(X - 1, Y - 10 + bob, 3, 1);
    g.fillRect(X, Y - 9 + bob, 1, 1);
    drawText(g, String(num), X, Y - 21 + bob, col, 1, 'center', '#000');
    // energy pips
    g.fillStyle = '#000';
    g.fillRect(X - 7, Y + 12, 14, 3);
    g.fillStyle = energy > 5 ? '#4cd964' : energy > 2 ? '#ffd400' : '#ff3b3b';
    g.fillRect(X - 6, Y + 13, Math.max(1, Math.round((energy / 9) * 12)), 1);
  }

  drawGoalie(gl, team) {
    const [x, y, a, flags] = gl;
    const g = this.g;
    const X = Math.round(this.sx(y)), Y = Math.round(this.sy(x));
    if (Y < -20 || Y > this.h + 20) return;
    const jc = this.jc[team];
    const [dx, dy] = this.dir(a);
    const px = -dy, py = dx;
    const down = flags & 1;
    g.fillStyle = 'rgba(20,30,60,0.25)';
    g.fillRect(X - 8, Y + 4, 17, 4);
    // pads
    const spread = down ? 9 : 5;
    for (const sd of [-1, 1]) {
      const cx = Math.round(X + px * spread * sd + dx * 3), cy = Math.round(Y + py * spread * sd + dy * 3);
      g.fillStyle = '#222';
      g.fillRect(cx - 3, cy - 3, 7, 7);
      g.fillStyle = '#f4f4f4';
      g.fillRect(cx - 2, cy - 2, 5, 5);
      g.fillStyle = jc.trim === '#ffffff' ? jc.body : jc.trim;
      g.fillRect(cx - 2, cy, 5, 1);
    }
    plotCircle(g, X, Y, 6, jc.body, true);
    plotCircle(g, X, Y, 6, jc.dark, false);
    g.fillStyle = jc.trim;
    g.fillRect(X - 5, Y, 11, 2);
    // glove + blocker
    g.fillStyle = flags & 2 ? '#ffe14d' : '#e8d9a8';
    g.fillRect(Math.round(X - px * 7 + dx * 3) - 2, Math.round(Y - py * 7 + dy * 3) - 2, 4, 4);
    g.fillStyle = '#ffffff';
    g.fillRect(Math.round(X + px * 7 + dx * 3) - 1, Math.round(Y + py * 7 + dy * 3) - 2, 3, 4);
    // mask
    plotCircle(g, Math.round(X + dx), Math.round(Y + dy), 3, '#f2f2f2', true);
    g.fillStyle = '#333';
    g.fillRect(Math.round(X + dx * 3) - 1, Math.round(Y + dy * 3), 2, 1);
  }

  drawPuck(snap) {
    const g = this.g;
    const [x, y, z] = snap.pk;
    const X = Math.round(this.sx(y)), Y = Math.round(this.sy(x));
    this.trail.push([X, Y - z * 2.5]);
    if (this.trail.length > 6) this.trail.shift();
    const [ox, oy] = this.trail[0];
    const fast = Math.hypot(X - ox, Y - z * 2.5 - oy) > 25;
    if (fast) {
      this.trail.forEach(([tx, ty], i) => {
        g.fillStyle = `rgba(40,40,60,${0.08 + i * 0.06})`;
        g.fillRect(Math.round(tx), Math.round(ty), 2, 2);
      });
    }
    if (z > 0.2) {
      g.fillStyle = 'rgba(20,30,60,0.3)';
      g.fillRect(X - 1, Y, 3, 2);
    }
    g.fillStyle = '#0a0a0a';
    g.fillRect(X - 1, Math.round(Y - z * 2.5) - 1, 3, 2);
  }

  line(x0, y0, x1, y1, color) {
    const g = this.g;
    g.fillStyle = color;
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy;
    for (let i = 0; i < 64; i++) {
      g.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x0 += sx; }
      if (e2 <= dx) { err += dx; y0 += sy; }
    }
  }

  drawHud(snap, opts) {
    const g = this.g;
    const T = this.meta.teams;
    // scoreboard: away on top, home below (NHL '94 style box)
    const hi = this.meta.homeIdx ?? 1;
    const order = [1 - hi, hi];
    g.fillStyle = 'rgba(8,10,24,0.88)';
    g.fillRect(4, 4, 74, 25);
    order.forEach((t, row) => {
      const y = 7 + row * 11;
      g.fillStyle = T[t].primary;
      g.fillRect(7, y, 4, 7);
      drawText(g, T[t].abbr, 14, y, '#ffffff');
      drawText(g, String(snap.sc[t]), 74, y, '#ffd400', 1, 'right');
      if (snap.box[1 - t].length > snap.box[t].length && snap.ph !== 'shootout') drawText(g, 'PP', 40, y, '#4cd964');
    });
    // clock box
    g.fillStyle = 'rgba(8,10,24,0.88)';
    g.fillRect(W - 78, 4, 74, 25);
    const per = snap.ph === 'shootout' ? 'SO' : snap.per <= 3 ? ['1ST', '2ND', '3RD'][snap.per - 1] : snap.per === 4 ? 'OT' : `${snap.per - 3}OT`;
    drawText(g, per, W - 74, 7, '#ffffff');
    const m = Math.floor(snap.clk / 60), s = snap.clk % 60;
    drawText(g, snap.ph === 'shootout' ? '--:--' : `${m}:${String(s).padStart(2, '0')}`, W - 8, 7, '#ffd400', 1, 'right');
    drawText(g, `SOG ${snap.sh[order[0]]}-${snap.sh[order[1]]}`, W - 74, 18, '#8fa0c0');
    // penalty clocks
    let py = 32;
    for (const t of [0, 1]) {
      for (const b of snap.box[t]) {
        g.fillStyle = 'rgba(120,10,20,0.85)';
        g.fillRect(4, py, 74, 10);
        drawText(g, `${T[t].abbr} #${b[0]}`, 7, py + 2, '#fff');
        drawText(g, `${Math.floor(b[1] / 60)}:${String(b[1] % 60).padStart(2, '0')}`, 76, py + 2, '#ffd400', 1, 'right');
        py += 11;
      }
    }
    // shootout tracker
    if (snap.so) {
      g.fillStyle = 'rgba(8,10,24,0.88)';
      g.fillRect(W / 2 - 60, 4, 120, 25);
      [0, 1].forEach((t, row) => {
        drawText(g, T[t].abbr, W / 2 - 56, 7 + row * 11, '#fff');
        const shots = snap.so.log.filter((l) => l[0] === t);
        shots.forEach((l, i) => {
          g.fillStyle = l[1] ? '#4cd964' : '#ff3b3b';
          g.fillRect(W / 2 - 30 + i * 9, 7 + row * 11, 6, 6);
        });
      });
    }
    // banner
    if (snap.ban) this.drawBanner(snap.ban, snap.t);
    if (opts.board && opts.board.length) this.drawBoard(opts.board);
    if (opts.replay) {
      g.fillStyle = '#000';
      g.fillRect(0, 0, W, 6); g.fillRect(0, this.h - 6, W, 6);
      if (Math.floor(this.t * 2) % 2) drawText(g, 'REPLAY', W / 2, this.h - 22, '#ff3b3b', 2, 'center', '#000');
    }
    if (opts.speed && opts.speed > 1) drawText(g, `${opts.speed}X`, W - 8, this.h - 12, '#ffd400', 1, 'right', '#000');
  }

  // Between periods: other games around the league, like an arena out-of-town board.
  drawBoard(rows) {
    const g = this.g;
    const cols = rows.length > 8 ? 2 : 1;
    const per = Math.ceil(rows.length / cols);
    const w = cols === 2 ? 360 : 180, h = 22 + per * 10;
    const x0 = Math.round(W / 2 - w / 2), y0 = Math.min(this.h - h - 8, Math.round(this.h / 2 + 22));
    g.fillStyle = '#000';
    g.fillRect(x0 - 2, y0 - 2, w + 4, h + 4);
    g.fillStyle = '#10204e';
    g.fillRect(x0, y0, w, h);
    g.fillStyle = '#e8202c';
    g.fillRect(x0, y0 + 13, w, 1);
    drawText(g, 'AROUND THE LEAGUE', W / 2, y0 + 4, '#f8e000', 1, 'center');
    rows.forEach((r, i) => {
      const cx = x0 + 6 + Math.floor(i / per) * (w / cols);
      const cy = y0 + 18 + (i % per) * 10;
      drawText(g, r.a, cx, cy, '#ffffff');
      drawText(g, String(r.as), cx + 30, cy, '#f8e000');
      drawText(g, r.h, cx + 44, cy, '#ffffff');
      drawText(g, String(r.hs), cx + 74, cy, '#f8e000');
      drawText(g, r.status, cx + 88, cy, '#8fb0ff');
    });
  }

  drawBanner(b, now) {
    const g = this.g;
    const age = now - b.t;
    const inT = Math.min(1, age / 0.15);
    const scale = b.text.length > 12 ? 2 : 3;
    const y = this.h / 2 - 30;
    const w = Math.min(W, textWidth(b.text, scale) + 30);
    const col = b.team >= 0 ? this.meta.teams[b.team].primary : '#1a2a6c';
    g.fillStyle = col;
    g.fillRect(Math.round(W / 2 - (w / 2) * inT), y - 6, Math.round(w * inT), 7 * scale + 12);
    g.fillStyle = '#000';
    g.fillRect(Math.round(W / 2 - (w / 2) * inT), y + 7 * scale + 6, Math.round(w * inT), 2);
    if (inT < 1) return;
    drawText(g, b.text, W / 2, y, '#ffffff', scale, 'center', '#000');
    if (b.sub) {
      const sw = textWidth(b.sub, 1) + 12;
      g.fillStyle = 'rgba(0,0,0,0.85)';
      g.fillRect(Math.round(W / 2 - sw / 2), y + 7 * scale + 10, sw, 12);
      drawText(g, b.sub, W / 2, y + 7 * scale + 12, '#ffd400', 1, 'center');
    }
  }
}

// Interpolate between two snapshots for smooth online rendering.
export function lerpSnap(a, b, t) {
  if (!a) return b;
  const map = new Map(a.sk.map((k) => [k[0], k]));
  const L = (u, v) => u + (v - u) * t;
  const LA = (u, v) => {
    let d = v - u;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    return u + d * t;
  };
  return {
    ...b,
    sk: b.sk.map((k) => {
      const o = map.get(k[0]);
      if (!o) return k;
      const n = k.slice();
      n[2] = L(o[2], k[2]); n[3] = L(o[3], k[3]); n[4] = LA(o[4], k[4]);
      return n;
    }),
    g: b.g.map((gl, i) => { const o = a.g[i]; const n = gl.slice(); n[0] = L(o[0], gl[0]); n[1] = L(o[1], gl[1]); return n; }),
    pk: Math.hypot(b.pk[0] - a.pk[0], b.pk[1] - a.pk[1]) > 20 ? b.pk : [L(a.pk[0], b.pk[0]), L(a.pk[1], b.pk[1]), L(a.pk[2], b.pk[2]), b.pk[3]],
  };
}
