import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import { roomRoutes } from './room.routes.js';

async function roomsModule(app: FastifyInstance) {
  await app.register(roomRoutes, { prefix: '/api' });
}

export default fp(roomsModule, { name: 'rooms-module' });
