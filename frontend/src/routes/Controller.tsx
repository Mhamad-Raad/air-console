import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useSocket } from '../hooks/useSocket';
import { useRoomStore } from '../stores/room.store';
import { Button } from '../components/ui/Button';
import { LanguageSwitcher } from '../components/ui/LanguageSwitcher';
import { setLocale, type Locale } from '../i18n';
import type { Room } from '../types';

const PLAYER_ID_KEY = 'air-console:playerId';
const nameKey = (code: string) => `air-console:room:${code}:name`;

export default function Controller() {
  const { t, i18n } = useTranslation();
  const { code = '' } = useParams();
  const navigate = useNavigate();
  const { socket, connected } = useSocket();
  const room = useRoomStore((s) => s.room);
  const setRoom = useRoomStore((s) => s.setRoom);
  const reset = useRoomStore((s) => s.reset);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(
    () => localStorage.getItem(PLAYER_ID_KEY),
  );
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState('');

  const storedName = localStorage.getItem(nameKey(code)) ?? 'Player';
  const me = playerId ? room?.players.find((p) => p.id === playerId) : null;
  const displayName = me?.name ?? storedName;
  const isReady = me?.isReady ?? false;
  const team = me?.team ?? null;

  useEffect(() => {
    if (!connected) return;
    const existingId = localStorage.getItem(PLAYER_ID_KEY) ?? undefined;
    let didJoin = false;

    socket.emit(
      'room:join',
      { code, name: storedName, playerId: existingId },
      (res: { ok: boolean; error?: string; room?: Room; playerId?: string }) => {
        if (res?.ok && res.room) {
          didJoin = true;
          setRoom(res.room);
          setJoined(true);
          if (res.playerId) {
            localStorage.setItem(PLAYER_ID_KEY, res.playerId);
            setPlayerId(res.playerId);
          }
          // Sync locale to server so host/peers can see it.
          socket.emit('player:update', { locale: i18n.language as Locale });
        } else {
          const errMsg = res?.error ?? 'Failed to join';
          // Room doesn't exist anymore — go home so the user can join a fresh one.
          if (/not found/i.test(errMsg)) {
            reset();
            setError(t('controller.roomNotFound'));
            setTimeout(() => navigate('/'), 1500);
          } else {
            setError(errMsg);
          }
        }
      },
    );

    const onState = (next: Room) => setRoom(next);
    const onKicked = () => {
      reset();
      alert(t('controller.kicked'));
      navigate('/');
    };

    socket.on('room:state', onState);
    socket.on('player:kicked', onKicked);

    return () => {
      socket.off('room:state', onState);
      socket.off('player:kicked', onKicked);
      // Back-button or unmount: tell the server we're leaving so the host
      // doesn't show a ghost player. Server-side disconnect cleanup also
      // covers this when the tab actually closes.
      if (didJoin && socket.connected) {
        socket.emit('room:leave');
      }
    };
  }, [connected, socket, code, storedName, setRoom, reset, navigate, t, i18n.language]);

  function startEdit() {
    setDraftName(displayName);
    setEditing(true);
  }

  function saveEdit() {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === displayName) {
      setEditing(false);
      return;
    }
    socket.emit('player:update', { name: trimmed }, (res: { ok: boolean }) => {
      if (res?.ok) {
        localStorage.setItem(nameKey(code), trimmed);
        setEditing(false);
      }
    });
  }

  function toggleReady() {
    socket.emit('player:update', { isReady: !isReady });
  }

  function changeLocale(loc: Locale) {
    setLocale(loc);
    socket.emit('player:update', { locale: loc });
  }

  if (room?.phase === 'in_game') {
    return (
      <main className="mx-auto flex min-h-full max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm uppercase tracking-widest text-white/40">{t('controller.inGameTitle')}</p>
        <h1 className="text-3xl font-bold">{t('controller.inGamePlaceholder')}</h1>
        {team && (
          <p className="text-sm text-white/60">
            {t('controller.yourTeam')}: {t(`host.team${team}`)}
          </p>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
      <header className="w-full">
        <div className="flex items-center justify-end">
          <LanguageSwitcher />
        </div>
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
            maxLength={24}
            className="flex-1 rounded-lg bg-surface px-3 py-2 text-center outline-none ring-1 ring-white/10 focus:ring-accent"
            onKeyDown={(e) => {
              if (e.key === 'Enter') saveEdit();
              if (e.key === 'Escape') setEditing(false);
            }}
          />
          <Button onClick={saveEdit} className="px-3 py-2 text-sm">
            {t('common.save')}
          </Button>
        </div>
      )}

      <p className="text-xs text-white/40">
        {error ? error : connected ? (joined ? t('controller.joined') : t('controller.joining')) : t('host.connecting')}
      </p>

      {team && (
        <p className="text-xs text-white/50">
          {t('controller.yourTeam')}: <span className="font-semibold">{t(`host.team${team}`)}</span>
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

      <button
        onClick={() => changeLocale(i18n.language === 'ar' ? 'en' : 'ar')}
        className="mt-2 hidden"
        aria-hidden
      />
    </main>
  );
}
