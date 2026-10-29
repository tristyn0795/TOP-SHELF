// Pixel-art team badges, drawn once per team and cached as data URLs.
import { drawText } from './render.js';

const cache = new Map();
const SIZE = 32;

function lum(hex) {
  const n = parseInt(hex.slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
}

// Shield half-width for each row: square shoulders, pointed bottom.
function halfWidth(y) {
  if (y < 2) return 13 - (2 - y);
  if (y < 20) return 14;
  return Math.max(0, 14 - (y - 20) * 1.25);
}

export function crestURL(t) {
  if (cache.has(t.id)) return cache.get(t.id);
  const c = document.createElement('canvas');
  c.width = SIZE; c.height = SIZE;
  const g = c.getContext('2d');
  const light = lum(t.primary) > 0.72;
  const fill = (inset, color) => {
    g.fillStyle = color;
    for (let y = inset; y < SIZE - inset; y++) {
      const hw = Math.round(halfWidth(y) - inset);
      if (hw <= 0) continue;
      g.fillRect(16 - hw, y, hw * 2, 1);
    }
  };
  fill(0, '#000000');
  fill(1, light ? t.secondary : '#f4f4f4');
  fill(2, t.primary);
  // stripes
  g.fillStyle = t.secondary;
  for (let y = 21; y < 24; y++) {
    const hw = Math.round(halfWidth(y) - 2);
    if (hw > 0) g.fillRect(16 - hw, y, hw * 2, 1);
  }
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(4, 3, 24, 1);
  const letter = t.name[0];
  const ink = light ? t.secondary : '#ffffff';
  drawText(g, letter, 17, 6, '#000000', 2, 'center');
  drawText(g, letter, 16, 5, ink, 2, 'center');
  const url = c.toDataURL();
  cache.set(t.id, url);
  return url;
}

export function crest(t, cls = '') {
  return `<img class="crest ${cls}" src="${crestURL(t)}" alt="${t.abbr}" width="32" height="32">`;
}
