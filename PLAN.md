# air-console — plan

## Vision

A local-multiplayer platform where one host screen (laptop / TV) runs a game and phones become the controllers, joined by scanning a QR code. Designed for casual gatherings: pick a game, scan, play. Web first, Flutter mobile later, both backed by the same Node.js + Socket.IO core so the protocol is reused.

## Goals

- **Reliable lobbies.** Joining, naming, teaming, and reconnecting always work, even on flaky phone Wi-Fi.
- **Pluggable games.** New games drop into `backend/src/games/<slug>` and a frontend renderer module without touching the room/transport layer.
- **Server-authoritative.** Game state never trusts the client — phones send intent, the server decides outcomes.
- **Scalable from day one.** Redis for ephemeral room state (so we can horizontal-scale Socket.IO via the Redis adapter), Postgres for persistent records.

## Current state (as of 2026-05-08)

Working end-to-end:

- Game catalog REST endpoint (`GET /api/games`)
- Room creation (`POST /api/rooms`) with short alphabetic codes
- Host screen claims room over WebSocket, displays QR
- Phones join via QR → name → controller, names appear live on host
- Disconnect cleanup (player drops off when phone closes browser)
- Host can kick a player; kicked phone is sent home with a notice
- Name + playerId persisted in `localStorage` so iPhone Safari closes don't wipe identity
- Smoke test script proving multi-client broadcast (`frontend/scripts/smoke-test.mjs`)

Not yet wired:

- Team picker, "ready" state, "start game" button
- Reconnection after a brief network drop (currently treated as a fresh join)
- Any actual gameplay — `dominos.engine.ts` is a skeleton
- Frontend renderer module per game
- Production deployment, env separation, monitoring

## Architectural principles

1. **Two transports, one service layer.** REST for cold-state operations (catalog, room creation). WebSocket for everything live. Both call into the same `RoomService` / `GameService`.
2. **Module-shaped, not layer-shaped.** `backend/src/modules/<feature>` owns its routes + service + repository + schema. Cross-cutting infra (`prisma`, `redis`, `logger`) lives in `lib/`.
3. **Game engines are pluggable.** Every game implements `GameEngine<TState, TAction>`. The realtime layer is generic — it routes `game:action` events to the engine bound to that room.
4. **Room state in Redis, results in Postgres.** Live rooms are ephemeral with a TTL. When a match ends, we persist a `Match` record to Postgres for history.
5. **Frontend mirrors backend types manually for now.** Once we have 2–3 games we'll extract a `shared/` package; premature monorepo tooling slows us down today.

## Phases

### Phase 1 — Lobby completion

**Goal:** the original user story ("scan, join, edit name, set teams, click play") works without any actual game logic running.

**Scope:**
- Edit-name flow on controller — emit `player:update`, persist to Redis, broadcast `room:state`.
- Team assignment on host — drag/click players into team A / B (configurable per game).
- "Ready" toggle on each controller.
- "Start game" button on host, gated until min-players + all-ready.
- Visual lobby state on both host and controller.

**Exit criteria:** four phones can join, edit names, split into two teams, all hit ready, host clicks Start, all five screens transition to a placeholder "in game" view.

**Estimated commits:** 15–25.

### Phase 2 — Game protocol + reconnection

**Goal:** the seams between lobby, in-game, and end-of-game are formal, and a phone losing signal for 30 seconds doesn't lose the player.

**Scope:**
- `game:start` → server transitions room to `in_game`, calls `engine.init(playerIds)`, stores state in Redis.
- `game:action` handler routes to active engine, validates, updates state, broadcasts player-specific views via `engine.view(state, playerId)`.
- `game:end` → persist `Match` row to Postgres with result, transition room to `ended`.
- **Reconnection:** when a socket reconnects with a stored `playerId` belonging to an active room, restore them in-place rather than treating it as a new join. Update `socketId` server-side.
- Heartbeat / grace period: drop a player only after N seconds of disconnection, not immediately.

**Exit criteria:** kill Wi-Fi on a phone for 20 seconds during gameplay → phone re-joins automatically when Wi-Fi returns, sees current state, can keep playing.

**Estimated commits:** 20–30.

### Phase 3 — First playable game (simple)

**Goal:** prove the full pipeline on a game whose rules fit on a postcard, before committing to Dominos.

**Candidates:**
- **Tap race** — host shows "go in 3… 2… 1…", first phone to tap wins the round, best of 5.
- **Pick the imposter** — players answer a prompt; one player gets a different prompt; group votes who's the imposter.
- **Trivia** — rotating multiple-choice questions, score per round.

**Recommendation:** start with **Tap race** — minimal rules, exercises every part of the engine without rules complexity. We can add a second simple game right after.

**Scope:**
- Game engine module under `backend/src/games/<slug>`.
- Frontend host renderer + controller renderer per game, registered in a small `gameRegistry`.
- Round / scoring abstraction reusable across games.

**Exit criteria:** 4 phones + 1 host play a full round of Tap Race, see scores update live, see a winner screen at the end.

**Estimated commits:** 25–40.

### Phase 4 — Dominos

**Goal:** the original game from your idea, fully playable.

**Scope:**
- Tile representation, deck shuffle, deal logic.
- Turn order, legal-move validation, drawing tiles, blocked detection.
- Scoring (Mexican / Block style — to be chosen).
- Hand UI on each controller (only your tiles visible).
- Board UI on host (snake-style layout, animations for played tiles).

**Exit criteria:** four phones play a full game of dominos to completion with correct rules and scoring. Host shows the board, phones show only their hand.

**Estimated commits:** 40–60.

### Phase 5 — Polish, observability, deploy

**Goal:** something we'd be willing to put on a production URL and let strangers play.

**Scope:**
- Real environment separation (dev / staging / prod) with secrets managed.
- Backend on Fly.io / Railway / Render; Postgres on Neon / Supabase; Redis on Upstash.
- Frontend on Vercel / Cloudflare Pages.
- Domain + HTTPS (so phones don't have to trust LAN IPs anymore — they just open a URL).
- Error monitoring (Sentry on both ends).
- Basic structured logging + Grafana / Better Stack dashboard.
- Mobile UX pass: tap targets, viewport, dark mode polish, "add to home screen" PWA hooks.

**Exit criteria:** can hand a friend a URL on the other side of the country, they open it, get a game, play it without us touching anything.

## Out of scope (deliberate)

- **Authentication.** Anonymous device-id identity is fine until we want stats / friends / leaderboards. Defer until Phase 6.
- **Friends, lobbies, matchmaking.** This is a "be in the same room" product. Online cross-LAN play is a separate phase if we ever want it.
- **Mobile app (Flutter).** The web controller is the controller for now. Once web flow is solid we wrap it in Flutter — likely Phase 6.
- **Monetization.** Not in v1.

## Open questions

1. **Scoring persistence.** Does a player carry stats across rooms, or are matches throw-away? (Affects whether anonymous IDs are durable enough or we need real accounts in Phase 6.)
2. **Game catalog source.** Static array in code (current) is fine until ~5 games. After that, move to Postgres + admin tool.
3. **Public LAN access vs. always-online.** Does v1 require internet, or do we want a "local-only" mode where the host runs everything offline and the phones connect over LAN? Affects deploy target.
4. **Spectator mode.** Allow phones to join without taking a player slot? Probably not in v1.

## How we work

- Many small commits, conventional messages (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
- Each phase ends with a tagged commit so we can roll back cleanly.
- `PLAN.md` updates land alongside the work that invalidates them — never let it drift.
- New tech (libraries, infra, patterns) gets a one-line justification in the commit message that introduces it.
