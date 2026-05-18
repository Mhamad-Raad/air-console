// Shapes shared inside the Dominos engine. Pulled out of the engine
// module so smoke tests and view projections can import types without
// dragging the engine's logic.

import type { Pip, Tile } from './tile.js';

export type DominosPhase = 'playing' | 'roundEnd' | 'finished';

/** A tile placed on the board, with which side it extends and how it
 *  sits visually. Doubles render perpendicular; everything else inline. */
export interface PlacedTile {
  tile: Tile;
  /** Which end of the chain this tile extended. The first tile uses 'left'. */
  side: 'left' | 'right';
  orientation: 'horizontal' | 'vertical';
}

export interface RoundResult {
  /** Player who won this round; null if blocked without a clear lowest. */
  winnerId: string | null;
  /** Pip points credited to the winner this round. */
  points: number;
  /** True if the round ended because no one could play. */
  blocked: boolean;
}

export interface DominosState {
  phase: DominosPhase;
  playerIds: string[];
  /** Each player's private hand. The engine's view() projection hides
   *  everyone else's hand from a given player. */
  hands: Record<string, Tile[]>;
  /** The chain in placement order. board[0] = first tile played. */
  board: PlacedTile[];
  /** Exposed pip values at each end of the chain (or null before the
   *  first tile is placed). */
  leftEnd: Pip | null;
  rightEnd: Pip | null;
  turn: string | null;
  /** Player who opened the round (held the highest double). */
  starterId: string | null;
  /** Consecutive passes; if it reaches playerIds.length, round is blocked. */
  passes: number;
  /**
   * Leftover tiles from the deal that haven't been picked up yet. In a
   * 2-player game this starts with 14 tiles; 3-player has 7; 4-player has 0.
   * The Draw rule lets a stuck player pull from here before being forced
   * to pass. Empty → behaves like pure Block.
   */
  boneyard: Tile[];
  /** Cumulative match score per player; first to targetScore wins. */
  scores: Record<string, number>;
  /** Per-round summaries, in order. */
  rounds: RoundResult[];
  targetScore: number;
  /** The match winner once phase = 'finished'. */
  winnerId: string | null;
}

export type DominosAction =
  | {
      type: 'play';
      data: { tile: [number, number]; side: 'left' | 'right' };
    }
  | { type: 'pass'; data?: Record<string, never> }
  | { type: 'draw'; data?: Record<string, never> }
  | { type: 'continue'; data?: Record<string, never> };
