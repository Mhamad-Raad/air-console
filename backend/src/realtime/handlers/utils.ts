// Reusable building blocks for socket handlers. Every game we add will hit
// the same patterns: validate the host, wrap a handler in try/catch, broadcast
// fresh room state. Centralising them keeps each handler 3-5 lines of intent.

import type { ServerEvent } from '../events.js';
import { ServerEvents } from '../events.js';
import { logger } from '../../lib/logger.js';
import { RoomService } from '../../modules/rooms/room.service.js';
import type { Room } from '../../modules/rooms/room.types.js';
import { GameRuntime, type GameRecord } from '../../games/game.runtime.js';
import { getIO } from '../socket.js';
import type { AppSocket } from '../socketContext.js';

// Ack shape: { ok, error? } plus whatever fields the handler returned.
// Flat, not nested — so callers see `res.room` not `res.data.room`.
export type Ack = (res: { ok: boolean; error?: string; [key: string]: unknown }) => void;

export const channel = (code: string) => `room:${code}`;

/**
 * Broadcast room:state to every socket in the room.
 * Pass `room` if you just wrote it — saves a Redis round-trip.
 */
export async function broadcastState(code: string, room?: Room): Promise<void> {
  const r = room ?? (await RoomService.get(code).catch(() => null));
  if (r) getIO().to(channel(code)).emit(ServerEvents.RoomState, r);
}

/**
 * Emit any server event to a single room (host + all controllers).
 */
export function emitToRoom(code: string, event: ServerEvent, payload: unknown): void {
  getIO().to(channel(code)).emit(event, payload);
}

/**
 * Fan out per-player projections of a game record. Each connected player
 * receives a state filtered through `engine.view(state, playerId)`; the host
 * receives the full host view. Saves having to reimplement this per-game.
 */
export function broadcastGameState(room: Room, record: GameRecord): void {
  const io = getIO();
  for (const player of room.players) {
    if (!player.socketId) continue;
    const sock = io.sockets.sockets.get(player.socketId);
    if (!sock) continue;
    sock.emit(ServerEvents.GameState, {
      slug: record.slug,
      view: GameRuntime.viewFor(record, player.id),
      updatedAt: record.updatedAt,
    });
  }
  if (room.hostSocketId) {
    const host = io.sockets.sockets.get(room.hostSocketId);
    host?.emit(ServerEvents.GameState, {
      slug: record.slug,
      view: GameRuntime.hostView(record),
      updatedAt: record.updatedAt,
    });
  }
}

interface HostContext {
  code: string;
}

/**
 * Returns the host's room code, or null if the caller isn't the host.
 * Use as the first line of any host-only handler.
 */
export function requireHost(socket: AppSocket): HostContext | null {
  const { code, role } = socket.data;
  if (!code || role !== 'host') return null;
  return { code };
}

/**
 * Wraps a handler body in try/catch + structured logging + ack.
 * The handler can return an object whose fields are spread into the ack
 * (so callers see `res.room`, not `res.data.room`).
 */
export function runHandler(
  event: string,
  fn: () => Promise<Record<string, unknown> | void>,
  ack?: Ack,
): Promise<void> {
  return fn().then(
    (data) => ack?.({ ok: true, ...(data ?? {}) }),
    (err: unknown) => {
      const message = err instanceof Error ? err.message : 'Operation failed';
      logger.warn({ err, event }, `${event} failed`);
      ack?.({ ok: false, error: message });
    },
  );
}
