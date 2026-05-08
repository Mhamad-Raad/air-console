import { NotFoundError } from '../../shared/errors.js';
import { GAME_CATALOG } from './game.catalog.js';
import type { GameCatalogEntry } from './game.types.js';

export const GameService = {
  list(): GameCatalogEntry[] {
    return GAME_CATALOG.filter((g) => g.enabled);
  },

  get(slug: string): GameCatalogEntry {
    const game = GAME_CATALOG.find((g) => g.slug === slug && g.enabled);
    if (!game) throw new NotFoundError('Game not found');
    return game;
  },
};
