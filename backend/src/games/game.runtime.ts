// Generic game runtime — sits between the realtime layer and the engine
// for whichever game a room is playing. Owns the game-state record in
// Redis (separate key from the room so room:state broadcasts stay small).

import { redis } from '../lib/redis.js';
import { ROOM } from '../config/constants.js';
import { NotFoundError } from '../shared/errors.js';
import type { Room } from '../modules/rooms/room.types.js';
import { requireEngine } from './registry.js';

const KEY_PREFIX = 'game:';
const key = (code: string) => `${KEY_PREFIX}${code}`;

interface GameRecord {
  slug: string;
  state: unknown;
  startedAt: number;
  updatedAt: number;
}

async function load(code: string): Promise<GameRecord | null> {
  const raw = await redis.get(key(code));
  return raw ? (JSON.parse(raw) as GameRecord) : null;
}

async function save(code: string, record: GameRecord): Promise<void> {
  await redis.set(key(code), JSON.stringify(record), 'EX', ROOM.TTL_SECONDS);
}

export const GameRuntime = {
  /** Build initial state for the room's game and persist it. */
  async start(room: Room): Promise<GameRecord> {
    const engine = requireEngine(room.gameSlug);
    const playerIds = room.players.map((p) => p.id);
    const state = engine.init(playerIds);
    const now = Date.now();
    const record: GameRecord = {
      slug: room.gameSlug,
      state,
      startedAt: now,
      updatedAt: now,
    };
    await save(room.code, record);
    return record;
  },

  /**
   * Apply an action from a player. Returns the next record + whether the
   * match has finished. Throws on illegal moves; the caller wraps in an ack.
   */
  async dispatch(
    code: string,
    playerId: string,
    action: unknown,
  ): Promise<{ record: GameRecord; finished: boolean }> {
    const record = await load(code);
    if (!record) throw new NotFoundError('No active game');
    const engine = requireEngine(record.slug);
    const next = engine.applyAction(record.state, playerId, action);
    const updated: GameRecord = { ...record, state: next, updatedAt: Date.now() };
    await save(code, updated);
    return { record: updated, finished: engine.isFinished(next) };
  },

  /** Per-player projection — controllers receive only what they're allowed to see. */
  viewFor(record: GameRecord, playerId: string): unknown {
    return requireEngine(record.slug).view(record.state, playerId);
  },

  /** Full-screen projection for the host. */
  hostView(record: GameRecord): unknown {
    return requireEngine(record.slug).hostView(record.state);
  },

  /** Optional structured result, for the Match row. Null if undecided. */
  resultOf(record: GameRecord): unknown {
    const engine = requireEngine(record.slug);
    return engine.result?.(record.state) ?? null;
  },

  async get(code: string): Promise<GameRecord | null> {
    return load(code);
  },

  async clear(code: string): Promise<void> {
    await redis.del(key(code));
  },
};

export type { GameRecord };
