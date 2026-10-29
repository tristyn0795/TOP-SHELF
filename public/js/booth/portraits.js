// The broadcast desk: Mick Embers and Eddie O'Shea in pixel art, drawn every frame.
import { drawText } from '../render.js';

export const DESK_W = 320, DESK_H = 180;

const SKIN = '#e8b48a', SKIN_SH = '#c98f66';

function px(g, c, x, y, w = 1, h = 1) { g.fillStyle = c; g.fillRect(Math.round(x), Math.round(y), w, h); }

// One commentator, centred on cx with shoulders at y=118.
function person(g, cx, who, t, talking) {
  const mick = who === 'mick';
  const blazer = mick ? '#1f3fa8' : '#a8202c';
  const blazerHi = mick ? '#3a5fd8' : '#d03a46';
  const hair = mick ? '#d4d6de' : '#4a3020';
  const bob = talking ? Math.round(Math.sin(t * 9) * 0.6) : 0;
  const y0 = 70 + bob;
  // torso
  px(g, '#000', cx - 23, y0 + 37, 46, 40);
  px(g, blazer, cx - 22, y0 + 38, 44, 40);
  px(g, blazerHi, cx - 22, y0 + 38, 44, 3);
  px(g, '#ffffff', cx - 6, y0 + 38, 12, 14);
  for (let i = 0; i < 7; i++) px(g, blazer, cx - 6 + i, y0 + 38 + i * 2, 1, 14 - i * 2);
  for (let i = 0; i < 7; i++) px(g, blazer, cx + 5 - i, y0 + 38 + i * 2, 1, 14 - i * 2);
  px(g, mick ? '#c8202c' : '#1f3fa8', cx - 2, y0 + 40, 4, 12); // tie
  px(g, '#f8e000', cx + 11, y0 + 44, 4, 3); // lapel pin
  // neck + head
  px(g, SKIN_SH, cx - 5, y0 + 31, 10, 8);
  px(g, '#000', cx - 12, y0 + 5, 24, 28);
  px(g, SKIN, cx - 11, y0 + 6, 22, 26);
  px(g, SKIN_SH, cx - 11, y0 + 28, 22, 4);
  px(g, SKIN, cx - 13, y0 + 15, 2, 6); px(g, SKIN, cx + 11, y0 + 15, 2, 6); // ears
  // hair
  if (mick) {
    px(g, hair, cx - 12, y0 + 3, 24, 7);
    px(g, hair, cx - 12, y0 + 9, 4, 9); px(g, hair, cx + 8, y0 + 9, 4, 9);
    px(g, '#a8aab4', cx - 4, y0 + 4, 9, 2);
  } else {
    px(g, hair, cx - 12, y0 + 2, 24, 8);
    px(g, hair, cx - 12, y0 + 9, 3, 6); px(g, hair, cx + 9, y0 + 9, 3, 6);
    px(g, '#5e3e2a', cx + 2, y0 + 3, 8, 2);
  }
  // eyes (blink every few seconds)
  const blink = (t * 1000 + (mick ? 0 : 1700)) % 4200 < 130;
  if (blink) { px(g, '#3a2a20', cx - 7, y0 + 16, 5, 1); px(g, '#3a2a20', cx + 2, y0 + 16, 5, 1); }
  else { px(g, '#fff', cx - 7, y0 + 14, 5, 3); px(g, '#fff', cx + 2, y0 + 14, 5, 3); px(g, '#1a1a2a', cx - 5, y0 + 14, 2, 3); px(g, '#1a1a2a', cx + 4, y0 + 14, 2, 3); }
  if (mick) { // glasses
    g.strokeStyle = '#222';
    g.lineWidth = 1;
    g.strokeRect(cx - 8.5, y0 + 12.5, 7, 6); g.strokeRect(cx + 1.5, y0 + 12.5, 7, 6);
    px(g, '#222', cx - 1, y0 + 14, 2, 1);
  }
  px(g, '#3a2a20', cx - 8, y0 + 11, 6, 1); px(g, '#3a2a20', cx + 2, y0 + 11, 6, 1); // brows
  px(g, SKIN_SH, cx - 1, y0 + 18, 2, 5); // nose
  if (!mick) px(g, '#3a2418', cx - 6, y0 + 23, 12, 3); // moustache
  // mouth
  const open = talking && Math.floor(t * 9) % 2 === 0;
  if (open) { px(g, '#5a1a1a', cx - 4, y0 + 26, 8, 3); px(g, '#fff', cx - 3, y0 + 26, 6, 1); }
  else px(g, '#8a3a2a', cx - 4, y0 + 27, 8, 1);
}

/**
 * Draw the whole desk scene.
 * o: { t, talking: 'mick'|'eddie'|null, colors: [awayPrimary, homePrimary], crests: [Image, Image], title }
 */
export function drawDesk(g, o) {
  const { t } = o;
  // studio wall
  const grd = g.createLinearGradient(0, 0, 0, DESK_H);
  grd.addColorStop(0, '#0a1440');
  grd.addColorStop(1, '#1a2a78');
  g.fillStyle = grd;
  g.fillRect(0, 0, DESK_W, DESK_H);
  // drifting arena lights in both teams' colours
  for (let i = 0; i < 14; i++) {
    const c = o.colors[i % 2];
    const x = (i * 53 + t * (6 + (i % 3) * 3)) % (DESK_W + 20) - 10;
    const y = 12 + ((i * 37) % 60);
    g.globalAlpha = 0.18 + 0.12 * Math.sin(t * 1.3 + i);
    px(g, c, x, y, 6, 6);
  }
  g.globalAlpha = 1;
  // back-wall monitors with the two crests
  for (const [i, x] of [[0, 18], [1, 246]]) {
    px(g, '#000', x - 2, 18, 60, 46);
    px(g, '#0d1a52', x, 20, 56, 42);
    px(g, o.colors[i], x, 58, 56, 4);
    if (o.crests[i]?.complete) g.drawImage(o.crests[i], x + 12, 22, 32, 32);
  }
  drawText(g, 'TOP SHELF', DESK_W / 2 + 1, 20, '#000', 2, 'center');
  drawText(g, 'TOP SHELF', DESK_W / 2, 19, '#f8e000', 2, 'center');
  drawText(g, o.title || 'HOCKEY', DESK_W / 2, 38, '#ffffff', 1, 'center');
  // the two hosts
  person(g, 118, 'mick', t, o.talking === 'mick');
  person(g, 202, 'eddie', t, o.talking === 'eddie');
  // desk
  g.fillStyle = '#000';
  g.beginPath(); g.moveTo(34, 128); g.lineTo(286, 128); g.lineTo(304, DESK_H); g.lineTo(16, DESK_H); g.closePath(); g.fill();
  g.fillStyle = '#0a1a6e';
  g.beginPath(); g.moveTo(36, 130); g.lineTo(284, 130); g.lineTo(301, DESK_H); g.lineTo(19, DESK_H); g.closePath(); g.fill();
  px(g, '#9fbcff', 36, 130, 248, 2);
  px(g, '#e8202c', 26, 152, 268, 3);
  drawText(g, 'TOP SHELF HOCKEY', DESK_W / 2, 161, '#ffffff', 1, 'center');
  // microphones
  for (const x of [134, 186]) { px(g, '#222', x, 116, 2, 14); px(g, '#555', x - 2, 112, 6, 5); }
  // name plates
  drawText(g, 'EMBERS', 118, 140, o.talking === 'mick' ? '#f8e000' : '#9fbcff', 1, 'center');
  drawText(g, "O'SHEA", 202, 140, o.talking === 'eddie' ? '#f8e000' : '#9fbcff', 1, 'center');
}
