# air-console — plan

## Vision

A local-multiplayer party platform inspired by [AirConsole](https://www.airconsole.com/), built for the **Iraq region**. One screen (laptop / TV / projector) runs the game, phones become controllers by scanning a QR code. Designed for casual gatherings — diwaniyas, family nights, cafe meetups — where friends and family already play card games and dominos together.

We are **not** trying to clone AirConsole's full library. We're replicating the *interaction model* — phones as controllers, instant-join via QR, no app install — and pairing it with a curated catalog of games that actually resonate locally (Dominos, Tarneeb, Hand, Konkan) alongside universally fun party games (drawing/guessing, trivia, imposter).

## Positioning

| AirConsole | air-console (us) |
|---|---|
| Hundreds of games, ad-supported + premium | ~10 well-built games, free at launch |
| English-first, then translations | **Arabic-first + English**, RTL by default |
| Western party-game catalog (Cards Against Humanity, etc.) | Iraq/Levant catalog (Tarneeb, Hand, Konkan) + family-safe party games |
| Global cloud audience | Friends/family in the same room — local Wi-Fi or cloud |
| Console controller metaphor | Same metaphor — same UX win — adapted with cultural fit |

## Goals

- **Reliable lobbies.** Joining, naming, teaming, and reconnecting always work, even on flaky phone Wi-Fi.
- **Pluggable games.** New games drop into `backend/src/games/<slug>` and a frontend renderer module without touching the room/transport layer.
- **Server-authoritative.** Game state never trusts the client — phones send intent, the server decides outcomes.
- **Bilingual + RTL from day one.** Arabic is a first-class citizen, not a post-launch translation pass.
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
- **Arabic UI / RTL layout**
- Production deployment, env separation, monitoring

## Architectural principles

1. **Two transports, one service layer.** REST for cold-state operations (catalog, room creation). WebSocket for everything live. Both call into the same `RoomService` / `GameService`.
2. **Module-shaped, not layer-shaped.** `backend/src/modules/<feature>` owns its routes + service + repository + schema. Cross-cutting infra (`prisma`, `redis`, `logger`) lives in `lib/`.
3. **Game engines are pluggable.** Every game implements `GameEngine<TState, TAction>`. The realtime layer is generic — it routes `game:action` events to the engine bound to that room.
4. **Room state in Redis, results in Postgres.** Live rooms are ephemeral with a TTL. When a match ends, we persist a `Match` record to Postgres for history.
5. **i18n-shaped from the start.** All user-facing strings go through a translation layer. Arabic + English, RTL-aware Tailwind classes, locale stored per-player.
6. **Frontend mirrors backend types manually for now.** Once we have 2–3 games we'll extract a `shared/` package; premature monorepo tooling slows us down today.

## Target catalog (v1 — first 6 months)

Mix of local-fit and universal. Not all at once — see phases.

**Card games (local-fit):**
- 🎴 **Tarneeb** (طرنيب) — 4 players, teams of 2, trick-taking with trump. The flagship.
- 🎴 **Hand** (هاند) — 4 players, also trick-taking, popular across Iraq/Levant.
- 🎴 **Konkan** (كونكان) — 2–4 players, rummy-style.

**Tile / classic:**
- 🁫 **Dominos** — 2–4, the cafe staple. Already in the codebase.

**Party / social (universal but localized content):**
- ✏️ **Draw & Guess** — like fARTwork; drawing prompts in Arabic + English.
- 🎯 **Trivia / Iraqi pop quiz** — bilingual question packs, local categories (Iraqi football, music, food, geography).
- 🕵️ **Imposter** — one player gets a different prompt; group votes who's the odd one out.
- 🤥 **Two truths and a lie** — classic icebreaker.

**Quick / minigames:**
- ⚡ **Tap race** — simple reaction game, useful as the "first playable" engine sanity check.

## Phases

### Phase 1 — Lobby completion + bilingual shell

**Goal:** the original user story ("scan, join, edit name, set teams, click play") works without any actual game logic, AND the UI is Arabic-ready.

**Scope:**
- Edit-name flow on controller — emit `player:update`, persist to Redis, broadcast `room:state`.
- Team assignment on host (configurable per game; some games have no teams).
- "Ready" toggle on each controller.
- "Start game" button on host, gated until min-players + all-ready.
- **i18n setup:** `react-i18next` (or equivalent), `ar` + `en` namespaces, all current strings extracted, language switcher in header, RTL applied via `dir` attr + Tailwind `rtl:` modifiers.
- Locale preference stored in `localStorage` and on the room player record.

**Exit criteria:** four phones can join, edit names, split into two teams, all hit ready, host clicks Start, all five screens transition to a placeholder "in game" view — and the entire UI works in Arabic with correct RTL layout.

**Estimated commits:** ~12.

### Phase 2 — Game protocol + reconnection

**Goal:** the seams between lobby, in-game, and end-of-game are formal, and a phone losing signal for 30 seconds doesn't lose the player.

**Scope:**
- `game:start` → server transitions room to `in_game`, calls `engine.init(playerIds)`, stores state in Redis.
- `game:action` handler routes to active engine, validates, updates state, broadcasts player-specific views via `engine.view(state, playerId)`.
- `game:end` → persist `Match` row to Postgres with result, transition room to `ended`.
- **Reconnection:** when a socket reconnects with a stored `playerId` belonging to an active room, restore them in-place rather than treating it as a new join. Update `socketId` server-side.
- Heartbeat / grace period: drop a player only after N seconds of disconnection, not immediately.

**Exit criteria:** kill Wi-Fi on a phone for 20 seconds during gameplay → phone re-joins automatically when Wi-Fi returns, sees current state, can keep playing.

**Estimated commits:** ~10.

### Phase 3 — First playable game (Trivia)

**Goal:** prove the full pipeline on a game whose rules fit on a postcard, AND that already has cultural fit (so showcase demos resonate from the first time you turn it on).

**Pick:** **Iraqi Pop Quiz / Trivia** — bilingual, local question packs (Iraqi football, music, food, history, geography). Faster to demo than Tarneeb; rules are obvious; a good first showcase.

**Scope:**
- Game engine module under `backend/src/games/trivia`.
- Question pack format (JSON), seeded with ~50 Arabic + 50 English questions across 5 categories.
- Frontend host renderer (question + answers + leaderboard) and controller renderer (4-button picker), registered in a `gameRegistry`.
- Round / scoring abstraction reusable across games.
- Tap race as the *second* game (Phase 3.5) — minimal, validates that the engine truly is pluggable.

**Exit criteria:** 4 phones + 1 host play a 10-question round of Trivia in Arabic, see scores update live, see a winner screen at the end.

**Estimated commits:** ~15.

### Phase 4 — Dominos

**Goal:** the cafe staple, fully playable.

**Scope:**
- Tile representation, deck shuffle, deal logic.
- Turn order, legal-move validation, drawing tiles, blocked detection.
- Scoring (Block style — 100 points to win, simplest variant for v1).
- Hand UI on each controller (only your tiles visible).
- Board UI on host (snake-style layout, animations for played tiles).
- Arabic + English UI strings.

**Exit criteria:** four phones play a full game of dominos to completion with correct rules and scoring. Host shows the board, phones show only their hand.

**Estimated commits:** ~20.

### Phase 5 — Tarneeb (the flagship)

**Goal:** the game that *makes* this product for the Iraq region.

**Scope:**
- Card representation, deal (13 cards each), team formation (across-the-table partners).
- Bidding phase: 7+ to bid, trump suit declaration, opt to "go without" trumps for double points.
- Trick-taking phase: must follow suit if able, trump beats off-suit, highest trump wins trick.
- Scoring: bid achieved → +bid points; failed → -bid points; first team to 31 wins.
- Hand UI on phones (sorted by suit), trick area on host with team scoreboard.
- Arabic-first UI (most Tarneeb players prefer Arabic terminology: حكم، صن، طرنيب).

**Exit criteria:** four phones play a full Tarneeb game to 31 points with correct rules, bidding, scoring. Comfortable for an Iraqi player who already knows the game.

**Estimated commits:** ~30.

### Phase 6 — Polish, observability, deploy

**Goal:** something we'd be willing to put on a public URL and let strangers play.

**Scope:**
- Real environment separation (dev / staging / prod) with secrets managed.
- Backend on Fly.io / Railway / Render (region: Frankfurt or closest to Iraq for latency); Postgres on Neon / Supabase; Redis on Upstash.
- Frontend on Vercel / Cloudflare Pages.
- Domain + HTTPS (so phones don't have to trust LAN IPs anymore — they just open a URL).
- Error monitoring (Sentry on both ends).
- Basic structured logging + dashboard.
- Mobile UX pass: tap targets, viewport, dark mode polish, "add to home screen" PWA hooks.
- Arabic SEO: `lang="ar"`, OG tags, social sharing in Arabic.

**Exit criteria:** can hand a friend a URL on the other side of the country, they open it on their phone in Arabic, get a game, play it without us touching anything.

### Phase 7+ — Expansion

In rough order of likely value:

1. **Hand** (هاند) — second flagship card game, similar engine to Tarneeb so reuses a lot.
2. **Draw & Guess** — high replay value, broad appeal.
3. **Imposter / Two Truths** — quick-fire party games.
4. **Konkan** — rounds out the card-game lineup.
5. **Flutter mobile app** — wraps the controller in a native shell, push notifications for "your friends started a game".
6. **Accounts + stats** — only when there's real demand. Anonymous works until then.

## Out of scope (deliberate)

- **Authentication.** Anonymous device-id identity is fine until we want stats / friends / leaderboards. Defer until Phase 7+.
- **Friends, lobbies, matchmaking.** This is a "be in the same room" product. Online cross-LAN play is a separate phase if we ever want it.
- **Mobile app (Flutter).** Web controller is the controller for now. Wrap it in Flutter once the web flow is solid.
- **Monetization.** Not in v1.
- **AirConsole's full breadth** (racing, action, kids' games, BMW integration, etc.). We're not chasing 100+ titles. ~10 well-built games beats 100 mediocre ones for our audience.

## Open questions

1. **Arabic content sourcing.** Trivia question packs need a writer or curator who knows Iraqi pop culture. DIY initially? Crowd-source later?
2. **Card game variants.** Tarneeb has regional variants — Iraqi vs. Syrian vs. Saudi rules differ. Pick one canonical (Iraqi) and add variants in settings later? Or support multiple from day one?
3. **Local-only vs. cloud-only deploy.** Should we ship a desktop installer that runs the whole stack locally (no internet needed)? Useful for cafes / power-out scenarios. Likely Phase 7+.
4. **Spectator mode.** Allow phones to join without taking a player slot? Probably not in v1.
5. **Game catalog source.** Static array in code (current) is fine until ~5 games. After that, move to Postgres + admin tool.

## How we work

- **Commits:** ~10–15 per session of multi-file work, grouped by logical change. Conventional messages (`feat:`, `fix:`, `chore:`, `docs:`, `refactor:`, `test:`).
- Each phase ends with a tagged commit so we can roll back cleanly.
- `PLAN.md` updates land alongside the work that invalidates them — never let it drift.
- New tech (libraries, infra, patterns) gets a one-line justification in the commit message that introduces it.
- Arabic strings reviewed by a native speaker (the user) before merge.
