import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSocket } from '../hooks/useSocket';
import { useSocketEvent } from '../hooks/useSocketEvent';
import { useEmit } from '../hooks/useEmit';
import { useMe, useRoom } from '../hooks/useRoom';
import { useGameState, useGameStateListener } from '../hooks/useGameState';
import { useGameAction } from '../hooks/useGameAction';
import { Button } from '../components/ui/Button';
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';
import { ClientEvents, ServerEvents } from '../lib/events';
import { STORAGE_KEYS, TIMING, PLAYER as PLAYER_LIMITS } from '../lib/constants';
import { type Locale } from '../i18n';
import { getRenderer } from '../games/registry';
import type { Player, Room } from '../types';

const PLAYER_ID_KEY = STORAGE_KEYS.PLAYER_ID;
const nameKey = STORAGE_KEYS.ROOM_NAME;

export default function Controller() {
  const { t, i18n } = useTranslation();
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { socket, connected } = useSocket();
  const emit = useEmit();
  const { room, setRoom, reset } = useRoom();
  const me = useMe();

  // Register the game:state listener at route mount so the renderer never
  // misses the catch-up snapshot the server sends right after a rejoin.
  useGameStateListener();

  const [storedName, setStoredName] = useState(
    () => localStorage.getItem(nameKey(code)) ?? '',
  );
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');

  const displayName = me?.name ?? storedName ?? t('controller.defaultName');
  const isReady = me?.isReady ?? false;
  const team = me?.team ?? null;

  // --- room:join lifecycle (does NOT depend on language) ---
  useEffect(() => {
    if (!connected) return;
    let didJoin = false;
    const initialName = (localStorage.getItem(nameKey(code)) ?? '').trim() || t('controller.defaultName');
    const existingId = localStorage.getItem(PLAYER_ID_KEY) ?? undefined;

    (async () => {
      const res = await emit<{ room?: Room; playerId?: string; error?: string }>(
        ClientEvents.RoomJoin,
        { code, name: initialName, playerId: existingId },
      );

      if (res.ok && res.room) {
        didJoin = true;
        setRoom(res.room);
        setJoined(true);
        if (res.playerId) localStorage.setItem(PLAYER_ID_KEY, res.playerId);
        // Sync the current locale to the server now that we're joined.
        socket.emit(ClientEvents.PlayerUpdate, { locale: i18n.language as Locale });
      } else {
        const errMsg = res.error ?? 'Failed to join';
        if (/not found/i.test(errMsg)) {
          reset();
          setError(t('controller.roomNotFound'));
          setTimeout(() => navigate('/'), TIMING.ROOM_NOT_FOUND_REDIRECT_MS);
        } else {
          setError(errMsg);
        }
      }
    })();

    return () => {
      // Back/unmount: tell the server we're leaving so the host doesn't see a ghost.
      if (didJoin && socket.connected) {
        socket.emit(ClientEvents.RoomLeave);
      }
    };
    // i18n.language deliberately excluded — language change syncs via the
    // separate effect below, not by re-joining the room.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connected, socket, code, emit, setRoom, reset, navigate, t]);

  // --- locale sync (no leave/rejoin) ---
  useEffect(() => {
    if (!joined) return;
    socket.emit(ClientEvents.PlayerUpdate, { locale: i18n.language as Locale });
  }, [i18n.language, joined, socket]);

  // --- server events ---
  useSocketEvent<Room>(ServerEvents.RoomState, (next) => setRoom(next), [setRoom]);
  useSocketEvent(ServerEvents.PlayerKicked, () => {
    reset();
    alert(t('controller.kicked'));
    navigate('/');
  }, [reset, navigate, t]);
  useSocketEvent(ServerEvents.RoomClosed, () => {
    reset();
    alert(t('controller.roomClosed'));
    navigate('/');
  }, [reset, navigate, t]);

  // --- actions ---
  function startEdit() {
    setDraftName(displayName);
    setEditing(true);
  }

  async function saveEdit() {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === displayName) {
      setEditing(false);
      return;
    }
    const res = await emit(ClientEvents.PlayerUpdate, { name: trimmed });
    if (res.ok) {
      localStorage.setItem(nameKey(code), trimmed);
      setStoredName(trimmed);
      setEditing(false);
    }
  }

  function toggleReady() {
    socket.emit(ClientEvents.PlayerUpdate, { isReady: !isReady });
  }

  // --- render ---
  if (room?.phase === 'in_game' && me) {
    return <ControllerGameView room={room} me={me} />;
  }

  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
      <header className="flex w-full justify-end">
        <LanguageSwitcher />
      </header>

      <p className="text-sm uppercase tracking-widest text-white/40">{t('controller.room')}</p>
      <h1 className="text-4xl font-extrabold">{code}</h1>

      {!editing ? (
        <div className="flex items-center gap-2">
          <p className="text-white/70">{t('controller.greeting', { name: displayName })}</p>
          {joined && (
            <button
              onClick={startEdit}
              className="rounded px-2 py-0.5 text-xs text-white/40 hover:bg-white/5 hover:text-white"
            >
              {t('common.edit')}
            </button>
          )}
        </div>
      ) : (
        <div className="flex w-full max-w-xs items-center gap-2">
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            maxLength={PLAYER_LIMITS.NAME_MAX_LENGTH}
            className="flex-1 rounded-lg bg-surface px-3 py-2 text-center outline-none ring-1 ring-white/10 focus:ring-accent"
            onKeyDown={(e) => {
              if (e.key === 'Enter') void saveEdit();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
          <Button onClick={() => void saveEdit()} className="px-3 py-2 text-sm">
            {t('common.save')}
          </Button>
        </div>
      )}

      <p className="text-xs text-white/40">
        {error
          ? error
          : connected
          ? joined
            ? t('controller.joined')
            : t('controller.joining')
          : t('host.connecting')}
      </p>

      {team && (
        <p className="text-xs text-white/50">
          {t('controller.yourTeam')}:{' '}
          <span className="font-semibold">{t(`host.team${team}`)}</span>
        </p>
      )}

      {room && (
        <p className="text-xs text-white/40">
          {t('controller.lobbyCount', { count: room.players.length })}
        </p>
      )}

      <Button
        variant={isReady ? 'secondary' : 'primary'}
        className="mt-4 w-full"
        onClick={toggleReady}
        disabled={!joined}
      >
        {isReady ? t('controller.cancelReady') : t('controller.imReady')}
      </Button>
    </main>
  );
}

interface ControllerGameViewProps {
  room: Room;
  me: Player;
}

function ControllerGameView({ room, me }: ControllerGameViewProps) {
  const { t } = useTranslation();
  const { view, slug } = useGameState();
  const emit = useGameAction();
  const renderer = getRenderer(room.gameSlug);

  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
      {!renderer ? (
        <p className="text-amber-400">
          {t('games.noRenderer', { slug: room.gameSlug })}
        </p>
      ) : view && slug === room.gameSlug ? (
        <renderer.ControllerView view={view} me={me} room={room} emit={emit} />
      ) : (
        <p className="text-white/60">{t('games.loading')}</p>
      )}
    </main>
  );
}
