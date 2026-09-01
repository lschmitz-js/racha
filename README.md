# Racha de Segunda

A small, installable web app for a Monday-night 5-a-side pickup group: balanced
3-team draws, a live match clock with winner-stays rotation, per-event stat
tracking, season/all-time leaderboards, an in-app emergency-contact system, and
a full bilingual (Português / English) rulebook.

## Features

- **Check-in (RSVP)** — players confirm for the next game in the Check-in tab
  (honor-system: tap your name, remembered on the device). The board is always
  tied to the next game from the schedule and rolls over automatically each week —
  no poll to open. The confirmed list + waitlist follow the rules: season players
  are always confirmed (they can stretch the cap up to 18), then drop-ins fill by
  check-in time up to the normal cap of 15 — anyone past that waits. Admins can
  set, toggle, or clear anyone's check-in from the Manage list. WhatsApp is only a
  reminder — there's a "copy reminder" button.
- **Team draws & match play** — a racha needs at least 10 present to start
  (`MIN_PLAYERS`, shared). Starting pre-selects whoever confirmed on the check-in
  board. `balanceTeams` splits players by skill: **standard (10–15)** gives
  white/black 5 each (the two playing sides) plus green (the rotating remainder,
  5/5/5 at 15); **full house (16–18)** spreads the subs evenly into three teams
  of up to 6 (one sub each), so 18 is 6/6/6. A match clock (5 min
  standard, 6 min in the 16–18 "full house") drives winner-stays rotation with the
  documented tie rules (first game: odds-or-evens; later games: the challenger
  stays). When the team coming on is short of five, the post-match panel tops it up
  from the team that just left. Teams can also be hand-tweaked by dragging players.
- **Live stats** — goals, assists, beautiful plays, howlers, saves, nutmegs
  (*canetas*), and open misses (*quase-gols*) are logged per player, per match.
  There is no fixed goalkeeper role — whoever is in net still gets credited with
  saves.
- **Recaps & leaderboards** — a points-based leaderboard, per-week recaps, and
  best-of-category / MVP cards. A **Season / All-time toggle** scopes everything;
  the Season view is bounded by the dates in `packages/shared/src/schedule.ts` and
  shows the season's start/end range.
- **Season schedule** — the home "Next racha" card computes the next *playable*
  Monday from the season window and the list of no-game holidays, both defined in
  `packages/shared/src/schedule.ts` (mirrored in the Rules screen).
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
- **In-app settings** — vest colors/labels and the Rules-screen contact/payment
  info (e-Transfer address, site URL) are stored in the database and edited
  in-app (Players → Menu), so they live with the deployment rather than in
  source. The vest UI picks readable text colors automatically.
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

Authentication is **on whenever `RACHA_TOKEN` is set**. It may be left unset only
for local/dev (the server logs a warning and leaves the API open); in production
(`NODE_ENV=production`) the server **refuses to start** without it.

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
  login route.
- **Hardening** — the API sends `Strict-Transport-Security` (HSTS),
  `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, and
  `Referrer-Policy: no-referrer`. Login runs in constant time (so a valid admin
  name can't be found by response timing); admin passwords are 8–200 chars; the
  public roster hides the `is_admin` flag (only admins see it); avatar uploads
  are validated by magic bytes, not just the declared content type; all SQL is
  parameterized; and the container runs as an unprivileged user.

`GET /api/auth/check` reports whether auth is required and who the presented
token resolves to; `GET /api/health` is a liveness probe.

## Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `RACHA_TOKEN` | *(unset)* | Master admin token; also switches auth on. **Required in production** — with `NODE_ENV=production` the server refuses to start without it. |
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

The container runs as an unprivileged user (`node`, uid 1000), so the `./data`
bind-mount must be writable by that uid — run `chown -R 1000:1000 data` before
the first start, or the app can't write the database.

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
snapshot, integrity check, tar with avatars, timestamped rotation (keep 30).
Run it from a nightly cron and mirror the newest archive off-box. Point it at
your stack with `RACHA_DIR`:

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
  players, emergency, checkin, sessions, matches, events, stats).
- `apps/web` — Vite + React SPA (`src/screens/*`, `src/lib/*`).
- `packages/shared` — Zod schemas + the ported `balanceTeams` algorithm.
- `scripts` — ops helpers (e.g. `racha-backup.sh`).

## Tests

```sh
npm test          # all workspaces: the balanceTeams unit tests + API smoke tests
```

The API smoke tests spin up the built server and cover the auth gate,
login/session/logout, the public roster hiding `is_admin`, the emergency
self-service flow, that PII never leaks, and that bad input returns 400.
