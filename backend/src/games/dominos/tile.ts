// Tile primitives for the double-six domino set.
//
// A tile is a pair of pip values [low, high] with 0 ≤ low ≤ high ≤ 6.
// Storing in canonical (low, high) order means tile equality and matching
// never need to think about orientation — the engine handles "which end is
// being played onto" at the board level, not at the tile level.

export type Pip = 0 | 1 | 2 | 3 | 4 | 5 | 6;
export type Tile = readonly [Pip, Pip];

/** Build a tile from any two pip values, normalising to low/high order. */
export function tile(a: number, b: number): Tile {
  if (!isPip(a) || !isPip(b)) throw new Error(`bad pip values ${a},${b}`);
  return a <= b ? [a, b] : [b, a];
}

function isPip(n: number): n is Pip {
  return Number.isInteger(n) && n >= 0 && n <= 6;
}

export function isDouble(t: Tile): boolean {
  return t[0] === t[1];
}

export function pipSum(t: Tile): number {
  return t[0] + t[1];
}

export function tileEquals(a: Tile, b: Tile): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

export function tileToString(t: Tile): string {
  return `${t[0]}-${t[1]}`;
}

/** True if the tile has a side matching the given end value. */
export function matchesEnd(t: Tile, end: number): boolean {
  return t[0] === end || t[1] === end;
}

/**
 * The pip value left exposed on the chain after this tile is played onto
 * an existing end. Caller guarantees `matchesEnd(t, end)`.
 */
export function otherEnd(t: Tile, end: number): Pip {
  return t[0] === end ? t[1] : t[0];
}

/** The full double-six set: 28 tiles, smallest pip first then by high. */
export function fullSet(): Tile[] {
  const tiles: Tile[] = [];
  for (let a = 0; a <= 6; a++) {
    for (let b = a; b <= 6; b++) {
      tiles.push([a as Pip, b as Pip]);
    }
  }
  return tiles;
}

/**
 * Fisher–Yates shuffle. Takes a 0..1 RNG so tests can pass a deterministic
 * source; defaults to Math.random for production play.
 */
export function shuffle<T>(items: readonly T[], rng: () => number = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = out[i]!;
    out[i] = out[j]!;
    out[j] = tmp;
  }
  return out;
}

/** Find the highest double in a hand, or null if there is none. */
export function highestDouble(hand: readonly Tile[]): Tile | null {
  let best: Tile | null = null;
  for (const t of hand) {
    if (!isDouble(t)) continue;
    if (!best || t[0] > best[0]) best = t;
  }
  return best;
}

export function handPipSum(hand: readonly Tile[]): number {
  let s = 0;
  for (const t of hand) s += pipSum(t);
  return s;
}
