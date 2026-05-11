// Mirror the in-code GAME_CATALOG into Postgres so Match rows can FK to it.
// The catalog stays the source of truth in code (per the Phase 1 design
// note in PLAN.md); this is a startup-time idempotent upsert.

import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { GAME_CATALOG } from './game.catalog.js';

export async function seedGames(): Promise<void> {
  for (const entry of GAME_CATALOG) {
    await prisma.game.upsert({
      where: { slug: entry.slug },
      update: {
        name: entry.name,
        description: entry.description,
        minPlayers: entry.minPlayers,
        maxPlayers: entry.maxPlayers,
        iconUrl: entry.iconUrl ?? null,
        enabled: entry.enabled,
      },
      create: {
        slug: entry.slug,
        name: entry.name,
        description: entry.description,
        minPlayers: entry.minPlayers,
        maxPlayers: entry.maxPlayers,
        iconUrl: entry.iconUrl ?? null,
        enabled: entry.enabled,
      },
    });
  }
  logger.info({ count: GAME_CATALOG.length }, 'games seeded');
}

/**
 * Resolve a slug to its Postgres Game.id (cuid). Used by the matches
 * pipeline since Match.gameId references Game.id, not Game.slug.
 */
export async function gameIdForSlug(slug: string): Promise<string | null> {
  const row = await prisma.game.findUnique({ where: { slug }, select: { id: true } });
  return row?.id ?? null;
}
