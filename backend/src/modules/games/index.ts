import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { gameRoutes } from './game.routes.js';

async function gamesModule(app: FastifyInstance) {
  await app.register(gameRoutes, { prefix: '/api' });
}

export default fp(gamesModule, { name: 'games-module' });
