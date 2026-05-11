// Manual-test helper: spin up two phone bots that join an existing room
// and submit answers on a slow cadence so the host UI can be screenshotted
// at each phase. Pass the room code as argv[2].
//   node tests/smoke/trivia-bots.mjs F4W9

import { io } from '../../../frontend/node_modules/socket.io-client/build/esm/index.js';

const BACKEND = 'http://localhost:3001';
const CODE = process.argv[2];
if (!CODE) {
  console.error('usage: node trivia-bots.mjs <ROOM_CODE>');
  process.exit(1);
}

// Mirrors backend/src/games/trivia/packs/default-en.ts answer key.
const ANSWER_KEY = [0, 1, 2, 0, 0, 1, 2, 0, 1, 0];
const ASKING_PAUSE_MS = 3000; // give the host UI a moment in asking phase
const FINAL_TICK_DELAY_MS = 2000; // push state to finished after last reveal

function emit(socket, event, payload) {
  return new Promise((resolve) => {
    socket.emit(event, payload ?? {}, (res) => resolve(res));
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
  console.log(`bots joining room ${CODE}`);
  const alice = await connect();
  const bob = await connect();
  const ja = await emit(alice, 'room:join', { code: CODE, name: 'Alice' });
  const jb = await emit(bob,   'room:join', { code: CODE, name: 'Bob' });
  if (!ja.ok || !jb.ok) {
    console.error('join failed', ja, jb);
    process.exit(1);
  }
  console.log(`Alice ${ja.playerId} · Bob ${jb.playerId}`);
  console.log('waiting for host to start the game…');

  let answeredThisRound = new Set();
  let lastIndex = -1;
  let done = false;

  function handle(socket, label) {
    socket.on('game:state', async (msg) => {
      const v = msg?.view;
      if (!v) return;
      if (v.phase === 'asking') {
        if (v.currentIndex !== lastIndex) {
          lastIndex = v.currentIndex;
          answeredThisRound = new Set();
          console.log(`[Q${v.currentIndex + 1}] asking`);
        }
        if (answeredThisRound.has(label)) return;
        // wait briefly so the host gets to render asking phase
        await new Promise((r) => setTimeout(r, ASKING_PAUSE_MS));
        if (answeredThisRound.has(label)) return;
        const correct = ANSWER_KEY[v.currentIndex];
        const choice = label === 'A' ? correct : 0;
        answeredThisRound.add(label);
        await emit(socket, 'game:action', { type: 'submit', data: { choice } });
        console.log(`  ${label} → ${choice}`);
      } else if (v.phase === 'reveal') {
        // Engine needs an incoming action to roll reveal → next question.
        // Bot A schedules a single tick after reveal expires; bot B no-ops.
        if (label === 'A') {
          const delay = Math.max(0, v.phaseEndsAt - Date.now()) + 150;
          setTimeout(() => emit(socket, 'game:action', { type: 'tick' }), delay);
        }
      } else if (v.phase === 'finished') {
        if (done) return;
        done = true;
        console.log('finished:', JSON.stringify(v.result));
        setTimeout(() => process.exit(0), 500);
      }
    });
  }

  handle(alice, 'A');
  handle(bob, 'B');

  // After the final reveal, no submit will nudge the engine to 'finished'.
  // Send a tick from alice once enough time has passed past the last reveal.
  setInterval(async () => {
    if (lastIndex < ANSWER_KEY.length - 1) return;
    await new Promise((r) => setTimeout(r, FINAL_TICK_DELAY_MS));
    await emit(alice, 'game:action', { type: 'tick' });
  }, 3000);
}

main().catch((e) => { console.error(e); process.exit(1); });
