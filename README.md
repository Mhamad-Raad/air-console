# air-console

Local-multiplayer game platform: one host screen runs the game, phones become controllers by scanning a QR code.

## Stack

- **Frontend (web):** React + Vite + TypeScript + Tailwind
- **Mobile (later):** Flutter
- **Backend:** Node.js + Fastify + TypeScript
- **Realtime:** Socket.IO
- **Database:** PostgreSQL + Prisma
- **Cache / room state:** Redis

## Layout

```
air-console/
├── backend/    # Fastify API + Socket.IO server
└── frontend/   # React web app (host screen + controller)
```

## Getting started

See `backend/README.md` and `frontend/README.md`.
