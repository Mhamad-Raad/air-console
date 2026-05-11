// Phase 2 protocol smoke test.
// Covers: per-player game:state fan-out, mid-game disconnect+grace-period
// reconnect with catch-up game:state, game:action round-trip, and (when
// Postgres is reachable) Match-row persistence on game:end.
//
// Run with `cd backend && node tests/smoke/reconnection.mjs`. Working
// directory matters: PrismaClient resolves from backend/node_modules.
// socket.io-client is intentionally borrowed from the frontend
// node_modules since the backend doesn't depend on it.

import { io } from '../../../frontend/node_modules/socket.io-client/build/esm/index.js';
import { PrismaClient } from '@prisma/client';

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

  // 7b. Player A dispatches a game:action; expect a fresh game:state on
  // both controllers and the host (server-authoritative round-trip).
  log('player A emits game:action {type:"pass"}…');
  const aActionEcho = waitFor(playerA2, ServerEvents.GameState, () => true, 3000);
  const bActionEcho = waitFor(playerB, ServerEvents.GameState, () => true, 3000);
  const hostActionEcho = waitFor(host, ServerEvents.GameState, () => true, 3000);
  await emit(playerA2, ClientEvents.GameAction, { type: 'pass' });
  const [aEcho, bEcho, hEcho] = await Promise.all([aActionEcho, bActionEcho, hostActionEcho]);
  // Shape-check the host vs. player view distinction one more time post-action.
  if (typeof hEcho.view.hands[aId] !== 'number') fail('post-action host view should be sizes');
  if (!Array.isArray(aEcho.view.hands[aId])) fail('post-action A view should be array');
  if (!Array.isArray(bEcho.view.hands[bId])) fail('post-action B view should be array');
  pass('game:action round-trip rebroadcasts per-player game:state');

  // 7c. Trigger game:end and verify a Match row landed in Postgres.
  // We ack-emit GameEnd from the host then read back the row by code +
  // recent timestamp.
  log('host ends game…');
  const beforeEnd = new Date();
  await emit(host, 'game:end');

  let prisma = null;
  try {
    prisma = new PrismaClient();
    // Brief wait — the persistence is awaited inside the ack but we still
    // give Postgres a beat to flush the visible row.
    await new Promise((r) => setTimeout(r, 200));
    const matches = await prisma.match.findMany({
      where: { code, startedAt: { gte: new Date(beforeEnd.getTime() - 60_000) } },
      orderBy: { startedAt: 'desc' },
      take: 1,
    });
    if (matches.length === 0) fail('Match row not persisted');
    const m = matches[0];
    if (m.code !== code) fail(`Match.code = ${m.code}`);
    if (!m.endedAt) fail('Match.endedAt not set');
    const players = m.players;
    if (!Array.isArray(players) || players.length !== 2) {
      fail(`Match.players length = ${players?.length}`);
    }
    const ids = players.map((p) => p.id).sort();
    const expected = [aId, bId].sort();
    if (ids[0] !== expected[0] || ids[1] !== expected[1]) {
      fail(`Match.players ids mismatch: ${JSON.stringify(ids)}`);
    }
    pass('game:end persisted Match row to Postgres with player snapshot');
  } catch (err) {
    if (err && /ECONNREFUSED|P1000|P1001/.test(String(err))) {
      log('⚠ skipping Match-row assertion: Postgres unreachable');
    } else {
      throw err;
    }
  } finally {
    if (prisma) await prisma.$disconnect().catch(() => {});
  }

  // 8. Cleanup. Close the room then let socket.io drain naturally —
  // explicit process.exit during shutdown can trip a libuv assertion on
  // Windows.
  log('host closes room…');
  await emit(host, ClientEvents.RoomClose);
  host.disconnect();
  playerA2.disconnect();
  playerB.disconnect();

  console.log('\n🎉 all phase 2 assertions passed\n');
}

main().catch((err) => {
  console.error('\n❌ unhandled:', err);
  process.exitCode = 1;
});
