// Single source of truth for the projected view shape the Dominos engine
// emits over the wire. Both the HostView and ControllerView import from
// here so a backend-side projection change only needs to be reflected in
// one place — instead of silently drifting between the two surfaces.
//
// The backend authority is `projectHostView` / `projectPlayerView` in
// backend/src/games/dominos/dominos.engine.ts. Keep these aligned with
// `commonHeader` + the per-surface extension fields there.

import type { TilePair } from './DominoTile';
import type { PlacedTile } from './layout';

export type DominosPhase = 'playing' | 'roundEnd' | 'finished';
export type DominosPip = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface DominosRoundResult {
  winnerId: string | null;
  points: number;
  blocked: boolean;
}

/** Fields shared by host + player projections. */
export interface DominosCommonView {
  phase: DominosPhase;
  playerIds: string[];
  board: PlacedTile[];
  leftEnd: DominosPip | null;
  rightEnd: DominosPip | null;
  turn: string | null;
  starterId: string | null;
  scores: Record<string, number>;
  rounds: DominosRoundResult[];
  targetScore: number;
  winnerId: string | null;
  boneyardCount: number;
}

/** What `engine.hostView(state)` emits. */
export interface DominosHostProjection extends DominosCommonView {
  handCounts: Record<string, number>;
}

/** What `engine.view(state, playerId)` emits per player. */
export interface DominosPlayerProjection extends DominosCommonView {
  handCounts: Record<string, number>;
  yourHand: TilePair[];
  canPlay: boolean;
  canDraw: boolean;
  canPass: boolean;
}
