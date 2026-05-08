import type { FastifyInstance } from 'fastify';
import { Server as IOServer, type Socket } from 'socket.io';
import { corsOrigins } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { registerRoomHandlers } from './handlers/room.handler.js';
import { registerGameHandlers } from './handlers/game.handler.js';

let io: IOServer | null = null;

export function getIO(): IOServer {
  if (!io) throw new Error('Socket.IO not initialised yet');
  return io;
}

export function attachSocketIO(app: FastifyInstance): IOServer {
  io = new IOServer(app.server, {
    cors: { origin: corsOrigins, credentials: true },
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket: Socket) => {
    logger.debug({ id: socket.id }, 'socket connected');

    registerRoomHandlers(socket);
    registerGameHandlers(socket);

    socket.on('disconnect', (reason) => {
      logger.debug({ id: socket.id, reason }, 'socket disconnected');
    });
  });

  return io;
}
