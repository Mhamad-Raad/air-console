// Orchestration for the end-of-game persistence path. Keeps the
// realtime handler thin (per the project's module-shaped architecture)
// and gives Phase 7+ leaderboards a single read-side seam.

import { logger } from '../../lib/logger.js';
import { GameService } from '../games/game.service.js';
import type { Room } from '../rooms/room.types.js';
import type { GameRecord } from '../../games/game.runtime.js';
import { GameRuntime } from '../../games/game.runtime.js';
import { MatchRepository } from './match.repository.js';

export const MatchService = {
  /**
   * Persist a finished match to Postgres. Non-fatal: if Postgres is
   * unreachable or the catalog hasn't been seeded, we log and return null
   * — gameplay already finished, so the host should not see an error.
   */
  async recordEnd(
    code: string,
    roomBefore: Room,
    record: GameRecord,
  ): Promise<{ id: string } | null> {
    try {
      const gameId = await GameService.idForSlug(record.slug);
      if (!gameId) {
        logger.warn(
          { slug: record.slug },
          'no Game row for slug; skipping Match persistence',
        );
        return null;
      }
      return await MatchRepository.create({
        code,
        gameId,
        startedAt: new Date(record.startedAt),
        endedAt: new Date(),
        players: roomBefore.players.map((p) => ({
          id: p.id,
          name: p.name,
          team: p.team ?? null,
        })),
        result: GameRuntime.resultOf(record),
      });
    } catch (err) {
      logger.warn({ err }, 'Match persistence failed; continuing');
      return null;
    }
  },
};
