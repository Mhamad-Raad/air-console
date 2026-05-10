import { useCallback } from 'react';
import { useSocket } from './useSocket';
import { ClientEvents } from '../lib/events';

/**
 * Send a `game:action` to the server. Engines receive the payload as
 * `{ type, data }`. Validation lives in the engine — the runtime returns
 * `game:actionError` to the offending socket on rejection.
 */
export function useGameAction() {
  const { socket } = useSocket();
  return useCallback(
    (action: { type: string; data?: unknown }) => {
      socket.emit(ClientEvents.GameAction, action);
    },
    [socket],
  );
}
