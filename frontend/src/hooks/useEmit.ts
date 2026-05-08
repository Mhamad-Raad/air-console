import { useCallback } from 'react';
import { getSocket } from '../lib/socket';
import type { ClientEvent } from '../lib/events';

export interface AckBase {
  ok: boolean;
  error?: string;
}

/**
 * Returns a typed emit() that returns a Promise resolving with the server's ack.
 * Replaces hand-written `socket.emit(event, payload, callback)` with `await emit(...)`.
 *
 * Usage:
 *   const res = await emit<{ room?: Room; playerId?: string }>(ClientEvents.RoomJoin, {...});
 *   if (res.ok && res.room) { ... }
 */
export function useEmit() {
  return useCallback(<Extra = Record<string, unknown>>(
    event: ClientEvent,
    payload?: unknown,
  ): Promise<AckBase & Partial<Extra>> => {
    return new Promise((resolve) => {
      getSocket().emit(event, payload ?? {}, (res: AckBase & Partial<Extra>) =>
        resolve(res ?? { ok: false, error: 'No response' }),
      );
    });
  }, []);
}
