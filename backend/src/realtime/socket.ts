import type { FastifyInstance } from 'fastify';
import { Server as IOServer } from 'socket.io';
import { corsOrigins } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { registerRoomHandlers } from './handlers/room.handler.js';
import { registerGameHandlers } from './handlers/game.handler.js';
import type { AppServer, AppSocket, AppSocketData } from './socketContext.js';

let io: AppServer | null = null;

export function getIO(): AppServer {
  if (!io) throw new Error('Socket.IO not initialised yet');
  return io;
}

export function attachSocketIO(app: FastifyInstance): AppServer {
  io = new IOServer<any, any, any, AppSocketData>(app.server, {
    cors: { origin: corsOrigins, credentials: true },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket: AppSocket) => {
    logger.debug({ id: socket.id }, 'socket connected');

    registerRoomHandlers(socket);
    registerGameHandlers(socket);

    socket.on('disconnect', (reason) => {
      logger.debug({ id: socket.id, reason }, 'socket disconnected');
    });
  });

  return io;
}
