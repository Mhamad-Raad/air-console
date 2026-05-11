// Question pack registry. Today: a single English pack loaded at module
// init. Future: per-room locale + category selection, admin-supplied
// packs. The engine talks to this module so swapping content doesn't
// touch the engine.

import type { Question } from './trivia.types.js';
import { DEFAULT_EN_PACK } from './packs/default-en.js';

const ACTIVE_PACK: Question[] = DEFAULT_EN_PACK;

export const MAX_QUESTIONS_PER_MATCH = 10;

/**
 * Pick up to MAX_QUESTIONS_PER_MATCH questions for a match. Deterministic
 * for now (slice from the front); randomisation lands once a pack is
 * large enough that repeat-avoidance across matches matters.
 */
export function pickQuestionsForMatch(): Question[] {
  return ACTIVE_PACK.slice(0, MAX_QUESTIONS_PER_MATCH);
}
