import { Hono } from 'hono';
import { z } from 'zod';
import { isGameMonday, isNoGameDate, SEASON_START, SEASON_END } from '@racha/shared';
import { getDb, type DB } from '../db/index.js';
import { type AppVariables } from '../auth.js';

export type Cancellation = { date: string; reason: string; created_at: number };

// The dates of all current cancellations — used by the check-in flow so a
// called-off Monday rolls its check-ins to the next real game.
export function getCancelledDates(db: DB): string[] {
  return (db.prepare('SELECT date FROM game_cancellations').all() as { date: string }[]).map(
    (r) => r.date
  );
}

export const cancellations = new Hono<{ Variables: AppVariables }>();

// Public read: everyone sees which games are called off and why.
cancellations.get('/', (c) => {
  const rows = getDb()
    .prepare('SELECT date, reason, created_at FROM game_cancellations ORDER BY date')
    .all() as Cancellation[];
  return c.json(rows);
});

const bodySchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'date must be YYYY-MM-DD'),
  reason: z.string().trim().max(80).optional().default(''),
});

// Admin: call off a specific Monday. Only a real game day qualifies — holidays
// and breaks are already off (in NO_GAME_DATES), and only Mondays in season are
// game days, so we reject anything else with a clear reason instead of storing a
// cancellation that would never show.
cancellations.post('/', async (c) => {
  const parsed = bodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: parsed.error.issues[0]?.message ?? 'invalid' }, 400);
  const { date, reason } = parsed.data;

  if (date < SEASON_START || date > SEASON_END)
    return c.json({ error: 'that date is outside the season' }, 400);
  if (isNoGameDate(date))
    return c.json({ error: 'that Monday is already off (a listed holiday)' }, 400);
  if (!isGameMonday(date))
    return c.json({ error: 'games are on Mondays — pick a game Monday' }, 400);

  getDb()
    .prepare(
      `INSERT INTO game_cancellations (date, reason, created_at) VALUES (?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET reason = excluded.reason`
    )
    .run(date, reason, Date.now());
  return c.json({ ok: true, date, reason });
});

// Admin: un-cancel (the game is back on).
cancellations.delete('/:date', (c) => {
  const date = c.req.param('date');
  getDb().prepare('DELETE FROM game_cancellations WHERE date = ?').run(date);
  return c.json({ ok: true });
});
