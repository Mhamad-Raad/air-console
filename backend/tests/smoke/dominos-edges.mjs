// Dominos edge-case scenario runner.
//
// Goes beyond the happy-path 2-player smoke: covers 3- and 4-player
// matches, multiple rounds in a single room, view-leak invariants, and
// negative tests where the engine should reject illegal actions.
//
// Run with `cd backend && node tests/smoke/dominos-edges.mjs` against a
// running backend (`npm run dev`). The basic 2-player smoke
// (dominos.mjs) still acts as the fast CI gate; this is the broader
// "did I cover the cases?" run.

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
  GameActionError: 'game:actionError',
};

// Engine rejections in this codebase come on a dedicated `game:actionError`
// channel — the action ack still says ok:true because the handler ran fine.
// Returns a promise that resolves to true if an error arrives within
// `windowMs`, else false (action was accepted).
function expectActionRejected(socket, sendFn, windowMs = 800) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      socket.off(ServerEvents.GameActionError, onErr);
      resolve(false);
    }, windowMs);
    function onErr() {
      clearTimeout(timer);
      socket.off(ServerEvents.GameActionError, onErr);
      resolve(true);
    }
    socket.on(ServerEvents.GameActionError, onErr);
    sendFn();
  });
}

let failures = 0;
let scenarios = 0;

function log(...args)  { console.log('   ', ...args); }
function pass(msg)     { console.log('  ✅', msg); }
function fail(msg)     { console.error('  ❌', msg); failures++; }
function section(msg)  { scenarios++; console.log(`\n[${scenarios}] ${msg}`); }
function expect(cond, msg) { (cond ? pass : fail)(msg); return cond; }

function emit(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`ack timeout for ${event}`)), 5000);
    socket.emit(event, payload ?? {}, (res) => { clearTimeout(t); resolve(res); });
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

// Greedy bot: opens with highest double; otherwise plays the highest-pip
// matching tile to drain the hand faster than "first legal tile". This
// makes DOMINO endings (someone empties) more likely than naive play.
function pickPlay(view) {
  const opening = view.leftEnd === null && view.rightEnd === null;
  if (opening) {
    const doubles = view.yourHand.filter((t) => t[0] === t[1]);
    const chosen = doubles.length
      ? doubles.reduce((best, t) => (t[0] > best[0] ? t : best))
      : view.yourHand.reduce((best, t) => (t[0] + t[1] > best[0] + best[1] ? t : best));
    return { tile: chosen, side: 'left' };
  }
  const candidates = [];
  for (const t of view.yourHand) {
    if (t[0] === view.leftEnd  || t[1] === view.leftEnd)  candidates.push({ tile: t, side: 'left'  });
    if (t[0] === view.rightEnd || t[1] === view.rightEnd) candidates.push({ tile: t, side: 'right' });
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => (b.tile[0] + b.tile[1]) - (a.tile[0] + a.tile[1]));
  return candidates[0];
}

function attachBot(socket, getMyId) {
  let lastKey = '';
  const handler = async (payload) => {
    const v = payload.view;
    if (!v) return;
    if (v.phase === 'roundEnd' && payload.view.playerIds?.[0] === getMyId()) {
      setTimeout(() => {
        if (socket.connected) socket.emit(ClientEvents.GameAction, { type: 'continue' }, () => {});
      }, 200);
      return;
    }
    if (v.phase !== 'playing') return;
    if (v.turn !== getMyId()) return;
    const key = `${v.board.length}-${v.turn}-${v.boneyardCount ?? 0}-${(v.yourHand ?? []).length}`;
    if (key === lastKey) return;
    lastKey = key;
    try {
      if (v.canPlay) {
        const move = pickPlay(v);
        if (!move) return;
        await emit(socket, ClientEvents.GameAction, {
          type: 'play',
          data: { tile: [move.tile[0], move.tile[1]], side: move.side },
        });
      } else if (v.canDraw) {
        await emit(socket, ClientEvents.GameAction, { type: 'draw' });
      } else {
        await emit(socket, ClientEvents.GameAction, { type: 'pass' });
      }
    } catch (err) {
      if (socket.connected) console.error('    bot action failed', err.message);
    }
  };
  socket.on(ServerEvents.GameState, handler);
  return handler;
}

async function setupRoom(playerNames) {
  const createRes = await fetch(`${BACKEND}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ gameSlug: 'dominos' }),
  });
  if (!createRes.ok) throw new Error(`POST /api/rooms ${createRes.status}`);
  const { code } = await createRes.json();

  const host = await connect();
  const claim = await emit(host, ClientEvents.HostClaim, { code });
  if (!claim.ok) throw new Error(`host:claim ${claim.error}`);

  const players = [];
  for (const name of playerNames) {
    const s = await connect();
    const j = await emit(s, ClientEvents.RoomJoin, { code, name });
    if (!j.ok) throw new Error(`join ${name} ${j.error}`);
    await emit(s, 'player:update', { isReady: true });
    players.push({ socket: s, id: j.playerId, name });
  }

  return { code, host, players };
}

async function teardown({ host, players }, botHandlers = []) {
  for (let i = 0; i < players.length; i++) {
    if (botHandlers[i]) players[i].socket.off(ServerEvents.GameState, botHandlers[i]);
  }
  try { await emit(host, ClientEvents.RoomClose); } catch {}
  host.disconnect();
  for (const p of players) p.disconnect?.() ?? p.socket?.disconnect();
}

/* ------------------------------------------------------------------ */

async function scenarioNPlayer(n) {
  section(`${n}-player round completes`);
  const names = ['Alice', 'Bob', 'Carol', 'Dave'].slice(0, n);
  const room = await setupRoom(names);
  const handlers = room.players.map((p) => attachBot(p.socket, () => p.id));
  const firstsP = room.players.map((p) => waitFor(p.socket, ServerEvents.GameState, () => true));
  const startRes = await emit(room.host, ClientEvents.GameStart);
  if (!startRes.ok) {
    fail(`game:start failed: ${startRes.error}`);
    await teardown(room, handlers);
    return;
  }
  const firsts = await Promise.all(firstsP);
  expect(firsts.every((p) => p.view.yourHand?.length === 7), `${n} players × 7 tiles dealt`);
  expect(firsts.every((p) => p.view.phase === 'playing'), 'all players in playing phase');
  expect(firsts.every((p) => p.view.board.length === 0), 'all players see empty board');
  expect(firsts.every((p) => !('hands' in p.view)), 'no player view leaks engine `hands` map');

  const totalDealt = n * 7;
  expect(totalDealt <= 28, `${n}-player deal fits in double-six (${totalDealt} ≤ 28)`);

  const endState = await waitFor(
    room.host,
    ServerEvents.GameState,
    (p) => p.view.phase === 'roundEnd' || p.view.phase === 'finished',
    ROUND_TIMEOUT_MS,
  );
  const r1 = endState.view.rounds[endState.view.rounds.length - 1];
  expect(!!r1, `${n}-player round ended cleanly`);
  log(`  result: ${r1.blocked ? 'BLOCKED' : 'DOMINO'} winner=${r1.winnerId?.slice(0, 6) ?? 'tie'} +${r1.points}`);
  await teardown(room, handlers);
}

async function scenarioMultiRound() {
  section('multi-round: 4 consecutive rounds in one room');
  const room = await setupRoom(['Alice', 'Bob']);
  const handlers = room.players.map((p) => attachBot(p.socket, () => p.id));
  const firstP = waitFor(room.host, ServerEvents.GameState, () => true);
  const startRes = await emit(room.host, ClientEvents.GameStart);
  if (!startRes.ok) {
    fail(`game:start failed: ${startRes.error}`);
    await teardown(room, handlers);
    return;
  }
  await firstP;

  let lastSeen = 0;
  const TARGET_ROUNDS = 4;
  while (lastSeen < TARGET_ROUNDS) {
    const ev = await waitFor(
      room.host,
      ServerEvents.GameState,
      (p) =>
        (p.view.phase === 'roundEnd' && p.view.rounds.length > lastSeen) ||
        p.view.phase === 'finished',
      ROUND_TIMEOUT_MS,
    );
    lastSeen = ev.view.rounds.length;
    const r = ev.view.rounds[lastSeen - 1];
    log(`  round ${lastSeen}: ${r.blocked ? 'BLOCKED' : 'DOMINO'} winner=${r.winnerId?.slice(0, 6) ?? 'tie'} +${r.points}`);
    if (ev.view.phase === 'finished') {
      log(`  match finished after ${lastSeen} rounds (winner=${ev.view.winnerId?.slice(0, 6)})`);
      break;
    }
  }
  expect(lastSeen >= 2, `played at least 2 rounds in one room (saw ${lastSeen})`);
  await teardown(room, handlers);
}

async function scenarioInvalidActions() {
  section('engine rejects illegal actions');
  const room = await setupRoom(['Alice', 'Bob']);
  const firstA = waitFor(room.players[0].socket, ServerEvents.GameState, () => true);
  const firstB = waitFor(room.players[1].socket, ServerEvents.GameState, () => true);
  const startRes = await emit(room.host, ClientEvents.GameStart);
  if (!startRes.ok) {
    fail(`game:start failed: ${startRes.error}`);
    await teardown(room);
    return;
  }
  const [stateA, stateB] = await Promise.all([firstA, firstB]);

  const opener = stateA.view.starterId;
  const notOpener = opener === room.players[0].id ? room.players[1] : room.players[0];
  const openerSock = opener === room.players[0].id ? room.players[0] : room.players[1];
  const openerView = opener === room.players[0].id ? stateA : stateB;
  const notOpenerView = opener === room.players[0].id ? stateB : stateA;

  // 1. Wrong turn — non-opener tries to play first.
  const nonOpenerTile = notOpenerView.view.yourHand[0];
  const r1 = await expectActionRejected(notOpener.socket, () => {
    notOpener.socket.emit(ClientEvents.GameAction, {
      type: 'play',
      data: { tile: [nonOpenerTile[0], nonOpenerTile[1]], side: 'left' },
    });
  });
  expect(r1, 'play on wrong turn → rejected');

  // 2. Tile not in hand — opener tries to play a tile they don't own.
  const openerHand = openerView.view.yourHand;
  const notHeld = findNotHeld(openerHand);
  const r2 = await expectActionRejected(openerSock.socket, () => {
    openerSock.socket.emit(ClientEvents.GameAction, {
      type: 'play',
      data: { tile: [notHeld[0], notHeld[1]], side: 'left' },
    });
  });
  expect(r2, 'play tile not in hand → rejected');

  // 3. Pass when you have a legal play — opening turn always has a legal
  //    play (any tile is legal at the opening), so pass should be rejected.
  const r3 = await expectActionRejected(openerSock.socket, () => {
    openerSock.socket.emit(ClientEvents.GameAction, { type: 'pass' });
  });
  expect(r3, 'pass when canPlay → rejected');

  // 4. Drive a legal opening play. The engine now enforces "opener must
  //    play their highest double", so we have to find it — the opener was
  //    picked precisely because they hold the highest double available.
  const openTile = openerHand
    .filter((t) => t[0] === t[1])
    .reduce((best, t) => (best === null || t[0] > best[0] ? t : best), null) ?? openerHand[0];
  const r4 = await emit(openerSock.socket, ClientEvents.GameAction, {
    type: 'play',
    data: { tile: [openTile[0], openTile[1]], side: 'left' },
  });
  expect(!!r4.ok, 'opening play accepted');

  // After opening, ends are set. Find a tile in the opener's remaining hand
  // that matches NEITHER end, if any exists. (Skip the case if no such tile.)
  await new Promise((r) => setTimeout(r, 100));
  const afterOpenP = waitFor(openerSock.socket, ServerEvents.GameState, () => true, 1500).catch(() => null);
  const afterOpen = await afterOpenP;
  const leftEnd  = afterOpen?.view.leftEnd  ?? openTile[0];
  const rightEnd = afterOpen?.view.rightEnd ?? openTile[1];

  // It's the OTHER player's turn now. Try a non-matching play from them.
  const otherHand = afterOpen
    ? (afterOpen.view.turn === notOpener.id ? notOpener : openerSock)
    : null;
  const otherView = afterOpen?.view;
  if (otherView && otherView.turn) {
    const turnPlayerSock = otherView.turn === room.players[0].id ? room.players[0] : room.players[1];
    const turnPlayerStateP = waitFor(turnPlayerSock.socket, ServerEvents.GameState, () => true, 500).catch(() => null);
    const turnPlayerState = await turnPlayerStateP ?? (turnPlayerSock.id === stateA.playerId ? stateA : stateB);
    const turnHand = turnPlayerState?.view?.yourHand ?? [];
    const nonMatch = turnHand.find((t) => t[0] !== leftEnd && t[1] !== leftEnd && t[0] !== rightEnd && t[1] !== rightEnd);
    if (nonMatch) {
      const r5 = await expectActionRejected(turnPlayerSock.socket, () => {
        turnPlayerSock.socket.emit(ClientEvents.GameAction, {
          type: 'play',
          data: { tile: [nonMatch[0], nonMatch[1]], side: 'left' },
        });
      });
      expect(r5, 'play tile that matches no end → rejected');
    } else {
      log('  (no non-matching tile in turn player hand — skipped that sub-case)');
    }
  }

  await teardown(room);
}

function findNotHeld(hand) {
  for (let a = 0; a <= 6; a++) {
    for (let b = a; b <= 6; b++) {
      if (!hand.some((t) => t[0] === a && t[1] === b)) return [a, b];
    }
  }
  return [0, 0];
}

async function main() {
  console.log('\n=== Dominos edge-case scenarios ===');

  await scenarioNPlayer(2);
  await scenarioNPlayer(3);
  await scenarioNPlayer(4);
  await scenarioMultiRound();
  await scenarioInvalidActions();

  console.log(`\n${failures === 0 ? '🎉' : '❌'} ${scenarios} scenarios, ${failures} failure${failures === 1 ? '' : 's'}\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\n❌ unhandled:', err);
  process.exitCode = 1;
});
