import { Hono } from 'hono';
import { z } from 'zod';
import {
  balanceTeams,
  type BalanceMode,
  type Player,
  uid,
  VESTS,
  type Vest,
  MIN_PLAYERS,
} from '@racha/shared';
import { getDb } from '../db/index.js';

type SessionRow = {
  id: string;
  date: string;
  status: 'draft' | 'live' | 'done';
  notes: string | null;
  created_at: number;
  ended_at: number | null;
};

type PlayerRow = {
  id: string;
  name: string;
  type: 'season' | 'dropin';
  role: 'player' | 'gk';
  skills_json: string;
};

function loadPlayer(row: PlayerRow): Player {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    skills: JSON.parse(row.skills_json),
    active: true,
    is_admin: false,
  };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export const sessions = new Hono();

sessions.get('/', (c) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM sessions ORDER BY date DESC, created_at DESC').all() as SessionRow[];
  return c.json(rows);
});

sessions.get('/active', (c) => {
  const db = getDb();
  const row = db
    .prepare(`SELECT * FROM sessions WHERE status IN ('draft','live') ORDER BY created_at DESC LIMIT 1`)
    .get() as SessionRow | undefined;
  return c.json(row ?? null);
});

function loadFullSession(id: string) {
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
  if (!session) return null;

  const spRows = db
    .prepare('SELECT player_id, arrived FROM session_players WHERE session_id = ?')
    .all(id) as { player_id: string; arrived: number }[];
  const player_ids = spRows.map((r) => r.player_id);
  const late_player_ids = spRows.filter((r) => !r.arrived).map((r) => r.player_id);

  const teams = db
    .prepare('SELECT id, vest FROM session_teams WHERE session_id = ?')
    .all(id) as { id: string; vest: Vest }[];

  const teamPlayers = db.prepare(
    'SELECT player_id FROM session_team_players WHERE session_team_id = ?'
  );
  const fullTeams = teams.map((t) => ({
    id: t.id,
    vest: t.vest,
    player_ids: teamPlayers.all(t.id).map((r: any) => r.player_id) as string[],
  }));

  const matches = db
    .prepare('SELECT * FROM matches WHERE session_id = ? ORDER BY ordinal')
    .all(id);

  return { session, player_ids, late_player_ids, teams: fullTeams, matches };
}

sessions.get('/:id', (c) => {
  const id = c.req.param('id');
  const data = loadFullSession(id);
  if (!data) return c.json({ error: 'not found' }, 404);
  return c.json(data);
});

const CreateSessionInput = z.object({
  date: z.string().optional(),
  player_ids: z.array(z.string()).min(MIN_PLAYERS),
  // Subset of player_ids who are expected tonight but haven't arrived yet.
  // They join the session roster with arrived=0 and stay out of draws.
  late_ids: z.array(z.string()).default([]),
});

sessions.post('/', async (c) => {
  const body = CreateSessionInput.parse(await c.req.json());
  const db = getDb();

  // Block creating a new session while one is already active.
  const active = db
    .prepare(`SELECT id FROM sessions WHERE status IN ('draft','live') LIMIT 1`)
    .get();
  if (active) {
    return c.json(
      { error: 'an active session already exists', activeId: (active as any).id },
      409
    );
  }

  const id = uid();
  const date = body.date ?? todayIso();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO sessions (id, date, status, created_at) VALUES (?, ?, 'draft', ?)`
    ).run(id, date, Date.now());
    const late = new Set(body.late_ids);
    const insSP = db.prepare(
      `INSERT INTO session_players (session_id, player_id, arrived) VALUES (?, ?, ?)`
    );
    for (const pid of body.player_ids) insSP.run(id, pid, late.has(pid) ? 0 : 1);
  });
  tx();
  return c.json({ id }, 201);
});

const DrawInput = z.object({
  randomize: z.boolean().default(false),
  mode: z.enum(['normal', 'dropin-split']).default('normal'),
});

sessions.post('/:id/draw', async (c) => {
  const id = c.req.param('id');
  const body = DrawInput.parse(await c.req.json().catch(() => ({})));
  const db = getDb();
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
  if (!session) return c.json({ error: 'not found' }, 404);

  // Late players (arrived=0) stay out of the draw; they get assigned to a
  // team by hand once they show up.
  const playerRows = db
    .prepare(
      `SELECT p.* FROM players p
       INNER JOIN session_players sp ON sp.player_id = p.id
       WHERE sp.session_id = ? AND sp.arrived = 1`
    )
    .all(id) as PlayerRow[];
  const players = playerRows.map(loadPlayer);

  let balanced;
  try {
    balanced = balanceTeams(players, body.randomize, body.mode as BalanceMode);
  } catch (err: any) {
    return c.json({ error: err?.message ?? 'draw failed' }, 400);
  }

  const existingTeams = db
    .prepare('SELECT id, vest FROM session_teams WHERE session_id = ?')
    .all(id) as { id: string; vest: Vest }[];

  const tx = db.transaction(() => {
    const insTP = db.prepare(
      `INSERT INTO session_team_players (session_team_id, player_id) VALUES (?, ?)`
    );
    if (existingTeams.length === 3) {
      // Redraw: matches/events may reference these team rows, so keep them
      // (same ids, same vests) and only swap the rosters.
      const teamIdByVest = new Map(existingTeams.map((t) => [t.vest, t.id]));
      db.prepare(
        `DELETE FROM session_team_players
         WHERE session_team_id IN (SELECT id FROM session_teams WHERE session_id = ?)`
      ).run(id);
      for (const t of balanced) {
        const tid = teamIdByVest.get(t.vest)!;
        for (const p of t.players) insTP.run(tid, p.id);
      }
    } else {
      // First draw (or partial leftovers from an older bug): rebuild teams.
      db.prepare('DELETE FROM session_teams WHERE session_id = ?').run(id);
      const insTeam = db.prepare(
        `INSERT INTO session_teams (id, session_id, vest) VALUES (?, ?, ?)`
      );
      for (const t of balanced) {
        const tid = uid();
        insTeam.run(tid, id, t.vest);
        for (const p of t.players) insTP.run(tid, p.id);
      }
    }
  });
  tx();

  const data = loadFullSession(id);
  if (!data) return c.json({ error: 'not found' }, 404);
  return c.json(data);
});

sessions.post('/:id/start', (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const res = db
    .prepare(`UPDATE sessions SET status='live' WHERE id = ? AND status='draft'`)
    .run(id);
  if (res.changes === 0) return c.json({ error: 'not draft' }, 409);
  return c.json({ ok: true });
});

sessions.post('/:id/end', (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const res = db
    .prepare(`UPDATE sessions SET status='done', ended_at=? WHERE id = ?`)
    .run(Date.now(), id);
  if (res.changes === 0) return c.json({ error: 'not found' }, 404);
  return c.json({ ok: true });
});

sessions.delete('/:id', (c) => {
  const id = c.req.param('id');
  const db = getDb();
  db.prepare('DELETE FROM sessions WHERE id = ?').run(id);
  return c.json({ ok: true });
});

// Flip the arrived flag for a session player (late arrivals checking in).
const ArrivalInput = z.object({ arrived: z.boolean().default(true) });

sessions.post('/:id/players/:playerId/arrival', async (c) => {
  const id = c.req.param('id');
  const playerId = c.req.param('playerId');
  const body = ArrivalInput.parse(await c.req.json().catch(() => ({})));
  const db = getDb();
  const res = db
    .prepare('UPDATE session_players SET arrived = ? WHERE session_id = ? AND player_id = ?')
    .run(body.arrived ? 1 : 0, id, playerId);
  if (res.changes === 0) return c.json({ error: 'not in session' }, 404);
  const data = loadFullSession(id);
  return c.json(data);
});

// Assign a player to a vest team within a session. Atomically ensures the
// player is in session_players, removes them from any other team in the same
// session, then adds them to this team. Acts as both add and move.
const AssignToTeamInput = z.object({ player_id: z.string() });

sessions.post('/:id/teams/:teamId/players', async (c) => {
  const id = c.req.param('id');
  const teamId = c.req.param('teamId');
  const body = AssignToTeamInput.parse(await c.req.json());
  const db = getDb();

  const team = db
    .prepare('SELECT id FROM session_teams WHERE id = ? AND session_id = ?')
    .get(teamId, id);
  if (!team) return c.json({ error: 'team not found' }, 404);

  const player = db.prepare('SELECT id FROM players WHERE id = ?').get(body.player_id);
  if (!player) return c.json({ error: 'player not found' }, 404);

  const tx = db.transaction(() => {
    db.prepare('INSERT OR IGNORE INTO session_players (session_id, player_id) VALUES (?, ?)')
      .run(id, body.player_id);
    // Being put on a team means the player is here.
    db.prepare('UPDATE session_players SET arrived = 1 WHERE session_id = ? AND player_id = ?')
      .run(id, body.player_id);
    db.prepare(
      `DELETE FROM session_team_players
       WHERE player_id = ?
         AND session_team_id IN (SELECT id FROM session_teams WHERE session_id = ?)`
    ).run(body.player_id, id);
    db.prepare(
      'INSERT OR IGNORE INTO session_team_players (session_team_id, player_id) VALUES (?, ?)'
    ).run(teamId, body.player_id);

    // Keep match_players in sync for any in-progress match whose playing teams
    // include the destination vest. New team_id wins so matches_played and
    // the live roster reflect the move.
    const liveMatches = db
      .prepare(
        `SELECT id, team_a_id, team_b_id FROM matches
         WHERE session_id = ? AND status != 'done'`
      )
      .all(id) as Array<{ id: string; team_a_id: string; team_b_id: string }>;
    const upsertMP = db.prepare(
      `INSERT INTO match_players (match_id, player_id, team_id, starting)
       VALUES (?, ?, ?, 0)
       ON CONFLICT(match_id, player_id) DO UPDATE SET team_id = excluded.team_id`
    );
    for (const lm of liveMatches) {
      if (lm.team_a_id === teamId || lm.team_b_id === teamId) {
        upsertMP.run(lm.id, body.player_id, teamId);
      }
    }
  });
  tx();

  const data = loadFullSession(id);
  return c.json(data);
});

sessions.delete('/:id/teams/:teamId/players/:playerId', (c) => {
  const id = c.req.param('id');
  const teamId = c.req.param('teamId');
  const playerId = c.req.param('playerId');
  const db = getDb();

  const team = db
    .prepare('SELECT id FROM session_teams WHERE id = ? AND session_id = ?')
    .get(teamId, id);
  if (!team) return c.json({ error: 'team not found' }, 404);

  // Uninvite from the whole session — otherwise a redraw would pull the player
  // back in from session_players. Also wipe from every team in this session in
  // case they were somehow on more than one.
  const tx = db.transaction(() => {
    db.prepare(
      `DELETE FROM session_team_players
       WHERE player_id = ?
         AND session_team_id IN (SELECT id FROM session_teams WHERE session_id = ?)`
    ).run(playerId, id);
    db.prepare(
      'DELETE FROM session_players WHERE session_id = ? AND player_id = ?'
    ).run(id, playerId);
  });
  tx();

  const data = loadFullSession(id);
  return c.json(data);
});

// Session leaderboard (the night's recap)
sessions.get('/:id/recap', (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT
         p.id, p.name, p.role,
         SUM(CASE WHEN e.type='goal' THEN 1 ELSE 0 END) AS goals,
         SUM(CASE WHEN e.type='assist' THEN 1 ELSE 0 END) AS assists,
         SUM(CASE WHEN e.type='beautiful' THEN 1 ELSE 0 END) AS beautiful,
         SUM(CASE WHEN e.type='bad' THEN 1 ELSE 0 END) AS bad,
         SUM(CASE WHEN e.type='save' THEN 1 ELSE 0 END) AS saves,
         SUM(CASE WHEN e.type='caneta' THEN 1 ELSE 0 END) AS canetas,
         SUM(CASE WHEN e.type='quasegol' THEN 1 ELSE 0 END) AS quasegols
       FROM players p
       INNER JOIN match_events e ON e.player_id = p.id
       INNER JOIN matches m ON m.id = e.match_id
       WHERE m.session_id = ?
       GROUP BY p.id, p.name, p.role
       ORDER BY goals DESC, assists DESC, p.name`
    )
    .all(id);
  return c.json(rows);
});
