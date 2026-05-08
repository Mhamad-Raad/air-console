// Centralised tunables. Duplicated on the frontend until we extract a shared
// package — keep both sides in sync when changing.

export const ROOM = {
  /** TTL on Redis records — abandoned rooms auto-expire. */
  TTL_SECONDS: 60 * 60 * 6, // 6h
  /** Length of the auto-generated room code (e.g. "AB23"). */
  CODE_LENGTH: 4,
  /** Alphabet for room codes — no I/O/0/1 to avoid mis-reads. */
  CODE_ALPHABET: 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789',
  /** How many code-collision retries before giving up. */
  CODE_COLLISION_RETRIES: 10,
} as const;

export const PLAYER = {
  NAME_MIN_LENGTH: 1,
  NAME_MAX_LENGTH: 24,
} as const;
