/**
 * A small seeded random stream (mulberry32): the same seed gives the same
 * numbers on every machine, so whatever the engine draws from a match seed
 * (`G.seed`: the market) replays from the game state alone, whatever the
 * drivers do with `Math.random`.
 */

/** A stream of numbers in [0, 1) from `seed` (any number; its low 32 bits count). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** `count` items of `pool`, drawn uniformly without replacement by `rand`, in
 *  the order drawn (all of them, shuffled, when the pool is short). */
export function drawWithoutReplacement<T>(pool: readonly T[], count: number, rand: () => number): T[] {
  const left = [...pool];
  const out: T[] = [];
  while (out.length < count && left.length > 0) {
    const i = Math.floor(rand() * left.length);
    out.push(left.splice(i, 1)[0]);
  }
  return out;
}

/** A fresh match seed, from `Math.random` (which a driver may pin). */
export function newSeed(): number {
  return Math.floor(Math.random() * 4294967296) >>> 0;
}
