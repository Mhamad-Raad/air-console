import { nanoid } from 'nanoid';
import {
  ClientEvents,
  ServerEvents,
  type HostClaimPayload,
  type JoinRoomPayload,
  type KickPayload,
  type PlayerSetPayload,
  type PlayerUpdatePayload,
} from '../events.js';
import { logger } from '../../lib/logger.js';
import { RoomService } from '../../modules/rooms/room.service.js';
import { JoinRoomSchema, PlayerPatchSchema } from '../../modules/rooms/room.schema.js';
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
      const message = err instanceof Error ? err.message : 'Failed to join room';
      socket.emit(ServerEvents.RoomError, { message });
      ack?.({ ok: false, error: message });
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

  socket.on(ClientEvents.RoomKick, async (payload: KickPayload, ack?: Ack) => {
    const { code, role } = socket.data;
    if (!code || role !== 'host') {
      return ack?.({ ok: false, error: 'Only the host can kick players' });
    }
    if (!payload?.playerId) return ack?.({ ok: false, error: 'Missing playerId' });

    try {
      const room = await RoomService.get(code);
      const target = room.players.find((p) => p.id === payload.playerId);
      if (!target) return ack?.({ ok: false, error: 'Player not in room' });

      await RoomService.removePlayer(code, payload.playerId);

      // Notify the kicked socket directly so they can navigate home.
      if (target.socketId) {
        const kickedSocket = getIO().sockets.sockets.get(target.socketId);
        if (kickedSocket) {
          kickedSocket.emit(ServerEvents.PlayerKicked, { code });
          await kickedSocket.leave(channel(code));
          kickedSocket.data = {};
        }
      }

      ack?.({ ok: true });
      await broadcastState(code);
    } catch (err) {
      logger.warn({ err, code, playerId: payload.playerId }, 'room:kick failed');
      ack?.({ ok: false, error: 'Failed to kick player' });
    }
  });

  socket.on(ClientEvents.PlayerUpdate, async (payload: PlayerUpdatePayload, ack?: Ack) => {
    const { code, playerId } = socket.data;
    if (!code || !playerId) return ack?.({ ok: false, error: 'Not in a room' });
    try {
      const patch = PlayerPatchSchema.parse(payload ?? {});
      const room = await RoomService.updatePlayer(code, playerId, patch);
      ack?.({ ok: true, room });
      await broadcastState(code);
    } catch (err) {
      logger.warn({ err, code, playerId }, 'player:update failed');
      ack?.({ ok: false, error: 'Update failed' });
    }
  });

  // Host updates another player (e.g. team assignment from the lobby UI).
  socket.on(ClientEvents.PlayerSet, async (payload: PlayerSetPayload, ack?: Ack) => {
    const { code, role } = socket.data;
    if (!code || role !== 'host') return ack?.({ ok: false, error: 'Host only' });
    if (!payload?.playerId) return ack?.({ ok: false, error: 'Missing playerId' });
    try {
      const patch = PlayerPatchSchema.parse(payload.patch ?? {});
      const room = await RoomService.updatePlayer(code, payload.playerId, patch);
      ack?.({ ok: true, room });
      await broadcastState(code);
    } catch (err) {
      logger.warn({ err, code, target: payload.playerId }, 'player:set failed');
      ack?.({ ok: false, error: 'Update failed' });
    }
  });

  socket.on(ClientEvents.GameStart, async (_payload: unknown, ack?: Ack) => {
    const { code, role } = socket.data;
    if (!code || role !== 'host') return ack?.({ ok: false, error: 'Host only' });
    try {
      const room = await RoomService.startGame(code);
      ack?.({ ok: true, room });
      await broadcastState(code);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to start';
      logger.warn({ err, code }, 'game:start failed');
      ack?.({ ok: false, error: message });
    }
  });

  socket.on(ClientEvents.GameEnd, async (_payload: unknown, ack?: Ack) => {
    const { code, role } = socket.data;
    if (!code || role !== 'host') return ack?.({ ok: false, error: 'Host only' });
    try {
      const room = await RoomService.endGame(code);
      ack?.({ ok: true, room });
      await broadcastState(code);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to end';
      logger.warn({ err, code }, 'game:end failed');
      ack?.({ ok: false, error: message });
    }
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
