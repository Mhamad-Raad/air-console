import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useSocket } from '../hooks/useSocket';
import { useRoomStore } from '../stores/room.store';
import type { Room } from '../types';

export default function Host() {
  const { code = '' } = useParams();
  const { socket, connected } = useSocket();
  const room = useRoomStore((s) => s.room);
  const setRoom = useRoomStore((s) => s.setRoom);

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

  function kick(playerId: string, name: string) {
    if (!confirm(`Remove ${name} from the room?`)) return;
    socket.emit('room:kick', { playerId });
  }

  return (
    <main className="flex min-h-full flex-col items-center justify-center gap-8 p-8">
      <header className="text-center">
        <p className="text-sm uppercase tracking-widest text-white/40">Room code</p>
        <h1 className="mt-2 text-6xl font-extrabold tracking-wider">{code}</h1>
        <p className="mt-2 text-xs text-white/40">
          {connected ? 'connected' : 'connecting…'}
        </p>
      </header>

      <div className="rounded-2xl bg-white p-6">
        <QRCodeSVG value={joinUrl} size={240} />
      </div>

      <p className="text-white/60">Scan to join · {joinUrl}</p>

      <section className="w-full max-w-md rounded-xl bg-surface p-4">
        <h2 className="font-semibold">
          Players <span className="text-white/40">({room?.players.length ?? 0})</span>
        </h2>
        <ul className="mt-2 space-y-1">
          {(room?.players ?? []).length === 0 && (
            <li className="text-sm text-white/40">Waiting for players…</li>
          )}
          {room?.players.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded px-2 py-1 hover:bg-white/5">
              <span className="text-sm">{p.name}</span>
              <button
                onClick={() => kick(p.id, p.name)}
                aria-label={`Remove ${p.name}`}
                className="rounded px-2 text-white/40 transition hover:bg-red-500/20 hover:text-red-400"
                title="Remove player"
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
