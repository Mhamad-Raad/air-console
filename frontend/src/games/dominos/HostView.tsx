import { useTranslation } from 'react-i18next';
import type { HostViewProps } from '../types';

interface DominosHostView {
  phase: 'dealing' | 'playing' | 'finished';
  hands: Record<string, number>; // player id -> tile count
  board: number[];
  turn: string | null;
  winner: string | null;
}

export function HostView({ view, room }: HostViewProps<DominosHostView>) {
  const { t } = useTranslation();
  const playerName = (id: string) =>
    room.players.find((p) => p.id === id)?.name ?? id.slice(0, 6);

  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-6">
      <div className="text-center">
        <p className="text-sm uppercase tracking-widest text-white/40">
          {t('host.inGame')} · Dominos
        </p>
        <p className="mt-1 text-xs text-white/40">phase: {view.phase}</p>
      </div>

      <section className="w-full rounded-xl bg-surface p-4">
        <h2 className="text-sm font-semibold text-white/60">
          {t('games.dominos.boardLabel')}
        </h2>
        {view.board.length === 0 ? (
          <p className="mt-2 text-sm text-white/40">
            {t('games.dominos.boardEmpty')}
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1">
            {view.board.map((tile, i) => (
              <span
                key={i}
                className="rounded bg-white/10 px-2 py-1 font-mono text-xs"
              >
                {tile}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="grid w-full grid-cols-2 gap-2">
        {Object.entries(view.hands).map(([id, count]) => (
          <div
            key={id}
            className={`rounded-lg p-3 text-sm ${
              view.turn === id
                ? 'bg-emerald-500/10 ring-1 ring-emerald-400/40'
                : 'bg-white/5'
            }`}
          >
            <div className="font-medium">{playerName(id)}</div>
            <div className="text-xs text-white/50">
              {t('games.dominos.tilesRemaining', { count })}
              {view.turn === id && (
                <span className="ml-2 text-emerald-400">
                  · {t('games.dominos.theirTurn')}
                </span>
              )}
            </div>
          </div>
        ))}
      </section>

      {view.winner && (
        <p className="text-lg font-semibold text-emerald-400">
          {t('games.dominos.winner', { name: playerName(view.winner) })}
        </p>
      )}
    </div>
  );
}
