import { nanoid } from 'nanoid';
import {
  ClientEvents,
  ServerEvents,
  type HostClaimPayload,
  type JoinRoomPayload,
  type PlayerUpdatePayload,
} from '../events.js';
import { logger } from '../../lib/logger.js';
import { RoomService } from '../../modules/rooms/room.service.js';
import { JoinRoomSchema } from '../../modules/rooms/room.schema.js';
import { getIO } from '../socket.js';
import type { AppSocket } from '../socketContext.js';

type Ack = (res: { ok: boolean; error?: string; room?: unknown; playerId?: string }) => void;

const channel = (code: string) => `room:${code}`;

async function broadcastState(code: string): Promise<void> {
  const room = await RoomService.get(code).catch(() => null);
  if (room) getIO().to(channel(code)).emit(ServerEvents.RoomState, room);
}

export function registerRoomHandlers(socket: AppSocket): void {
  socket.on(ClientEvents.HostClaim, async (payload: HostClaimPayload, ack?: Ack) => {
    const code = payload.code?.toUpperCase();
    if (!code) return ack?.({ ok: false, error: 'Missing code' });
    try {
      const room = await RoomService.setHost(code, socket.id);
      socket.data.code = code;
      socket.data.role = 'host';
      await socket.join(channel(code));
      ack?.({ ok: true, room });
      await broadcastState(code);
    } catch (err) {
      logger.warn({ err, code }, 'host:claim failed');
      ack?.({ ok: false, error: 'Room not found' });
    }
  });

  socket.on(ClientEvents.RoomJoin, async (raw: JoinRoomPayload, ack?: Ack) => {
    try {
      const payload = JoinRoomSchema.parse({ ...raw, code: raw.code?.toUpperCase() });
      const playerId = payload.playerId ?? nanoid();
      const room = await RoomService.addPlayer(payload.code, {
        id: playerId,
        name: payload.name,
        socketId: socket.id,
        isHost: false,
      });

      socket.data.code = payload.code;
      socket.data.role = 'player';
      socket.data.playerId = playerId;
      await socket.join(channel(payload.code));

      ack?.({ ok: true, room, playerId });
      await broadcastState(payload.code);
    } catch (err) {
      logger.warn({ err }, 'room:join failed');
      socket.emit(ServerEvents.RoomError, { message: 'Failed to join room' });
      ack?.({ ok: false, error: 'Failed to join room' });
    }
  });

  socket.on(ClientEvents.RoomLeave, async () => {
    const { code, role, playerId } = socket.data;
    if (!code) return;
    if (role === 'player' && playerId) {
      await RoomService.removePlayer(code, playerId);
      await broadcastState(code);
    }
    await socket.leave(channel(code));
    socket.data = {};
  });

  socket.on(ClientEvents.PlayerUpdate, async (payload: PlayerUpdatePayload) => {
    const { code, playerId } = socket.data;
    if (!code || !playerId) return;
    // TODO: implement RoomService.updatePlayer when we extend Player
    logger.debug({ code, playerId, payload }, 'player:update (todo)');
    await broadcastState(code);
  });

  socket.on('disconnect', async () => {
    const { code, role, playerId } = socket.data;
    if (!code) return;
    if (role === 'player' && playerId) {
      await RoomService.removePlayer(code, playerId);
      await broadcastState(code);
    }
    // Host disconnect: leave room alive (controllers may still be there).
  });
}
