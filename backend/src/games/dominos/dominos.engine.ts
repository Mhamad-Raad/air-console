// Dominos engine — server-authoritative.
// Skeleton: the protocol seam is what matters for Phase 2; full rules land
// in Phase 4.

import type { GameEngine } from '../engine.js';

export interface DominosState {
  phase: 'dealing' | 'playing' | 'finished';
  hands: Record<string, number[]>;
  board: number[];
  turn: string | null;
  winner: string | null;
}

export type DominosAction =
  | { type: 'play'; tile: number; side: 'left' | 'right' }
  | { type: 'pass' };

export const DominosEngine: GameEngine<DominosState, DominosAction> = {
  init(playerIds) {
    return {
      phase: 'dealing',
      hands: Object.fromEntries(playerIds.map((id) => [id, []])),
      board: [],
      turn: playerIds[0] ?? null,
      winner: null,
    };
  },

  applyAction(state) {
    // TODO: implement real rules in Phase 4
    return state;
  },

  view(state, playerId) {
    // hide other players' hands
    return {
      ...state,
      hands: {
        ...Object.fromEntries(Object.keys(state.hands).map((id) => [id, []])),
        [playerId]: state.hands[playerId] ?? [],
      },
    };
  },

  hostView(state) {
    // Host sees the board, turn, and hand sizes — never tile values.
    return {
      ...state,
      hands: Object.fromEntries(
        Object.entries(state.hands).map(([id, tiles]) => [id, tiles.length]),
      ),
    };
  },

  isFinished(state) {
    return state.phase === 'finished';
  },

  result(state) {
    return state.winner ? { winnerId: state.winner } : null;
  },
};
