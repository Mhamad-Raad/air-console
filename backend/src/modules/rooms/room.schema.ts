import { z } from 'zod';

export const CreateRoomSchema = z.object({
  gameSlug: z.string().min(1),
});
export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;

export const JoinRoomSchema = z.object({
  code: z.string().length(4).regex(/^[A-Z0-9]+$/),
  name: z.string().min(1).max(24),
  playerId: z.string().optional(),
});
export type JoinRoomInput = z.infer<typeof JoinRoomSchema>;

export const PlayerPatchSchema = z.object({
  name: z.string().min(1).max(24).optional(),
  team: z.enum(['A', 'B']).nullable().optional(),
  isReady: z.boolean().optional(),
  locale: z.enum(['en', 'ar', 'ckb']).optional(),
});
export type PlayerPatchInput = z.infer<typeof PlayerPatchSchema>;
