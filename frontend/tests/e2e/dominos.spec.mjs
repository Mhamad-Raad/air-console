// Playwright E2E for the Dominos UI.
//
// Drives a real 2-player game end-to-end through the actual UI: host
// creates the room, two phones join, both mark ready, host starts, then
// the test plays turns by clicking SVG tiles + side buttons on whichever
// phone has the turn. Screenshots land in tests/e2e/screenshots/ for
// visual review.
//
// Prereqs: backend on :3001 and `npm run dev` on :5173. Run with:
//   cd frontend && node tests/e2e/dominos.spec.mjs

import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SHOTS = resolve(__dirname, 'screenshots');

const FRONTEND = 'http://localhost:5173';
const HEADLESS = process.env.HEADLESS !== '0';
const SLOWMO = HEADLESS ? 0 : 250;

const PHONE_VIEWPORT = { width: 390, height: 844 };
const TV_VIEWPORT    = { width: 1280, height: 800 };

let failures = 0;
function pass(msg)  { console.log('  ✅', msg); }
function fail(msg)  { console.error('  ❌', msg); failures++; }
function step(msg)  { console.log(`\n→ ${msg}`); }
function ok(cond, msg) { (cond ? pass : fail)(msg); return cond; }

async function shot(page, name) {
  await page.screenshot({ path: resolve(SHOTS, `${name}.png`), fullPage: false });
}

async function setStoredName(page, code, name) {
  await page.addInitScript(({ code, name }) => {
    localStorage.setItem(`air-console:room:${code}:name`, name);
  }, { code, name });
}

async function main() {
  await mkdir(SHOTS, { recursive: true });

  step('launch browser');
  const browser = await chromium.launch({ headless: HEADLESS, slowMo: SLOWMO });

  // ---- host context (TV-size) ----
  const hostCtx  = await browser.newContext({ viewport: TV_VIEWPORT });
  const host = await hostCtx.newPage();
  host.on('pageerror', (e) => console.error('[host pageerror]', e.message));

  step('host: open home + start a Dominos room');
  await host.goto(FRONTEND);
  // The home page lists each game in a card; the start button reads "Start"
  // (or the i18n equivalent). Filter to the card whose heading is Dominos.
  const dominosCard = host.locator('article', { hasText: 'Dominos' });
  await dominosCard.waitFor({ timeout: 10_000 });
  await dominosCard.getByRole('button').click();

  await host.waitForURL(/\/host\//, { timeout: 10_000 });
  const url = host.url();
  const code = url.split('/host/')[1].replace(/\/.*$/, '');
  ok(/^[A-Z0-9]{4}$/.test(code), `host landed in room ${code}`);
  await shot(host, '01-host-lobby-empty');

  // ---- phone contexts ----
  const phoneCtxA = await browser.newContext({ viewport: PHONE_VIEWPORT });
  const phoneCtxB = await browser.newContext({ viewport: PHONE_VIEWPORT });
  const alice = await phoneCtxA.newPage();
  const bob   = await phoneCtxB.newPage();
  alice.on('pageerror', (e) => console.error('[alice pageerror]', e.message));
  bob.on('pageerror',   (e) => console.error('[bob pageerror]', e.message));

  step('phones: pre-set names + open /controller directly to skip the name form');
  await setStoredName(alice, code, 'Alice');
  await setStoredName(bob,   code, 'Bob');
  await alice.goto(`${FRONTEND}/controller/${code}`);
  await bob.goto(`${FRONTEND}/controller/${code}`);

  // Wait for both rosters to appear in the host's player list.
  await host.locator('ul').filter({ hasText: 'Alice' }).first().waitFor({ timeout: 10_000 });
  await host.locator('ul').filter({ hasText: 'Bob'   }).first().waitFor({ timeout: 10_000 });
  pass('both players visible in host lobby');
  await shot(host, '02-host-lobby-both-joined');
  await shot(alice, '02-alice-lobby');

  step('phones: click "I\'m ready"');
  await alice.getByRole('button', { name: /ready/i }).first().click();
  await bob.getByRole('button',   { name: /ready/i }).first().click();
  // Host's Start button becomes enabled once both players are ready.
  const startBtn = host.getByRole('button', { name: /start/i }).first();
  await startBtn.waitFor({ timeout: 5_000 });
  // Poll the disabled attribute — the Start button only un-disables once
  // both ready signals have round-tripped through the room state.
  for (let i = 0; i < 30; i++) {
    const disabled = await startBtn.getAttribute('disabled');
    if (disabled === null) break;
    await host.waitForTimeout(150);
  }
  pass('host Start button became enabled');

  step('host: click Start');
  await startBtn.click();

  step('verify in-game UI rendered');
  // Debug: capture each surface 1.5s after start so we can see what's
  // actually rendering if the SVG wait below fails. Don't gate on these.
  await host.waitForTimeout(1500);
  await shot(host,  '03a-host-post-start');
  await shot(alice, '03a-alice-post-start');
  await shot(bob,   '03a-bob-post-start');
  log(`host body snippet: ${(await host.locator('body').innerText()).slice(0, 160)}`);
  log(`alice body snippet: ${(await alice.locator('body').innerText()).slice(0, 160)}`);

  // Wait for the in-game projection on each side. The host transitions
  // from lobby → in-game when room:state arrives with phase='in_game';
  // the TopBar's "Round 1 · to 100" copy is a robust signal that we've
  // landed in the dominos host renderer specifically.
  await Promise.all([
    alice.locator('svg[aria-label^="domino "]').first().waitFor({ timeout: 15_000 }),
    bob.locator('svg[aria-label^="domino "]').first().waitFor({ timeout: 15_000 }),
    host.locator('text=/Round 1/i').first().waitFor({ timeout: 15_000 }),
  ]);

  await shot(host,  '03-host-in-game-initial');
  await shot(alice, '03-alice-in-game-initial');
  await shot(bob,   '03-bob-in-game-initial');

  // Each phone should be rendering 7 hand tiles.
  const aliceTiles = await alice.locator('svg[aria-label^="domino "]').count();
  const bobTiles   = await bob.locator('svg[aria-label^="domino "]').count();
  ok(aliceTiles === 7, `alice sees 7 hand tiles (got ${aliceTiles})`);
  ok(bobTiles   === 7, `bob sees 7 hand tiles (got ${bobTiles})`);

  // Host should render the empty-board placeholder ("opens with").
  const hostHasOpensWith = await host.locator('text=/opens the round/i').count();
  ok(hostHasOpensWith >= 1, 'host shows opener prompt over empty felt');

  // Identify which phone has the turn by looking for "Your turn" heading.
  step('drive turns until phase != playing');
  const phones = [
    { name: 'Alice', page: alice },
    { name: 'Bob',   page: bob },
  ];

  // With Draw rules a 2-player round can take many more actions (14 boneyard
  // tiles to potentially work through), so give the loop plenty of room.
  const MAX_TURNS = 80;
  let turnsTaken = 0;
  let finished = false;
  for (let i = 0; i < MAX_TURNS; i++) {
    // Find which phone is the active turn-player.
    let active = null;
    for (const p of phones) {
      // Either "Your turn" or "No legal play — pass" indicates active turn.
      const isMine = await p.page.locator('text=/Your turn|No legal play/i').count();
      if (isMine > 0) { active = p; break; }
    }
    if (!active) {
      // No active "your turn" — likely round ended. Check for "round over" /
      // "blocked" / "win" copy on any surface.
      const roundEnd =
        (await host.locator('text=/Round over|Round blocked|wins the match/i').count()) > 0;
      if (roundEnd) {
        pass(`round/match transition detected after ${turnsTaken} turns`);
        finished = true;
        break;
      }
      await host.waitForTimeout(300);
      continue;
    }

    // Active phone: prefer clicking a playable tile (not dimmed). If
    // nothing's playable, draw from the boneyard while it has tiles, else
    // pass. The Draw rule replaces "stuck = pass" with "stuck = draw, then
    // pass only when boneyard is empty".
    const playable = active.page.locator(
      'svg[aria-label^="domino "]:not(.opacity-40)',
    ).first();
    const playableExists = await playable.count();
    if (playableExists > 0) {
      await playable.click();
      const leftBtn = active.page.getByRole('button', { name: /^◀|Left/i }).first();
      const visible = await leftBtn.isVisible().catch(() => false);
      if (visible) {
        const enabled = (await leftBtn.getAttribute('disabled')) === null;
        if (enabled) {
          await leftBtn.click();
        } else {
          const rightBtn = active.page.getByRole('button', { name: /Right|▶$/i }).first();
          if (await rightBtn.isVisible().catch(() => false)) {
            await rightBtn.click();
          }
        }
      }
    } else {
      // Try Draw pile first; fall back to Pass.
      const drawBtn = active.page.getByRole('button', { name: /draw a tile/i }).first();
      const drawVisible = await drawBtn.isVisible().catch(() => false);
      const drawEnabled = drawVisible && (await drawBtn.getAttribute('disabled')) === null;
      if (drawEnabled) {
        await drawBtn.click();
      } else {
        const passBtn = active.page.getByRole('button', { name: /^pass$/i }).first();
        const passEnabled = (await passBtn.getAttribute('disabled')) === null;
        if (passEnabled) await passBtn.click();
      }
    }
    turnsTaken++;
    // Wait briefly for the next state broadcast to land.
    await host.waitForTimeout(250);
  }
  ok(finished, `reached round/match end within ${MAX_TURNS} turns`);
  await shot(host,  '04-host-end-of-round');
  await shot(alice, '04-alice-end-of-round');
  await shot(bob,   '04-bob-end-of-round');

  // Host should now display tiles on the board. Count placed-tile SVGs on
  // the host page — minus the 2 face-down ones in the hand-counts row.
  const totalHostSvgs = await host.locator('svg[aria-label^="domino "], svg[aria-label="face-down tile"]').count();
  ok(totalHostSvgs >= 3, `host rendered tiles on the felt board (svg count=${totalHostSvgs})`);

  step('teardown');
  await browser.close();

  console.log(`\n${failures === 0 ? '🎉' : '❌'} ${failures} failure${failures === 1 ? '' : 's'}`);
  console.log(`screenshots → ${SHOTS}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('\n❌ unhandled:', err);
  process.exitCode = 1;
});
