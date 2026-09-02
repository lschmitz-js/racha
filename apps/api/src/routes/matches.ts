import { Hono } from 'hono';
import type { Context } from 'hono';
import { z } from 'zod';
import { uid } from '@racha/shared';
import { getDb } from '../db/index.js';
import { isFrozen, sessionStateByMatch } from '../session-guard.js';
import { isRealAdmin, type AppVariables } from '../auth.js';

// Match-clock changes are locked once the game day is over (see session-guard).
const FROZEN = { error: 'this game is finished — the clock is locked' } as const;
const matchFrozen = (matchId: string) => {
  const st = sessionStateByMatch(matchId);
  return st ? isFrozen(st.status, st.date) : false;
};
// Result/finalize on a finished game: allowed, but only for an admin (a stat
// correction). Returns a 403 response to send, or null to proceed.
function frozenAdminOnly(c: Context<{ Variables: AppVariables }>, matchId: string) {
  if (matchFrozen(matchId) && !isRealAdmin(c.get('user'))) {
    return c.json({ error: 'this game is finished — only an admin can change it' }, 403);
  }
  return null;
}

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

export const matches = new Hono<{ Variables: AppVariables }>();

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
    .prepare('SELECT status, date FROM sessions WHERE id = ?')
    .get(body.session_id) as { status: string; date: string } | undefined;
  if (!session) return c.json({ error: 'session not found' }, 404);
  if (isFrozen(session.status, session.date)) {
    return c.json({ error: 'this game is finished — no new matches' }, 409);
  }
  // One live match at a time: don't start a new one while another is still on
  // the clock. Stops duplicate matches piling up if someone taps "start next"
  // again from an already-finished match.
  const playing = db
    .prepare("SELECT id FROM matches WHERE session_id = ? AND status IN ('running','paused') LIMIT 1")
    .get(body.session_id);
  if (playing) return c.json({ error: 'finish the current match before starting a new one' }, 409);

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
    // The only rule: the winner keeps their side, and nothing is ever returned
    // to a previous team. If the team coming on (team B) is short of five, top it
    // up from the team going to the bench (the losers) — those players simply
    // join team B and stay. team A (the winner) is left exactly as it is.
    if (body.borrow && body.borrow.player_ids.length) {
      let needed = Math.max(0, 5 - (teamCount.get(body.team_b_id) as { c: number }).c);
      const inBench = new Set(
        (
          db
            .prepare('SELECT player_id FROM session_team_players WHERE session_team_id = ?')
            .all(body.bench_team_id) as { player_id: string }[]
        ).map((r) => r.player_id)
      );
      for (const pid of body.borrow.player_ids) {
        if (needed <= 0) break;
        if (!inBench.has(pid)) continue;
        moveToTeam(pid, body.team_b_id);
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
  if (matchFrozen(id)) return c.json(FROZEN, 409);
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
  if (matchFrozen(id)) return c.json(FROZEN, 409);
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
  if (matchFrozen(id)) return c.json(FROZEN, 409);
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
  const blocked = frozenAdminOnly(c, id);
  if (blocked) return blocked;

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
  const blocked = frozenAdminOnly(c, id);
  if (blocked) return blocked;

  let result = body.result ?? 'pending';
  let winner = body.winner_team_id ?? null;
  if (result === 'a') winner = m.team_a_id;
  else if (result === 'b') winner = m.team_b_id;
  else if (result === 'draw') winner = null;

  db.prepare(`UPDATE matches SET result=?, winner_team_id=? WHERE id = ?`).run(result, winner, id);
  const row = db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as MatchRow;
  return c.json(row);
});

// Undo an accidental "end": reopen a finished match (back to paused, result
// cleared) so the clock and stats can be edited again. Only the last match can
// be reopened — if a later match already exists, there'd be two open matches.
matches.post('/:id/reopen', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const m = db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as MatchRow | undefined;
  if (!m) return c.json({ error: 'not found' }, 404);
  if (matchFrozen(id)) return c.json(FROZEN, 409);
  const later = db
    .prepare('SELECT 1 FROM matches WHERE session_id = ? AND ordinal > ?')
    .get(m.session_id, m.ordinal);
  if (later) return c.json({ error: 'a later match already exists' }, 409);
  db.prepare(
    "UPDATE matches SET status='paused', result='pending', winner_team_id=NULL, ended_at=NULL WHERE id = ?"
  ).run(id);
  const row = db.prepare('SELECT * FROM matches WHERE id = ?').get(id) as MatchRow;
  return c.json(row);
});

// Delete a single match (admin tidy-up: a mis-created or test match). Its events
// and player snapshots cascade away; the remaining matches are renumbered so the
// "Match N" titles stay contiguous. A FINISHED match is locked once the game day
// is over (its stats are history); a not-yet-finished (pending/running/paused)
// match — a stray or mistake — can always be removed.
matches.delete('/:id', (c) => {
  const db = getDb();
  const id = c.req.param('id');
  const m = db.prepare('SELECT session_id, status FROM matches WHERE id = ?').get(id) as
    | { session_id: string; status: string }
    | undefined;
  if (!m) return c.json({ error: 'not found' }, 404);
  if (m.status === 'done' && matchFrozen(id)) return c.json(FROZEN, 409);

  const tx = db.transaction(() => {
    db.prepare('DELETE FROM matches WHERE id = ?').run(id); // cascades events + match_players
    // Renumber remaining matches 1..n. Bump to a temporary high range first so
    // the UNIQUE(session_id, ordinal) constraint can't collide mid-update.
    db.prepare('UPDATE matches SET ordinal = ordinal + 100000 WHERE session_id = ?').run(m.session_id);
    const rest = db
      .prepare('SELECT id FROM matches WHERE session_id = ? ORDER BY ordinal')
      .all(m.session_id) as Array<{ id: string }>;
    const upd = db.prepare('UPDATE matches SET ordinal = ? WHERE id = ?');
    rest.forEach((r, i) => upd.run(i + 1, r.id));
  });
  tx();
  return c.json({ ok: true });
});

export function computeClockMs(m: MatchRow, now: number = Date.now()): number {
  if (m.status === 'running' && m.started_at) {
    return m.elapsed_ms + (now - m.started_at);
  }
  return m.elapsed_ms;
}
