// One-shot: claim host on a room and immediately start the game. Used to
// drive puppeteer phone-view tests where the host page isn't loaded.

import { io } from '../../../frontend/node_modules/socket.io-client/build/esm/index.js';

const BACKEND = 'http://localhost:3001';
const CODE = process.argv[2];
if (!CODE) {
  console.error('usage: node trivia-host-bot.mjs <ROOM_CODE>');
  process.exit(1);
}

function emit(socket, event, payload) {
  return new Promise((resolve) => {
    socket.emit(event, payload ?? {}, (res) => resolve(res));
  });
}

const s = io(BACKEND, { transports: ['websocket'], reconnection: false, forceNew: true });
s.on('connect', async () => {
  const claim = await emit(s, 'host:claim', { code: CODE });
  if (!claim?.ok) { console.error('claim failed', claim); process.exit(1); }
  // small pause so any players still mid-join finalize.
  await new Promise((r) => setTimeout(r, 800));
  const start = await emit(s, 'game:start');
  console.log('game:start ack:', start);
  // stay connected so the room phase stays in_game (otherwise the host
  // socket dropping might or might not affect state, depending on the
  // disconnect sweep). Just hang around.
  setInterval(() => {}, 60000);
});
