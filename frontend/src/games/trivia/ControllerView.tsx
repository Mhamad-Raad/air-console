import { useEffect, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  Button,
  Countdown,
  ScoreNumber,
  Stinger,
  celebrate,
  playSound,
  pulse,
} from '../../shared/feel';
import type { ControllerViewProps } from '../types';

type Phase = 'asking' | 'reveal' | 'finished';

interface QuestionPublic {
  id: string;
  text: string;
  choices: string[];
  category?: string;
  correctIndex?: number;
}

interface MySubmission {
  choice: number;
  submittedAt: number;
  correct?: boolean;
  points?: number;
}

interface TriviaPlayerView {
  phase: Phase;
  currentIndex: number;
  totalQuestions: number;
  phaseEndsAt: number;
  questionDurationMs: number;
  revealDurationMs: number;
  scores: Record<string, number>;
  question?: QuestionPublic;
  yourSubmission?: MySubmission | null;
  yourScore?: number;
  result?: Array<{ playerId: string; score: number }>;
}

function colorFor(i: number): string {
  switch (i % 4) {
    case 0: return 'bg-red-500';
    case 1: return 'bg-blue-500';
    case 2: return 'bg-yellow-500 text-black';
    default: return 'bg-green-500';
  }
}
// Shape per slot, matched 1:1 with the host's tiles. Tap shape on phone,
// matching shape lights up on TV — language-independent affordance.
const CHOICE_LABELS = ['▲', '◆', '●', '■'];

export function ControllerView({ view, me, emit }: ControllerViewProps<TriviaPlayerView>) {
  const { t } = useTranslation();
  useFeedbackEffects(view, me.id);

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4">
      <TopBar view={view} t={t} />

      {view.phase === 'asking' && <Asking view={view} emit={emit} t={t} />}
      {view.phase === 'reveal' && <Reveal view={view} emit={emit} t={t} />}
      {view.phase === 'finished' && <Finished view={view} meId={me.id} t={t} />}
    </div>
  );
}

function useFeedbackEffects(view: TriviaPlayerView, meId: string) {
  // Fire sound + haptic + confetti exactly once when entering reveal/finished,
  // so re-renders within the same phase don't replay them.
  const lastKey = useRef<string>('');
  useEffect(() => {
    const key = `${view.phase}-${view.currentIndex}`;
    if (lastKey.current === key) return;
    lastKey.current = key;

    if (view.phase === 'reveal') {
      const correct = view.yourSubmission?.correct;
      if (correct === true) {
        playSound('correct');
        pulse('medium');
        celebrate('small');
      } else if (correct === false) {
        playSound('wrong');
        pulse('heavy');
      }
    }
    if (view.phase === 'finished') {
      const ranked = view.result ?? [];
      const myRank = ranked.findIndex((r) => r.playerId === meId);
      if (myRank === 0) {
        playSound('win');
        celebrate('epic');
      } else if (myRank >= 0) {
        playSound('lose');
      }
    }
  }, [view, meId]);
}

function useRemainingSeconds(phaseEndsAt: number, resetKey: string): number {
  return useMemo(
    () => Math.max(0, Math.ceil((phaseEndsAt - Date.now()) / 1000)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phaseEndsAt, resetKey],
  );
}

interface TFn {
  (key: string, opts?: Record<string, unknown>): string;
}

function TopBar({ view, t }: { view: TriviaPlayerView; t: TFn }) {
  return (
    <div className="flex w-full items-center justify-between">
      <p className="text-xs uppercase tracking-widest text-white/40">
        {t('games.trivia.title')}
      </p>
      <p className="text-xs text-white/60">
        {t('games.trivia.questionOf', {
          n: Math.min(view.currentIndex + 1, view.totalQuestions),
          total: view.totalQuestions,
        })}
      </p>
    </div>
  );
}

function Asking({
  view,
  emit,
  t,
}: {
  view: TriviaPlayerView;
  emit: ControllerViewProps['emit'];
  t: TFn;
}) {
  const q = view.question;
  const initialSeconds = useRemainingSeconds(
    view.phaseEndsAt,
    `asking-${view.currentIndex}`,
  );
  const locked = view.yourSubmission != null;
  if (!q) return null;

  return (
    <>
      <Countdown seconds={initialSeconds} className="text-4xl" />

      <motion.p
        key={q.id}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="text-center text-lg font-medium text-white/80"
      >
        {q.text}
      </motion.p>

      <div className="grid w-full grid-cols-2 gap-3">
        {q.choices.map((choice, i) => (
          <Button
            key={`${q.id}-${i}`}
            variant="primary"
            sound="select"
            haptic="medium"
            disabled={locked}
            onClick={() => emit({ type: 'submit', data: { choice: i } })}
            className={`${colorFor(i)} h-24 flex-col text-lg`}
          >
            <span className="font-display text-3xl font-extrabold leading-none">
              {CHOICE_LABELS[i]}
            </span>
            <span className="mt-1 text-sm font-medium opacity-90">{choice}</span>
          </Button>
        ))}
      </div>

      {locked && (
        <motion.p
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-base font-semibold text-emerald-400"
        >
          {t('games.trivia.lockedIn')}
        </motion.p>
      )}
    </>
  );
}

function Reveal({
  view,
  emit,
  t,
}: {
  view: TriviaPlayerView;
  emit: ControllerViewProps['emit'];
  t: TFn;
}) {
  // Engine only advances reveal→next on an incoming action. Without this
  // auto-tick the game would freeze after every reveal. Every controller
  // schedules a tick when reveal ends; the first to arrive advances state
  // server-side, the rest no-op through the same applyAction path.
  useEffect(() => {
    const delay = Math.max(0, view.phaseEndsAt - Date.now()) + 120;
    const id = window.setTimeout(() => emit({ type: 'tick' }), delay);
    return () => window.clearTimeout(id);
  }, [view.phaseEndsAt, emit]);

  const q = view.question;
  const sub = view.yourSubmission;
  if (!q || q.correctIndex === undefined) return null;

  const didAnswer = sub != null;
  const correct = sub?.correct === true;
  const points = sub?.points ?? 0;

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 18 }}
        className={`rounded-2xl px-6 py-4 font-display text-3xl font-extrabold ${
          correct ? 'bg-green-500/20 text-green-300' : 'bg-red-500/20 text-red-300'
        }`}
      >
        {didAnswer
          ? correct
            ? t('games.trivia.correct')
            : t('games.trivia.wrong')
          : t('games.trivia.noAnswer')}
      </motion.div>

      {correct && (
        <motion.p
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-xl font-bold text-emerald-300"
        >
          {t('games.trivia.pointsGained', { points })}
        </motion.p>
      )}

      <div className="w-full rounded-xl bg-surface p-4 text-center">
        <p className="text-xs uppercase tracking-widest text-white/40">
          {t('games.trivia.yourScore')}
        </p>
        <p className="mt-1 font-display text-4xl font-extrabold">
          <ScoreNumber value={view.yourScore ?? 0} />

        </p>
      </div>

      <p className="text-xs text-white/40">{t('games.trivia.waitingForNext')}</p>
    </div>
  );
}

function Finished({
  view,
  meId,
  t,
}: {
  view: TriviaPlayerView;
  meId: string;
  t: TFn;
}) {
  const ranked = view.result ?? [];
  const myRank = ranked.findIndex((r) => r.playerId === meId);
  const myScore = view.yourScore ?? 0;

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <Stinger
        show
        text={myRank === 0 ? t('games.trivia.youWin') : t('games.trivia.gameOver')}
        subtext={
          myRank >= 0 ? t('games.trivia.youRank', { rank: myRank + 1 }) : undefined
        }
        sound={null}
      />

      <div className="w-full rounded-xl bg-surface p-4 text-center">
        <p className="text-xs uppercase tracking-widest text-white/40">
          {t('games.trivia.finalScore')}
        </p>
        <p className="mt-1 font-display text-5xl font-extrabold">
          <ScoreNumber value={myScore} />
        </p>
      </div>

      {myRank >= 0 && (
        <p className="text-sm text-white/60">
          {t('games.trivia.youRank', { rank: myRank + 1 })} / {ranked.length}
        </p>
      )}
    </div>
  );
}
