import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import sensible from '@fastify/sensible';
import { env, corsOrigins } from './config/env.js';
import errorHandler from './plugins/errorHandler.js';
import roomsModule from './modules/rooms/index.js';
import gamesModule from './modules/games/index.js';

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: env.LOG_LEVEL,
      transport:
        env.NODE_ENV === 'development'
          ? {
              target: 'pino-pretty',
              options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
            }
          : undefined,
    },
    trustProxy: true,
  });

  await app.register(helmet, { contentSecurityPolicy: false });
  // In dev, accept any origin (so phones on the LAN can connect without
  // hardcoding their IP into CORS_ORIGIN). In prod, lock down via env.
  const corsOrigin = env.NODE_ENV === 'development' ? true : corsOrigins;
  await app.register(cors, {
    origin: corsOrigin,
    credentials: true,
  });
  await app.register(sensible);
  await app.register(errorHandler);

  app.get('/health', async () => ({ status: 'ok', uptime: process.uptime() }));

  await app.register(gamesModule);
  await app.register(roomsModule);

  return app;
}
