// Helper for visual smoke tests: takes a room CODE on the CLI, joins as
// two players (named in env or defaults), readies up, then idles holding
// the connections so a separately-rendered host screen can show the
// in-game UI. Stops on Ctrl-C.
//
// Usage: node tests/smoke/hold-room.mjs <CODE>

import { io } from '../../../frontend/node_modules/socket.io-client/build/esm/index.js';

const BACKEND = 'http://localhost:3001';
const code = process.argv[2]?.toUpperCase();
if (!code) {
  console.error('usage: node hold-room.mjs <CODE>');
  process.exit(1);
}

function emit(socket, event, payload) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`ack timeout ${event}`)), 3000);
    socket.emit(event, payload ?? {}, (res) => {
      clearTimeout(t);
      resolve(res);
    });
  });
}

function connect() {
  return new Promise((resolve, reject) => {
    const s = io(BACKEND, { transports: ['websocket'], forceNew: true });
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}

const sockets = [];
async function joinAndReady(name) {
  const s = await connect();
  sockets.push(s);
  const r = await emit(s, 'room:join', { code, name });
  if (!r.ok) throw new Error(`${name} join failed: ${r.error}`);
  console.log(`${name} joined as ${r.playerId}`);
  await emit(s, 'player:update', { isReady: true });
}

const cleanup = () => {
  console.log('\nclosing player sockets…');
  sockets.forEach((s) => s.disconnect());
  setTimeout(() => process.exit(0), 200);
};
process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

await joinAndReady('Alice');
await joinAndReady('Bob');
console.log(`\nholding 2 ready players in room ${code}. Ctrl-C to release.`);
// Idle forever.
setInterval(() => {}, 60_000);
