import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import { useSocket } from '../hooks/useSocket';
import { useRoomStore } from '../stores/room.store';

export default function Host() {
  const { code = '' } = useParams();
  const { connected } = useSocket();
  const room = useRoomStore((s) => s.room);

  const joinUrl = `${window.location.origin}/join/${code}`;

  useEffect(() => {
    document.title = `Host · ${code}`;
  }, [code]);

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
        <h2 className="font-semibold">Players</h2>
        <ul className="mt-2 space-y-1">
          {(room?.players ?? []).length === 0 && (
            <li className="text-sm text-white/40">Waiting for players…</li>
          )}
          {room?.players.map((p) => (
            <li key={p.id} className="text-sm">
              {p.name}
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
