import { z } from 'zod';
import { PLAYER, ROOM } from '../../config/constants.js';

export const CreateRoomSchema = z.object({
  gameSlug: z.string().min(1),
});
export type CreateRoomInput = z.infer<typeof CreateRoomSchema>;

export const JoinRoomSchema = z.object({
  code: z.string().length(ROOM.CODE_LENGTH).regex(/^[A-Z0-9]+$/),
  name: z.string().min(PLAYER.NAME_MIN_LENGTH).max(PLAYER.NAME_MAX_LENGTH),
  playerId: z.string().optional(),
});
export type JoinRoomInput = z.infer<typeof JoinRoomSchema>;

export const PlayerPatchSchema = z.object({
  name: z.string().min(PLAYER.NAME_MIN_LENGTH).max(PLAYER.NAME_MAX_LENGTH).optional(),
  team: z.enum(['A', 'B']).nullable().optional(),
  isReady: z.boolean().optional(),
  locale: z.enum(['en', 'ar', 'ckb']).optional(),
});
export type PlayerPatchInput = z.infer<typeof PlayerPatchSchema>;
