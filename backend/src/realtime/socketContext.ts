// Per-socket context attached via socket.data so handlers know who/what
// each connection represents. Module augmentation keeps it strongly typed
// without passing extra args around.

import 'socket.io';

declare module 'socket.io' {
  interface Socket {
    data: SocketContext;
  }
}

export interface SocketContext {
  code?: string;
  role?: 'host' | 'player';
  playerId?: string;
}
