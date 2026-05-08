// Mirrors backend types — keep in sync.
// Once we move to a monorepo with shared types we can drop this duplication.

export interface GameCatalogEntry {
  slug: string;
  name: string;
  description: string;
  minPlayers: number;
  maxPlayers: number;
  iconUrl?: string;
  enabled: boolean;
}

export interface Player {
  id: string;
  name: string;
  socketId?: string;
  team?: string;
  isHost: boolean;
  joinedAt: number;
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
