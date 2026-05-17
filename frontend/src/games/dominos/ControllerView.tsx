import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  Button,
  ScoreNumber,
  Stinger,
  celebrate,
  playSound,
  pulse,
} from '../../shared/feel';
import { DominoTile, type TilePair } from './DominoTile';
import type { ControllerViewProps } from '../types';

type Phase = 'playing' | 'roundEnd' | 'finished';
type Pip = 0 | 1 | 2 | 3 | 4 | 5 | 6;

interface PlacedTile {
  tile: TilePair;
  side: 'left' | 'right';
  orientation: 'horizontal' | 'vertical';
}

interface RoundResult {
  winnerId: string | null;
  points: number;
  blocked: boolean;
}

interface DominosPlayerView {
  phase: Phase;
  playerIds: string[];
  board: PlacedTile[];
  leftEnd: Pip | null;
  rightEnd: Pip | null;
  turn: string | null;
  starterId: string | null;
  scores: Record<string, number>;
  rounds: RoundResult[];
  targetScore: number;
  winnerId: string | null;
  handCounts: Record<string, number>;
  yourHand: TilePair[];
  canPlay: boolean;
}

interface TFn {
  (key: string, opts?: Record<string, unknown>): string;
}

export function ControllerView({
  view,
  me,
  emit,
}: ControllerViewProps<DominosPlayerView>) {
  const { t } = useTranslation();
  useFeedbackEffects(view, me.id);

  // Once per round-end transition, the first-listed player emits `continue`
  // so the engine deals the next round. Only one client emits to avoid the
  // engine throwing on duplicate continues (it errors when not in roundEnd).
  useContinueScheduler(view, me.id, emit);

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-4">
      <TopBar view={view} me={me.id} t={t} />

      {view.phase === 'playing' && (
        <PlayingControls view={view} meId={me.id} emit={emit} t={t} />
      )}
      {view.phase === 'roundEnd' && (
        <RoundEndPanel view={view} meId={me.id} t={t} />
      )}
      {view.phase === 'finished' && (
        <FinishedPanel view={view} meId={me.id} t={t} />
      )}
    </div>
  );
}

function useFeedbackEffects(view: DominosPlayerView, meId: string) {
  const lastKey = useRef<string>('');
  useEffect(() => {
    const key = `${view.phase}-${view.rounds.length}`;
    if (lastKey.current === key) return;
    lastKey.current = key;

    if (view.phase === 'roundEnd') {
      const last = view.rounds[view.rounds.length - 1];
      if (last?.winnerId === meId) {
        playSound('correct');
        pulse('medium');
        celebrate('small');
      } else if (last?.winnerId) {
        playSound('wrong');
      }
    }
    if (view.phase === 'finished') {
      if (view.winnerId === meId) {
        playSound('win');
        celebrate('epic');
      } else {
        playSound('lose');
      }
    }
  }, [view, meId]);
}

function useContinueScheduler(
  view: DominosPlayerView,
  meId: string,
  emit: ControllerViewProps['emit'],
) {
  useEffect(() => {
    if (view.phase !== 'roundEnd') return;
    if (view.playerIds[0] !== meId) return;
    const id = window.setTimeout(() => emit({ type: 'continue' }), 4000);
    return () => window.clearTimeout(id);
  }, [view.phase, view.playerIds, view.rounds.length, meId, emit]);
}

function TopBar({
  view,
  me,
  t,
}: {
  view: DominosPlayerView;
  me: string;
  t: TFn;
}) {
  const roundNumber = view.rounds.length + (view.phase === 'roundEnd' ? 0 : 1);
  return (
    <div className="flex w-full items-center justify-between">
      <p className="text-xs uppercase tracking-widest text-white/40">
        {t('games.dominos.title')}
      </p>
      <div className="flex items-center gap-3 text-xs">
        <span className="text-white/40">
          {t('games.dominos.roundShort', { n: roundNumber })}
        </span>
        <span className="text-white/70 tabular-nums">
          <ScoreNumber value={view.scores[me] ?? 0} />
        </span>
      </div>
    </div>
  );
}

function PlayingControls({
  view,
  meId,
  emit,
  t,
}: {
  view: DominosPlayerView;
  meId: string;
  emit: ControllerViewProps['emit'];
  t: TFn;
}) {
  const isMyTurn = view.turn === meId;
  const opening = view.leftEnd === null && view.rightEnd === null;
  const [selected, setSelected] = useState<number | null>(null);

  // Reset selection whenever it's no longer my turn or my hand changes.
  useEffect(() => {
    if (!isMyTurn) setSelected(null);
  }, [isMyTurn]);
  useEffect(() => {
    setSelected(null);
  }, [view.yourHand.length]);

  const matches = useMemo(
    () =>
      view.yourHand.map((tile) => ({
        left:
          opening ||
          (view.leftEnd !== null &&
            (tile[0] === view.leftEnd || tile[1] === view.leftEnd)),
        right:
          opening ||
          (view.rightEnd !== null &&
            (tile[0] === view.rightEnd || tile[1] === view.rightEnd)),
      })),
    [view.yourHand, view.leftEnd, view.rightEnd, opening],
  );

  const sel = selected != null ? view.yourHand[selected] : null;
  const selMatch = selected != null ? matches[selected] : null;

  function play(side: 'left' | 'right') {
    if (sel == null) return;
    emit({
      type: 'play',
      data: { tile: [sel[0], sel[1]], side },
    });
    setSelected(null);
  }

  function onTileTap(i: number) {
    if (!isMyTurn) return;
    const m = matches[i];
    if (!m) return;
    if (!m.left && !m.right) return; // unplayable — ignore

    // If exactly one side matches (and it's not the opening move where both
    // are allowed), play immediately. Otherwise let the user pick a side.
    if (!opening && m.left && !m.right) {
      const tile = view.yourHand[i]!;
      emit({ type: 'play', data: { tile: [tile[0], tile[1]], side: 'left' } });
      return;
    }
    if (!opening && !m.left && m.right) {
      const tile = view.yourHand[i]!;
      emit({ type: 'play', data: { tile: [tile[0], tile[1]], side: 'right' } });
      return;
    }
    setSelected((cur) => (cur === i ? null : i));
  }

  return (
    <>
      <TurnHeader view={view} meId={meId} t={t} />

      <EndsIndicator view={view} t={t} />

      <Hand
        hand={view.yourHand}
        matches={matches}
        selected={selected}
        onTileTap={onTileTap}
        isMyTurn={isMyTurn}
      />

      <AnimatePresence>
        {sel && selMatch && (
          <motion.div
            key="sides"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="grid w-full grid-cols-2 gap-3"
          >
            <Button
              variant="primary"
              disabled={!selMatch.left}
              onClick={() => play('left')}
              sound="select"
              haptic="medium"
            >
              ◀ {opening ? t('games.dominos.play') : t('games.dominos.playLeft', { value: view.leftEnd })}
            </Button>
            {!opening ? (
              <Button
                variant="primary"
                disabled={!selMatch.right}
                onClick={() => play('right')}
                sound="select"
                haptic="medium"
              >
                {t('games.dominos.playRight', { value: view.rightEnd })} ▶
              </Button>
            ) : (
              <Button variant="secondary" disabled>
                —
              </Button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <Button
        variant="secondary"
        disabled={!isMyTurn || view.canPlay}
        onClick={() => emit({ type: 'pass' })}
        className="w-full"
        sound="tap"
      >
        {t('games.dominos.pass')}
      </Button>
    </>
  );
}

function TurnHeader({
  view,
  meId,
  t,
}: {
  view: DominosPlayerView;
  meId: string;
  t: TFn;
}) {
  const isMyTurn = view.turn === meId;
  if (isMyTurn) {
    return (
      <motion.p
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 18 }}
        className="font-display text-2xl font-extrabold text-emerald-300"
      >
        {view.canPlay
          ? t('games.dominos.yourTurn')
          : t('games.dominos.mustPass')}
      </motion.p>
    );
  }
  return (
    <p className="text-sm text-white/60">
      {t('games.dominos.waitingForTurn')}
    </p>
  );
}

function EndsIndicator({ view, t }: { view: DominosPlayerView; t: TFn }) {
  if (view.leftEnd === null || view.rightEnd === null) {
    return (
      <p className="text-xs uppercase tracking-widest text-white/40">
        {t('games.dominos.boardEmpty')}
      </p>
    );
  }
  return (
    <div className="flex items-center gap-3 text-xs">
      <span className="rounded-full bg-white/10 px-3 py-1 text-white/80">
        {t('games.dominos.leftEnd', { value: view.leftEnd })}
      </span>
      <span className="rounded-full bg-white/10 px-3 py-1 text-white/80">
        {t('games.dominos.rightEnd', { value: view.rightEnd })}
      </span>
    </div>
  );
}

function Hand({
  hand,
  matches,
  selected,
  onTileTap,
  isMyTurn,
}: {
  hand: TilePair[];
  matches: ReadonlyArray<{ left: boolean; right: boolean }>;
  selected: number | null;
  onTileTap: (i: number) => void;
  isMyTurn: boolean;
}) {
  if (hand.length === 0) {
    return (
      <p className="text-sm text-white/40">No tiles dealt yet.</p>
    );
  }

  return (
    <div className="w-full overflow-x-auto py-2">
      <ul className="flex justify-center gap-2 px-2">
        {hand.map((tile, i) => {
          const m = matches[i]!;
          const playable = isMyTurn && (m.left || m.right);
          return (
            <li key={`${i}-${tile[0]}-${tile[1]}`} className="shrink-0">
              <DominoTile
                tile={tile}
                orientation="horizontal"
                size={36}
                selected={selected === i}
                dimmed={isMyTurn && !playable}
                onClick={() => onTileTap(i)}
                ariaLabel={`tile ${tile[0]} ${tile[1]}`}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function RoundEndPanel({
  view,
  meId,
  t,
}: {
  view: DominosPlayerView;
  meId: string;
  t: TFn;
}) {
  const last = view.rounds[view.rounds.length - 1];
  const iWon = last?.winnerId === meId;
  return (
    <div className="flex w-full flex-col items-center gap-3 py-6">
      <motion.div
        initial={{ scale: 0.6, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 320, damping: 18 }}
        className={`rounded-2xl px-6 py-4 font-display text-2xl font-extrabold ${
          iWon
            ? 'bg-emerald-500/20 text-emerald-300'
            : 'bg-white/10 text-white/80'
        }`}
      >
        {last?.blocked
          ? t('games.dominos.blockedRound')
          : iWon
            ? t('games.dominos.youWonRound', { points: last?.points ?? 0 })
            : t('games.dominos.roundOver')}
      </motion.div>
      <p className="text-xs text-white/40">{t('games.dominos.nextRoundComing')}</p>
    </div>
  );
}

function FinishedPanel({
  view,
  meId,
  t,
}: {
  view: DominosPlayerView;
  meId: string;
  t: TFn;
}) {
  const iWon = view.winnerId === meId;
  const myScore = view.scores[meId] ?? 0;
  const [revealed, setRevealed] = useState(false);
  useEffect(() => {
    const id = window.setTimeout(() => setRevealed(true), 1600);
    return () => window.clearTimeout(id);
  }, []);

  return (
    <div className="flex w-full flex-col items-center gap-4 pt-16">
      <Stinger
        show={!revealed}
        text={iWon ? t('games.dominos.youWin') : t('games.dominos.gameOver')}
        sound={null}
      />
      <div className="w-full rounded-xl bg-surface p-4 text-center">
        <p className="text-xs uppercase tracking-widest text-white/40">
          {t('games.dominos.finalScore')}
        </p>
        <p className="mt-1 font-display text-5xl font-extrabold">
          <ScoreNumber value={myScore} />
        </p>
      </div>
    </div>
  );
}
