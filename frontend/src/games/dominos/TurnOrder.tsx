// Horizontal turn-order strip — same component for host and controller.
// Shows who plays next so players don't have to track turn rotation in
// their heads. Highlights the current player and the player after them.

import { motion } from 'framer-motion';

interface Props {
  playerIds: readonly string[];
  currentTurn: string | null;
  /** Optional self-id so we can label the viewer's chip as "You". */
  meId?: string;
  playerName: (id: string) => string;
  /** Larger for the host TV; compact for the phone. */
  size?: 'lg' | 'sm';
}

export function TurnOrder({
  playerIds,
  currentTurn,
  meId,
  playerName,
  size = 'lg',
}: Props) {
  if (playerIds.length === 0) return null;
  const currentIdx = currentTurn ? playerIds.indexOf(currentTurn) : -1;
  const nextIdx = currentIdx >= 0 ? (currentIdx + 1) % playerIds.length : -1;

  const chipBase =
    size === 'lg'
      ? 'rounded-full px-3 py-1.5 text-sm font-semibold'
      : 'rounded-full px-2 py-0.5 text-[11px] font-semibold';
  const arrowClass =
    size === 'lg' ? 'text-white/30 text-base' : 'text-white/30 text-xs';

  return (
    <div className="flex flex-wrap items-center justify-center gap-1">
      {playerIds.map((id, i) => {
        const isMe = meId && id === meId;
        const isCurrent = i === currentIdx;
        const isNext = i === nextIdx && !isCurrent;
        const label = isMe ? `${playerName(id)} (you)` : playerName(id);

        return (
          <div key={id} className="flex items-center gap-1">
            <motion.span
              animate={{ scale: isCurrent ? 1.06 : 1 }}
              transition={{ type: 'spring', stiffness: 280, damping: 18 }}
              className={[
                chipBase,
                isCurrent
                  ? 'bg-emerald-500 text-black shadow-[0_0_18px_rgba(16,185,129,0.55)]'
                  : isNext
                    ? 'bg-white/10 text-white/90 ring-1 ring-white/30'
                    : 'bg-white/5 text-white/60',
              ].join(' ')}
            >
              {label}
            </motion.span>
            {i < playerIds.length - 1 && (
              <span className={arrowClass} aria-hidden>
                →
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
