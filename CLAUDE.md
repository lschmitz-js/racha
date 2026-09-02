# Racha de Segunda — project guide

Context for anyone (human or AI) picking up this repo, so the project doesn't
have to be re-explained each time. Pairs with [README.md](README.md) (features)
and [CHANGELOG.md](CHANGELOG.md) (timeline).

## What it is

An installable PWA for a Monday-night 5-a-side pickup group: weekly check-in,
balanced 3-team draws, a live match clock with winner-stays rotation, per-event
stats, season/all-time leaderboards, an in-app game calendar with cancellations,
emergency contacts, and a bilingual (PT/EN) rulebook.

## Stack & layout (npm workspaces monorepo)

- `apps/web` — Vite + React + TypeScript + Tailwind, wouter routing,
  @tanstack/react-query. No service worker (a refresh always gets a new build).
- `apps/api` — Hono on Node 20, better-sqlite3, Zod. SQLite file is the only
  datastore.
- `packages/shared` — code both sides import: `balanceTeams`, the season
  schedule (`schedule.ts`), id helpers, shared types.

## Key domain logic (where to look first)

- **Season schedule** — `packages/shared/src/schedule.ts`: `SEASON_START/END`,
  `NO_GAME_DATES` (holidays, mirrored in the Rules screen), `nextGameDateISO`,
  `seasonMondays`, `isGameMonday`, `upcomingMondayISO`. All string + UTC-weekday
  math so the server (UTC) and a browser agree. Session/game dates use the
  **America/Vancouver** day, never UTC.
- **Team balance** — `packages/shared/src/balance.ts`. Standard (10–15): two
  playing sides of 5 + a rotating remainder. Full house (16–18): three teams of
  up to 6 (one sub each), so 18 is 6/6/6.
- **Rotation rule** — winner keeps their exact side; nothing is returned. A short
  incoming team simply tops up from the losers.
- **Game cancellations** — `apps/api/src/routes/cancellations.ts` +
  `game_cancellations` table. Holidays are automatic; the admin popup only cancels
  Mondays _not_ already in `NO_GAME_DATES`.

## Auth model

- Reads are public (except PII/audit). Writes split into:
  - **Operational** (draw/teams/clock/stats for the one open session): admin OR
    the day's 4-digit **operator code** (`x-racha-code`).
  - **Admin-only**: open/close/delete a session, delete a match, roster/settings,
    editing a finished game, cancellations.
- Finished or past-dated sessions are **frozen** (structural writes locked; admin
  stat fixes still allowed).
- A few public self-service paths: emergency form, check-in, guest add/remove.

## Local dev & tests

- `npm run dev` (per workspace) to run web/api locally.
- Tests: `npm run test --workspace=apps/api` (smoke) and
  `--workspace=packages/shared` (schedule/balance). Keep them green; add coverage
  with behavior changes.
- Build check: `npm run build --workspace=apps/web` (also typechecks).

## Conventions

- **Ask before committing/pushing/deploying.** Recap what changed and why first.
- **Keep the public repo clean of live-env identifiers**: the production domain,
  deploy host/path, API tokens, payment address, and real player names live in the
  operator's private notes/`.env` — never in source, fixtures, or these docs.
- **Back up the production DB before any schema/data-changing deploy**; code-only
  deploys don't need it.
- Deploy is a code pull + container rebuild on the operator's host (details in
  private notes, not here).
- Bilingual: every user-facing string has EN + PT in `apps/web/src/lib/i18n.tsx`.

## Planned / in discussion

- **Payments & finance** (SSO login, drop-in/season payment tracking, a finance
  tab, unpaid reminders) — see [docs/plan-payments.md](docs/plan-payments.md).
