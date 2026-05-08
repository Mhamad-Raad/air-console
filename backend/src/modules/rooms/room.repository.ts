import { redis } from '../../lib/redis.js';
import { ROOM } from '../../config/constants.js';
import type { Room } from './room.types.js';

const KEY_PREFIX = 'room:';

const key = (code: string) => `${KEY_PREFIX}${code}`;

export const RoomRepository = {
  async save(room: Room): Promise<void> {
    await redis.set(key(room.code), JSON.stringify(room), 'EX', ROOM.TTL_SECONDS);
  },

  async get(code: string): Promise<Room | null> {
    const raw = await redis.get(key(code));
    return raw ? (JSON.parse(raw) as Room) : null;
  },

  async delete(code: string): Promise<void> {
    await redis.del(key(code));
  },

  async exists(code: string): Promise<boolean> {
    return (await redis.exists(key(code))) === 1;
  },
};
