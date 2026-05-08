import type { Socket } from 'socket.io';
import { ClientEvents, ServerEvents, type JoinRoomPayload, type PlayerUpdatePayload } from '../events.js';
import { logger } from '../../lib/logger.js';

export function registerRoomHandlers(socket: Socket): void {
  socket.on(ClientEvents.RoomJoin, async (payload: JoinRoomPayload, ack?: (res: unknown) => void) => {
    try {
      // TODO: wire to RoomService.join — validates code, adds player, persists in Redis
      logger.debug({ socketId: socket.id, payload }, 'room:join');
      socket.join(`room:${payload.code}`);
      ack?.({ ok: true });
    } catch (err) {
      logger.error({ err }, 'room:join failed');
      socket.emit(ServerEvents.RoomError, { message: 'Failed to join room' });
      ack?.({ ok: false });
    }
  });

  socket.on(ClientEvents.RoomLeave, (payload: { code: string }) => {
    socket.leave(`room:${payload.code}`);
    socket.to(`room:${payload.code}`).emit(ServerEvents.PlayerLeft, { socketId: socket.id });
  });

  socket.on(ClientEvents.PlayerUpdate, (payload: PlayerUpdatePayload & { code: string }) => {
    // TODO: persist to Redis, then broadcast updated room state
    socket.to(`room:${payload.code}`).emit(ServerEvents.RoomState, { updated: payload });
  });
}
