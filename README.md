# air-console

Local-multiplayer game platform. One screen (your laptop / TV) runs the game, phones become controllers by scanning a QR code. Like AirConsole, but yours.

## Stack

- **Web frontend:** React + Vite + TypeScript + Tailwind
- **Mobile (later):** Flutter
- **Backend:** Node.js + Fastify + TypeScript
- **Realtime:** Socket.IO
- **Database:** Postgres (via Prisma)
- **Live room state:** Redis

See `PLAN.md` for the roadmap and `backend/README.md` / `frontend/README.md` for layout details.

---

## Run it locally

You need three things on your machine:

1. **Node.js 20+** — https://nodejs.org/
2. **Git** — https://git-scm.com/
3. **Docker Desktop** (running) — https://www.docker.com/products/docker-desktop/

That's it. Postgres and Redis run inside Docker, so you don't have to install them separately.

### One-time setup

Open a terminal in the project root and run these in order:

```bash
# 1. Start the database + redis containers
docker compose up -d

# 2. Set up the backend
cd backend
cp .env.example .env
npm install
npm run prisma:generate

# 3. Set up the frontend (in a NEW terminal)
cd frontend
cp .env.example .env
npm install
```

Done. You only need to do this once.

### Daily workflow

You'll want **three terminals** open. Run one command in each:

```bash
# Terminal 1 — make sure containers are up (idempotent, safe to re-run)
docker compose up -d

# Terminal 2 — backend
cd backend
npm run dev
# → "Server listening at http://0.0.0.0:3001"

# Terminal 3 — frontend
cd frontend
npm run dev
# → "Local:   http://localhost:5173/"
```

Open **http://localhost:5173** in your browser. You should see the game catalog. Click **Start** on Dominos and you'll get a room code + QR code.

### Stop everything

```bash
# In each dev-server terminal: Ctrl+C
# Then stop the containers:
docker compose down
```

Your data (any rooms / matches) is kept in Docker volumes, so it'll still be there next time.

---

## Test it from your phone

You want the QR code to actually work — that means your phone has to reach your laptop on the same Wi-Fi.

### 1. Find your laptop's LAN IP

Vite prints it when you start the frontend. Look for a line like:

```
Network: http://192.168.1.41:5173/
```

That `192.168.1.41` (or whatever yours is) is your laptop's IP on the local network.

### 2. Open the app via the LAN IP, not localhost

On your laptop browser, open `http://192.168.1.41:5173` instead of `http://localhost:5173`.

This matters because the QR code is generated from the URL you're on. If you're on `localhost`, the QR points to `localhost`, and your phone has no idea what `localhost` means (it's the phone itself).

### 3. Make sure your phone is on the same Wi-Fi

Then scan the QR with the camera. Type your name. Done.

### Common gotcha — Windows Firewall

If the phone shows "connecting…" forever, Windows Firewall is probably blocking port 3001.

**Quick test from your phone:** open `http://192.168.1.41:3001/health` in the phone's browser.

- ✅ Sees JSON (`{"status":"ok",...}`) → firewall is fine, you're good
- ❌ Page hangs / "can't connect" → firewall is blocking

**Fix it (one time):** open PowerShell **as Administrator** and run:

```powershell
New-NetFirewallRule -DisplayName "air-console backend" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3001
```

Refresh and try again.

---

## Quick verification

If you want to confirm the realtime layer is working without poking around the UI:

```bash
cd frontend
node scripts/smoke-test.mjs
```

This script creates a room, simulates a host + two players, drops one of them, and prints what each socket receives. If you see Alice and Bob appear and Alice disappear, everything is wired.

---

## What's working today

Pick a game → get a room code + QR → phones scan and join → host screen shows the live player list → host can kick players → kicked players are sent home with a notice → names persist across browser closes (including iOS Safari).

What's **not** wired yet: actual gameplay (engine is a skeleton), team picker, "ready" + "start game" flow, reconnection after a network drop. See `PLAN.md` for what's next.
