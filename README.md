# Racha de Segunda

A small, installable web app for a Monday-night 5-a-side pickup group: balanced
3-team draws, a live match clock with winner-stays rotation, per-event stat
tracking, season/all-time leaderboards, an in-app emergency-contact system, and
a full bilingual (Português / English) rulebook. Runs live at
[racha.lbschmitz.ca](https://racha.lbschmitz.ca).

## Features

- **Team draws & match play** — `balanceTeams` splits the confirmed players into
  three balanced teams; teams can also be hand-tweaked by dragging players
  between them. A match clock (5 min standard, 6 min in the 16–18 player "full
  house" format) drives winner-stays rotation, with the documented tie rules
  (first game: odds-or-evens; later games: the challenger stays).
- **Live stats** — goals, assists, beautiful plays, howlers, saves, nutmegs
  (*canetas*), and open misses (*quase-gols*) are logged per player, per match.
  There is no fixed goalkeeper role — whoever is in net still gets credited with
  saves.
- **Recaps & leaderboards** — a points-based leaderboard, per-week recaps, and
  best-of-category / MVP cards. A **Season / All-time toggle** scopes everything;
  the Season view is bounded by the dates in `apps/web/src/lib/schedule.ts` and
  shows the season's start/end range.
- **Season schedule** — the home "Next racha" card computes the next *playable*
  Monday from the season window and the list of no-game holidays, both defined in
  `apps/web/src/lib/schedule.ts` (mirrored in the Rules screen).
- **Editable roster** — the season roster is managed on the Players tab (no names
  hardcoded). Players can be imported/exported as JSON.
- **Emergency contacts** — each player gets a private, unguessable self-service
  link to fill in their emergency details in-app (replacing the old Google
  Sheet). Contact info is viewable only by admins, exportable to CSV, and each
  link can be shown as a QR code. The link token is kept out of logs and the
  `Referer` header.
- **Accounts, admin & audit** — admins sign in with their player name + password;
  a server-side session then authorizes writes. State-changing admin actions and
  login attempts are recorded in an audit log, viewable on the History screen.
- **Configurable kit** — vest colors and labels are stored in settings (not
  hardcoded) and edited in-app; the UI picks readable text colors automatically.
- **Bilingual + installable** — every screen is PT/EN, and the app is a PWA you
  can install to a phone home screen (see the in-app install guide).

## Stack

- **Frontend** — React + Vite + TypeScript + Tailwind, `wouter` (routing) and
  `@tanstack/react-query` (data).
- **Backend** — [Hono](https://hono.dev) on Node.js 20, SQLite via
  `better-sqlite3`, [Zod](https://zod.dev) for input validation.
- **Auth** — `scrypt` password hashing and server-side session tokens, both via
  `node:crypto` (no external auth dependency).
- **Shipping** — one Docker image (the API serves the built SPA) plus a Caddy
  reverse proxy, behind Cloudflare in production. Schema migrations run
  automatically on boot and are additive.

## Auth & security model

Authentication is **on whenever `RACHA_TOKEN` is set** (leave it unset only for
local/dev — the server logs a warning and leaves the API open).

- **Reads are public** — except sensitive ones (emergency PII, the emergency
  export, and the audit log), which require an admin.
- **Writes are fail-closed** — every state-changing request requires an
  authenticated admin, with two deliberate exceptions: the player emergency
  self-service submit (`/api/emergency/*`) and the login route itself.
- **Admins** log in with their player name + password; the server returns a
  session token (sent back as the `X-Racha-Token` header) that lasts 30 days and
  is stored only as a hash.
- **`RACHA_TOKEN` is the master break-glass** — presenting it authenticates as a
  synthetic `master` user even if the players DB is empty/unusable. Bootstrap the
  first admins with it. The token is compared in constant time.
- **Abuse protection** — a per-IP rate limit (keyed on Cloudflare's
  `CF-Connecting-IP`, which a client can't forge) plus a stricter limit on the
  login route. Security headers (`nosniff`, `X-Frame-Options: DENY`,
  `Referrer-Policy: no-referrer`) are set by the API and again by Caddy at the
  edge.

`GET /api/auth/check` reports whether auth is required and who the presented
token resolves to; `GET /api/health` is a liveness probe.

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `RACHA_TOKEN` | *(unset)* | Master admin token; also switches auth on. **Set this for any public deploy.** |
| `DB_PATH` | `./data/racha.db` | SQLite file location. |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | `300` / `10000` | General per-IP API limit (`0` disables). |
| `LOGIN_RATE_MAX` / `LOGIN_RATE_WINDOW_MS` | `10` / `60000` | Stricter login throttle. |

## Development

```sh
npm install
# API + web in parallel (web on :5173 proxies /api → :8080)
npm run dev
```

## Build & run

```sh
npm run build
DB_PATH=$(pwd)/data/racha.db node apps/api/dist/server.js   # serves the SPA on :8080
```

## Deploy

```sh
docker compose up --build -d
```

The compose stack is the API container + a Caddy reverse proxy (TLS via Let's
Encrypt). Keep the SQLite file on the `./data` volume, and set `RACHA_TOKEN` in
the environment (e.g. an `.env` file next to `docker-compose.yml`) so writes are
locked down. In production the origin sits behind Cloudflare and does not publish
port 8080 — Caddy on 80/443 is the only public surface.

## Backups

`data/` holds the whole state: the SQLite DB (`racha.db`) **and** the `avatars/`
folder — back up both. Because the DB runs in WAL mode, take a *consistent*
snapshot rather than copying the file directly:

```sh
sqlite3 data/racha.db ".backup '/tmp/racha-snapshot.db'"
sqlite3 /tmp/racha-snapshot.db 'PRAGMA integrity_check;'   # expect: ok
tar czf racha-$(date +%F).tgz -C /tmp racha.db -C data avatars
```

[`scripts/racha-backup.sh`](scripts/racha-backup.sh) does exactly this —
snapshot, integrity check, tar with avatars, timestamped rotation (keep 30) — and
is what the production instance runs on a nightly cron, mirroring the newest
archive off-box. Point it at your stack with `RACHA_DIR`:

```sh
# nightly at 03:17, as root
17 3 * * * root RACHA_DIR=/srv/racha /usr/local/bin/racha-backup.sh
```

(Litestream is a good option if you want continuous streaming replication
instead — see `litestream.yml`.)

## Importing existing data

The single-file legacy app exports `{ db, weekIds }` JSON. As an admin, hit
**Import** on the Players screen and pick the file — IDs are preserved.

## Repo layout

- `apps/api` — Hono + SQLite backend (`src/routes/*` = auth, audit, settings,
  players, emergency, sessions, matches, events, stats).
- `apps/web` — Vite + React SPA (`src/screens/*`, `src/lib/*`).
- `packages/shared` — Zod schemas + the ported `balanceTeams` algorithm.
- `scripts` — ops helpers (e.g. `racha-backup.sh`).

## Tests

```sh
npm test          # all workspaces: the balanceTeams unit tests + API smoke tests
```

The API smoke tests spin up the built server and cover the auth gate,
login/session/logout, the emergency self-service flow, and that PII never leaks.
