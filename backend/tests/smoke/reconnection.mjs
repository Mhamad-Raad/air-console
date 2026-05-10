// Phase 2 reconnection smoke test.
// Verifies: a player who disconnects keeps their seat (with disconnectedAt
// set), can rejoin within the grace window without losing state, and is
// caught up to the live game:state if the room is in_game.
//
// Run with: node tests/smoke/reconnection.mjs
// Requires: backend running on http://localhost:3001
//           Redis up; frontend node_modules present (we borrow socket.io-client)

import { io } from '../../../frontend/node_modules/socket.io-client/build/esm/index.js';

const BACKEND = 'http://localhost:3001';

const ClientEvents = {
  HostClaim: 'host:claim',
  RoomJoin: 'room:join',
  PlayerUpdate: 'player:update',
  GameStart: 'game:start',
  GameAction: 'game:action',
  RoomClose: 'room:close',
};
const ServerEvents = {
  RoomState: 'room:state',
  GameState: 'game:state',
};

function log(...args) {
  console.log('  ', ...args);
}

function fail(msg) {
  console.error('\n❌ FAIL:', msg);
  process.exit(1);
}

function pass(msg) {
  console.log('✅', msg);
}

function emit(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`ack timeout for ${event}`)), 3000);
    socket.emit(event, payload ?? {}, (res) => {
      clearTimeout(t);
      resolve(res);
    });
  });
}

function waitFor(socket, event, predicate, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`timeout waiting for ${event}`));
    }, timeoutMs);
    function handler(payload) {
      if (predicate(payload)) {
        clearTimeout(t);
        socket.off(event, handler);
        resolve(payload);
      }
    }
    socket.on(event, handler);
  });
}

function connect() {
  return new Promise((resolve, reject) => {
    const s = io(BACKEND, { transports: ['websocket'], reconnection: false, forceNew: true });
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}

async function main() {
  console.log('\n--- Phase 2 reconnection smoke ---\n');

  // 1. Create a room via REST.
  log('creating room…');
  const createRes = await fetch(`${BACKEND}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ gameSlug: 'dominos' }),
  });
  if (!createRes.ok) fail(`POST /api/rooms ${createRes.status}`);
  const { code } = await createRes.json();
  log('room', code);

  // 2. Host claims.
  log('host claim…');
  const host = await connect();
  const claim = await emit(host, ClientEvents.HostClaim, { code });
  if (!claim.ok) fail(`host:claim ${claim.error}`);
  pass('host claimed room');

  // 3. Two players join.
  log('player A join…');
  const playerA = await connect();
  const joinA = await emit(playerA, ClientEvents.RoomJoin, { code, name: 'Alice' });
  if (!joinA.ok) fail(`A join ${joinA.error}`);
  const aId = joinA.playerId;
  log('  playerId A =', aId);

  log('player B join…');
  const playerB = await connect();
  const joinB = await emit(playerB, ClientEvents.RoomJoin, { code, name: 'Bob' });
  if (!joinB.ok) fail(`B join ${joinB.error}`);
  const bId = joinB.playerId;
  log('  playerId B =', bId);

  pass('two players joined');

  // 4. Both ready up so we can start the game.
  await emit(playerA, ClientEvents.PlayerUpdate, { isReady: true });
  await emit(playerB, ClientEvents.PlayerUpdate, { isReady: true });

  // 5. Start the game; expect game:state on both controllers and the host.
  log('host starts game…');
  const aGameState = waitFor(playerA, ServerEvents.GameState, () => true);
  const bGameState = waitFor(playerB, ServerEvents.GameState, () => true);
  const hostGameState = waitFor(host, ServerEvents.GameState, () => true);
  const start = await emit(host, ClientEvents.GameStart);
  if (!start.ok) fail(`game:start ${start.error}`);

  const [aState, bState, hState] = await Promise.all([aGameState, bGameState, hostGameState]);
  if (aState.slug !== 'dominos') fail(`A view slug=${aState.slug}`);
  if (bState.slug !== 'dominos') fail(`B view slug=${bState.slug}`);
  if (hState.slug !== 'dominos') fail(`host view slug=${hState.slug}`);
  // Host view: hands are { id: <number> } — not arrays.
  if (typeof hState.view.hands[aId] !== 'number') {
    fail(`host view should expose hand SIZE not array, got ${typeof hState.view.hands[aId]}`);
  }
  // Player view: only see your own hand as an array, others are []
  if (!Array.isArray(aState.view.hands[aId])) fail('A should see their own hand as array');
  if (!Array.isArray(aState.view.hands[bId]) || aState.view.hands[bId].length !== 0) {
    fail('A should see B hand as empty array');
  }
  pass('game:start fanned per-player views (host sees sizes, players see hidden hands)');

  // 6. Player A disconnects mid-game. Expect room:state with disconnectedAt.
  log('player A disconnects…');
  const disconnectMarked = waitFor(
    host,
    ServerEvents.RoomState,
    (room) => {
      const a = room.players.find((p) => p.id === aId);
      return a && typeof a.disconnectedAt === 'number';
    },
    5000,
  );
  playerA.disconnect();
  const afterDisconnect = await disconnectMarked;
  const aRecord = afterDisconnect.players.find((p) => p.id === aId);
  if (!aRecord) fail('player A removed (expected to keep seat)');
  if (typeof aRecord.disconnectedAt !== 'number') fail('disconnectedAt not set');
  if (afterDisconnect.players.length !== 2) {
    fail(`expected 2 players still in room, got ${afterDisconnect.players.length}`);
  }
  pass('disconnect kept seat and marked disconnectedAt');

  // 7. Player A reconnects with same playerId. Expect:
  //    a) room:state with disconnectedAt cleared
  //    b) game:state delivered to the rejoiner so they catch up
  log('player A reconnects with same playerId…');
  const playerA2 = await connect();
  const reconnectCleared = waitFor(
    host,
    ServerEvents.RoomState,
    (room) => {
      const a = room.players.find((p) => p.id === aId);
      return a && a.disconnectedAt === undefined;
    },
    5000,
  );
  const catchUpGameState = waitFor(playerA2, ServerEvents.GameState, () => true, 5000);
  const rejoin = await emit(playerA2, ClientEvents.RoomJoin, {
    code,
    name: 'Alice',
    playerId: aId,
  });
  if (!rejoin.ok) fail(`rejoin ${rejoin.error}`);
  if (rejoin.playerId !== aId) fail(`expected same playerId, got ${rejoin.playerId}`);
  await reconnectCleared;
  pass('rejoin cleared disconnectedAt and preserved playerId');

  const catchUp = await catchUpGameState;
  if (catchUp.slug !== 'dominos') fail(`catch-up game:state slug=${catchUp.slug}`);
  if (!Array.isArray(catchUp.view.hands[aId])) fail('catch-up view missing own hand');
  pass('rejoiner received catch-up game:state');

  // 8. Cleanup. Close the room then let socket.io drain naturally —
  // explicit process.exit during shutdown can trip a libuv assertion on
  // Windows.
  log('host closes room…');
  await emit(host, ClientEvents.RoomClose);
  host.disconnect();
  playerA2.disconnect();
  playerB.disconnect();

  console.log('\n🎉 all reconnection assertions passed\n');
}

main().catch((err) => {
  console.error('\n❌ unhandled:', err);
  process.exitCode = 1;
});
