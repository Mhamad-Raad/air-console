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

      // Engine rejections are domain events, not handler failures: surface
      // them on a dedicated channel and treat the handler as successful (it
      // correctly applied the rule). Re-throwing here would double-signal —
      // runHandler would also log a warn and ack({ok:false}).
      let dispatchResult;
      try {
        dispatchResult = await GameRuntime.dispatch(code, playerId, payload);
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Illegal action';
        socket.emit(ServerEvents.GameActionError, { error: message });
        return;
      }

      const room = await RoomService.get(code);
      broadcastGameState(room, dispatchResult.record);
      if (dispatchResult.finished) {
        // Engines that auto-finish will eventually trigger persistence here
        // too; for now game:end is host-driven (see room.handler.ts).
        logger.info({ code }, 'game finished');
      }
    }, ack),
  );
}
