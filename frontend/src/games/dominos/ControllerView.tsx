import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
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
import { TurnOrder } from './TurnOrder';
import { computeChain, fitTileSize } from './layout';
import type { DominosPlayerProjection } from './view';
import type { ControllerViewProps } from '../types';

interface TFn {
  (key: string, opts?: Record<string, unknown>): string;
}

const MINI_TILE_PREFERRED = 22;
const MINI_TILE_MIN = 10;
const HAND_TILE_SIZE = 38;

const tileKey = (t: TilePair) => `${t[0]}-${t[1]}`;

export function ControllerView({
  view,
  me,
  room,
  emit,
}: ControllerViewProps<DominosPlayerProjection>) {
  const { t } = useTranslation();
  const playerName = (id: string) =>
    room.players.find((p) => p.id === id)?.name ?? id.slice(0, 6);

  useRoundFeedback(view, me.id);
  useTurnArrivalCue(view, me.id);
  useContinueScheduler(view, me.id, emit);

  return (
    <div className="flex w-full max-w-md flex-col items-center gap-3">
      <TopBar view={view} me={me.id} t={t} />

      <TurnOrder
        playerIds={view.playerIds}
        currentTurn={view.turn}
        meId={me.id}
        playerName={playerName}
        size="sm"
      />

      {view.phase === 'playing' && (
        <PlayingControls
          view={view}
          meId={me.id}
          emit={emit}
          t={t}
        />
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

function useRoundFeedback(view: DominosPlayerProjection, meId: string) {
  const lastKey = useRef<string>('');
  // Read the latest result through a ref so the effect can depend only on
  // the change-key, not the full view — otherwise every state update would
  // re-run the effect (it'd no-op via the lastKey guard, but it still
  // pulls in unnecessary work and complicates reasoning about deps).
  const latest = useRef(view);
  latest.current = view;

  const phase = view.phase;
  const roundCount = view.rounds.length;

  useEffect(() => {
    const key = `${phase}-${roundCount}`;
    if (lastKey.current === key) return;
    lastKey.current = key;
    const v = latest.current;

    if (phase === 'roundEnd') {
      const last = v.rounds[roundCount - 1];
      if (last?.winnerId === meId) {
        playSound('correct');
        pulse('medium');
        celebrate('small');
      } else if (last?.winnerId) {
        playSound('wrong');
      }
    }
    if (phase === 'finished') {
      if (v.winnerId === meId) {
        playSound('win');
        celebrate('epic');
      } else {
        playSound('lose');
      }
    }
  }, [phase, roundCount, meId]);
}

// Sound + haptic + visual flash exactly once when the turn flips to us.
// Ignores re-renders where the turn hasn't changed since the last fire.
function useTurnArrivalCue(view: DominosPlayerProjection, meId: string) {
  const prevTurn = useRef<string | null>(null);
  useEffect(() => {
    const becameMyTurn =
      view.phase === 'playing' && view.turn === meId && prevTurn.current !== meId;
    if (becameMyTurn) {
      playSound('tickFinal');
      pulse('medium');
    }
    prevTurn.current = view.turn;
  }, [view.turn, view.phase, meId]);
}

function useContinueScheduler(
  view: DominosPlayerProjection,
  meId: string,
  emit: ControllerViewProps['emit'],
) {
  // Every controller schedules a continue when it sees roundEnd. The engine
  // treats `continue` as idempotent, so duplicates from peers (or network
  // retries) are silently absorbed. Gating on a single "anointed" player
  // (e.g. playerIds[0]) would strand the room if that player disconnects;
  // this fan-out is robust to one or more controllers going dark.
  // Tiny jitter per-player avoids the engine racing to apply N identical
  // continues at the same millisecond — only one matters but logs stay clean.
  useEffect(() => {
    if (view.phase !== 'roundEnd') return;
    const myIdx = Math.max(0, view.playerIds.indexOf(meId));
    const delay = 3500 + myIdx * 250;
    const id = window.setTimeout(() => emit({ type: 'continue' }), delay);
    return () => window.clearTimeout(id);
  }, [view.phase, view.playerIds, view.rounds.length, meId, emit]);
}

function TopBar({
  view,
  me,
  t,
}: {
  view: DominosPlayerProjection;
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
        <span className="tabular-nums text-white/70">
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
  view: DominosPlayerProjection;
  meId: string;
  emit: ControllerViewProps['emit'];
  t: TFn;
}) {
  const isMyTurn = view.turn === meId;
  const opening = view.leftEnd === null && view.rightEnd === null;
  // Track selection by tile string so a state update that doesn't change
  // the hand's contents (e.g., score tick after another player's action)
  // doesn't blow away the user's pick. And so the user's pick is robust
  // to index shifts after a play.
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // While a tile is being dragged, the mini-board lights up its drop
  // zones based on which sides the dragged tile can legally play onto.
  const [draggingTile, setDraggingTile] = useState<TilePair | null>(null);
  const miniBoardRef = useRef<HTMLDivElement>(null);

  // Drop selection whenever it's not our turn anymore, or the selected
  // tile has been removed from our hand (e.g., we just played it).
  useEffect(() => {
    if (!isMyTurn) {
      setSelectedKey(null);
      return;
    }
    if (selectedKey && !view.yourHand.some((t) => tileKey(t) === selectedKey)) {
      setSelectedKey(null);
    }
  }, [isMyTurn, view.yourHand, selectedKey]);

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

  const selectedIdx = selectedKey
    ? view.yourHand.findIndex((t) => tileKey(t) === selectedKey)
    : -1;
  const selTile = selectedIdx >= 0 ? view.yourHand[selectedIdx]! : null;
  const selMatch = selectedIdx >= 0 ? matches[selectedIdx]! : null;

  // Match info for the tile currently being dragged. Memoised by tile key
  // so the mini-board's halves can light up immediately on drag start
  // without recomputing on every cursor move.
  const draggingMatch = useMemo<{ left: boolean; right: boolean } | null>(() => {
    if (!draggingTile) return null;
    const k = tileKey(draggingTile);
    const i = view.yourHand.findIndex((t) => tileKey(t) === k);
    return i >= 0 ? (matches[i] ?? null) : null;
  }, [draggingTile, view.yourHand, matches]);

  function play(side: 'left' | 'right') {
    if (!selTile) return;
    emit({ type: 'play', data: { tile: [selTile[0], selTile[1]], side } });
    setSelectedKey(null);
  }

  function onTileTap(i: number) {
    if (!isMyTurn) return;
    const m = matches[i];
    if (!m || (!m.left && !m.right)) return;
    const tile = view.yourHand[i]!;
    if (!opening && m.left && !m.right) {
      emit({ type: 'play', data: { tile: [tile[0], tile[1]], side: 'left' } });
      return;
    }
    if (!opening && !m.left && m.right) {
      emit({ type: 'play', data: { tile: [tile[0], tile[1]], side: 'right' } });
      return;
    }
    setSelectedKey((cur) => (cur === tileKey(tile) ? null : tileKey(tile)));
  }

  // Called from the hand when a tile drag ends. We read the mini-board's
  // current bounding box live so resizing the viewport mid-drag still
  // works, and translate the pointer into a "left half" / "right half"
  // verdict. Misses (drop outside the board) snap back via dragSnapToOrigin.
  function onTileDragEnd(tile: TilePair, info: PanInfo) {
    setDraggingTile(null);
    if (!isMyTurn) return;
    const k = tileKey(tile);
    const i = view.yourHand.findIndex((t) => tileKey(t) === k);
    if (i < 0) return;
    const m = matches[i]!;
    const el = miniBoardRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const { x, y } = info.point;
    const inside = x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    if (!inside) return;
    const mid = r.left + r.width / 2;
    let side: 'left' | 'right' = x < mid ? 'left' : 'right';
    // Opening move: side label is cosmetic, the engine treats both as opening.
    if (opening) side = 'left';
    if (side === 'left' && !m.left) return;
    if (side === 'right' && !m.right) return;
    playSound('select');
    pulse('medium');
    emit({ type: 'play', data: { tile: [tile[0], tile[1]], side } });
  }

  return (
    <>
      <TurnHeader view={view} meId={meId} t={t} />

      <MiniBoard
        panelRef={miniBoardRef}
        view={view}
        t={t}
        draggingMatch={draggingMatch}
        opening={opening}
      />

      <Hand
        hand={view.yourHand}
        matches={matches}
        selectedKey={selectedKey}
        onTileTap={onTileTap}
        onTileDragStart={(tile) => isMyTurn && setDraggingTile(tile)}
        onTileDragEnd={onTileDragEnd}
        isMyTurn={isMyTurn}
      />

      {!draggingTile && (
        <p className="text-center text-[11px] uppercase tracking-widest text-white/40">
          {isMyTurn
            ? t('games.dominos.dragHint')
            : ''}
        </p>
      )}

      <AnimatePresence>
        {selTile && selMatch && (
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

      <Boneyard view={view} isMyTurn={isMyTurn} emit={emit} t={t} />

      <Button
        variant="secondary"
        disabled={!view.canPass}
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
  view: DominosPlayerProjection;
  meId: string;
  t: TFn;
}) {
  const isMyTurn = view.turn === meId;
  if (isMyTurn) {
    return (
      <motion.div
        key="my-turn"
        initial={{ scale: 0.85, backgroundColor: 'rgba(16,185,129,0.45)' }}
        animate={{ scale: 1, backgroundColor: 'rgba(16,185,129,0)' }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="rounded-2xl px-5 py-2"
      >
        <p className="font-display text-2xl font-extrabold text-emerald-300">
          {view.canPlay
            ? t('games.dominos.yourTurn')
            : t('games.dominos.mustPass')}
        </p>
      </motion.div>
    );
  }
  return (
    <p className="text-sm text-white/60">
      {t('games.dominos.waitingForTurn')}
    </p>
  );
}

// Mini snake-board on the phone, doubling as the drop target for the
// drag-to-play gesture. While the player drags a tile, the two halves
// of the board light up to show which side is a valid drop.
function MiniBoard({
  panelRef,
  view,
  t,
  draggingMatch,
  opening,
}: {
  panelRef: React.RefObject<HTMLDivElement>;
  view: DominosPlayerProjection;
  t: TFn;
  draggingMatch: { left: boolean; right: boolean } | null;
  opening: boolean;
}) {
  const chain = computeChain(view.board, view.leftEnd);
  const [innerWidth, setInnerWidth] = useState(320);
  useLayoutEffect(() => {
    const el = panelRef.current;
    if (!el) return;
    const update = () => setInnerWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [panelRef]);
  const tileSize = fitTileSize(
    chain,
    Math.max(220, innerWidth - 24),
    MINI_TILE_PREFERRED,
    MINI_TILE_MIN,
    3,
  );

  const showZones = draggingMatch !== null;
  const leftOk  = showZones && (opening ? draggingMatch.left  : draggingMatch.left);
  const rightOk = showZones && (opening ? draggingMatch.right : draggingMatch.right);

  return (
    <div
      ref={panelRef}
      className="relative w-full overflow-hidden rounded-2xl px-3 py-4 ring-1 ring-emerald-900/40"
      style={{
        minHeight: 90,
        background:
          'radial-gradient(ellipse at center, #1a7a4d 0%, #0f5230 65%, #07321d 100%)',
        boxShadow: 'inset 0 0 30px rgba(0,0,0,0.45)',
      }}
    >
      {/* Drop zones: rendered while dragging, fading in. Green halo on the
          valid side, red on the invalid side. Pure visual — the actual drop
          decision is made in onTileDragEnd against the bounding box. */}
      <AnimatePresence>
        {showZones && (
          <>
            <motion.div
              key="zone-left"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-y-0 left-0 w-1/2"
              style={{
                background: leftOk
                  ? 'linear-gradient(90deg, rgba(16,185,129,0.35), rgba(16,185,129,0.08))'
                  : 'linear-gradient(90deg, rgba(239,68,68,0.25), rgba(239,68,68,0.05))',
              }}
            />
            <motion.div
              key="zone-right"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="pointer-events-none absolute inset-y-0 right-0 w-1/2"
              style={{
                background: rightOk
                  ? 'linear-gradient(270deg, rgba(16,185,129,0.35), rgba(16,185,129,0.08))'
                  : 'linear-gradient(270deg, rgba(239,68,68,0.25), rgba(239,68,68,0.05))',
              }}
            />
          </>
        )}
      </AnimatePresence>

      {view.leftEnd !== null && view.rightEnd !== null && (
        <div className="relative inset-x-2 z-10 flex items-center justify-between pb-1 text-[10px] uppercase tracking-widest text-emerald-100/70">
          <span className={leftOk ? 'font-bold text-emerald-200' : ''}>◀ {view.leftEnd}</span>
          <span className={rightOk ? 'font-bold text-emerald-200' : ''}>{view.rightEnd} ▶</span>
        </div>
      )}

      <div className="relative z-10 flex min-h-[44px] items-center justify-center">
        {chain.length === 0 ? (
          <p className="text-[11px] uppercase tracking-widest text-emerald-100/60">
            {t('games.dominos.dropToOpen')}
          </p>
        ) : (
          <ul className="flex items-center" style={{ gap: 3 }}>
            <AnimatePresence initial={false}>
              {chain.map((entry, i) => (
                <motion.li
                  key={`mini-${i}-${entry.pair[0]}-${entry.pair[1]}-${entry.orientation}`}
                  layout
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ type: 'spring', stiffness: 380, damping: 24 }}
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
    </div>
  );
};

function Hand({
  hand,
  matches,
  selectedKey,
  onTileTap,
  onTileDragStart,
  onTileDragEnd,
  isMyTurn,
}: {
  hand: TilePair[];
  matches: ReadonlyArray<{ left: boolean; right: boolean }>;
  selectedKey: string | null;
  onTileTap: (i: number) => void;
  onTileDragStart: (tile: TilePair) => void;
  onTileDragEnd: (tile: TilePair, info: PanInfo) => void;
  isMyTurn: boolean;
}) {
  if (hand.length === 0) {
    return <p className="text-sm text-white/40">No tiles dealt yet.</p>;
  }

  return (
    <div className="w-full rounded-2xl bg-surface px-2 pb-2 pt-6">
      <ul className="flex flex-wrap justify-center gap-2">
        <AnimatePresence initial={false}>
          {hand.map((tile, i) => {
            const m = matches[i]!;
            const playable = isMyTurn && (m.left || m.right);
            const k = tileKey(tile);
            // Playable tiles lift up + get a halo so the player's eye finds
            // them immediately. Unplayable tiles stay flat and dim.
            return (
              <motion.li
                key={k}
                layout
                initial={{ opacity: 0, scale: 0.6, y: 10 }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  y: playable ? -8 : 0,
                  filter: playable
                    ? 'drop-shadow(0 0 8px rgba(251,191,36,0.55))'
                    : 'drop-shadow(0 0 0 rgba(0,0,0,0))',
                }}
                exit={{ opacity: 0, scale: 0.4, y: -50 }}
                transition={{ type: 'spring', stiffness: 380, damping: 22 }}
                drag={playable}
                dragSnapToOrigin
                dragMomentum={false}
                dragElastic={1}
                whileDrag={{ scale: 1.25, zIndex: 50 }}
                onDragStart={() => onTileDragStart(tile)}
                onDragEnd={(_, info) => onTileDragEnd(tile, info)}
                style={{ touchAction: 'none' }}
              >
                <DominoTile
                  tile={tile}
                  orientation="horizontal"
                  size={HAND_TILE_SIZE}
                  selected={selectedKey === k}
                  dimmed={isMyTurn && !playable}
                  onClick={() => onTileTap(i)}
                  ariaLabel={`tile ${tile[0]} ${tile[1]}`}
                />
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}

// Face-down boneyard pile shown to the active player when they're stuck.
// Tap or pulse the pile to pull a tile into the hand. Hidden when the
// boneyard is empty (pure Block) or when it isn't this player's turn.
function Boneyard({
  view,
  isMyTurn,
  emit,
  t,
}: {
  view: DominosPlayerProjection;
  isMyTurn: boolean;
  emit: ControllerViewProps['emit'];
  t: TFn;
}) {
  if (view.boneyardCount === 0) return null;
  const active = isMyTurn && view.canDraw;
  return (
    <motion.div
      animate={{ scale: active ? 1.04 : 1 }}
      className={[
        'flex w-full items-center justify-between rounded-2xl px-4 py-3 ring-1',
        active ? 'bg-amber-500/10 ring-amber-400/60' : 'bg-surface ring-white/5',
      ].join(' ')}
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          aria-label={t('games.dominos.draw')}
          disabled={!active}
          onClick={() => {
            playSound('tap');
            pulse('light');
            emit({ type: 'draw' });
          }}
          className="relative shrink-0 transition disabled:opacity-50"
        >
          {/* Stacked face-down tiles for visual depth */}
          <span className="absolute -left-1.5 -top-1.5 opacity-60">
            <DominoTile tile={[0, 0] as const} orientation="vertical" size={24} faceDown />
          </span>
          <span className="absolute -left-0.5 -top-0.5 opacity-80">
            <DominoTile tile={[0, 0] as const} orientation="vertical" size={24} faceDown />
          </span>
          <DominoTile tile={[0, 0] as const} orientation="vertical" size={24} faceDown />
        </button>
        <div className="flex flex-col leading-tight">
          <span className="text-[10px] uppercase tracking-widest text-white/40">
            {t('games.dominos.boneyard')}
          </span>
          <span className="font-display text-base font-extrabold tabular-nums">
            {view.boneyardCount}
          </span>
        </div>
      </div>
      {active && (
        <span className="font-display text-sm font-semibold text-amber-300">
          {t('games.dominos.drawHint')}
        </span>
      )}
    </motion.div>
  );
}

function RoundEndPanel({
  view,
  meId,
  t,
}: {
  view: DominosPlayerProjection;
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
  view: DominosPlayerProjection;
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
