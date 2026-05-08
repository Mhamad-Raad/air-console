import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import { useRoomStore } from '../stores/room.store';
import { Button } from '../components/ui/Button';
import type { Room } from '../types';

const PLAYER_ID_KEY = 'air-console:playerId';
const nameKey = (code: string) => `air-console:room:${code}:name`;

export default function Controller() {
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

  // Name persists across Safari closes via localStorage. The room state is
  // the source of truth once we've joined — fall back to local storage only
  // before the first state arrives.
  const storedName = localStorage.getItem(nameKey(code)) ?? 'Player';
  const meFromRoom = playerId ? room?.players.find((p) => p.id === playerId) : null;
  const displayName = meFromRoom?.name ?? storedName;

  useEffect(() => {
    if (!connected) return;
    const existingId = localStorage.getItem(PLAYER_ID_KEY) ?? undefined;

    socket.emit(
      'room:join',
      { code, name: storedName, playerId: existingId },
      (res: { ok: boolean; error?: string; room?: Room; playerId?: string }) => {
        if (res?.ok && res.room) {
          setRoom(res.room);
          setJoined(true);
          if (res.playerId) {
            localStorage.setItem(PLAYER_ID_KEY, res.playerId);
            setPlayerId(res.playerId);
          }
        } else {
          setError(res?.error ?? 'Failed to join');
        }
      },
    );

    const onState = (next: Room) => setRoom(next);
    const onKicked = () => {
      reset();
      alert('You were removed from the room.');
      navigate('/');
    };

    socket.on('room:state', onState);
    socket.on('player:kicked', onKicked);

    return () => {
      socket.off('room:state', onState);
      socket.off('player:kicked', onKicked);
    };
  }, [connected, socket, code, storedName, setRoom, reset, navigate]);

  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-sm uppercase tracking-widest text-white/40">Room</p>
      <h1 className="text-4xl font-extrabold">{code}</h1>
      <p className="text-white/70">Hi, {displayName}</p>
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
