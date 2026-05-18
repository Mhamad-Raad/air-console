import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { useTranslation } from 'react-i18next';
import {
  ScoreNumber,
  Stinger,
  celebrate,
  playSound,
} from '../../shared/feel';
import { DominoTile } from './DominoTile';
import { TurnOrder } from './TurnOrder';
import { computeChain, fitTileSize } from './layout';
import type {
  DominosHostProjection,
  DominosRoundResult,
} from './view';
import type { HostViewProps } from '../types';

interface TFn {
  (key: string, opts?: Record<string, unknown>): string;
}

const HOST_TILE_PREFERRED = 64;
const HOST_TILE_MIN = 22;

export function HostView({ view, room }: HostViewProps<DominosHostProjection>) {
  const { t } = useTranslation();
  const playerName = (id: string) =>
    room.players.find((p) => p.id === id)?.name ?? id.slice(0, 6);

  usePhaseSounds(view);

  return (
    <div className="flex w-full max-w-7xl flex-col items-center gap-5">
      <TopBar view={view} t={t} />

      <Scoreboard view={view} playerName={playerName} />

      <TurnOrder
        playerIds={view.playerIds}
        currentTurn={view.turn}
        playerName={playerName}
      />

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

function usePhaseSounds(view: DominosHostProjection) {
  const lastKey = useRef<string>('');
  useEffect(() => {
    const key = `${view.phase}-${view.rounds.length}`;
    if (lastKey.current === key) return;
    lastKey.current = key;
    if (view.phase === 'roundEnd') playSound('reveal');
    if (view.phase === 'finished') {
      playSound('win');
      celebrate('epic');
    }
  }, [view.phase, view.rounds.length]);
}

function TopBar({ view, t }: { view: DominosHostProjection; t: TFn }) {
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
  view: DominosHostProjection;
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
            animate={{ scale: isTurn ? 1.04 : 1 }}
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
  view: DominosHostProjection;
  playerName: (id: string) => string;
  t: TFn;
}) {
  const chain = computeChain(view.board, view.leftEnd);
  const lastResult = view.rounds[view.rounds.length - 1];

  // Measure the felt panel's inner width so the snake auto-shrinks to fit.
  // ResizeObserver fires on viewport changes; recompute on chain growth too.
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [innerWidth, setInnerWidth] = useState(960);
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const update = () => setInnerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Subtract the panel's horizontal padding (px-8) ~= 64px when sizing.
  const tileSize = fitTileSize(
    chain,
    Math.max(280, innerWidth - 64),
    HOST_TILE_PREFERRED,
    HOST_TILE_MIN,
  );

  return (
    <section
      ref={panelRef}
      className="relative w-full overflow-hidden rounded-3xl px-8 py-12 shadow-2xl ring-1 ring-emerald-900/40"
      style={{
        minHeight: 360,
        background:
          'radial-gradient(ellipse at center, #1a7a4d 0%, #0f5230 55%, #07321d 100%)',
        boxShadow:
          'inset 0 0 80px rgba(0,0,0,0.45), 0 30px 60px -20px rgba(0,0,0,0.6)',
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            'radial-gradient(rgba(255,255,255,0.6) 1px, transparent 1px)',
          backgroundSize: '6px 6px',
        }}
      />

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

      <div className="relative flex min-h-[200px] items-center justify-center">
        {chain.length === 0 ? (
          <EmptyTable view={view} playerName={playerName} t={t} />
        ) : (
          <ul className="flex items-center" style={{ gap: 6 }}>
            <AnimatePresence initial={false}>
              {chain.map((entry, i) => (
                <motion.li
                  key={`tile-${i}-${entry.pair[0]}-${entry.pair[1]}-${entry.orientation}`}
                  layout
                  initial={{ opacity: 0, scale: 0.5, y: -30 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.5 }}
                  transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                >
                  <DominoTile
                    tile={entry.pair}
                    orientation={entry.orientation}
                    size={tileSize}
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
  view: DominosHostProjection;
  playerName: (id: string) => string;
  t: TFn;
}) {
  return (
    <div className="w-full text-center text-emerald-100/80">
      {view.starterId ? (
        <p className="font-display text-xl">
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
  result: DominosRoundResult;
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
  view: DominosHostProjection;
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
              tile={[0, 0] as const}
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
      {view.boneyardCount > 0 && (
        <div className="flex items-center gap-2 border-l border-white/10 pl-4">
          <DominoTile
            tile={[0, 0] as const}
            orientation="vertical"
            size={20}
            faceDown
          />
          <div className="flex flex-col leading-tight">
            <span className="text-xs text-white/60">{t('games.dominos.boneyard')}</span>
            <span className="text-xs font-semibold tabular-nums text-white/90">
              {view.boneyardCount}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
