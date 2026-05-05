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
         (SELECT COUNT(DISTINCT mp.match_id)
            FROM match_players mp WHERE mp.player_id = p.id) AS matches_played,
         (SELECT COUNT(*)
            FROM session_players sp WHERE sp.player_id = p.id) AS sessions_played,
         SUM(CASE WHEN e.type='goal' THEN 1 ELSE 0 END) AS goals,
         SUM(CASE WHEN e.type='assist' THEN 1 ELSE 0 END) AS assists,
         SUM(CASE WHEN e.type='beautiful' THEN 1 ELSE 0 END) AS beautiful,
         SUM(CASE WHEN e.type='bad' THEN 1 ELSE 0 END) AS bad,
         SUM(CASE WHEN e.type='save' THEN 1 ELSE 0 END) AS saves
       FROM players p
       LEFT JOIN match_events e ON e.player_id = p.id
       WHERE p.active = 1
       GROUP BY p.id, p.name, p.type, p.role
       ORDER BY goals DESC, assists DESC, p.name`
    )
    .all();
  return c.json(rows);
});

// Per-week summary (one row per session) including each session's leaderboard
// so the client can compute MVP + best-of-the-day cards without an N+1 fetch.
stats.get('/weeks', (c) => {
  const db = getDb();
  const sessions = db
    .prepare(
      `SELECT id AS session_id, date, status, created_at
       FROM sessions
       ORDER BY date DESC, created_at DESC`
    )
    .all() as Array<{ session_id: string; date: string; status: string; created_at: number }>;

  const matchCountStmt = db.prepare(
    `SELECT COUNT(*) AS n FROM matches WHERE session_id = ?`
  );
  const goalCountStmt = db.prepare(
    `SELECT COUNT(*) AS n
       FROM match_events e
       INNER JOIN matches m ON m.id = e.match_id
       WHERE m.session_id = ? AND e.type = 'goal'`
  );
  const leaderboardStmt = db.prepare(
    `SELECT
       p.id, p.name, p.role,
       SUM(CASE WHEN e.type='goal'      THEN 1 ELSE 0 END) AS goals,
       SUM(CASE WHEN e.type='assist'    THEN 1 ELSE 0 END) AS assists,
       SUM(CASE WHEN e.type='beautiful' THEN 1 ELSE 0 END) AS beautiful,
       SUM(CASE WHEN e.type='bad'       THEN 1 ELSE 0 END) AS bad,
       SUM(CASE WHEN e.type='save'      THEN 1 ELSE 0 END) AS saves
     FROM players p
     INNER JOIN match_events e ON e.player_id = p.id
     INNER JOIN matches m       ON m.id      = e.match_id
     WHERE m.session_id = ?
     GROUP BY p.id, p.name, p.role`
  );

  const result = sessions.map((s) => ({
    session_id: s.session_id,
    date: s.date,
    status: s.status,
    matches: (matchCountStmt.get(s.session_id) as { n: number }).n,
    goals: (goalCountStmt.get(s.session_id) as { n: number }).n,
    leaderboard: leaderboardStmt.all(s.session_id),
  }));
  return c.json(result);
});
