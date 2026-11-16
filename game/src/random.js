// A tiny seeded RNG (mulberry32). Every random choice in a run — spawns,
// drops, particles, the starfield — flows through one stream owned by the
// world, so a fixed seed replays the same run: the screenshot scenes and the
// autopilot rely on it, and real runs seed it from the clock.
export function makeRng(seed) {
  let state = seed >>> 0 || 0x9e3779b9;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function range(rng, min, max) {
  return min + rng() * (max - min);
}

export function rangeInt(rng, min, max) {
  return Math.floor(range(rng, min, max + 1));
}

export function pick(rng, items) {
  return items[Math.floor(rng() * items.length)];
}

export function chance(rng, probability) {
  return rng() < probability;
}

// In-place Fisher-Yates shuffle driven by the run's stream.
export function shuffle(rng, items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = items[i];
    items[i] = items[j];
    items[j] = tmp;
  }
  return items;
}
