import { Hono } from 'hono';
import { z } from 'zod';
import { NewEventInput, uid } from '@racha/shared';
import { getDb } from '../db/index.js';
import { computeClockMs } from './matches.js';

type MatchRow = {
  id: string;
  started_at: number | null;
  elapsed_ms: number;
  status: 'pending' | 'running' | 'paused' | 'done';
  team_a_id: string;
  team_b_id: string;
};

export const events = new Hono();

events.post('/', async (c) => {
  const body = NewEventInput.parse(await c.req.json());
  const db = getDb();
  const m = db
    .prepare('SELECT id, started_at, elapsed_ms, status, team_a_id, team_b_id FROM matches WHERE id = ?')
    .get(body.match_id) as MatchRow | undefined;
  if (!m) return c.json({ error: 'match not found' }, 404);

  // Idempotent insert by client-generated id
  const existing = db.prepare('SELECT * FROM match_events WHERE id = ?').get(body.id);
  if (existing) return c.json(existing, 200);

  const offset = body.clock_offset_ms ?? 0;
  const clock = Math.max(0, computeClockMs(m as any) + offset);

  db.prepare(
    `INSERT INTO match_events (id, match_id, clock_ms, type, player_id, team_id, link_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    body.id,
    body.match_id,
    clock,
    body.type,
    body.player_id,
    body.team_id,
    body.link_id ?? null,
    Date.now()
  );

  const row = db.prepare('SELECT * FROM match_events WHERE id = ?').get(body.id);
  return c.json(row, 201);
});

const SubInput = z.object({
  match_id: z.string(),
  team_id: z.string(),
  out_player_id: z.string(),
  in_player_id: z.string(),
});

events.post('/sub', async (c) => {
  const body = SubInput.parse(await c.req.json());
  const db = getDb();
  const m = db.prepare('SELECT * FROM matches WHERE id = ?').get(body.match_id) as MatchRow | undefined;
  if (!m) return c.json({ error: 'match not found' }, 404);
  const link_id = uid();
  const clock = Math.max(0, computeClockMs(m as any));
  const now = Date.now();

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO match_events (id, match_id, clock_ms, type, player_id, team_id, link_id, created_at)
       VALUES (?, ?, ?, 'sub_out', ?, ?, ?, ?)`
    ).run(uid(), body.match_id, clock, body.out_player_id, body.team_id, link_id, now);
    db.prepare(
      `INSERT INTO match_events (id, match_id, clock_ms, type, player_id, team_id, link_id, created_at)
       VALUES (?, ?, ?, 'sub_in', ?, ?, ?, ?)`
    ).run(uid(), body.match_id, clock, body.in_player_id, body.team_id, link_id, now);

    // Add the incoming player to match_players if not already there
    db.prepare(
      `INSERT OR IGNORE INTO match_players (match_id, player_id, team_id, starting)
       VALUES (?, ?, ?, 0)`
    ).run(body.match_id, body.in_player_id, body.team_id);
  });
  tx();

  return c.json({ link_id, clock_ms: clock }, 201);
});

// Soft-delete a single event or a whole link group (for goal+assist undo)
events.delete('/:id', (c) => {
  const id = c.req.param('id');
  const link = c.req.query('link') === '1';
  const db = getDb();
  const ev = db.prepare('SELECT * FROM match_events WHERE id = ?').get(id) as
    | { id: string; link_id: string | null }
    | undefined;
  if (!ev) return c.json({ error: 'not found' }, 404);

  if (link && ev.link_id) {
    db.prepare('DELETE FROM match_events WHERE link_id = ?').run(ev.link_id);
  } else {
    db.prepare('DELETE FROM match_events WHERE id = ?').run(id);
  }
  return c.json({ ok: true });
});
