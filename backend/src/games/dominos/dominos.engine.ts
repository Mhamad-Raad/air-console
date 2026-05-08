// Dominos engine — server-authoritative.
// Implements the contract every game must follow so the realtime layer
// can stay generic and games can be added by dropping in a folder.

export interface GameEngine<TState, TAction> {
  init(playerIds: string[]): TState;
  applyAction(state: TState, playerId: string, action: TAction): TState;
  view(state: TState, playerId: string): unknown;
  isFinished(state: TState): boolean;
}

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
    // TODO: implement real rules
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

  isFinished(state) {
    return state.phase === 'finished';
  },
};
