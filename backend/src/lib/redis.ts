import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

export const redis = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
});

redis.on('error', (err) => {
  logger.error({ err }, 'redis error');
});

redis.on('connect', () => {
  logger.info('redis connected');
});

export async function disconnectRedis(): Promise<void> {
  await redis.quit();
}
