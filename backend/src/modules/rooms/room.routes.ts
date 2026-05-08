import type { FastifyInstance } from 'fastify';
import { CreateRoomSchema } from './room.schema.js';
import { RoomService } from './room.service.js';

export async function roomRoutes(app: FastifyInstance): Promise<void> {
  app.post('/rooms', async (request, reply) => {
    const body = CreateRoomSchema.parse(request.body);
    // Host socket id will be supplied via WS handshake later — for the REST
    // bootstrap path the client passes a placeholder until a host connects.
    const room = await RoomService.create({ gameSlug: body.gameSlug, hostSocketId: '' });
    return reply.status(201).send(room);
  });

  app.get<{ Params: { code: string } }>('/rooms/:code', async (request) => {
    return RoomService.get(request.params.code.toUpperCase());
  });
}
