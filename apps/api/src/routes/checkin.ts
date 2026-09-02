import { Hono } from 'hono';
import { z } from 'zod';
import { uid, nextGameDateISO, CONFIRMED_CAP, SEASON_CAP } from '@racha/shared';
import { getDb } from '../db/index.js';

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
  type: 'season' | 'dropin';
  status: 'in' | 'out';
  checked_in_at: number | null;
};
type Entry = { id: string; name: string; type: 'season' | 'dropin'; checked_in_at: number | null };

// Compute the whole board for a game date: season-first then drop-ins by time,
// split at the cap into confirmed vs waitlist, plus the explicit opt-outs.
function readBoard(gameDate: string | null) {
  if (!gameDate) {
    return { game_date: null, cap: CONFIRMED_CAP, confirmed: [], waitlist: [], out: [] };
  }
  // Season players must confirm; drop-ins check in optionally if they want to
  // play. Season players rank first, then drop-ins by check-in time.
  const rows = getDb()
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

  const byTime = (a: Row, b: Row) => (a.checked_in_at ?? 0) - (b.checked_in_at ?? 0);
  const seasonIns = rows.filter((r) => r.status === 'in' && r.type === 'season').sort(byTime);
  const dropIns = rows.filter((r) => r.status === 'in' && r.type === 'dropin').sort(byTime);
  const out = rows
    .filter((r) => r.status === 'out')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(toEntry);

  // Season players are guaranteed a confirmed spot, up to the hard ceiling (18).
  // Drop-ins then fill the rest, but only up to the normal cap of 15 total — so
  // an all-season night can reach 18, while drop-ins never push past 15.
  const confirmedSeason = seasonIns.slice(0, SEASON_CAP);
  const dropSlots = Math.max(0, CONFIRMED_CAP - confirmedSeason.length);
  const confirmedDrop = dropIns.slice(0, dropSlots);

  const confirmed = [...confirmedSeason, ...confirmedDrop].map(toEntry);
  const waitlist = [...seasonIns.slice(SEASON_CAP), ...dropIns.slice(dropSlots)].map(toEntry);
  // The displayed cap is 15 normally, stretching only as far as the season
  // players who actually checked in (up to 18).
  const cap = Math.min(SEASON_CAP, Math.max(CONFIRMED_CAP, confirmedSeason.length));

  return { game_date: gameDate, cap, confirmed, waitlist, out };
}

checkin.get('/', (c) => c.json(readBoard(nextGameDateISO())));

// Admin-only reset: wipe every check-in for the upcoming game. This lives on a
// sub-path (not the public `/api/checkin`), so the fail-closed write gate
// requires an authenticated admin and the action is audited.
checkin.delete('/all', (c) => {
  const gameDate = nextGameDateISO();
  if (!gameDate) return c.json({ error: 'no upcoming game' }, 400);
  getDb().prepare('DELETE FROM checkins WHERE game_date = ?').run(gameDate);
  return c.json(readBoard(gameDate));
});

checkin.post('/', async (c) => {
  const { player_id, status } = CheckinInput.parse(await c.req.json());
  const gameDate = nextGameDateISO();
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
