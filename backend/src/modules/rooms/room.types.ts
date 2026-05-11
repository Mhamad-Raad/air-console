export type Team = 'A' | 'B';
export type Locale = 'en' | 'ar' | 'ckb';

export interface Player {
  id: string;
  name: string;
  socketId?: string;
  team?: Team | null;
  isReady: boolean;
  locale: Locale;
  joinedAt: number;
  /**
   * Wall-clock ms of the most recent disconnect. Cleared on rejoin.
   * The sweeper removes players whose timestamp is older than the grace cutoff.
   */
  disconnectedAt?: number;
}

export interface PlayerPatch {
  name?: string;
  team?: Team | null;
  isReady?: boolean;
  locale?: Locale;
}

// `endGame()` transitions back to 'lobby' (rematch UX); add an 'ended'
// phase here only when a real post-game review screen needs it.
export type RoomPhase = 'lobby' | 'in_game';

export interface Room {
  code: string;
  gameSlug: string;
  hostSocketId: string;
  phase: RoomPhase;
  players: Player[];
  createdAt: number;
  updatedAt: number;
}
