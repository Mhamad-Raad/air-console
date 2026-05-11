import { buildServer } from './server.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { attachSocketIO } from './realtime/socket.js';
import { stopDisconnectSweeper } from './realtime/disconnect.sweeper.js';
import { seedGames } from './modules/games/game.seeder.js';
import { disconnectPrisma } from './lib/prisma.js';

async function main() {
  const app = await buildServer();

  try {
    await app.listen({ port: env.PORT, host: env.HOST });
    attachSocketIO(app);
    logger.info({ port: env.PORT }, 'socket.io attached');
  } catch (err) {
    logger.error({ err }, 'failed to start server');
    process.exit(1);
  }

  // Mirror the in-code catalog into Postgres so finished matches can FK
  // to a Game row. Non-fatal: lobby + live game work without Postgres.
  await seedGames().catch((err) => {
    logger.warn(
      { err: err instanceof Error ? err.message : err },
      'game catalog seed failed (Match persistence will be skipped)',
    );
  });

  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'shutting down');
    stopDisconnectSweeper();
    await app.close();
    await disconnectPrisma().catch(() => undefined);
    process.exit(0);
  };

  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'fatal');
  process.exit(1);
});
