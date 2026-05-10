import { create } from 'zustand';

interface GameStateSnapshot {
  slug: string;
  view: unknown;
  updatedAt: number;
}

interface GameState {
  current: GameStateSnapshot | null;
  setCurrent: (next: GameStateSnapshot | null) => void;
  reset: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  current: null,
  setCurrent: (current) => set({ current }),
  reset: () => set({ current: null }),
}));
