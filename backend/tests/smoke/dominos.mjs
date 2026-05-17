// Dominos engine smoke test — Phase 4.
// Plays one round end-to-end with two simple bots (always pick the first
// legal tile), then continues into a second round to prove the
// roundEnd → playing transition.
//
// We don't try to reach matchEnd (targetScore=100) — a single round only
// scores ~30–100 points, so finishing the match would mean many rounds
// of bot play. The engine's match-end path is exercised by unit-level
// reasoning; this smoke is about wire-format + round-loop correctness.
//
// Run with `cd backend && node tests/smoke/dominos.mjs` against a running
// backend (`npm run dev` in another shell).

import { io } from '../../../frontend/node_modules/socket.io-client/build/esm/index.js';

const BACKEND = 'http://localhost:3001';
const TURN_TIMEOUT_MS = 8000;
const ROUND_TIMEOUT_MS = 30_000;

const ClientEvents = {
  HostClaim: 'host:claim',
  RoomJoin: 'room:join',
  GameStart: 'game:start',
  GameAction: 'game:action',
  RoomClose: 'room:close',
};
const ServerEvents = {
  GameState: 'game:state',
};

function log(...args) { console.log('  ', ...args); }
function fail(msg) { console.error('\n❌ FAIL:', msg); process.exit(1); }
function pass(msg) { console.log('✅', msg); }

function emit(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`ack timeout for ${event}`)), 5000);
    socket.emit(event, payload ?? {}, (res) => {
      clearTimeout(t);
      resolve(res);
    });
  });
}

function waitFor(socket, event, predicate, timeoutMs = TURN_TIMEOUT_MS) {
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

// Pick the first tile in hand that matches either chain end. For the
// opening move both ends are null and any tile is legal — prefer the
// highest double if we have one, matching real-world opener etiquette.
function pickPlay(view) {
  const opening = view.leftEnd === null && view.rightEnd === null;
  if (opening) {
    const doubles = view.yourHand.filter((t) => t[0] === t[1]);
    const chosen = doubles.length
      ? doubles.reduce((best, t) => (t[0] > best[0] ? t : best))
      : view.yourHand[0];
    if (!chosen) return null;
    return { tile: chosen, side: 'left' };
  }
  for (const t of view.yourHand) {
    if (t[0] === view.leftEnd || t[1] === view.leftEnd) {
      return { tile: t, side: 'left' };
    }
    if (t[0] === view.rightEnd || t[1] === view.rightEnd) {
      return { tile: t, side: 'right' };
    }
  }
  return null;
}

/**
 * Attach a permanent bot listener: whenever it's our turn during a playing
 * phase, play a legal tile or pass. Returns the underlying handler so the
 * caller can detach during teardown.
 */
function attachBot(socket, getMyId) {
  let acting = false;
  const handler = async (payload) => {
    if (acting) return;
    const view = payload.view;
    if (!view) return;
    if (view.phase !== 'playing') return;
    if (view.turn !== getMyId()) return;
    acting = true;
    try {
      if (view.canPlay) {
        const move = pickPlay(view);
        if (!move) {
          // canPlay says yes but pickPlay failed — engine/bot disagree.
          console.error('bot disagreed with canPlay', { view });
          return;
        }
        await emit(socket, ClientEvents.GameAction, {
          type: 'play',
          data: { tile: [move.tile[0], move.tile[1]], side: move.side },
        });
      } else {
        await emit(socket, ClientEvents.GameAction, { type: 'pass' });
      }
    } catch (err) {
      // Suppress trailing ack timeouts that fire during teardown — the bot
      // may already be mid-emit when the room is closed and the socket
      // stops receiving acks. While the socket is still up, log loudly.
      if (socket.connected) console.error('bot action failed', err);
    } finally {
      acting = false;
    }
  };
  socket.on(ServerEvents.GameState, handler);
  return handler;
}

async function main() {
  console.log('\n--- Phase 4 dominos smoke ---\n');

  log('creating dominos room…');
  const createRes = await fetch(`${BACKEND}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ gameSlug: 'dominos' }),
  });
  if (!createRes.ok) fail(`POST /api/rooms ${createRes.status}`);
  const { code } = await createRes.json();
  log('room', code);

  const host = await connect();
  const claim = await emit(host, ClientEvents.HostClaim, { code });
  if (!claim.ok) fail(`host:claim ${claim.error}`);

  const alice = await connect();
  const bob = await connect();
  const joinA = await emit(alice, ClientEvents.RoomJoin, { code, name: 'Alice' });
  const joinB = await emit(bob,   ClientEvents.RoomJoin, { code, name: 'Bob' });
  if (!joinA.ok || !joinB.ok) fail('player join failed');
  const aliceId = joinA.playerId;
  const bobId = joinB.playerId;
  pass(`room set up: host + Alice(${aliceId.slice(0, 6)}) + Bob(${bobId.slice(0, 6)})`);

  // Dominos requires both players ready. Mark them both via player:update,
  // then ask the host to start. If the game doesn't require ready, the
  // updates are harmless.
  const readyA = await emit(alice, 'player:update', { isReady: true });
  const readyB = await emit(bob,   'player:update', { isReady: true });
  if (!readyA.ok || !readyB.ok) fail(`player:update failed (${readyA.error ?? ''} ${readyB.error ?? ''})`);

  // Attach bots BEFORE game:start so they see the initial state broadcast
  // and can immediately act when it's their turn.
  const aliceBot = attachBot(alice, () => aliceId);
  const bobBot   = attachBot(bob,   () => bobId);

  // Set up waitFors for initial state BEFORE game:start, on independent
  // one-shot listeners — they coexist with the bot listener.
  const aliceFirstP = waitFor(alice, ServerEvents.GameState, () => true);
  const bobFirstP   = waitFor(bob,   ServerEvents.GameState, () => true);

  const started = await emit(host, ClientEvents.GameStart);
  if (!started.ok) fail(`game:start ${started.error}`);

  const aliceInitial = await aliceFirstP;
  const bobInitial   = await bobFirstP;
  if (aliceInitial.slug !== 'dominos') fail(`slug ${aliceInitial.slug}`);
  if (aliceInitial.view.phase !== 'playing') fail(`expected playing, got ${aliceInitial.view.phase}`);
  if (!Array.isArray(aliceInitial.view.yourHand) || aliceInitial.view.yourHand.length !== 7) {
    fail(`alice expected 7 tiles, got ${aliceInitial.view.yourHand?.length}`);
  }
  if (!Array.isArray(bobInitial.view.yourHand) || bobInitial.view.yourHand.length !== 7) {
    fail(`bob expected 7 tiles, got ${bobInitial.view.yourHand?.length}`);
  }
  if (aliceInitial.view.board.length !== 0) fail('expected empty board');
  if (aliceInitial.view.leftEnd !== null || aliceInitial.view.rightEnd !== null) {
    fail('expected null ends before opening move');
  }
  // Both hand counts visible to each player.
  if ((aliceInitial.view.handCounts[bobId] ?? -1) !== 7) {
    fail(`alice should see bob has 7 tiles, got ${aliceInitial.view.handCounts[bobId]}`);
  }
  // Player view must hide other players' hands (no leak in the projection).
  if ('hands' in aliceInitial.view) {
    fail('player view leaks engine-side hands map');
  }
  pass('initial deal: 7 tiles each, empty board, opener identified');

  const opener = aliceInitial.view.starterId;
  if (!opener || (opener !== aliceId && opener !== bobId)) fail(`bad opener ${opener}`);
  log('opener', opener === aliceId ? 'Alice' : 'Bob');

  // Wait for round 1 to end (either domino or blocked). Watch the host
  // socket since it sees every transition.
  const round1End = await waitFor(
    host,
    ServerEvents.GameState,
    (p) => p.view.phase === 'roundEnd' || p.view.phase === 'finished',
    ROUND_TIMEOUT_MS,
  );
  const r1 = round1End.view.rounds[round1End.view.rounds.length - 1];
  if (!r1) fail('roundEnd reached but rounds[] is empty');
  pass(
    `round 1 ended: ${r1.blocked ? 'BLOCKED' : 'DOMINO'} · winner=${r1.winnerId ?? 'tie'} · +${r1.points}`,
  );

  // Score invariant: if there's a winner, their score equals their previous
  // score (0) + r1.points. If tie/no-winner, all scores are still 0.
  if (r1.winnerId) {
    const expected = r1.points;
    const got = round1End.view.scores[r1.winnerId] ?? 0;
    if (got !== expected) fail(`winner score ${got} !== ${expected}`);
  } else {
    for (const id of round1End.view.playerIds) {
      if ((round1End.view.scores[id] ?? 0) !== 0) {
        fail(`tied round but ${id} has score ${round1End.view.scores[id]}`);
      }
    }
  }
  pass('round 1 scoring invariant holds');

  // Trigger continue (one of the players emits — mirroring the controller
  // scheduler which only fires from playerIds[0]).
  if (round1End.view.phase === 'roundEnd') {
    const playing2 = waitFor(
      host,
      ServerEvents.GameState,
      (p) => p.view.phase === 'playing' && p.view.rounds.length === 1,
      TURN_TIMEOUT_MS,
    );
    const continuer = round1End.view.playerIds[0] === aliceId ? alice : bob;
    await emit(continuer, ClientEvents.GameAction, { type: 'continue' });
    const r2Start = await playing2;
    if (r2Start.view.board.length !== 0) fail('round 2 should start with empty board');
    if (r2Start.view.handCounts[aliceId] !== 7 || r2Start.view.handCounts[bobId] !== 7) {
      fail('round 2 should re-deal 7 tiles each');
    }
    pass('continue → round 2 dealt cleanly');
  } else {
    pass('match finished in round 1 (unusually short — engine still consistent)');
  }

  // Detach bots first so the room-close broadcast doesn't trigger one last
  // doomed action emit after their socket starts tearing down.
  alice.off(ServerEvents.GameState, aliceBot);
  bob.off(ServerEvents.GameState, bobBot);

  await emit(host, ClientEvents.RoomClose);
  host.disconnect();
  alice.disconnect();
  bob.disconnect();

  console.log('\n🎉 dominos smoke passed\n');
}

main().catch((err) => {
  console.error('\n❌ unhandled:', err);
  process.exitCode = 1;
});
