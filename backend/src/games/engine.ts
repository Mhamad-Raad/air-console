// The contract every game engine implements. The realtime layer is generic
// over this interface — it routes `game:action` events to whichever engine
// is bound to the room's game slug, without knowing the rules.

export interface GameEngine<TState, TAction> {
  /** Build the initial state for a new match. */
  init(playerIds: string[]): TState;

  /**
   * Apply a player's action and return the next state. Throw on illegal
   * moves — the runtime catches and returns the error to the player.
   */
  applyAction(state: TState, playerId: string, action: TAction): TState;

  /**
   * Project state into what a single player is allowed to see. Lets us hide
   * other players' hands, secret roles, etc. Host gets the full state.
   */
  view(state: TState, playerId: string): unknown;

  /** Full state for the host's screen — board, scores, turn indicator. */
  hostView(state: TState): unknown;

  /** True once the match is over and a result can be persisted. */
  isFinished(state: TState): boolean;

  /**
   * Optional summary written to the Match row when the game ends.
   * Returns null if the game has no canonical result (e.g. drawn).
   */
  result?(state: TState): unknown;
}

// Erase the engine's state/action types at the registry boundary so the
// generic runtime can hold engines for any game side-by-side.
export type AnyGameEngine = GameEngine<unknown, unknown>;
