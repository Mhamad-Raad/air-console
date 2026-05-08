import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { useSocket } from '../hooks/useSocket';
import { useRoomStore } from '../stores/room.store';
import { Button } from '../components/ui/Button';
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';
import { api } from '../lib/api';
import type { GameCatalogEntry, Player, Room, Team } from '../types';

const TEAM_STYLES: Record<Team, string> = {
  A: 'bg-sky-500/80 text-white border-sky-400',
  B: 'bg-amber-500/80 text-white border-amber-400',
};
const TEAM_INACTIVE = 'bg-white/5 text-white/50 hover:bg-white/10 border-white/10';

export default function Host() {
  const { t } = useTranslation();
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { socket, connected } = useSocket();
  const room = useRoomStore((s) => s.room);
  const setRoom = useRoomStore((s) => s.setRoom);
  const reset = useRoomStore((s) => s.reset);
  const [game, setGame] = useState<GameCatalogEntry | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [pendingKick, setPendingKick] = useState<string | null>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  const joinUrl = `${window.location.origin}/join/${code}`;

  useEffect(() => {
    document.title = `Host · ${code}`;
  }, [code]);

  useEffect(() => {
    if (!connected) return;
    socket.emit('host:claim', { code }, (res: { ok: boolean; room?: Room }) => {
      if (res?.ok && res.room) setRoom(res.room);
    });

    const onState = (next: Room) => setRoom(next);
    const onClosed = () => {
      reset();
      navigate('/');
    };
    socket.on('room:state', onState);
    socket.on('room:closed', onClosed);

    return () => {
      socket.off('room:state', onState);
      socket.off('room:closed', onClosed);
    };
  }, [connected, socket, code, setRoom, reset, navigate]);

  useEffect(() => {
    if (!room?.gameSlug) return;
    api
      .get<GameCatalogEntry>(`/api/games/${room.gameSlug}`)
      .then(setGame)
      .catch(() => setGame(null));
  }, [room?.gameSlug]);

  // Auto-cancel pending kick after 4s if not confirmed.
  useEffect(() => {
    if (!pendingKick) return;
    const t = setTimeout(() => setPendingKick(null), 4000);
    return () => clearTimeout(t);
  }, [pendingKick]);

  function confirmKick(playerId: string) {
    socket.emit('room:kick', { playerId }, (res: { ok: boolean; error?: string }) => {
      if (!res?.ok) console.warn('kick failed', res?.error);
    });
    setPendingKick(null);
  }

  function setTeam(player: Player, team: Team | null) {
    socket.emit('player:set', { playerId: player.id, patch: { team } });
  }

  function startGame() {
    setStartError(null);
    socket.emit('game:start', {}, (res: { ok: boolean; error?: string }) => {
      if (!res?.ok) setStartError(res?.error ?? 'Failed to start');
    });
  }

  function endGame() {
    socket.emit('game:end', {});
  }

  function requestLeave() {
    if ((room?.players.length ?? 0) === 0) {
      doLeave();
      return;
    }
    setConfirmingLeave(true);
  }

  function doLeave() {
    socket.emit('room:close', {}, () => {
      reset();
      navigate('/');
    });
    // Fallback navigation in case the ack never lands (e.g. backend hiccup).
    setTimeout(() => navigate('/'), 600);
  }

  const players = room?.players ?? [];
  const playerCount = players.length;
  const minPlayers = game?.minPlayers ?? 2;
  const allReady = !game?.requireReady || (playerCount > 0 && players.every((p) => p.isReady));
  const hasMinPlayers = playerCount >= minPlayers;
  const canStart = hasMinPlayers && allReady && room?.phase === 'lobby';

  if (room?.phase === 'in_game') {
    return (
      <main className="flex min-h-full flex-col items-center justify-center gap-4 p-8 text-center">
        <p className="text-sm uppercase tracking-widest text-white/40">{t('host.inGame')}</p>
        <h1 className="text-4xl font-bold">{t('host.inGamePlaceholder')}</h1>
        <ul className="mt-4 grid grid-cols-2 gap-2">
          {players.map((p) => (
            <li key={p.id} className="rounded-lg bg-surface px-3 py-2 text-sm">
              {p.name}
              {p.team && <span className="ml-2 text-white/40">· {t(`host.team${p.team}`)}</span>}
            </li>
          ))}
        </ul>
        <Button variant="secondary" onClick={endGame} className="mt-6">
          {t('host.endGame')}
        </Button>
      </main>
    );
  }

  return (
    <main className="flex min-h-full flex-col items-center gap-6 p-8">
      <header className="flex w-full max-w-3xl items-start justify-between">
        <button
          onClick={requestLeave}
          className="flex items-center gap-1 rounded-lg bg-surface px-3 py-1.5 text-sm text-white/70 hover:bg-white/10"
        >
          <span aria-hidden>←</span>
          {t('host.backHome')}
        </button>
        <div className="text-center">
          <p className="text-sm uppercase tracking-widest text-white/40">{t('host.roomCode')}</p>
          <h1 className="mt-1 text-6xl font-extrabold tracking-wider">{code}</h1>
          <p className="mt-1 text-xs text-white/40">
            {connected ? t('host.connected') : t('host.connecting')}
          </p>
        </div>
        <LanguageSwitcher />
      </header>

      {confirmingLeave && (
        <div className="w-full max-w-md rounded-xl border border-white/10 bg-surface p-4 text-center">
          <p className="text-sm">{t('host.leaveAsk')}</p>
          <div className="mt-3 flex justify-center gap-2">
            <button
              onClick={doLeave}
              className="rounded-md bg-red-500/80 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
            >
              {t('host.leaveYes')}
            </button>
            <button
              onClick={() => setConfirmingLeave(false)}
              className="rounded-md bg-white/10 px-4 py-2 text-sm text-white/70 hover:bg-white/20"
            >
              {t('host.leaveNo')}
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-white p-6">
        <QRCodeSVG value={joinUrl} size={220} />
      </div>

      <p className="text-sm text-white/60">
        {t('host.scanToJoin')} · <span className="font-mono">{joinUrl}</span>
      </p>

      <section className="w-full max-w-md rounded-xl bg-surface p-4">
        <h2 className="font-semibold">
          {t('host.players')}{' '}
          <span className="text-white/40">
            ({playerCount}
            {game?.maxPlayers ? `/${game.maxPlayers}` : ''})
          </span>
        </h2>
        <ul className="mt-3 space-y-2">
          {players.length === 0 && (
            <li className="text-sm text-white/40">{t('host.waitingForPlayers')}</li>
          )}
          {players.map((p) => {
            const isPending = pendingKick === p.id;
            return (
              <li key={p.id} className="rounded-lg bg-white/5 p-2">
                {isPending ? (
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm">{t('host.removeAsk', { name: p.name })}</span>
                    <span className="flex gap-2">
                      <button
                        onClick={() => confirmKick(p.id)}
                        className="rounded bg-red-500/80 px-3 py-1 text-xs font-medium text-white hover:bg-red-500"
                      >
                        {t('host.removeYes')}
                      </button>
                      <button
                        onClick={() => setPendingKick(null)}
                        className="rounded bg-white/10 px-3 py-1 text-xs text-white/70 hover:bg-white/20"
                      >
                        {t('host.removeNo')}
                      </button>
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
                      <span
                        className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${
                          p.isReady ? 'bg-emerald-400' : 'bg-white/20'
                        }`}
                        aria-label={p.isReady ? t('host.ready') : t('host.notReady')}
                      />
                      <span className="truncate">{p.name}</span>
                    </span>
                    {game?.supportsTeams && (
                      <span className="flex shrink-0 gap-1">
                        {(['A', 'B'] as Team[]).map((tm) => {
                          const active = p.team === tm;
                          return (
                            <button
                              key={tm}
                              onClick={() => setTeam(p, active ? null : tm)}
                              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                                active ? TEAM_STYLES[tm] : TEAM_INACTIVE
                              }`}
                            >
                              {t(`host.team${tm}`)}
                            </button>
                          );
                        })}
                      </span>
                    )}
                    <button
                      onClick={() => setPendingKick(p.id)}
                      aria-label={`${t('common.remove')} ${p.name}`}
                      className="shrink-0 rounded px-2 py-1 text-white/40 transition hover:bg-red-500/20 hover:text-red-400"
                    >
                      ×
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <div className="flex w-full max-w-md flex-col items-stretch gap-2">
        <Button onClick={startGame} disabled={!canStart} className="w-full text-lg">
          {t('host.startGame')}
        </Button>
        {!canStart && room?.phase === 'lobby' && (
          <p className="text-center text-xs text-white/40">
            {!hasMinPlayers
              ? t('host.needMorePlayers', { min: minPlayers })
              : !allReady
              ? t('host.needAllReady')
              : ''}
          </p>
        )}
        {startError && <p className="text-center text-xs text-red-400">{startError}</p>}
      </div>
    </main>
  );
}
