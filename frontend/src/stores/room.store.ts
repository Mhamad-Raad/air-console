import { create } from 'zustand';
import type { Room } from '../types';

interface RoomState {
  room: Room | null;
  setRoom: (room: Room | null) => void;
  reset: () => void;
}

export const useRoomStore = create<RoomState>((set) => ({
  room: null,
  setRoom: (room) => set({ room }),
  reset: () => set({ room: null }),
}));
