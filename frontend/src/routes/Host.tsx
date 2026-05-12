import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { useSocket } from '../hooks/useSocket';
import { useSocketEvent } from '../hooks/useSocketEvent';
import { useEmit } from '../hooks/useEmit';
import { useRoom } from '../hooks/useRoom';
import { useGameState, useGameStateListener } from '../hooks/useGameState';
import { Button } from '../components/ui/Button';
import { InlineConfirm } from '../components/ui/InlineConfirm';
import { Pill } from '../components/ui/Pill';
import { StatusDot } from '../components/ui/StatusDot';
import { RouteHeader } from '../components/ui/RouteHeader';
import { api } from '../lib/api';
import { ClientEvents, ServerEvents } from '../lib/events';
import { TIMING } from '../lib/constants';
import { getRenderer } from '../games/registry';
import type { GameCatalogEntry, Player, Room, Team } from '../types';

const TEAM_TONE: Record<Team, 'sky' | 'amber'> = { A: 'sky', B: 'amber' };

export default function Host() {
  const { t } = useTranslation();
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { socket, connected } = useSocket();
  const emit = useEmit();
  const { room, setRoom, reset } = useRoom();
  const [game, setGame] = useState<GameCatalogEntry | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [pendingKick, setPendingKick] = useState<string | null>(null);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  // Register the game:state listener at route mount so the renderer never
  // misses the catch-up snapshot the server sends right after a rejoin.
  useGameStateListener();

  const joinUrl = `${window.location.origin}/join/${code}`;

  useEffect(() => {
    document.title = `Host · ${code}`;
  }, [code]);

  // --- host:claim on connect ---
  useEffect(() => {
    if (!connected) return;
    void emit<{ room?: Room }>(ClientEvents.HostClaim, { code }).then((res) => {
      if (res.ok && res.room) setRoom(res.room);
    });
  }, [connected, emit, code, setRoom]);

  // --- fetch game config once we know the slug ---
  useEffect(() => {
    if (!room?.gameSlug) return;
    api
      .get<GameCatalogEntry>(`/api/games/${room.gameSlug}`)
      .then(setGame)
      .catch(() => setGame(null));
  }, [room?.gameSlug]);

  // --- server events ---
  useSocketEvent<Room>(ServerEvents.RoomState, (next) => setRoom(next), [setRoom]);
  useSocketEvent(ServerEvents.RoomClosed, () => {
    reset();
    navigate('/');
  }, [reset, navigate]);

  // --- actions ---
  function confirmKick(playerId: string) {
    void emit(ClientEvents.RoomKick, { playerId });
    setPendingKick(null);
  }

  function setTeam(player: Player, team: Team | null) {
    socket.emit(ClientEvents.PlayerSet, { playerId: player.id, patch: { team } });
  }

  async function startGame() {
    setStartError(null);
    const res = await emit(ClientEvents.GameStart);
    if (!res.ok) setStartError(res.error ?? 'Failed to start');
  }

  function endGame() {
    socket.emit(ClientEvents.GameEnd, {});
  }

  function requestLeave() {
    if ((room?.players.length ?? 0) === 0) {
      doLeave();
      return;
    }
    setConfirmingLeave(true);
  }

  function doLeave() {
    let navigated = false;
    const goHome = () => {
      if (navigated) return;
      navigated = true;
      reset();
      navigate('/');
    };
    void emit(ClientEvents.RoomClose).then(goHome);
    // Fallback in case the ack never lands.
    setTimeout(goHome, TIMING.LEAVE_FALLBACK_MS);
  }

  // --- derived state ---
  const players = room?.players ?? [];
  const playerCount = players.length;
  const minPlayers = game?.minPlayers ?? 2;
  const allReady = !game?.requireReady || (playerCount > 0 && players.every((p) => p.isReady));
  const hasMinPlayers = playerCount >= minPlayers;
  const canStart = hasMinPlayers && allReady && room?.phase === 'lobby';

  // --- render: in-game ---
  if (room?.phase === 'in_game') {
    return <HostGameView room={room} onEndGame={endGame} />;
  }

  // --- render: lobby ---
  return (
    <main className="flex min-h-full flex-col items-center gap-6 p-8">
      <RouteHeader
        onBack={requestLeave}
        backLabel={t('host.backHome')}
        center={
          <>
            <p className="text-sm uppercase tracking-widest text-white/40">{t('host.roomCode')}</p>
            <h1 className="mt-1 text-6xl font-extrabold tracking-wider">{code}</h1>
            <p className="mt-1 text-xs text-white/40">
              {connected ? t('host.connected') : t('host.connecting')}
            </p>
          </>
        }
        className="max-w-3xl"
      />

      {confirmingLeave && (
        <div className="w-full max-w-md rounded-xl border border-white/10 bg-surface p-4">
          <InlineConfirm
            message={t('host.leaveAsk')}
            yes={t('host.leaveYes')}
            no={t('host.leaveNo')}
            onConfirm={() => {
              setConfirmingLeave(false);
              doLeave();
            }}
            onCancel={() => setConfirmingLeave(false)}
            autoCancelMs={0}
          />
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
          {players.map((p) => (
            <PlayerRow
              key={p.id}
              player={p}
              showTeams={!!game?.supportsTeams}
              isPendingKick={pendingKick === p.id}
              onStartKick={() => setPendingKick(p.id)}
              onConfirmKick={() => confirmKick(p.id)}
              onCancelKick={() => setPendingKick(null)}
              onSetTeam={(team) => setTeam(p, team)}
            />
          ))}
        </ul>
      </section>

      <div className="flex w-full max-w-md flex-col items-stretch gap-2">
        <Button onClick={() => void startGame()} disabled={!canStart} className="w-full text-lg">
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

interface HostGameViewProps {
  room: Room;
  onEndGame: () => void;
}

function HostGameView({ room, onEndGame }: HostGameViewProps) {
  const { t } = useTranslation();
  const { view, slug } = useGameState();
  const renderer = getRenderer(room.gameSlug);
  const HostView = renderer?.HostView;

  return (
    <main className="flex min-h-full flex-col items-center gap-6 p-8">
      {!renderer ? (
        <p className="text-amber-400">{t('games.noRenderer', { slug: room.gameSlug })}</p>
      ) : !HostView ? (
        // Phone-driven game with no host renderer — show a roster fallback
        // so the screen isn't blank during play.
        <PhoneDrivenFallback room={room} />
      ) : view && slug === room.gameSlug ? (
        <HostView view={view} room={room} />
      ) : (
        <p className="text-white/60">{t('games.loading')}</p>
      )}
      {/* mt-auto pushes the End Game button to the viewport bottom so
          game content (esp. Trivia's reveal leaderboard) doesn't crowd
          into it on shorter screens. */}
      <Button variant="secondary" onClick={onEndGame} className="mt-auto pt-2">
        {t('host.endGame')}
      </Button>
    </main>
  );
}

function PhoneDrivenFallback({ room }: { room: Room }) {
  const { t } = useTranslation();
  return (
    <div className="flex w-full max-w-3xl flex-col items-center gap-4 text-center">
      <p className="text-sm uppercase tracking-widest text-white/40">{t('host.inGame')}</p>
      <h1 className="text-3xl font-semibold">{t('games.phoneDrivenTitle')}</h1>
      <p className="text-white/60">{t('games.phoneDrivenHint')}</p>
      <ul className="mt-4 grid w-full grid-cols-2 gap-2">
        {room.players.map((p) => (
          <li key={p.id} className="rounded-lg bg-surface px-3 py-2 text-sm">
            {p.name}
            {p.team && (
              <span className="ml-2 text-white/40">· {t(`host.team${p.team}`)}</span>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

interface PlayerRowProps {
  player: Player;
  showTeams: boolean;
  isPendingKick: boolean;
  onStartKick: () => void;
  onConfirmKick: () => void;
  onCancelKick: () => void;
  onSetTeam: (team: Team | null) => void;
}

function PlayerRow({
  player,
  showTeams,
  isPendingKick,
  onStartKick,
  onConfirmKick,
  onCancelKick,
  onSetTeam,
}: PlayerRowProps) {
  const { t } = useTranslation();

  return (
    <li className="rounded-lg bg-white/5 p-2">
      {isPendingKick ? (
        <InlineConfirm
          message={t('host.removeAsk', { name: player.name })}
          yes={t('host.removeYes')}
          no={t('host.removeNo')}
          onConfirm={onConfirmKick}
          onCancel={onCancelKick}
        />
      ) : (
        <div className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 flex-1 items-center gap-2 text-sm">
            <StatusDot
              on={player.isReady}
              tone={
                player.disconnectedAt ? 'warn' : player.isReady ? 'on' : 'off'
              }
              label={
                player.disconnectedAt
                  ? t('host.reconnecting')
                  : player.isReady
                  ? t('host.ready')
                  : t('host.notReady')
              }
            />
            <span
              className={`truncate ${player.disconnectedAt ? 'text-white/40 italic' : ''}`}
            >
              {player.name}
              {player.disconnectedAt && (
                <span className="ml-2 text-xs text-amber-400/80 not-italic">
                  · {t('host.disconnected')}
                </span>
              )}
            </span>
          </span>
          {showTeams && (
            <span className="flex shrink-0 gap-1">
              {(['A', 'B'] as Team[]).map((tm) => (
                <Pill
                  key={tm}
                  active={player.team === tm}
                  tone={TEAM_TONE[tm]}
                  onClick={() => onSetTeam(player.team === tm ? null : tm)}
                >
                  {t(`host.team${tm}`)}
                </Pill>
              ))}
            </span>
          )}
          <button
            onClick={onStartKick}
            aria-label={`${t('common.remove')} ${player.name}`}
            className="shrink-0 rounded px-2 py-1 text-white/40 transition hover:bg-red-500/20 hover:text-red-400"
          >
            ×
          </button>
        </div>
      )}
    </li>
  );
}
