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
import { GameRuntime } from '../../games/game.runtime.js';
import { MatchRepository } from '../../modules/matches/match.repository.js';
import { gameIdForSlug } from '../../modules/games/game.seeder.js';
import { getIO } from '../socket.js';
import type { AppSocket } from '../socketContext.js';
import {
  broadcastGameState,
  broadcastState,
  channel,
  requireHost,
  runHandler,
  type Ack,
} from './utils.js';

export function registerRoomHandlers(socket: AppSocket): void {
  socket.on(ClientEvents.HostClaim, (payload: HostClaimPayload, ack?: Ack) =>
    runHandler('host:claim', async () => {
      const code = payload?.code?.toUpperCase();
      if (!code) throw new Error('Missing code');
      // Set context first so a disconnect mid-write still cleans up.
      socket.data.code = code;
      socket.data.role = 'host';
      const room = await RoomService.setHost(code, socket.id);
      await socket.join(channel(code));
      await broadcastState(code, room);
      return { room };
    }, ack),
  );

  socket.on(ClientEvents.RoomJoin, (raw: JoinRoomPayload, ack?: Ack) =>
    runHandler('room:join', async () => {
      const payload = JoinRoomSchema.parse({ ...raw, code: raw?.code?.toUpperCase() });
      const playerId = payload.playerId ?? nanoid();
      // Set context first so a disconnect mid-write still cleans up the player.
      socket.data.code = payload.code;
      socket.data.role = 'player';
      socket.data.playerId = playerId;
      const room = await RoomService.addPlayer(payload.code, {
        id: playerId,
        name: payload.name,
        socketId: socket.id,
      });
      await socket.join(channel(payload.code));
      await broadcastState(payload.code, room);

      // Reconnect into an in-game room: catch this socket up to the live
      // game state so the player doesn't see a blank UI for an action cycle.
      if (room.phase === 'in_game') {
        const record = await GameRuntime.get(room.code);
        if (record) {
          socket.emit(ServerEvents.GameState, {
            slug: record.slug,
            view: GameRuntime.viewFor(record, playerId),
            updatedAt: record.updatedAt,
          });
        }
      }

      return { room, playerId };
    }, ack),
  );

  socket.on(ClientEvents.RoomLeave, () =>
    runHandler('room:leave', async () => {
      const { code, role, playerId } = socket.data;
      if (!code) return;
      if (role === 'player' && playerId) {
        const room = await RoomService.removePlayer(code, playerId);
        if (room) await broadcastState(code, room);
      }
      await socket.leave(channel(code));
      socket.data = {};
    }),
  );

  socket.on(ClientEvents.RoomKick, (payload: KickPayload, ack?: Ack) =>
    runHandler('room:kick', async () => {
      const ctx = requireHost(socket);
      if (!ctx) throw new Error('Host only');
      if (!payload?.playerId) throw new Error('Missing playerId');

      const current = await RoomService.get(ctx.code);
      const target = current.players.find((p) => p.id === payload.playerId);
      if (!target) throw new Error('Player not in room');

      const room = await RoomService.removePlayer(ctx.code, payload.playerId);

      // Notify the kicked socket directly so they can navigate home.
      if (target.socketId) {
        const kickedSocket = getIO().sockets.sockets.get(target.socketId);
        if (kickedSocket) {
          kickedSocket.emit(ServerEvents.PlayerKicked, { code: ctx.code });
          await kickedSocket.leave(channel(ctx.code));
          kickedSocket.data = {};
        }
      }

      if (room) await broadcastState(ctx.code, room);
    }, ack),
  );

  socket.on(ClientEvents.PlayerUpdate, (payload: PlayerUpdatePayload, ack?: Ack) =>
    runHandler('player:update', async () => {
      const { code, playerId } = socket.data;
      if (!code || !playerId) throw new Error('Not in a room');
      const patch = PlayerPatchSchema.parse(payload ?? {});
      const room = await RoomService.updatePlayer(code, playerId, patch);
      await broadcastState(code, room);
      return { room };
    }, ack),
  );

  // Host updates another player (e.g. team assignment from the lobby UI).
  socket.on(ClientEvents.PlayerSet, (payload: PlayerSetPayload, ack?: Ack) =>
    runHandler('player:set', async () => {
      const ctx = requireHost(socket);
      if (!ctx) throw new Error('Host only');
      if (!payload?.playerId) throw new Error('Missing playerId');
      const patch = PlayerPatchSchema.parse(payload.patch ?? {});
      const room = await RoomService.updatePlayer(ctx.code, payload.playerId, patch);
      await broadcastState(ctx.code, room);
      return { room };
    }, ack),
  );

  socket.on(ClientEvents.GameStart, (_payload: unknown, ack?: Ack) =>
    runHandler('game:start', async () => {
      const ctx = requireHost(socket);
      if (!ctx) throw new Error('Host only');
      const room = await RoomService.startGame(ctx.code);
      const record = await GameRuntime.start(room);
      await broadcastState(ctx.code, room);
      broadcastGameState(room, record);
      return { room };
    }, ack),
  );

  socket.on(ClientEvents.GameEnd, (_payload: unknown, ack?: Ack) =>
    runHandler('game:end', async () => {
      const ctx = requireHost(socket);
      if (!ctx) throw new Error('Host only');

      // Snapshot for the Match row BEFORE we tear down: we need the
      // pre-end room (player roster + teams) and the engine state's result.
      const roomBefore = await RoomService.get(ctx.code);
      const record = await GameRuntime.get(ctx.code);

      const room = await RoomService.endGame(ctx.code);
      await GameRuntime.clear(ctx.code);
      await broadcastState(ctx.code, room);

      // Persist the Match. Non-fatal if Postgres is unreachable — game
      // play already ended, so the host shouldn't see an error toast.
      if (record) {
        try {
          const gameId = await gameIdForSlug(record.slug);
          if (!gameId) {
            logger.warn(
              { slug: record.slug },
              'no Game row for slug; skipping Match persistence',
            );
          } else {
            await MatchRepository.create({
              code: ctx.code,
              gameId,
              startedAt: new Date(record.startedAt),
              endedAt: new Date(),
              players: roomBefore.players.map((p) => ({
                id: p.id,
                name: p.name,
                team: p.team ?? null,
              })),
              result: GameRuntime.resultOf(record),
            });
          }
        } catch (err) {
          logger.warn({ err }, 'Match persistence failed; continuing');
        }
      }

      return { room };
    }, ack),
  );

  socket.on(ClientEvents.RoomClose, (_payload: unknown, ack?: Ack) =>
    runHandler('room:close', async () => {
      const ctx = requireHost(socket);
      if (!ctx) throw new Error('Host only');
      const io = getIO();
      // Notify everyone first so all clients can navigate home.
      io.to(channel(ctx.code)).emit(ServerEvents.RoomClosed, { code: ctx.code });
      // Force every connected socket out of the channel and clear their context.
      const adapterRoom = io.sockets.adapter.rooms.get(channel(ctx.code));
      if (adapterRoom) {
        for (const id of adapterRoom) {
          const s = io.sockets.sockets.get(id);
          if (!s) continue;
          await s.leave(channel(ctx.code));
          s.data = {};
        }
      }
      await RoomService.deleteRoom(ctx.code);
    }, ack),
  );

  socket.on('disconnect', async (reason) => {
    logger.debug({ id: socket.id, reason }, 'socket disconnected');
    const { code, role, playerId } = socket.data;
    if (!code) return;
    if (role === 'player' && playerId) {
      // Don't drop the seat — mark the player and let the sweeper remove
      // them only if they fail to come back inside the grace window.
      const room = await RoomService.markDisconnected(code, playerId);
      if (room) await broadcastState(code, room);
    }
    // Host disconnect: leave room alive so reconnect or claim can pick it back up.
  });
}
