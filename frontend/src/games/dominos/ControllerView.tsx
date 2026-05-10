import { useTranslation } from 'react-i18next';
import { Button } from '../../components/ui/Button';
import type { ControllerViewProps } from '../types';

interface DominosPlayerView {
  phase: 'dealing' | 'playing' | 'finished';
  hands: Record<string, number[]>;
  board: number[];
  turn: string | null;
  winner: string | null;
}

export function ControllerView({ view, me, emit }: ControllerViewProps<DominosPlayerView>) {
  const { t } = useTranslation();
  const myHand = view.hands[me.id] ?? [];
  const isMyTurn = view.turn === me.id;

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <p className="text-sm uppercase tracking-widest text-white/40">
        {t('controller.inGameTitle')} · Dominos
      </p>

      <p
        className={`text-base font-semibold ${
          isMyTurn ? 'text-emerald-400' : 'text-white/60'
        }`}
      >
        {isMyTurn
          ? t('games.dominos.yourTurn')
          : t('games.dominos.waitingForTurn')}
      </p>

      <section className="w-full rounded-xl bg-surface p-3 text-center">
        <p className="text-xs uppercase tracking-widest text-white/40">
          {t('games.dominos.yourHand')}
        </p>
        {myHand.length === 0 ? (
          <p className="mt-2 text-sm text-white/40">
            {t('games.dominos.handEmpty')}
          </p>
        ) : (
          <div className="mt-2 flex flex-wrap justify-center gap-1">
            {myHand.map((tile, i) => (
              <span
                key={i}
                className="rounded bg-white/10 px-3 py-2 font-mono text-sm"
              >
                {tile}
              </span>
            ))}
          </div>
        )}
      </section>

      <Button
        disabled={!isMyTurn}
        onClick={() => emit({ type: 'pass' })}
        variant="secondary"
        className="w-full"
      >
        {t('games.dominos.pass')}
      </Button>
    </div>
  );
}
