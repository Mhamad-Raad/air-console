// Shared layout helpers for the Dominos renderers.
//
// The same chain is drawn on the host (big felt) and on each controller
// (mini-board). Both compute a per-tile half-square size that fits the
// whole snake into the available horizontal space — instead of letting
// it overflow + auto-scroll, which made it impossible for players to see
// where the play happened.

import type { TilePair } from './DominoTile';

export interface PlacedTile {
  tile: TilePair;
  side: 'left' | 'right';
  orientation: 'horizontal' | 'vertical';
}

/**
 * A renderable tile in the snake. `pair` is intentionally typed loosely
 * as `[number, number]` (not TilePair) because we may flip canonical
 * [low, high] tiles for display so adjacent pips touch — the resulting
 * pair is no longer guaranteed low-then-high. DominoTile only cares
 * about the two pip values; the canonical-ordering invariant is a
 * concern of the engine, not of the renderer.
 */
export interface DisplayTile {
  pair: readonly [number, number];
  orientation: 'horizontal' | 'vertical';
  leftPip: number;
  rightPip: number;
}

/**
 * Turn the engine's PlacedTile[] (canonical-pip order) into a render-ready
 * sequence where each tile's left pip equals the previous tile's right
 * pip, so the chain looks like real dominos. The first tile is anchored
 * using leftEnd; doubles render perpendicular and expose the same pip on
 * both touching sides.
 */
export function computeChain(
  board: PlacedTile[],
  leftEnd: number | null,
): DisplayTile[] {
  if (board.length === 0) return [];

  const out: DisplayTile[] = [];
  const first = board[0]!;

  let firstLeft: number;
  let firstRight: number;
  if (first.orientation === 'vertical') {
    firstLeft = first.tile[0];
    firstRight = first.tile[0];
  } else if (leftEnd !== null && first.tile[0] === leftEnd) {
    firstLeft = first.tile[0];
    firstRight = first.tile[1];
  } else if (leftEnd !== null && first.tile[1] === leftEnd) {
    firstLeft = first.tile[1];
    firstRight = first.tile[0];
  } else {
    firstLeft = first.tile[0];
    firstRight = first.tile[1];
  }
  out.push({
    pair: [firstLeft, firstRight] as const,
    orientation: first.orientation,
    leftPip: firstLeft,
    rightPip: firstRight,
  });

  for (let i = 1; i < board.length; i++) {
    const placed = board[i]!;
    const requiredLeft = out[i - 1]!.rightPip;
    let displayLeft: number;
    let displayRight: number;
    if (placed.orientation === 'vertical') {
      displayLeft = placed.tile[0];
      displayRight = placed.tile[0];
    } else if (placed.tile[0] === requiredLeft) {
      displayLeft = placed.tile[0];
      displayRight = placed.tile[1];
    } else {
      displayLeft = placed.tile[1];
      displayRight = placed.tile[0];
    }
    out.push({
      pair: [displayLeft, displayRight] as const,
      orientation: placed.orientation,
      leftPip: displayLeft,
      rightPip: displayRight,
    });
  }
  return out;
}

/**
 * Pick a half-square pixel size that fits the whole chain into the given
 * horizontal budget. Horizontal tiles take 2S, vertical (doubles) take S.
 * If the chain is empty or short, use the preferred size — we don't want
 * the opening tile to render as a tiny postage stamp.
 */
export function fitTileSize(
  chain: DisplayTile[],
  availableWidthPx: number,
  preferred: number,
  min: number,
  gapPx = 6,
): number {
  if (chain.length === 0) return preferred;
  // Total width in half-square units, treating doubles as 1S and others as 2S.
  let halfSquares = 0;
  for (const t of chain) {
    halfSquares += t.orientation === 'vertical' ? 1 : 2;
  }
  const gaps = Math.max(0, chain.length - 1) * gapPx;
  const sizeFromBudget = Math.floor((availableWidthPx - gaps) / halfSquares);
  return Math.max(min, Math.min(preferred, sizeFromBudget));
}
