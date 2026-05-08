// Centralised tunables. Mirrors backend/src/config/constants.ts where they
// overlap (max name length, code length). Keep both sides in sync until we
// extract a shared package.

export const PLAYER = {
  NAME_MAX_LENGTH: 24,
} as const;

export const ROOM = {
  CODE_LENGTH: 4,
} as const;

export const TIMING = {
  /** How long the kick "Are you sure?" prompt stays before auto-cancelling. */
  KICK_AUTOCANCEL_MS: 4000,
  /** Fallback nav-home delay if room:close ack never lands. */
  LEAVE_FALLBACK_MS: 600,
  /** Notice-then-redirect delay when a room no longer exists. */
  ROOM_NOT_FOUND_REDIRECT_MS: 1500,
} as const;

export const STORAGE_KEYS = {
  PLAYER_ID: 'air-console:playerId',
  LOCALE: 'air-console:locale',
  /** Per-room player name. Use storageKeys.roomName(code). */
  ROOM_NAME: (code: string) => `air-console:room:${code}:name`,
} as const;
