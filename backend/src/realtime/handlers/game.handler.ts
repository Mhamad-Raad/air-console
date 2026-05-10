// Routes player actions into whichever engine the room's game is bound to.
// Per-player projections fan out via broadcastGameState — each connected
// socket sees only what `engine.view(state, playerId)` exposes.

import { ClientEvents, ServerEvents, type GameActionPayload } from '../events.js';
import { logger } from '../../lib/logger.js';
import { GameRuntime } from '../../games/game.runtime.js';
import { RoomService } from '../../modules/rooms/room.service.js';
import type { AppSocket } from '../socketContext.js';
import { broadcastGameState, runHandler, type Ack } from './utils.js';

export function registerGameHandlers(socket: AppSocket): void {
  socket.on(ClientEvents.GameAction, (payload: GameActionPayload, ack?: Ack) =>
    runHandler('game:action', async () => {
      const { code, role, playerId } = socket.data;
      if (!code) throw new Error('Not in a room');
      if (role !== 'player' || !playerId) throw new Error('Players only');
      if (!payload || typeof payload !== 'object') throw new Error('Invalid action');

      try {
        const { record, finished } = await GameRuntime.dispatch(code, playerId, payload);
        const room = await RoomService.get(code);
        broadcastGameState(room, record);
        if (finished) {
          // game:end is host-driven for now; engines that auto-finish will trigger
          // the same persistence path in the next commit.
          logger.info({ code }, 'game finished');
        }
      } catch (err) {
        // Engine rejected the move — tell only the offending player.
        const message = err instanceof Error ? err.message : 'Illegal action';
        socket.emit(ServerEvents.GameActionError, { error: message });
        throw err;
      }
    }, ack),
  );
}
