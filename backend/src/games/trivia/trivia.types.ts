// Shapes shared inside the Trivia engine. Kept separate from the engine
// module so packs / smoke tests can import them without dragging the
// engine's logic.

export interface Question {
  id: string;
  text: string;
  /** Multiple-choice options in display order. Typically 4 (Kahoot-style). */
  choices: string[];
  correctIndex: number;
  category?: string;
  /** Optional locale tag — informational; engine doesn't switch on it. */
  locale?: 'en' | 'ar' | 'ckb';
}

/**
 * A single player's submitted answer for one question. `correct` and
 * `points` are populated by the engine when the answer is recorded so
 * later reveal-view projections don't have to recompute.
 */
export interface Submission {
  choice: number;
  submittedAt: number;
  correct: boolean;
  points: number;
}

export type TriviaPhase = 'asking' | 'reveal' | 'finished';

export interface TriviaState {
  phase: TriviaPhase;
  /** The questions chosen for this match, in play order. Length ≤ MAX. */
  questions: Question[];
  /** Index into `questions`. When phase='finished' this equals questions.length. */
  currentIndex: number;
  /** Epoch ms at which the current phase ends (asking deadline / reveal end). */
  phaseEndsAt: number;
  /** Durations carried in state so future configs can tweak per-match. */
  questionDurationMs: number;
  revealDurationMs: number;
  /** Cumulative score per playerId. */
  scores: Record<string, number>;
  /** Per-question submissions: submissions[i] = { playerId: Submission }. */
  submissions: Array<Record<string, Submission>>;
  /** Player ids in the match. Stored so the engine knows the cohort. */
  playerIds: string[];
}

export type TriviaAction =
  | { type: 'submit'; data: { choice: number } }
  | { type: 'tick'; data?: Record<string, never> };
