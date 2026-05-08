# backend

Fastify + Socket.IO + Prisma + Redis.

## Setup

```bash
cp .env.example .env
npm install
npm run prisma:generate
npm run dev
```

Server boots on `http://localhost:3001` by default.

## Layout

```
src/
├── index.ts                # entry point — boots the server
├── server.ts               # builds the Fastify instance
├── config/                 # env loading + validation
├── lib/                    # framework-level singletons (prisma, redis, logger)
├── modules/                # feature modules (rooms, games, players)
│   └── <module>/
│       ├── <m>.routes.ts   # HTTP routes
│       ├── <m>.service.ts  # business logic
│       ├── <m>.repository.ts
│       ├── <m>.schema.ts   # zod schemas
│       └── index.ts        # fastify plugin registration
├── games/                  # game engines (dominos, etc.)
├── realtime/               # Socket.IO setup + handlers
└── shared/                 # shared errors + types
```

## Why this layout

- **modules/** holds feature-shaped code, not layer-shaped — easier to add/remove a feature.
- **lib/** is for cross-cutting infra (one Prisma client, one Redis client).
- **games/** is separate from **modules/** because game rules are pluggable engines, not HTTP modules.
- **realtime/** is its own folder because WebSocket events are a different transport from HTTP routes but share the same services.
