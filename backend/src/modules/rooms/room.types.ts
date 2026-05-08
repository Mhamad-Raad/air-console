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
