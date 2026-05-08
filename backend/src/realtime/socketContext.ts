// Per-socket context attached via socket.data so handlers know who/what
// each connection represents. We use Socket.IO's built-in generic slot
// rather than module augmentation so types compose cleanly.

import type { Server, Socket } from 'socket.io';

export interface AppSocketData {
  code?: string;
  role?: 'host' | 'player';
  playerId?: string;
}

// Events stay loosely typed for now — once the protocol stabilises we can
// fill in ClientToServer/ServerToClient maps for end-to-end type safety.
export type AppServer = Server<any, any, any, AppSocketData>;
export type AppSocket = Socket<any, any, any, AppSocketData>;
