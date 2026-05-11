// Trivia engine smoke test — Phase 3.
// Plays a full 10-question round with two players (Alice always correct,
// Bob always picks choice 0) and asserts: per-question reveal broadcast,
// scoring deltas, end-of-game ranked result with Alice as winner.
//
// Run with `cd backend && node tests/smoke/trivia.mjs` against a running
// backend (`npm run dev` in another shell).

import { io } from '../../../frontend/node_modules/socket.io-client/build/esm/index.js';

const BACKEND = 'http://localhost:3001';

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

// Mirrors the default-en pack, in pack order. Keep in sync with
// backend/src/games/trivia/packs/default-en.ts if questions change.
const ANSWER_KEY = [0, 1, 2, 0, 0, 1, 2, 0, 1, 0];
const REVEAL_DURATION_MS = 1_500;

function log(...args) { console.log('  ', ...args); }
function fail(msg) { console.error('\n❌ FAIL:', msg); process.exit(1); }
function pass(msg) { console.log('✅', msg); }
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

function emit(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`ack timeout for ${event}`)), 5000);
    socket.emit(event, payload ?? {}, (res) => {
      clearTimeout(t);
      resolve(res);
    });
  });
}

function waitFor(socket, event, predicate, timeoutMs = 5000) {
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
  console.log('\n--- Phase 3 trivia smoke ---\n');

  // 1. Create a Trivia room.
  log('creating trivia room…');
  const createRes = await fetch(`${BACKEND}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ gameSlug: 'trivia' }),
  });
  if (!createRes.ok) fail(`POST /api/rooms ${createRes.status}`);
  const { code } = await createRes.json();
  log('room', code);

  // 2. Host + two players.
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

  // 3. Trivia has requireReady=false; host can start immediately.
  const aliceFirst = waitFor(alice, ServerEvents.GameState, () => true);
  const hostFirst  = waitFor(host,  ServerEvents.GameState, () => true);
  const start = await emit(host, ClientEvents.GameStart);
  if (!start.ok) fail(`game:start ${start.error}`);
  const aliceInitial = await aliceFirst;
  const hostInitial  = await hostFirst;
  if (aliceInitial.slug !== 'trivia') fail(`alice slug ${aliceInitial.slug}`);
  if (aliceInitial.view.phase !== 'asking') fail(`expected asking phase, got ${aliceInitial.view.phase}`);
  if (aliceInitial.view.totalQuestions !== ANSWER_KEY.length) {
    fail(`expected ${ANSWER_KEY.length} questions, got ${aliceInitial.view.totalQuestions}`);
  }
  // Player view in asking phase should NOT leak correctIndex.
  if (aliceInitial.view.question?.correctIndex !== undefined) {
    fail('player view should hide correctIndex during asking');
  }
  // Host view in asking phase should also hide correctIndex.
  if (hostInitial.view.question?.correctIndex !== undefined) {
    fail('host view should hide correctIndex during asking');
  }
  pass('game:start delivered asking-phase views without leaking answers');

  // 4. Play through all questions. Alice = correct, Bob = always 0.
  let bobCorrectCount = 0;
  for (let i = 0; i < ANSWER_KEY.length; i++) {
    if (i > 0) {
      // wait out reveal from previous question
      await sleep(REVEAL_DURATION_MS + 150);
    }

    // Wait for asking phase on this question. For i=0 we already have it
    // from the initial game:start broadcast. For i>0 we expect to see
    // a fresh asking view after our submits trigger reveal→next.
    if (i > 0) {
      await waitFor(
        alice,
        ServerEvents.GameState,
        (s) => s.view.phase === 'asking' && s.view.currentIndex === i,
        5000,
      );
    }

    // Both submit. Alice picks correct, Bob picks 0.
    const correctIdx = ANSWER_KEY[i];
    if (correctIdx === 0) bobCorrectCount++;

    const revealForAlice = waitFor(
      alice,
      ServerEvents.GameState,
      (s) => s.view.phase === 'reveal' && s.view.currentIndex === i,
      5000,
    );

    await emit(alice, ClientEvents.GameAction, { type: 'submit', data: { choice: correctIdx } });
    await emit(bob,   ClientEvents.GameAction, { type: 'submit', data: { choice: 0 } });

    const reveal = await revealForAlice;
    // Reveal view should expose correctIndex + alice's submission result.
    if (reveal.view.question?.correctIndex !== correctIdx) {
      fail(`Q${i} reveal correctIndex ${reveal.view.question?.correctIndex} ≠ ${correctIdx}`);
    }
    if (!reveal.view.yourSubmission?.correct) {
      fail(`Q${i} alice's submission should be marked correct`);
    }
    if (reveal.view.yourSubmission.points < 500 || reveal.view.yourSubmission.points > 1000) {
      fail(`Q${i} alice points out of range: ${reveal.view.yourSubmission.points}`);
    }
  }
  pass(`played ${ANSWER_KEY.length} questions; bob lucky-correct on ${bobCorrectCount}`);

  // 5. Wait out the final reveal, then send a tick to push state to finished.
  await sleep(REVEAL_DURATION_MS + 150);
  const finishedSeen = waitFor(
    alice,
    ServerEvents.GameState,
    (s) => s.view.phase === 'finished',
    5000,
  );
  await emit(alice, ClientEvents.GameAction, { type: 'tick' });
  const finished = await finishedSeen;
  if (!Array.isArray(finished.view.result)) fail('finished view missing ranked result');
  const ranked = finished.view.result;
  if (ranked.length !== 2) fail(`expected 2 ranked entries, got ${ranked.length}`);
  if (ranked[0].playerId !== aliceId) {
    fail(`expected Alice as winner, got ${ranked[0].playerId}`);
  }
  if (ranked[0].score <= ranked[1].score) {
    fail(`expected Alice's score > Bob's, got ${ranked[0].score} vs ${ranked[1].score}`);
  }
  pass(`finished: Alice ${ranked[0].score} > Bob ${ranked[1].score}`);

  // 6. Host view at finished should also expose ranked result.
  const hostFinished = waitFor(host, ServerEvents.GameState, (s) => s.view.phase === 'finished', 5000);
  await emit(alice, ClientEvents.GameAction, { type: 'tick' });
  const hostFinal = await hostFinished;
  if (!Array.isArray(hostFinal.view.result)) fail('host finished view missing result');
  pass('host received finished view with ranked result');

  // 7. Cleanup.
  await emit(host, ClientEvents.RoomClose);
  host.disconnect();
  alice.disconnect();
  bob.disconnect();

  console.log('\n🎉 trivia smoke passed\n');
}

main().catch((err) => {
  console.error('\n❌ unhandled:', err);
  process.exitCode = 1;
});
