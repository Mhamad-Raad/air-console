import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSocket } from '../hooks/useSocket';
import { Button } from '../components/ui/Button';

export default function Controller() {
  const { code = '' } = useParams();
  const { socket, connected } = useSocket();
  const [joined, setJoined] = useState(false);
  const name = sessionStorage.getItem(`room:${code}:name`) ?? 'Player';

  useEffect(() => {
    if (!connected) return;
    socket.emit(
      'room:join',
      { code, name, playerId: localStorage.getItem('playerId') ?? undefined },
      (res: { ok: boolean }) => {
        if (res?.ok) setJoined(true);
      },
    );
  }, [connected, socket, code, name]);

  return (
    <main className="mx-auto flex min-h-full max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
      <p className="text-sm uppercase tracking-widest text-white/40">Room</p>
      <h1 className="text-4xl font-extrabold">{code}</h1>
      <p className="text-white/70">Hi, {name}</p>
      <p className="text-xs text-white/40">
        {connected ? (joined ? 'joined' : 'joining…') : 'connecting…'}
      </p>
      <Button variant="secondary" className="mt-4 w-full" disabled>
        Waiting for host
      </Button>
    </main>
  );
}
