// Persistent record of finished matches. Live state lives in Redis until
// game:end fires, at which point we copy a summary into Postgres for
// history / leaderboards / analytics.

import { prisma } from '../../lib/prisma.js';

interface MatchPlayerSnapshot {
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
    const row = await prisma.match.create({
      data: {
        code: input.code,
        gameId: input.gameId,
        startedAt: input.startedAt,
        endedAt: input.endedAt,
        // Prisma `Json` accepts any JSON-serialisable value; cast so TS
        // doesn't widen the type to Prisma.InputJsonValue paranoia.
        players: input.players as unknown as object,
        result: (input.result ?? null) as unknown as object,
      },
      select: { id: true },
    });
    return row;
  },
};
