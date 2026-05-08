import { useEffect } from 'react';
import { getSocket } from '../lib/socket';
import type { ServerEvent } from '../lib/events';

/**
 * Subscribe to a server event for the lifetime of the component.
 * Cleanup is handled automatically.
 */
export function useSocketEvent<T = unknown>(
  event: ServerEvent,
  handler: (payload: T) => void,
  deps: unknown[] = [],
): void {
  useEffect(() => {
    const socket = getSocket();
    socket.on(event, handler as (...args: unknown[]) => void);
    return () => {
      socket.off(event, handler as (...args: unknown[]) => void);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [event, ...deps]);
}
