import type { GameCatalogEntry } from './game.types.js';

// Static catalog for MVP. Move to DB once we have an admin UI.
export const GAME_CATALOG: GameCatalogEntry[] = [
  {
    slug: 'dominos',
    name: 'Dominos',
    description: 'Classic dominos with team play.',
    minPlayers: 2,
    maxPlayers: 4,
    supportsTeams: true,
    requireReady: true,
    enabled: true,
  },
  {
    slug: 'trivia',
    name: 'Iraqi Pop Quiz',
    description: 'Fast-paced trivia. Faster correct answers score more.',
    minPlayers: 1,
    maxPlayers: 8,
    supportsTeams: false,
    requireReady: false,
    enabled: true,
  },
];
