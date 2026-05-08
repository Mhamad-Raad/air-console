import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { useSocket } from '../hooks/useSocket';
import { useRoomStore } from '../stores/room.store';
import { Button } from '../components/ui/Button';
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';
import { api } from '../lib/api';
import type { GameCatalogEntry, Player, Room, Team } from '../types';

const TEAM_CYCLE: (Team | null)[] = [null, 'A', 'B'];

export default function Host() {
  const { t } = useTranslation();
  const { code = '' } = useParams();
  const { socket, connected } = useSocket();
  const room = useRoomStore((s) => s.room);
  const setRoom = useRoomStore((s) => s.setRoom);
  const [game, setGame] = useState<GameCatalogEntry | null>(null);
  const [startError, setStartError] = useState<string | null>(null);

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
    socket.on('room:state', onState);

    return () => {
      socket.off('room:state', onState);
    };
  }, [connected, socket, code, setRoom]);

  useEffect(() => {
    if (!room?.gameSlug) return;
    api
      .get<GameCatalogEntry>(`/api/games/${room.gameSlug}`)
      .then(setGame)
      .catch(() => setGame(null));
  }, [room?.gameSlug]);

  function kick(playerId: string, name: string) {
    if (!confirm(t('host.removeConfirm', { name }))) return;
    socket.emit('room:kick', { playerId });
  }

  function cycleTeam(player: Player) {
    const idx = TEAM_CYCLE.indexOf(player.team ?? null);
    const next = TEAM_CYCLE[(idx + 1) % TEAM_CYCLE.length] ?? null;
    socket.emit('player:set', { playerId: player.id, patch: { team: next } });
  }

  function startGame() {
    setStartError(null);
    socket.emit('game:start', {}, (res: { ok: boolean; error?: string }) => {
      if (!res?.ok) setStartError(res?.error ?? 'Failed to start');
    });
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
      </main>
    );
  }

  return (
    <main className="flex min-h-full flex-col items-center gap-6 p-8">
      <header className="flex w-full max-w-3xl items-start justify-between">
        <div className="text-center">
          <p className="text-sm uppercase tracking-widest text-white/40">{t('host.roomCode')}</p>
          <h1 className="mt-1 text-6xl font-extrabold tracking-wider">{code}</h1>
          <p className="mt-1 text-xs text-white/40">
            {connected ? t('host.connected') : t('host.connecting')}
          </p>
        </div>
        <LanguageSwitcher />
      </header>

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
        <ul className="mt-2 space-y-1">
          {players.length === 0 && (
            <li className="text-sm text-white/40">{t('host.waitingForPlayers')}</li>
          )}
          {players.map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between rounded px-2 py-1 hover:bg-white/5"
            >
              <span className="flex items-center gap-2 text-sm">
                <span
                  className={`inline-block h-2 w-2 rounded-full ${
                    p.isReady ? 'bg-emerald-400' : 'bg-white/20'
                  }`}
                  aria-label={p.isReady ? t('host.ready') : t('host.notReady')}
                />
                {p.name}
              </span>
              <span className="flex items-center gap-1">
                {game?.supportsTeams && (
                  <button
                    onClick={() => cycleTeam(p)}
                    className="rounded bg-white/5 px-2 py-0.5 text-xs text-white/70 hover:bg-white/10"
                    title={t('host.team')}
                  >
                    {p.team ? t(`host.team${p.team}`) : t('host.noTeam')}
                  </button>
                )}
                <button
                  onClick={() => kick(p.id, p.name)}
                  aria-label={`${t('common.remove')} ${p.name}`}
                  className="rounded px-2 text-white/40 transition hover:bg-red-500/20 hover:text-red-400"
                >
                  ×
                </button>
              </span>
            </li>
          ))}
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
