# Racha de Segunda

A small webapp for Monday-night 5-a-side: balanced 3-team draws, a 5-minute match clock, live event tracking (goals/assists/beautiful/silly/bad/saves), winner-stays rotation, and a season recap.

## Stack

- React + Vite + TypeScript + Tailwind (frontend)
- Hono on Node.js 20 (backend)
- SQLite via `better-sqlite3` (data)
- One Docker container, one volume — same image runs on AWS Lightsail, Proxmox, or a laptop.

## Development

```sh
npm install
# Run API + web in parallel (web on :5173 proxies /api → :8080)
npm run dev
```

Build everything:

```sh
npm run build
DB_PATH=$(pwd)/data/racha.db node apps/api/dist/server.js   # serves SPA on :8080
```

## Importing existing data

The single-file legacy app exports `{ db, weekIds }` JSON. Hit **Import** on the Players screen and pick the file — IDs are preserved.

## Deploy

```sh
docker compose up --build -d
```

Mount `./data` to keep the SQLite file outside the container. To require a write token on mutating endpoints, set `RACHA_TOKEN=...` and send `X-Racha-Token: ...` from the client.

For continuous backups, install [Litestream](https://litestream.io/) and use `litestream.yml`.

## Repo layout

- `apps/api` — Hono + SQLite backend
- `apps/web` — Vite + React SPA
- `packages/shared` — Zod schemas + the ported `balanceTeams` algorithm

## Tests

```sh
npm test --workspace=packages/shared
```
