// Smoke test: covers the full Phase 1 lobby flow.
//
// 1. Create a room (REST)
// 2. Host claims it
// 3. Two players join
// 4. Host assigns teams via player:set
// 5. Both players mark themselves ready via player:update
// 6. Host starts the game; verify everyone sees phase=in_game
// 7. Disconnect one player to confirm cleanup
//
// Run from the frontend folder so node finds socket.io-client:
//   node scripts/smoke-test.mjs

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

function summarise(room) {
  const list = room.players
    .map((p) => `${p.name}${p.team ? `(${p.team})` : ''}${p.isReady ? '✓' : ''}`)
    .join(', ') || '(none)';
  return `phase=${room.phase} players=[${list}]`;
}

function connect(label) {
  const s = io(API, { transports: ['websocket'] });
  s.on('room:state', (room) => console.log(`[${label}] room:state ${summarise(room)}`));
  s.on('connect', () => console.log(`[${label}] connected ${s.id}`));
  s.on('disconnect', () => console.log(`[${label}] disconnected`));
  return s;
}

function emit(s, event, payload) {
  return new Promise((resolve) => s.emit(event, payload, resolve));
}

async function waitForConnect(s) {
  return new Promise((r) => (s.connected ? r() : s.on('connect', r)));
}

async function main() {
  const room = await createRoom();
  console.log('created room', room.code);

  const host = connect('host');
  const a = connect('A');
  const b = connect('B');

  await Promise.all([waitForConnect(host), waitForConnect(a), waitForConnect(b)]);

  console.log('\n— host claims room');
  await emit(host, 'host:claim', { code: room.code });

  console.log('\n— players join');
  const aJoin = await emit(a, 'room:join', { code: room.code, name: 'Alice' });
  const bJoin = await emit(b, 'room:join', { code: room.code, name: 'Bob' });

  console.log('\n— host assigns teams');
  await emit(host, 'player:set', { playerId: aJoin.playerId, patch: { team: 'A' } });
  await emit(host, 'player:set', { playerId: bJoin.playerId, patch: { team: 'B' } });

  console.log('\n— host tries to start before everyone is ready (should fail)');
  console.log('game:start ack', await emit(host, 'game:start', {}));

  console.log('\n— players mark ready');
  await emit(a, 'player:update', { isReady: true });
  await emit(b, 'player:update', { isReady: true });

  console.log('\n— host starts the game');
  console.log('game:start ack', await emit(host, 'game:start', {}));

  await new Promise((r) => setTimeout(r, 300));

  console.log('\n— A disconnects');
  a.disconnect();
  await new Promise((r) => setTimeout(r, 300));

  host.disconnect();
  b.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
