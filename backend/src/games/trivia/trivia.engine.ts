// Trivia engine — server-authoritative, Kahoot-style scoring.
//
// State machine: asking → reveal → asking → ... → reveal → finished.
//
// Time model: engines are pure data transforms, but Trivia needs
// time-based transitions. We embed phaseEndsAt in state and call
// rollTime() at the top of every applyAction/view to advance the state
// machine based on Date.now(). This keeps the existing realtime protocol
// untouched (host doesn't emit game:action) — any incoming player action
// or 'tick' nudges the state forward when its timer has elapsed.
//
// Scoring: correct answer = 500 base + speed bonus up to 500, where
// bonus = round(500 * remaining / duration). Max 1000 per question,
// 0 for wrong or unanswered.

import type { GameEngine } from '../engine.js';
import type {
  Question,
  Submission,
  TriviaAction,
  TriviaPhase,
  TriviaState,
} from './trivia.types.js';
import { pickQuestionsForMatch } from './questions.js';

const QUESTION_DURATION_MS = 15_000;
const REVEAL_DURATION_MS = 1_500;
const BASE_POINTS = 500;
const SPEED_BONUS_MAX = 500;

function emptyScoreboard(playerIds: string[]): Record<string, number> {
  return Object.fromEntries(playerIds.map((id) => [id, 0]));
}

function currentQuestion(state: TriviaState): Question | null {
  return state.questions[state.currentIndex] ?? null;
}

function scoreFor(question: Question, choice: number, elapsedMs: number, durationMs: number) {
  const correct = choice === question.correctIndex;
  if (!correct) return { correct: false, points: 0 };
  const remainingRatio = Math.max(0, (durationMs - elapsedMs) / durationMs);
  const points = BASE_POINTS + Math.round(SPEED_BONUS_MAX * remainingRatio);
  return { correct: true, points };
}

function allPlayersAnswered(state: TriviaState): boolean {
  const current = state.submissions[state.currentIndex];
  if (!current) return false;
  return state.playerIds.every((id) => current[id] !== undefined);
}

function enterAsking(state: TriviaState, now: number): TriviaState {
  return { ...state, phase: 'asking', phaseEndsAt: now + state.questionDurationMs };
}

function enterReveal(state: TriviaState, now: number): TriviaState {
  return { ...state, phase: 'reveal', phaseEndsAt: now + state.revealDurationMs };
}

function enterFinished(state: TriviaState): TriviaState {
  return { ...state, phase: 'finished', phaseEndsAt: 0, currentIndex: state.questions.length };
}

/**
 * Advance the state machine based on the current time. Idempotent —
 * called at the start of every action/view so callers never need to
 * reason about deadlines themselves.
 */
function rollTime(state: TriviaState, now: number): TriviaState {
  if (state.phase === 'finished') return state;
  if (now < state.phaseEndsAt) return state;

  if (state.phase === 'asking') {
    return enterReveal(state, now);
  }
  // reveal expired → next question or finish
  const nextIndex = state.currentIndex + 1;
  if (nextIndex >= state.questions.length) {
    return enterFinished(state);
  }
  return enterAsking({ ...state, currentIndex: nextIndex }, now);
}

function recordSubmission(
  state: TriviaState,
  playerId: string,
  question: Question,
  choice: number,
  now: number,
): TriviaState {
  const elapsed = state.questionDurationMs - (state.phaseEndsAt - now);
  const { correct, points } = scoreFor(question, choice, elapsed, state.questionDurationMs);
  const submission: Submission = { choice, submittedAt: now, correct, points };

  const submissions = state.submissions.slice();
  const current = { ...(submissions[state.currentIndex] ?? {}) };
  current[playerId] = submission;
  submissions[state.currentIndex] = current;

  const scores = { ...state.scores, [playerId]: (state.scores[playerId] ?? 0) + points };

  return { ...state, submissions, scores };
}

export const TriviaEngine: GameEngine<TriviaState, TriviaAction> = {
  init(playerIds) {
    const questions = pickQuestionsForMatch();
    const now = Date.now();
    const state: TriviaState = {
      phase: questions.length > 0 ? 'asking' : 'finished',
      questions,
      currentIndex: 0,
      phaseEndsAt: now + QUESTION_DURATION_MS,
      questionDurationMs: QUESTION_DURATION_MS,
      revealDurationMs: REVEAL_DURATION_MS,
      scores: emptyScoreboard(playerIds),
      submissions: questions.map(() => ({})),
      playerIds: [...playerIds],
    };
    return state;
  },

  applyAction(state, playerId, action) {
    const now = Date.now();
    let next = rollTime(state, now);

    if (!action || typeof action !== 'object') {
      throw new Error('Invalid action');
    }
    const a = action as TriviaAction;

    if (a.type === 'tick') {
      return next; // rollTime already applied
    }

    if (a.type === 'submit') {
      if (next.phase !== 'asking') throw new Error('Not accepting answers');
      const question = currentQuestion(next);
      if (!question) throw new Error('No active question');
      if (!next.playerIds.includes(playerId)) throw new Error('Player not in match');
      const existing = next.submissions[next.currentIndex]?.[playerId];
      if (existing) throw new Error('Already answered');
      const choice = a.data?.choice;
      if (typeof choice !== 'number' || choice < 0 || choice >= question.choices.length) {
        throw new Error('Invalid choice');
      }
      next = recordSubmission(next, playerId, question, choice, now);
      // If everyone has answered, jump straight to reveal — no need to wait
      // out the rest of the asking timer.
      if (allPlayersAnswered(next)) {
        next = enterReveal(next, now);
      }
      return next;
    }

    throw new Error('Unknown action type');
  },

  view(state, playerId) {
    const now = Date.now();
    const rolled = rollTime(state, now);
    return projectView(rolled, playerId);
  },

  hostView(state) {
    const now = Date.now();
    const rolled = rollTime(state, now);
    return projectHostView(rolled);
  },

  isFinished(state) {
    return rollTime(state, Date.now()).phase === 'finished';
  },

  result(state) {
    const final = rollTime(state, Date.now());
    if (final.phase !== 'finished') return null;
    const ranked = Object.entries(final.scores)
      .map(([id, score]) => ({ playerId: id, score }))
      .sort((a, b) => b.score - a.score);
    const winnerId = ranked[0]?.playerId ?? null;
    return { winnerId, ranked, totalQuestions: final.questions.length };
  },
};

// --- view projections -----------------------------------------------------

interface PublicQuestion {
  id: string;
  text: string;
  choices: string[];
  category?: string;
}

function stripAnswer(q: Question): PublicQuestion {
  const { id, text, choices, category } = q;
  return { id, text, choices: [...choices], category };
}

function commonHeader(state: TriviaState) {
  return {
    phase: state.phase,
    currentIndex: state.currentIndex,
    totalQuestions: state.questions.length,
    phaseEndsAt: state.phaseEndsAt,
    questionDurationMs: state.questionDurationMs,
    revealDurationMs: state.revealDurationMs,
    scores: { ...state.scores },
  };
}

function projectView(state: TriviaState, playerId: string) {
  if (state.phase === 'finished') {
    return { ...commonHeader(state), result: rankedScores(state), yourScore: state.scores[playerId] ?? 0 };
  }
  const question = currentQuestion(state);
  if (!question) return commonHeader(state);

  const mine = state.submissions[state.currentIndex]?.[playerId] ?? null;

  if (state.phase === 'asking') {
    return {
      ...commonHeader(state),
      question: stripAnswer(question),
      yourSubmission: mine ? { choice: mine.choice, submittedAt: mine.submittedAt } : null,
      yourScore: state.scores[playerId] ?? 0,
    };
  }

  // reveal — players see correct answer + their own result
  return {
    ...commonHeader(state),
    question: { ...stripAnswer(question), correctIndex: question.correctIndex },
    yourSubmission: mine,
    yourScore: state.scores[playerId] ?? 0,
  };
}

function projectHostView(state: TriviaState) {
  if (state.phase === 'finished') {
    return { ...commonHeader(state), result: rankedScores(state) };
  }
  const question = currentQuestion(state);
  if (!question) return commonHeader(state);

  const submissionsThis = state.submissions[state.currentIndex] ?? {};
  const answered = Object.keys(submissionsThis);

  if (state.phase === 'asking') {
    return {
      ...commonHeader(state),
      // Host shows the question + choices but NOT the correct index until reveal.
      question: stripAnswer(question),
      answeredPlayerIds: answered,
    };
  }

  return {
    ...commonHeader(state),
    question: { ...stripAnswer(question), correctIndex: question.correctIndex },
    submissions: submissionsThis,
  };
}

function rankedScores(state: TriviaState) {
  return Object.entries(state.scores)
    .map(([id, score]) => ({ playerId: id, score }))
    .sort((a, b) => b.score - a.score);
}

// Re-export the phase type for convenience at the engine boundary.
export type { TriviaState, TriviaAction, TriviaPhase };
