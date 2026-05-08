// Smoke test: create a room, host claims it, two players join, all sockets
// should receive room:state with the new player list.
//
// Run from the frontend folder so node finds socket.io-client:
//   node ../scripts/smoke-test.mjs

import { io } from 'socket.io-client';

const API = process.env.API_URL ?? 'http://localhost:3001';

async function createRoom() {
  const res = await fetch(`${API}/api/rooms`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ gameSlug: 'dominos' }),
  });
  if (!res.ok) throw new Error(`createRoom failed: ${res.status}`);
  return res.json();
}

function connect(label) {
  const s = io(API, { transports: ['websocket'] });
  s.on('room:state', (room) => {
    console.log(`[${label}] room:state players=${room.players.map((p) => p.name).join(', ') || '(none)'}`);
  });
  s.on('connect', () => console.log(`[${label}] connected ${s.id}`));
  s.on('disconnect', () => console.log(`[${label}] disconnected`));
  return s;
}

function emit(s, event, payload) {
  return new Promise((resolve) => s.emit(event, payload, resolve));
}

async function main() {
  const room = await createRoom();
  console.log('created room', room.code);

  const host = connect('host');
  const a = connect('A');
  const b = connect('B');

  await new Promise((r) => host.on('connect', r));
  await new Promise((r) => a.on('connect', r));
  await new Promise((r) => b.on('connect', r));

  console.log('host claiming…');
  console.log('host:claim ack', await emit(host, 'host:claim', { code: room.code }));

  console.log('A joining…');
  console.log('room:join ack', await emit(a, 'room:join', { code: room.code, name: 'Alice' }));

  console.log('B joining…');
  console.log('room:join ack', await emit(b, 'room:join', { code: room.code, name: 'Bob' }));

  await new Promise((r) => setTimeout(r, 500));

  console.log('A disconnecting…');
  a.disconnect();
  await new Promise((r) => setTimeout(r, 500));

  host.disconnect();
  b.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
