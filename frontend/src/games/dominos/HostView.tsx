import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  ScoreNumber,
  Stinger,
  celebrate,
  playSound,
} from '../../shared/feel';
import { DominoTile, type TilePair } from './DominoTile';
import type { HostViewProps } from '../types';

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

interface DominosHostView {
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
}

export function HostView({ view, room }: HostViewProps<DominosHostView>) {
  const { t } = useTranslation();
  const playerName = (id: string) =>
    room.players.find((p) => p.id === id)?.name ?? id.slice(0, 6);

  usePhaseSounds(view);

  return (
    <div className="flex w-full max-w-6xl flex-col items-center gap-5">
      <TopBar view={view} t={t} />

      <Scoreboard view={view} playerName={playerName} />

      <FeltTable view={view} playerName={playerName} t={t} />

      <HandCountsRow view={view} playerName={playerName} t={t} />

      <Stinger
        show={view.phase === 'finished'}
        text={
          view.winnerId
            ? t('games.dominos.matchWinner', { name: playerName(view.winnerId) })
            : t('games.dominos.gameOver')
        }
        sound={null}
      />
    </div>
  );
}

// Engine emits roundEnd / finished; play the matching feedback exactly once
// per transition. The ref guard avoids replaying on incidental re-renders.
function usePhaseSounds(view: DominosHostView) {
  const lastKey = useRef<string>('');
  useEffect(() => {
    const key = `${view.phase}-${view.rounds.length}`;
    if (lastKey.current === key) return;
    lastKey.current = key;
    if (view.phase === 'roundEnd') {
      playSound('reveal');
    }
    if (view.phase === 'finished') {
      playSound('win');
      celebrate('epic');
    }
  }, [view.phase, view.rounds.length]);
}

interface TFn {
  (key: string, opts?: Record<string, unknown>): string;
}

function TopBar({ view, t }: { view: DominosHostView; t: TFn }) {
  const roundNumber = view.rounds.length + (view.phase === 'roundEnd' ? 0 : 1);
  return (
    <div className="flex w-full items-center justify-between">
      <p className="text-sm uppercase tracking-widest text-white/40">
        {t('games.dominos.title')}
      </p>
      <p className="text-sm text-white/60">
        {t('games.dominos.roundN', {
          n: roundNumber,
          target: view.targetScore,
        })}
      </p>
    </div>
  );
}

function Scoreboard({
  view,
  playerName,
}: {
  view: DominosHostView;
  playerName: (id: string) => string;
}) {
  return (
    <div className="grid w-full grid-cols-2 gap-2 md:grid-cols-4">
      {view.playerIds.map((id) => {
        const isTurn = view.turn === id;
        const isWinner = view.winnerId === id;
        return (
          <motion.div
            key={id}
            layout
            animate={{
              scale: isTurn ? 1.04 : 1,
            }}
            className={[
              'flex items-center justify-between rounded-xl px-4 py-3',
              isWinner
                ? 'bg-amber-500/20 ring-2 ring-amber-300'
                : isTurn
                  ? 'bg-emerald-500/15 ring-2 ring-emerald-400/60'
                  : 'bg-surface ring-1 ring-white/5',
            ].join(' ')}
          >
            <div className="flex flex-col">
              <span className="font-display text-lg font-extrabold leading-none">
                {playerName(id)}
              </span>
              {isTurn && (
                <span className="mt-1 text-[10px] uppercase tracking-widest text-emerald-300">
                  to play
                </span>
              )}
            </div>
            <span className="font-display text-3xl font-extrabold tabular-nums">
              <ScoreNumber value={view.scores[id] ?? 0} />
            </span>
          </motion.div>
        );
      })}
    </div>
  );
}

function FeltTable({
  view,
  playerName,
  t,
}: {
  view: DominosHostView;
  playerName: (id: string) => string;
  t: TFn;
}) {
  const chain = computeChain(view.board, view.leftEnd);
  const lastResult = view.rounds[view.rounds.length - 1];
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // Keep the latest-played tile in view by scrolling to the right edge whenever
  // the chain grows. v1 layout is a single horizontal row; v2 would do L-bends.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
  }, [chain.length]);

  return (
    <section
      className="relative w-full overflow-hidden rounded-3xl px-6 py-10 shadow-2xl ring-1 ring-emerald-900/40"
      style={{
        background:
          'radial-gradient(ellipse at center, #1a7a4d 0%, #0f5230 55%, #07321d 100%)',
        boxShadow:
          'inset 0 0 80px rgba(0,0,0,0.45), 0 30px 60px -20px rgba(0,0,0,0.6)',
      }}
    >
      {/* Subtle felt texture via a dotted overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)',
          backgroundSize: '6px 6px',
        }}
      />

      {/* Ends badges */}
      {view.leftEnd !== null && view.rightEnd !== null && (
        <div className="relative mb-4 flex items-center justify-between text-xs uppercase tracking-widest text-emerald-100/70">
          <span className="rounded-full bg-black/30 px-3 py-1">
            {t('games.dominos.leftEnd', { value: view.leftEnd })}
          </span>
          <span className="rounded-full bg-black/30 px-3 py-1">
            {t('games.dominos.rightEnd', { value: view.rightEnd })}
          </span>
        </div>
      )}

      <div
        ref={scrollRef}
        className="relative flex min-h-[180px] items-center overflow-x-auto px-4"
        style={{ scrollbarWidth: 'none' }}
      >
        {chain.length === 0 ? (
          <EmptyTable view={view} playerName={playerName} t={t} />
        ) : (
          <ul className="flex items-center gap-1.5">
            <AnimatePresence initial={false}>
              {chain.map((entry, i) => (
                <motion.li
                  key={`${i}-${entry.pair[0]}-${entry.pair[1]}-${entry.orientation}`}
                  layout
                  initial={{ opacity: 0, scale: 0.6, y: -20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                >
                  <DominoTile
                    tile={entry.pair}
                    orientation={entry.orientation}
                    size={56}
                  />
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </div>

      <AnimatePresence>
        {view.phase === 'roundEnd' && lastResult && (
          <RoundEndOverlay
            result={lastResult}
            playerName={playerName}
            t={t}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

function EmptyTable({
  view,
  playerName,
  t,
}: {
  view: DominosHostView;
  playerName: (id: string) => string;
  t: TFn;
}) {
  return (
    <div className="w-full text-center text-emerald-100/80">
      {view.starterId ? (
        <p className="font-display text-lg">
          {t('games.dominos.opensWith', {
            name: playerName(view.starterId),
          })}
        </p>
      ) : (
        <p className="text-sm">{t('games.dominos.boardEmpty')}</p>
      )}
    </div>
  );
}

function RoundEndOverlay({
  result,
  playerName,
  t,
}: {
  result: RoundResult;
  playerName: (id: string) => string;
  t: TFn;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className="absolute inset-x-0 bottom-0 flex justify-center pb-6"
    >
      <div className="rounded-2xl bg-black/70 px-6 py-4 text-center shadow-xl ring-1 ring-white/10">
        <p className="text-xs uppercase tracking-widest text-white/40">
          {result.blocked
            ? t('games.dominos.blockedRound')
            : t('games.dominos.roundOver')}
        </p>
        {result.winnerId ? (
          <p className="mt-1 font-display text-2xl font-extrabold">
            {t('games.dominos.roundWinner', {
              name: playerName(result.winnerId),
              points: result.points,
            })}
          </p>
        ) : (
          <p className="mt-1 font-display text-2xl font-extrabold text-white/80">
            {t('games.dominos.tieRound')}
          </p>
        )}
        <p className="mt-2 text-xs text-white/40">
          {t('games.dominos.nextRoundComing')}
        </p>
      </div>
    </motion.div>
  );
}

function HandCountsRow({
  view,
  playerName,
  t,
}: {
  view: DominosHostView;
  playerName: (id: string) => string;
  t: TFn;
}) {
  return (
    <div className="flex w-full flex-wrap items-center justify-center gap-4 rounded-xl bg-surface px-4 py-3">
      {view.playerIds.map((id) => {
        const count = view.handCounts[id] ?? 0;
        return (
          <div key={id} className="flex items-center gap-2">
            <DominoTile
              tile={[0, 0]}
              orientation="vertical"
              size={20}
              faceDown
            />
            <div className="flex flex-col leading-tight">
              <span className="text-xs text-white/60">{playerName(id)}</span>
              <span className="text-xs font-semibold tabular-nums text-white/90">
                {t('games.dominos.tilesRemaining', { count })}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Chain rendering: turn the engine's PlacedTile[] (canonical-pip order) into
// a sequence of tiles oriented so that adjacent pips visually match.
//
// The engine stores each tile as [low, high]. To draw the snake we walk left-
// to-right and flip tiles when needed so each tile's left pip equals the
// previous tile's right pip. The very first tile is anchored using leftEnd.
// Doubles render perpendicular and expose the same pip on both touching sides.

interface DisplayTile {
  pair: TilePair;
  orientation: 'horizontal' | 'vertical';
  leftPip: number;
  rightPip: number;
}

function computeChain(
  board: PlacedTile[],
  leftEnd: number | null,
): DisplayTile[] {
  if (board.length === 0) return [];

  const out: DisplayTile[] = [];
  const first = board[0]!;

  let firstLeft: number;
  let firstRight: number;
  if (first.orientation === 'vertical') {
    firstLeft = first.tile[0];
    firstRight = first.tile[0];
  } else if (leftEnd !== null && first.tile[0] === leftEnd) {
    firstLeft = first.tile[0];
    firstRight = first.tile[1];
  } else if (leftEnd !== null && first.tile[1] === leftEnd) {
    firstLeft = first.tile[1];
    firstRight = first.tile[0];
  } else {
    firstLeft = first.tile[0];
    firstRight = first.tile[1];
  }
  out.push({
    pair: [firstLeft, firstRight] as unknown as TilePair,
    orientation: first.orientation,
    leftPip: firstLeft,
    rightPip: firstRight,
  });

  for (let i = 1; i < board.length; i++) {
    const placed = board[i]!;
    const requiredLeft = out[i - 1]!.rightPip;
    let displayLeft: number;
    let displayRight: number;
    if (placed.orientation === 'vertical') {
      displayLeft = placed.tile[0];
      displayRight = placed.tile[0];
    } else if (placed.tile[0] === requiredLeft) {
      displayLeft = placed.tile[0];
      displayRight = placed.tile[1];
    } else {
      displayLeft = placed.tile[1];
      displayRight = placed.tile[0];
    }
    out.push({
      pair: [displayLeft, displayRight] as unknown as TilePair,
      orientation: placed.orientation,
      leftPip: displayLeft,
      rightPip: displayRight,
    });
  }
  return out;
}
