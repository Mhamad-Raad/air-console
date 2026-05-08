import { ClientEvents, ServerEvents, type GameActionPayload } from '../events.js';
import { logger } from '../../lib/logger.js';
import type { AppSocket } from '../socketContext.js';

export function registerGameHandlers(socket: AppSocket): void {
  socket.on(ClientEvents.GameStart, (payload: { code: string }) => {
    // TODO: GameService.start — picks engine, builds initial state, broadcasts
    logger.debug({ code: payload.code }, 'game:start');
    socket.to(`room:${payload.code}`).emit(ServerEvents.GameState, { phase: 'starting' });
  });

  socket.on(ClientEvents.GameAction, (payload: GameActionPayload & { code: string }) => {
    // TODO: GameService.applyAction — server-authoritative state update
    logger.debug({ code: payload.code, type: payload.type }, 'game:action');
    socket.to(`room:${payload.code}`).emit(ServerEvents.GameState, { last: payload });
  });
}
