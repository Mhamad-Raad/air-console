import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import { useRoomStore } from '../stores/room.store';
import { Button } from '../components/ui/Button';
import type { Room } from '../types';

const PLAYER_ID_KEY = 'air-console:playerId';

export default function Controller() {
  const { code = '' } = useParams();
  const { socket, connected } = useSocket();
  const room = useRoomStore((s) => s.room);
  const setRoom = useRoomStore((s) => s.setRoom);
  const [joined, setJoined] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const name = sessionStorage.getItem(`room:${code}:name`) ?? 'Player';

  useEffect(() => {
    if (!connected) return;
    const playerId = localStorage.getItem(PLAYER_ID_KEY) ?? undefined;

    socket.emit(
      'room:join',
      { code, name, playerId },
      (res: { ok: boolean; error?: string; room?: Room; playerId?: string }) => {
        if (res?.ok && res.room) {
          setRoom(res.room);
          setJoined(true);
          if (res.playerId) localStorage.setItem(PLAYER_ID_KEY, res.playerId);
        } else {
          setError(res?.error ?? 'Failed to join');
        }
      },
    );

    const onState = (next: Room) => setRoom(next);
    socket.on('room:state', onState);

    return () => {
      socket.off('room:state', onState);
    };
  }, [connected, socket, code, name, setRoom]);

  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-sm uppercase tracking-widest text-white/40">Room</p>
      <h1 className="text-4xl font-extrabold">{code}</h1>
      <p className="text-white/70">Hi, {name}</p>
      <p className="text-xs text-white/40">
        {error ? error : connected ? (joined ? 'joined' : 'joining…') : 'connecting…'}
      </p>
      {room && (
        <p className="text-xs text-white/40">
          {room.players.length} player{room.players.length === 1 ? '' : 's'} in lobby
        </p>
      )}
      <Button variant="secondary" className="mt-4 w-full" disabled>
        Waiting for host
      </Button>
    </main>
  );
}
