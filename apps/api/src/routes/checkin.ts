import { Hono } from 'hono';
import { z } from 'zod';
import { uid, nextGameDateISO, CHECKIN_CAP } from '@racha/shared';
import { getDb } from '../db/index.js';

// Weekly game check-ins (RSVP). The game is always derived server-side from the
// shared schedule (nextGameDateISO) — the client never picks the date — so the
// board rolls over automatically each week with no "open the list" step. Writes
// are public/honor-system (a player taps their own name); admins can override
// anyone via the same endpoint. The confirmed/waitlist split follows the rules:
// season players first, then drop-ins by check-in time, up to CHECKIN_CAP.
export const checkin = new Hono();

const CheckinInput = z.object({
  player_id: z.string().min(1),
  status: z.enum(['in', 'out']),
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
    return { game_date: null, cap: CHECKIN_CAP, confirmed: [], waitlist: [], out: [] };
  }
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

  const ins = rows
    .filter((r) => r.status === 'in')
    .sort(
      (a, b) =>
        (a.type === 'season' ? 0 : 1) - (b.type === 'season' ? 0 : 1) ||
        (a.checked_in_at ?? 0) - (b.checked_in_at ?? 0)
    )
    .map(toEntry);
  const out = rows
    .filter((r) => r.status === 'out')
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(toEntry);

  return {
    game_date: gameDate,
    cap: CHECKIN_CAP,
    confirmed: ins.slice(0, CHECKIN_CAP),
    waitlist: ins.slice(CHECKIN_CAP),
    out,
  };
}

checkin.get('/', (c) => c.json(readBoard(nextGameDateISO())));

checkin.post('/', async (c) => {
  const { player_id, status } = CheckinInput.parse(await c.req.json());
  const gameDate = nextGameDateISO();
  if (!gameDate) return c.json({ error: 'no upcoming game' }, 400);

  const db = getDb();
  const player = db
    .prepare('SELECT id FROM players WHERE id = ? AND active = 1')
    .get(player_id) as { id: string } | undefined;
  if (!player) return c.json({ error: 'unknown player' }, 404);

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
