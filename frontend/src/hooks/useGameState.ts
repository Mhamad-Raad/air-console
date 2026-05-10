import { useEffect } from 'react';
import { useGameStore } from '../stores/game.store';
import { useSocketEvent } from './useSocketEvent';
import { ServerEvents } from '../lib/events';

interface GameStatePayload {
  slug: string;
  view: unknown;
  updatedAt: number;
}

/**
 * Subscribe to server `game:state` broadcasts and mirror the latest snapshot
 * into the global game store. Call this once at the route level so the
 * listener is registered BEFORE any catch-up game:state arrives (the server
 * sends one immediately after a rejoin into an in-game room).
 *
 * Reset on unmount so a stale view from a previous game doesn't flash next
 * time the route mounts.
 */
export function useGameStateListener(): void {
  const setCurrent = useGameStore((s) => s.setCurrent);
  useSocketEvent<GameStatePayload>(
    ServerEvents.GameState,
    (payload) => setCurrent(payload),
    [setCurrent],
  );
  useEffect(() => () => setCurrent(null), [setCurrent]);
}

/**
 * Read-only accessor for whichever view component needs the current state.
 * Pass the engine-specific shape as the type parameter for type-safety in
 * the renderer.
 */
export function useGameState<TView = unknown>(): {
  slug: string | null;
  view: TView | null;
  updatedAt: number | null;
} {
  const current = useGameStore((s) => s.current);
  return {
    slug: current?.slug ?? null,
    view: (current?.view as TView | undefined) ?? null,
    updatedAt: current?.updatedAt ?? null,
  };
}
