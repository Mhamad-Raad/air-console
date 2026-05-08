import { useRoomStore } from '../stores/room.store';
import { STORAGE_KEYS } from '../lib/constants';
import type { Player } from '../types';

const PLAYER_ID_KEY = STORAGE_KEYS.PLAYER_ID;

/**
 * Compact room store accessor — `const { room, setRoom, reset } = useRoom();`
 */
export function useRoom() {
  const room = useRoomStore((s) => s.room);
  const setRoom = useRoomStore((s) => s.setRoom);
  const reset = useRoomStore((s) => s.reset);
  return { room, setRoom, reset };
}

/**
 * The current player record from the room state, looked up by the
 * playerId persisted in localStorage. Null if not joined.
 */
export function useMe(): Player | null {
  const room = useRoomStore((s) => s.room);
  if (!room) return null;
  const playerId = typeof window === 'undefined' ? null : localStorage.getItem(PLAYER_ID_KEY);
  if (!playerId) return null;
  return room.players.find((p) => p.id === playerId) ?? null;
}
