import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  Countdown,
  ScoreNumber,
  Stinger,
  celebrate,
  playSound,
} from '../../shared/feel';
import type { HostViewProps } from '../types';

type Phase = 'asking' | 'reveal' | 'finished';

interface QuestionPublic {
  id: string;
  text: string;
  choices: string[];
  category?: string;
  correctIndex?: number;
}

interface Submission {
  choice: number;
  submittedAt: number;
  correct: boolean;
  points: number;
}

interface TriviaHostView {
  phase: Phase;
  currentIndex: number;
  totalQuestions: number;
  phaseEndsAt: number;
  questionDurationMs: number;
  revealDurationMs: number;
  scores: Record<string, number>;
  question?: QuestionPublic;
  answeredPlayerIds?: string[];
  submissions?: Record<string, Submission>;
  result?: Array<{ playerId: string; score: number }>;
}

// Kahoot-inspired colour mapping. Combined with the A/B/C/D label the
// player sees on their phone, this gives a one-glance link between phone
// and TV without needing to read the answer text.
function colorFor(i: number): string {
  switch (i % 4) {
    case 0: return 'bg-red-500';
    case 1: return 'bg-blue-500';
    case 2: return 'bg-yellow-500 text-black';
    default: return 'bg-green-500';
  }
}
// Kahoot's iconic phone↔TV link: a shape per slot, paired 1:1 with the
// color in colorFor(). The player taps the shape on their phone; the
// matching shape lights up on the host screen. No reading required.
const CHOICE_LABELS = ['▲', '◆', '●', '■'];

export function HostView({ view, room }: HostViewProps<TriviaHostView>) {
  const { t } = useTranslation();
  const playerName = (id: string) =>
    room.players.find((p) => p.id === id)?.name ?? id.slice(0, 6);

  usePhaseSounds(view.phase);

  return (
    <div className="flex w-full max-w-5xl flex-col items-center gap-6">
      <TopBar view={view} t={t} />

      {view.phase === 'asking' && <Asking view={view} totalPlayers={room.players.length} t={t} />}
      {view.phase === 'reveal' && <Reveal view={view} playerName={playerName} t={t} />}
      {view.phase === 'finished' && <Finished view={view} playerName={playerName} t={t} />}
    </div>
  );
}

function usePhaseSounds(phase: Phase) {
  const prev = useRef<Phase | null>(null);
  useEffect(() => {
    if (prev.current !== phase) {
      if (phase === 'reveal') playSound('reveal');
      // 'finished' suspense sweep — the win + celebrate fire later inside
      // the drumroll when 1st place is revealed, not on phase entry.
      if (phase === 'finished') playSound('reveal');
    }
    prev.current = phase;
  }, [phase]);
}

function useRemainingSeconds(phaseEndsAt: number, resetKey: string): number {
  return useMemo(
    () => Math.max(0, Math.ceil((phaseEndsAt - Date.now()) / 1000)),
    // resetKey forces the memo to recompute when the phase/question changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phaseEndsAt, resetKey],
  );
}

interface TFn {
  (key: string, opts?: Record<string, unknown>): string;
}

function TopBar({ view, t }: { view: TriviaHostView; t: TFn }) {
  return (
    <div className="flex w-full items-center justify-between">
      <p className="text-sm uppercase tracking-widest text-white/40">
        {t('games.trivia.title')}
      </p>
      <p className="text-sm text-white/60">
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
  totalPlayers,
  t,
}: {
  view: TriviaHostView;
  totalPlayers: number;
  t: TFn;
}) {
  const q = view.question;
  const initialSeconds = useRemainingSeconds(
    view.phaseEndsAt,
    `asking-${view.currentIndex}`,
  );
  const answered = view.answeredPlayerIds?.length ?? 0;
  if (!q) return null;

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <Countdown seconds={initialSeconds} className="text-7xl" />

      <motion.h2
        key={q.id}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="text-center font-display text-5xl font-extrabold leading-snug tracking-tight"
      >
        {q.text}
      </motion.h2>

      <div className="grid w-full grid-cols-2 gap-4">
        {q.choices.map((choice, i) => (
          <motion.div
            key={`${q.id}-${i}`}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{
              delay: 0.1 + i * 0.07,
              type: 'spring',
              stiffness: 280,
              damping: 20,
            }}
            className={`rounded-2xl px-8 py-10 font-display text-3xl font-extrabold shadow-lg ${colorFor(i)}`}
          >
            <span className="mr-4 text-4xl drop-shadow">{CHOICE_LABELS[i]}</span>
            {choice}
          </motion.div>
        ))}
      </div>

      <p className="text-base text-white/60">
        {t('games.trivia.answeredCount', { answered, total: totalPlayers })}
      </p>
    </div>
  );
}

function Reveal({
  view,
  playerName,
  t,
}: {
  view: TriviaHostView;
  playerName: (id: string) => string;
  t: TFn;
}) {
  const q = view.question;
  if (!q || q.correctIndex === undefined) return null;
  const submissions = view.submissions ?? {};

  // Count how many players picked each option.
  const counts = q.choices.map(
    (_, i) =>
      Object.values(submissions).filter((s) => s.choice === i).length,
  );
  const maxCount = Math.max(1, ...counts);

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <motion.h2
        key={`${q.id}-reveal`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="text-center font-display text-5xl font-extrabold leading-snug tracking-tight"
      >
        {q.text}
      </motion.h2>

      <div className="grid w-full grid-cols-2 gap-4">
        {q.choices.map((choice, i) => {
          const isCorrect = i === q.correctIndex;
          const count = counts[i] ?? 0;
          const pct = count / maxCount;
          return (
            <motion.div
              key={`${q.id}-r-${i}`}
              animate={{
                scale: isCorrect ? 1.05 : 0.95,
                opacity: isCorrect ? 1 : 0.45,
              }}
              transition={{ type: 'spring', stiffness: 280, damping: 18 }}
              className={`relative overflow-hidden rounded-2xl px-8 py-10 font-display text-3xl font-extrabold shadow-lg ${colorFor(i)} ${isCorrect ? 'ring-4 ring-white' : ''}`}
            >
              {/* Vote bar: grows from the bottom of the tile, height
                  proportional to this option's share of the highest count.
                  Uses translate so it doesn't reflow text. */}
              <motion.div
                aria-hidden
                initial={{ scaleY: 0 }}
                animate={{ scaleY: pct }}
                transition={{ delay: 0.25, duration: 0.6, ease: [0.4, 0, 0.2, 1] }}
                style={{ transformOrigin: 'bottom' }}
                className="absolute inset-x-0 bottom-0 h-full bg-white/15 pointer-events-none"
              />
              <span className="relative mr-4 text-4xl drop-shadow">
                {CHOICE_LABELS[i]}
              </span>
              <span className="relative">{choice}</span>
              <motion.span
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
                className="absolute right-4 top-3 rounded-full bg-black/40 px-2 py-0.5 font-display text-sm tabular-nums"
              >
                {count}
              </motion.span>
            </motion.div>
          );
        })}
      </div>

      <Leaderboard scores={view.scores} playerName={playerName} t={t} compact />
    </div>
  );
}

function Finished({
  view,
  playerName,
  t,
}: {
  view: TriviaHostView;
  playerName: (id: string) => string;
  t: TFn;
}) {
  const ranked = view.result ?? [];
  const winner = ranked[0];
  // Drumroll stage gate: 0 = suspense beat, 1 = 3rd revealed,
  // 2 = 2nd revealed, 3 = 1st revealed (stinger fires here),
  // 4 = remaining leaderboard fades in below.
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const timers = [
      window.setTimeout(() => setStage(1), 900),
      window.setTimeout(() => setStage(2), 2100),
      window.setTimeout(() => setStage(3), 3300),
      window.setTimeout(() => setStage(4), 5000),
    ];
    return () => timers.forEach(window.clearTimeout);
  }, []);

  useEffect(() => {
    if (stage === 1 || stage === 2) playSound('tickFinal');
    if (stage === 3) {
      playSound('win');
      celebrate('epic');
    }
  }, [stage]);

  return (
    <div className="flex w-full flex-col items-center gap-6">
      <Stinger
        show={stage === 3}
        text={winner ? t('games.trivia.winner', { name: playerName(winner.playerId) }) : t('games.trivia.gameOver')}
        sound={null}
      />

      <h2 className="font-display text-3xl font-extrabold tracking-tight text-white/90">
        {t('games.trivia.leaderboard')}
      </h2>

      {/* Podium: 2nd | 1st | 3rd. Pedestals stay visible so layout is
          stable; contents pop in 3rd → 2nd → 1st with stagger. */}
      <div className="grid w-full max-w-3xl grid-cols-3 items-end gap-4">
        <PodiumSlot
          rank={2}
          entry={ranked[1]}
          revealed={stage >= 2}
          height="h-40"
          ringClass="ring-slate-300/70"
          bgClass="bg-slate-300/15"
          playerName={playerName}
        />
        <PodiumSlot
          rank={1}
          entry={ranked[0]}
          revealed={stage >= 3}
          height="h-56"
          ringClass="ring-amber-300"
          bgClass="bg-amber-400/20"
          playerName={playerName}
          crown
        />
        <PodiumSlot
          rank={3}
          entry={ranked[2]}
          revealed={stage >= 1}
          height="h-32"
          ringClass="ring-orange-400/70"
          bgClass="bg-orange-500/15"
          playerName={playerName}
        />
      </div>

      <AnimatePresence>
        {stage >= 4 && ranked.length > 3 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="w-full max-w-2xl"
          >
            <Leaderboard scores={view.scores} playerName={playerName} t={t} compact />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PodiumSlot({
  rank,
  entry,
  revealed,
  height,
  ringClass,
  bgClass,
  playerName,
  crown = false,
}: {
  rank: 1 | 2 | 3;
  entry?: { playerId: string; score: number };
  revealed: boolean;
  height: string;
  ringClass: string;
  bgClass: string;
  playerName: (id: string) => string;
  crown?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-2">
      <AnimatePresence>
        {revealed && entry && (
          <motion.div
            key="contents"
            initial={{ opacity: 0, y: 20, scale: 0.85 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ type: 'spring', stiffness: 320, damping: 18 }}
            className="flex flex-col items-center gap-1 text-center"
          >
            {crown && <div className="text-3xl">👑</div>}
            <div className="font-display text-2xl font-extrabold leading-tight">
              {playerName(entry.playerId)}
            </div>
            <div className="font-display text-3xl font-extrabold tabular-nums text-white">
              <ScoreNumber value={entry.score} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <div
        className={`flex w-full items-start justify-center rounded-t-xl ring-2 ${ringClass} ${bgClass} ${height} pt-3`}
      >
        <span className="font-display text-4xl font-extrabold text-white/80">
          {rank}
        </span>
      </div>
    </div>
  );
}

function Leaderboard({
  scores,
  playerName,
  t,
  compact = false,
}: {
  scores: Record<string, number>;
  playerName: (id: string) => string;
  t: TFn;
  compact?: boolean;
}) {
  const ranked = Object.entries(scores)
    .map(([id, score]) => ({ id, score }))
    .sort((a, b) => b.score - a.score);

  return (
    <section className="w-full max-w-2xl rounded-2xl bg-surface p-4">
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-widest text-white/40">
        {t('games.trivia.leaderboard')}
      </h3>
      <ol className={`space-y-2 ${compact ? 'text-base' : 'text-2xl'}`}>
        <AnimatePresence initial={false}>
          {ranked.map((entry, i) => (
            <motion.li
              key={entry.id}
              layout
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="flex items-center justify-between rounded-lg bg-white/5 px-4 py-2"
            >
              <span className="flex items-center gap-3">
                <span className="w-6 text-white/40">{i + 1}.</span>
                <span className="font-display font-semibold">{playerName(entry.id)}</span>
              </span>
              <span className="font-display font-extrabold tabular-nums">
                <ScoreNumber value={entry.score} />
              </span>
            </motion.li>
          ))}
        </AnimatePresence>
      </ol>
    </section>
  );
}
