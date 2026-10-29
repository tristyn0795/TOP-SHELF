// Serializable PRNG: any object with a numeric `seed` field can be used as RNG state,
// so engine and league state survive JSON round-trips (saves, network, replays).
export function rand(st) {
  let t = (st.seed = (st.seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randInt(st, lo, hi) {
  return lo + Math.floor(rand(st) * (hi - lo + 1));
}

export function gauss(st) {
  // Box-Muller, one sample
  const u = Math.max(1e-9, rand(st));
  const v = rand(st);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function pick(st, arr) {
  return arr[Math.floor(rand(st) * arr.length)];
}

export function shuffle(st, arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand(st) * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export function poisson(st, lambda) {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do { k++; p *= rand(st); } while (p > L);
  return k - 1;
}

export function weightedPick(st, items, weightFn) {
  let total = 0;
  for (const it of items) total += Math.max(0, weightFn(it));
  let r = rand(st) * total;
  for (const it of items) {
    r -= Math.max(0, weightFn(it));
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

export function newSeed() {
  return (Math.random() * 4294967296) >>> 0;
}
