import { Hono } from 'hono';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
import { uid, nextGameDateISO, CONFIRMED_CAP, SEASON_CAP, GUEST_CAP } from '@racha/shared';
import { getDb } from '../db/index.js';
import { getCancelledDates } from './cancellations.js';

// The upcoming game date, rolling past both listed holidays and any admin
// cancellations so check-ins land on the game we'll actually play.
function upcomingGameDate(): string | null {
  return nextGameDateISO(new Date(), getCancelledDates(getDb()));
}

type PlayerType = 'season' | 'dropin' | 'guest';
// Priority for a confirmed spot: season first, then drop-ins, then guests last.
const TYPE_RANK: Record<PlayerType, number> = { season: 0, dropin: 1, guest: 2 };

// Guest self-add can be turned off by an admin (settings key `guests.selfAdd`).
// Defaults to on when unset.
function guestSelfAddAllowed(db: ReturnType<typeof getDb>): boolean {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('guests') as
    | { value: string }
    | undefined;
  if (!row) return true;
  try {
    return JSON.parse(row.value).selfAdd !== false;
  } catch {
    return true;
  }
}

// Weekly game check-ins (RSVP). The game is always derived server-side from the
// shared schedule (nextGameDateISO) — the client never picks the date — so the
// board rolls over automatically each week with no "open the list" step. Writes
// are public/honor-system (a player taps their own name); admins can override
// anyone via the same endpoint. The confirmed/waitlist split follows the rules:
// season players are always confirmed (up to SEASON_CAP), then drop-ins by
// check-in time fill the rest up to CONFIRMED_CAP.
export const checkin = new Hono();

const CheckinInput = z.object({
  player_id: z.string().min(1),
  // 'none' clears the player's check-in entirely (back to no response) — used
  // when a player taps their already-selected choice again.
  status: z.enum(['in', 'out', 'none']),
});

type Row = {
  player_id: string;
  name: string;
  type: PlayerType;
  status: 'in' | 'out';
  checked_in_at: number | null;
};
type Entry = { id: string; name: string; type: PlayerType; checked_in_at: number | null };

// Compute the whole board for a game date: season-first then drop-ins by time,
// split at the cap into confirmed vs waitlist, plus the explicit opt-outs.
function readBoard(gameDate: string | null) {
  const db = getDb();
  const guestsAllowed = guestSelfAddAllowed(db);
  if (!gameDate) {
    return {
      game_date: null,
      cap: CONFIRMED_CAP,
      confirmed: [],
      waitlist: [],
      out: [],
      guest_cap: GUEST_CAP,
      guest_count: 0,
      guests_allowed: guestsAllowed,
    };
  }
  // Season players must confirm; drop-ins check in optionally if they want to
  // play; guests are the lowest priority. Season ranks first, then drop-ins,
  // then guests, each tier by check-in time.
  const rows = db
    .prepare(
      `SELECT c.player_id, p.name, p.type, c.status, c.checked_in_at
         FROM checkins c
         JOIN players p ON p.id = c.player_id AND p.active = 1
        WHERE c.game_date = ?`
    )
    .all(gameDate) as Row[];

  const toEntry = (r: Row): Entry => ({
    id: r.player_id,
    name: r.name,
    type: r.type,
    checked_in_at: r.checked_in_at,
  });

  // Order in by tier (season → drop-in → guest), then by check-in time.
  const byTierThenTime = (a: Row, b: Row) =>
    TYPE_RANK[a.type] - TYPE_RANK[b.type] || (a.checked_in_at ?? 0) - (b.checked_in_at ?? 0);
  const ins = rows.filter((r) => r.status === 'in').sort(byTierThenTime);
  const seasonIns = ins.filter((r) => r.type === 'season');
  const nonSeasonIns = ins.filter((r) => r.type !== 'season'); // drop-ins then guests
  const out = rows
    .filter((r) => r.status === 'out')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(toEntry);

  // Season players are guaranteed a confirmed spot, up to the hard ceiling (18).
  // Drop-ins then guests fill the rest, but only up to the normal cap of 15 —
  // so an all-season night can reach 18, while non-season never pushes past 15.
  const confirmedSeason = seasonIns.slice(0, SEASON_CAP);
  const fillSlots = Math.max(0, CONFIRMED_CAP - confirmedSeason.length);
  const confirmedFill = nonSeasonIns.slice(0, fillSlots);

  const confirmed = [...confirmedSeason, ...confirmedFill].map(toEntry);
  const waitlist = [...seasonIns.slice(SEASON_CAP), ...nonSeasonIns.slice(fillSlots)].map(toEntry);
  // The displayed cap is 15 normally, stretching only as far as the season
  // players who actually checked in (up to 18).
  const cap = Math.min(SEASON_CAP, Math.max(CONFIRMED_CAP, confirmedSeason.length));

  return {
    game_date: gameDate,
    cap,
    confirmed,
    waitlist,
    out,
    guest_cap: GUEST_CAP,
    guest_count: ins.filter((r) => r.type === 'guest').length,
    guests_allowed: guestsAllowed,
  };
}

checkin.get('/', (c) => c.json(readBoard(upcomingGameDate())));

// Admin-only reset: wipe every check-in for the upcoming game. This lives on a
// sub-path (not the public `/api/checkin`), so the fail-closed write gate
// requires an authenticated admin and the action is audited.
checkin.delete('/all', (c) => {
  const gameDate = upcomingGameDate();
  if (!gameDate) return c.json({ error: 'no upcoming game' }, 400);
  getDb().prepare('DELETE FROM checkins WHERE game_date = ?').run(gameDate);
  return c.json(readBoard(gameDate));
});

// Public guest add: anyone can add a one-off external drop-in by name and it is
// checked in immediately. Kept narrow (only ever creates a type='guest' with
// default skills) so the general admin-only player create is not exposed.
// Spam guards: admin kill-switch, per-game cap, name validation + dedupe, and a
// stricter rate limit (server.ts). This path is whitelisted in the write gate.
const GuestInput = z.object({ name: z.string().trim().min(2).max(40) });

checkin.post('/guest', async (c) => {
  const gameDate = upcomingGameDate();
  if (!gameDate) return c.json({ error: 'no upcoming game' }, 400);

  const db = getDb();
  if (!guestSelfAddAllowed(db)) return c.json({ error: 'guests are turned off' }, 403);

  const { name } = GuestInput.parse(await c.req.json());

  // Dedupe: don't allow a name that already belongs to an active player (guest
  // or real) — blocks flooding the same name and impersonating a real player.
  const dup = db
    .prepare('SELECT 1 FROM players WHERE active = 1 AND lower(name) = lower(?)')
    .get(name);
  if (dup) return c.json({ error: 'that name is already taken' }, 409);

  // Per-game guest cap.
  const { n } = db
    .prepare(
      `SELECT COUNT(*) AS n FROM checkins c JOIN players p ON p.id = c.player_id
        WHERE c.game_date = ? AND c.status = 'in' AND p.type = 'guest' AND p.active = 1`
    )
    .get(gameDate) as { n: number };
  if (n >= GUEST_CAP) return c.json({ error: 'guest limit reached for this game' }, 429);

  const id = uid();
  const now = Date.now();
  db.prepare(
    `INSERT INTO players (id, name, type, role, skills_json, active, emergency_token, is_admin, password_hash, created_at)
     VALUES (?, ?, 'guest', 'player', ?, 1, ?, 0, NULL, ?)`
  ).run(id, name, JSON.stringify([3, 3, 3, 3, 3, 3, 3, 3]), randomBytes(18).toString('base64url'), now);
  db.prepare(
    `INSERT INTO checkins (id, game_date, player_id, status, checked_in_at, updated_at)
     VALUES (?, ?, ?, 'in', ?, ?)`
  ).run(uid(), gameDate, id, now, now);

  return c.json(readBoard(gameDate));
});

// Public: remove a guest (a guest changed their mind, or someone tidies up).
// Guests are throwaway players with no login, so — like adding one — this is
// public. Restricted to type='guest' so it can never delete a real player;
// deleting the player cascades their check-in row away.
checkin.delete('/guest/:id', (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const p = db.prepare('SELECT id, type FROM players WHERE id = ? AND active = 1').get(id) as
    | { id: string; type: string }
    | undefined;
  if (!p) return c.json({ error: 'unknown player' }, 404);
  if (p.type !== 'guest') return c.json({ error: 'only guests can be removed here' }, 403);
  db.prepare('DELETE FROM players WHERE id = ?').run(id); // cascades checkins
  return c.json(readBoard(upcomingGameDate()));
});

checkin.post('/', async (c) => {
  const { player_id, status } = CheckinInput.parse(await c.req.json());
  const gameDate = upcomingGameDate();
  if (!gameDate) return c.json({ error: 'no upcoming game' }, 400);

  const db = getDb();
  const player = db
    .prepare('SELECT id FROM players WHERE id = ? AND active = 1')
    .get(player_id) as { id: string } | undefined;
  if (!player) return c.json({ error: 'unknown player' }, 404);

  if (status === 'none') {
    db.prepare('DELETE FROM checkins WHERE game_date = ? AND player_id = ?').run(gameDate, player_id);
    return c.json(readBoard(gameDate));
  }

  const now = Date.now();
  const existing = db
    .prepare('SELECT status, checked_in_at FROM checkins WHERE game_date = ? AND player_id = ?')
    .get(gameDate, player_id) as { status: string; checked_in_at: number | null } | undefined;

  // Keep the original check-in time while a player stays "in"; a fresh "in"
  // (new, or after opting out) takes a new timestamp, so they re-join the
  // waitlist order at the back — matching "faster you vote, better your chance".
  const checkedInAt =
    status === 'in'
      ? existing?.status === 'in' && existing.checked_in_at
        ? existing.checked_in_at
        : now
      : null;

  db.prepare(
    `INSERT INTO checkins (id, game_date, player_id, status, checked_in_at, updated_at)
     VALUES (@id, @gd, @pid, @st, @cia, @ts)
     ON CONFLICT(game_date, player_id) DO UPDATE SET
       status        = excluded.status,
       checked_in_at = excluded.checked_in_at,
       updated_at    = excluded.updated_at`
  ).run({ id: uid(), gd: gameDate, pid: player_id, st: status, cia: checkedInAt, ts: now });

  return c.json(readBoard(gameDate));
});
