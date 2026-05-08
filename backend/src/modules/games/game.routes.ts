import type { FastifyInstance } from 'fastify';
import { GameService } from './game.service.js';

export async function gameRoutes(app: FastifyInstance): Promise<void> {
  app.get('/games', async () => GameService.list());

  app.get<{ Params: { slug: string } }>('/games/:slug', async (request) => {
    return GameService.get(request.params.slug);
  });
}
