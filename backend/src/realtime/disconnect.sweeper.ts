// Periodic janitor for the disconnect-grace flow.
// Disconnect handlers mark players with `disconnectedAt`; this sweeper
// removes the seat once the grace window has elapsed. Idempotent — a
// reconnect during the window clears the flag and the sweeper skips them.

import { logger } from '../lib/logger.js';
import { PLAYER } from '../config/constants.js';
import { RoomRepository } from '../modules/rooms/room.repository.js';
import { RoomService } from '../modules/rooms/room.service.js';
import { broadcastState } from './handlers/utils.js';

let timer: NodeJS.Timeout | null = null;

async function sweepOnce(): Promise<void> {
  const cutoff = Date.now() - PLAYER.DISCONNECT_GRACE_SECONDS * 1000;
  for await (const code of RoomRepository.iterateCodes()) {
    try {
      const room = await RoomRepository.get(code);
      if (!room) continue;
      const stale = room.players.filter(
        (p) => p.disconnectedAt !== undefined && p.disconnectedAt < cutoff,
      );
      if (stale.length === 0) continue;

      let latest = room;
      for (const p of stale) {
        const next = await RoomService.removePlayer(code, p.id);
        if (next) latest = next;
      }
      logger.info(
        { code, removed: stale.map((p) => p.id) },
        'sweeper removed timed-out players',
      );
      await broadcastState(code, latest);
    } catch (err) {
      logger.debug({ err, code }, 'sweep skipped room');
    }
  }
}

export function startDisconnectSweeper(): void {
  if (timer) return;
  timer = setInterval(() => {
    void sweepOnce().catch((err) => logger.warn({ err }, 'sweep failed'));
  }, PLAYER.DISCONNECT_SWEEP_INTERVAL_SECONDS * 1000);
  // Don't keep the process alive purely for the sweeper.
  timer.unref?.();
  logger.info(
    {
      graceSeconds: PLAYER.DISCONNECT_GRACE_SECONDS,
      intervalSeconds: PLAYER.DISCONNECT_SWEEP_INTERVAL_SECONDS,
    },
    'disconnect sweeper started',
  );
}

export function stopDisconnectSweeper(): void {
  if (!timer) return;
  clearInterval(timer);
  timer = null;
}
