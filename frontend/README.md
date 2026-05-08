# frontend

React + Vite + TypeScript + Tailwind. Hosts both the **host screen** (TV/laptop) and the **mobile controller**, distinguished by route.

## Setup

```bash
cp .env.example .env
npm install
npm run dev
```

Dev server boots on `http://localhost:5173`.

## Layout

```
src/
├── main.tsx              # entry point
├── App.tsx               # router
├── index.css             # tailwind imports
├── routes/               # one file per top-level page
│   ├── Home.tsx          # game catalog
│   ├── Host.tsx          # host screen — QR + lobby + gameplay
│   ├── Join.tsx          # /join/:code redirect to controller
│   └── Controller.tsx    # mobile controller view
├── lib/                  # framework-level helpers (api, socket)
├── stores/               # zustand stores
├── components/           # reusable presentational components
├── hooks/                # custom hooks
└── types/                # shared TS types (mirror backend events)
```

## Why this layout

- **routes/** holds page-shaped components only. Each route owns its data fetching and composes `components/`.
- **stores/** are global state slices. Local UI state stays in components.
- **lib/** is for non-react infrastructure (socket client, REST wrapper).
- **components/** stays presentational so it's reusable across routes.
