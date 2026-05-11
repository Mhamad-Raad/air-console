import { NotFoundError } from '../../shared/errors.js';
import { prisma } from '../../lib/prisma.js';
import { GAME_CATALOG } from './game.catalog.js';
import type { GameCatalogEntry } from './game.types.js';

// slug -> Game.id (cuid). Stable for the process lifetime once games are
// seeded, so a tiny in-memory cache replaces a Postgres round-trip on
// every game:end.
const idBySlugCache = new Map<string, string>();

export const GameService = {
  list(): GameCatalogEntry[] {
    return GAME_CATALOG.filter((g) => g.enabled);
  },

  get(slug: string): GameCatalogEntry {
    const game = GAME_CATALOG.find((g) => g.slug === slug && g.enabled);
    if (!game) throw new NotFoundError('Game not found');
    return game;
  },

  /**
   * Resolve a catalog slug to its Postgres `Game.id`. Used by the matches
   * pipeline since `Match.gameId` references `Game.id`, not `Game.slug`.
   * Returns null if the row hasn't been seeded yet (Postgres unreachable
   * at startup — gameplay still works, persistence is just skipped).
   */
  async idForSlug(slug: string): Promise<string | null> {
    const cached = idBySlugCache.get(slug);
    if (cached) return cached;
    const row = await prisma.game.findUnique({ where: { slug }, select: { id: true } });
    if (row?.id) {
      idBySlugCache.set(slug, row.id);
      return row.id;
    }
    return null;
  },

  /** Test-only: lets seeder reset the cache after upserts so first lookup is fresh. */
  invalidateIdCache(): void {
    idBySlugCache.clear();
  },
};
