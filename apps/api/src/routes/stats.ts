import { Hono } from 'hono';
import { getDb } from '../db/index.js';

export const stats = new Hono();

// Season-wide leaderboard
stats.get('/season', (c) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
         p.id, p.name, p.type, p.role,
         COUNT(DISTINCT mp.match_id) AS matches_played,
         SUM(CASE WHEN e.type='goal' THEN 1 ELSE 0 END) AS goals,
         SUM(CASE WHEN e.type='assist' THEN 1 ELSE 0 END) AS assists,
         SUM(CASE WHEN e.type='beautiful' THEN 1 ELSE 0 END) AS beautiful,
         SUM(CASE WHEN e.type='silly' THEN 1 ELSE 0 END) AS silly,
         SUM(CASE WHEN e.type='bad' THEN 1 ELSE 0 END) AS bad,
         SUM(CASE WHEN e.type='save' THEN 1 ELSE 0 END) AS saves
       FROM players p
       LEFT JOIN match_players mp ON mp.player_id = p.id
       LEFT JOIN match_events e ON e.player_id = p.id
       WHERE p.active = 1
       GROUP BY p.id, p.name, p.type, p.role
       ORDER BY goals DESC, assists DESC, p.name`
    )
    .all();
  return c.json(rows);
});

// Per-week summary (one row per session)
stats.get('/weeks', (c) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
         s.id AS session_id, s.date, s.status,
         COUNT(DISTINCT m.id) AS matches,
         SUM(CASE WHEN e.type='goal' THEN 1 ELSE 0 END) AS goals
       FROM sessions s
       LEFT JOIN matches m ON m.session_id = s.id
       LEFT JOIN match_events e ON e.match_id = m.id
       GROUP BY s.id, s.date, s.status
       ORDER BY s.date DESC, s.created_at DESC`
    )
    .all();
  return c.json(rows);
});
