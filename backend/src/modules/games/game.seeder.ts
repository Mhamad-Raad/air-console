// Mirror the in-code GAME_CATALOG into Postgres so Match rows can FK to it.
// The catalog stays the source of truth in code (per the Phase 1 design
// note in PLAN.md); this is a startup-time idempotent upsert.

import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { GAME_CATALOG } from './game.catalog.js';
import { GameService } from './game.service.js';

export async function seedGames(): Promise<void> {
  for (const entry of GAME_CATALOG) {
    const data = {
      name: entry.name,
      description: entry.description,
      minPlayers: entry.minPlayers,
      maxPlayers: entry.maxPlayers,
      iconUrl: entry.iconUrl ?? null,
      enabled: entry.enabled,
    };
    await prisma.game.upsert({
      where: { slug: entry.slug },
      update: data,
      create: { slug: entry.slug, ...data },
    });
  }
  // Force the slug->id cache to reload from a freshly-seeded table.
  GameService.invalidateIdCache();
  logger.info({ count: GAME_CATALOG.length }, 'games seeded');
}
