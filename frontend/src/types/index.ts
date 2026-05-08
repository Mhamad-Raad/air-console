// Mirrors backend types — keep in sync.
// Once we move to a monorepo with shared types we can drop this duplication.

export type Team = 'A' | 'B';
export type Locale = 'en' | 'ar' | 'ckb';

export interface GameCatalogEntry {
  slug: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  supportsTeams: boolean;
  requireReady: boolean;
  iconUrl?: string;
  enabled: boolean;
}

export interface Player {
  id: string;
  name: string;
  socketId?: string;
  team?: Team | null;
  isReady: boolean;
  isHost: boolean;
  locale: Locale;
  joinedAt: number;
}

export interface PlayerPatch {
  name?: string;
  team?: Team | null;
  isReady?: boolean;
  locale?: Locale;
}

export type RoomPhase = 'lobby' | 'in_game' | 'ended';

export interface Room {
  code: string;
  gameSlug: string;
  hostSocketId: string;
  phase: RoomPhase;
  players: Player[];
  createdAt: number;
  updatedAt: number;
}
