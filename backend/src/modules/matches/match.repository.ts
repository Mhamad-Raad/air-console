// Persistent record of finished matches. Live state lives in Redis until
// game:end fires, at which point we copy a summary into Postgres for
// history / leaderboards / analytics.

import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';

export interface MatchPlayerSnapshot {
  id: string;
  name: string;
  team: 'A' | 'B' | null;
}

export interface CreateMatchInput {
  code: string;
  gameId: string;
  startedAt: Date;
  endedAt: Date;
  players: MatchPlayerSnapshot[];
  result: unknown;
}

export const MatchRepository = {
  async create(input: CreateMatchInput): Promise<{ id: string }> {
    return prisma.match.create({
      data: {
        code: input.code,
        gameId: input.gameId,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        players: input.players as unknown as Prisma.InputJsonValue,
        result:
          input.result === undefined || input.result === null
            ? Prisma.JsonNull
            : (input.result as Prisma.InputJsonValue),
      },
      select: { id: true },
    });
  },
};
