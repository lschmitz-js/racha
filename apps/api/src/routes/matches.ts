import { Hono } from 'hono';
import { z } from 'zod';
import { uid } from '@racha/shared';
import { getDb } from '../db/index.js';

type MatchRow = {
  id: string;
  session_id: string;
  ordinal: number;
  team_a_id: string;
  team_b_id: string;
  bench_team_id: string;
  started_at: number | null;
  ended_at: number | null;
  elapsed_ms: number;
  status: 'pending' | 'running' | 'paused' | 'done';
  result: 'a' | 'b' | 'draw' | 'pending';
  winner_team_id: string | null;
};

export const matches = new Hono();

const CreateMatchInput = z.object({
  session_id: z.string(),
  team_a_id: z.string(),
  team_b_id: z.string(),
  bench_team_id: z.string(),
  // Players to lend into team B (the team coming on) from the team going to the
  // bench, to top it up to five. Applied server-side after loan returns, capped
  // at what's actually needed.
  borrow: z.object({ player_ids: z.array(z.string()) }).optional(),
});

matches.post('/', async (c) => {
  const body = CreateMatchInput.parse(await c.req.json());
  const db = getDb();

  const session = db
    .prepare('SELECT status FROM sessions WHERE id = ?')
    .get(body.session_id) as { status: string } | undefined;
  if (!session) return c.json({ error: 'session not found' }, 404);
  if (session.status === 'done') {
    return c.json({ error: 'session is ended' }, 409);
  }

  const id = uid();
  const max = db
    .prepare('SELECT COALESCE(MAX(ordinal), 0) AS n FROM matches WHERE session_id = ?')
    .get(body.session_id) as { n: number };
  const ordinal = max.n + 1;

  const now = Date.now();

  // Move a player onto a team within this session (removing them from any other
  // team first). Used by the loan return + borrow steps below.
  const sessionTeamIds = (
    db.prepare('SELECT id FROM session_teams WHERE session_id = ?').all(body.session_id) as {
      id: string;
    }[]
  ).map((r) => r.id);
  const teamIdPlaceholders = sessionTeamIds.map(() => '?').join(',');
  const removeFromTeams = db.prepare(
    `DELETE FROM session_team_players WHERE player_id = ? AND session_team_id IN (${teamIdPlaceholders})`
  );
  const addToTeam = db.prepare(
    'INSERT OR IGNORE INTO session_team_players (session_team_id, player_id) VALUES (?, ?)'
  );
  const moveToTeam = (playerId: string, toTeamId: string) => {
    removeFromTeams.run(playerId, ...sessionTeamIds);
    addToTeam.run(toTeamId, playerId);
  };
  const teamCount = db.prepare(
    'SELECT COUNT(*) AS c FROM session_team_players WHERE session_team_id = ?'
  );

  const tx = db.transaction(() => {
    // 1) Return: the team going to the bench gives back everything it borrowed —
    //    winners keep their borrowed players, the team that steps off returns them.
    const loans = db
      .prepare(
        `SELECT id, player_id, home_team_id FROM team_loans
          WHERE session_id = ? AND borrower_team_id = ? AND returned_at IS NULL`
      )
      .all(body.session_id, body.bench_team_id) as {
      id: string;
      player_id: string;
      home_team_id: string;
    }[];
    const closeLoan = db.prepare('UPDATE team_loans SET returned_at = ? WHERE id = ?');
    for (const loan of loans) {
      moveToTeam(loan.player_id, loan.home_team_id);
      closeLoan.run(now, loan.id);
    }

    // 2) Borrow: top team B up to five from the team going to the bench, but only
    //    by however much it still needs after the returns above.
    if (body.borrow && body.borrow.player_ids.length) {
      let needed = Math.max(0, 5 - (teamCount.get(body.team_b_id) as { c: number }).c);
      const inBench = new Set(
        (
          db
            .prepare('SELECT player_id FROM session_team_players WHERE session_team_id = ?')
            .all(body.bench_team_id) as { player_id: string }[]
        ).map((r) => r.player_id)
      );
      const insLoan = db.prepare(
        `INSERT INTO team_loans (id, session_id, player_id, home_team_id, borrower_team_id, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      );
      for (const pid of body.borrow.player_ids) {
        if (needed <= 0) break;
        if (!inBench.has(pid)) continue;
        moveToTeam(pid, body.team_b_id);
        insLoan.run(uid(), body.session_id, pid, body.bench_team_id, body.team_b_id, now);
        needed--;
      }
    }

    db.prepare(
      `INSERT INTO matches (id, session_id, ordinal, team_a_id, team_b_id, bench_team_id)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, body.session_id, ordinal, body.team_a_id, body.team_b_id, body.bench_team_id);

    // Lineup = all players on team A and team B (starting=1), after the moves above.
    const teamPlayers = db.prepare(
      'SELECT player_id FROM session_team_players WHERE session_team_id = ?'
    );
    const insMP = db.prepare(
      'INSERT INTO match_players (match_id, player_id, team_id, starting) VALUES (?, ?, ?, 1)'
    );
    for (const tid of [body.team_a_id, body.team_b_id]) {
      const ps = teamPlayers.all(tid) as { player_id: string }[];
      for (const p of ps) insMP.run(id, p.player_id, tid);
    }
  });
  tx();

  const row = db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as MatchRow;
  return c.json(row, 201);
});

matches.get('/:id', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as MatchRow | undefined;
  if (!match) return c.json({ error: 'not found' }, 404);
  const lineup = db.prepare('SELECT * FROM match_players WHERE match_id = ?').all(id);
  const events = db
    .prepare('SELECT * FROM match_events WHERE match_id = ? ORDER BY clock_ms, created_at')
    .all(id);
  return c.json({ match, lineup, events });
});

matches.post('/:id/start', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const m = db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as MatchRow | undefined;
  if (!m) return c.json({ error: 'not found' }, 404);
  if (m.status === 'running') return c.json({ ok: true });

  const now = Date.now();
  db.prepare(
    `UPDATE matches SET status='running', started_at = COALESCE(started_at, ?) WHERE id = ?`
  ).run(now, id);
  // mark session live
  db.prepare(`UPDATE sessions SET status='live' WHERE id = (SELECT session_id FROM matches WHERE id = ?) AND status='draft'`).run(id);

  const row = db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as MatchRow;
  return c.json(row);
});

matches.post('/:id/pause', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const m = db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as MatchRow | undefined;
  if (!m) return c.json({ error: 'not found' }, 404);
  if (m.status !== 'running') return c.json({ error: 'not running' }, 409);

  const now = Date.now();
  const startedAt = m.started_at ?? now;
  const newElapsed = m.elapsed_ms + (now - startedAt);
  db.prepare(
    `UPDATE matches SET status='paused', elapsed_ms=?, started_at=NULL WHERE id = ?`
  ).run(newElapsed, id);
  const row = db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as MatchRow;
  return c.json(row);
});

matches.post('/:id/resume', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const m = db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as MatchRow | undefined;
  if (!m) return c.json({ error: 'not found' }, 404);
  if (m.status !== 'paused') return c.json({ error: 'not paused' }, 409);

  db.prepare(
    `UPDATE matches SET status='running', started_at=? WHERE id = ?`
  ).run(Date.now(), id);
  const row = db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as MatchRow;
  return c.json(row);
});

const EndInput = z.object({
  result: z.enum(['a', 'b', 'draw']).optional(),
  winner_team_id: z.string().nullable().optional(),
});

matches.post('/:id/end', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const body = EndInput.parse(await c.req.json().catch(() => ({})));
  const m = db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as MatchRow | undefined;
  if (!m) return c.json({ error: 'not found' }, 404);

  const now = Date.now();
  let elapsed = m.elapsed_ms;
  if (m.status === 'running' && m.started_at) {
    elapsed += now - m.started_at;
  }

  let result = body.result ?? 'pending';
  let winner = body.winner_team_id ?? null;
  if (result === 'a') winner = m.team_a_id;
  else if (result === 'b') winner = m.team_b_id;
  else if (result === 'draw') winner = null;

  db.prepare(
    `UPDATE matches
     SET status='done', ended_at=?, elapsed_ms=?, started_at=NULL, result=?, winner_team_id=?
     WHERE id = ?`
  ).run(now, elapsed, result, winner, id);

  const row = db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as MatchRow;
  return c.json(row);
});

// Decide winner after match ends (manual override)
matches.post('/:id/result', async (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const body = EndInput.parse(await c.req.json());
  const m = db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as MatchRow | undefined;
  if (!m) return c.json({ error: 'not found' }, 404);

  let result = body.result ?? 'pending';
  let winner = body.winner_team_id ?? null;
  if (result === 'a') winner = m.team_a_id;
  else if (result === 'b') winner = m.team_b_id;
  else if (result === 'draw') winner = null;

  db.prepare(`UPDATE matches SET result=?, winner_team_id=? WHERE id = ?`).run(result, winner, id);
  const row = db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as MatchRow;
  return c.json(row);
});

export function computeClockMs(m: MatchRow, now: number = Date.now()): number {
  if (m.status === 'running' && m.started_at) {
    return m.elapsed_ms + (now - m.started_at);
  }
  return m.elapsed_ms;
}
