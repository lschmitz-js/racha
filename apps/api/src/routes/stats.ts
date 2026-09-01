import { Hono } from 'hono';
import { getDb } from '../db/index.js';

export const stats = new Hono();

// Aggregated leaderboard. Optional ?from=YYYY-MM-DD&to=YYYY-MM-DD restricts it
// to sessions whose date falls in [from, to] (used for the "Season" view);
// with no range it aggregates everything (the "All-time" view). The date filter
// lives in the sessions join + `s.id IS NOT NULL` guards, so every active player
// still appears — players with no in-range events simply score zeros.
stats.get('/season', (c) => {
  const db = getDb();
  const from = c.req.query('from') ?? null;
  const to = c.req.query('to') ?? null;
  const rows = db
    .prepare(
      `SELECT
         p.id, p.name, p.type,
         (SELECT COUNT(DISTINCT mp.match_id)
            FROM match_players mp
            JOIN matches ms  ON ms.id = mp.match_id
            JOIN sessions ss ON ss.id = ms.session_id
            WHERE mp.player_id = p.id
              AND (@from IS NULL OR ss.date >= @from)
              AND (@to   IS NULL OR ss.date <= @to)) AS matches_played,
         (SELECT COUNT(*)
            FROM session_players sp
            JOIN sessions sd ON sd.id = sp.session_id
            WHERE sp.player_id = p.id
              AND (@from IS NULL OR sd.date >= @from)
              AND (@to   IS NULL OR sd.date <= @to)) AS sessions_played,
         SUM(CASE WHEN e.type='goal'      AND s.id IS NOT NULL THEN 1 ELSE 0 END) AS goals,
         SUM(CASE WHEN e.type='assist'    AND s.id IS NOT NULL THEN 1 ELSE 0 END) AS assists,
         SUM(CASE WHEN e.type='beautiful' AND s.id IS NOT NULL THEN 1 ELSE 0 END) AS beautiful,
         SUM(CASE WHEN e.type='bad'       AND s.id IS NOT NULL THEN 1 ELSE 0 END) AS bad,
         SUM(CASE WHEN e.type='save'      AND s.id IS NOT NULL THEN 1 ELSE 0 END) AS saves,
         SUM(CASE WHEN e.type='caneta'    AND s.id IS NOT NULL THEN 1 ELSE 0 END) AS canetas,
         SUM(CASE WHEN e.type='quasegol'  AND s.id IS NOT NULL THEN 1 ELSE 0 END) AS quasegols
       FROM players p
       LEFT JOIN match_events e ON e.player_id = p.id
       LEFT JOIN matches  m ON m.id = e.match_id
       LEFT JOIN sessions s ON s.id = m.session_id
            AND (@from IS NULL OR s.date >= @from)
            AND (@to   IS NULL OR s.date <= @to)
       WHERE p.active = 1
       GROUP BY p.id, p.name, p.type
       ORDER BY goals DESC, assists DESC, p.name`
    )
    .all({ from, to });
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
       SUM(CASE WHEN e.type='save'      THEN 1 ELSE 0 END) AS saves,
       SUM(CASE WHEN e.type='caneta'    THEN 1 ELSE 0 END) AS canetas,
       SUM(CASE WHEN e.type='quasegol'  THEN 1 ELSE 0 END) AS quasegols
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
