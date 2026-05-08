import { useCallback } from 'react';
import { getSocket } from '../lib/socket';
import type { ClientEvent } from '../lib/events';

export interface AckResponse {
  ok: boolean;
  error?: string;
  [key: string]: unknown;
}

/**
 * Returns a typed emit() that returns a Promise resolving with the server's ack.
 * Replaces hand-written `socket.emit(event, payload, callback)` with `await emit(...)`.
 */
export function useEmit() {
  return useCallback(<T extends AckResponse = AckResponse>(
    event: ClientEvent,
    payload?: unknown,
  ): Promise<T> => {
    return new Promise((resolve) => {
      getSocket().emit(event, payload ?? {}, (res: T) => resolve(res));
    });
  }, []);
}
