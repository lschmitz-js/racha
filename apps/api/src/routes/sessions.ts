import { Hono } from 'hono';
import { z } from 'zod';
import { balanceTeams, type BalanceMode, type Player, uid, VESTS, type Vest } from '@racha/shared';
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
    role: row.role,
    skills: JSON.parse(row.skills_json),
    active: true,
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

  const player_ids = db
    .prepare('SELECT player_id FROM session_players WHERE session_id = ?')
    .all(id)
    .map((r: any) => r.player_id) as string[];

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

  return { session, player_ids, teams: fullTeams, matches };
}

sessions.get('/:id', (c) => {
  const id = c.req.param('id');
  const data = loadFullSession(id);
  if (!data) return c.json({ error: 'not found' }, 404);
  return c.json(data);
});

const CreateSessionInput = z.object({
  date: z.string().optional(),
  player_ids: z.array(z.string()).min(6),
});

sessions.post('/', async (c) => {
  const body = CreateSessionInput.parse(await c.req.json());
  const db = getDb();
  const id = uid();
  const date = body.date ?? todayIso();
  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO sessions (id, date, status, created_at) VALUES (?, ?, 'draft', ?)`
    ).run(id, date, Date.now());
    const insSP = db.prepare(
      `INSERT INTO session_players (session_id, player_id) VALUES (?, ?)`
    );
    for (const pid of body.player_ids) insSP.run(id, pid);
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

  const playerRows = db
    .prepare(
      `SELECT p.* FROM players p
       INNER JOIN session_players sp ON sp.player_id = p.id
       WHERE sp.session_id = ?`
    )
    .all(id) as PlayerRow[];
  const players = playerRows.map(loadPlayer);

  const balanced = balanceTeams(players, body.randomize, body.mode as BalanceMode);

  const tx = db.transaction(() => {
    // Replace any prior draw for this session
    db.prepare('DELETE FROM session_teams WHERE session_id = ?').run(id);
    const insTeam = db.prepare(
      `INSERT INTO session_teams (id, session_id, vest) VALUES (?, ?, ?)`
    );
    const insTP = db.prepare(
      `INSERT INTO session_team_players (session_team_id, player_id) VALUES (?, ?)`
    );
    for (const t of balanced) {
      const tid = uid();
      insTeam.run(tid, id, t.vest);
      for (const p of t.players) insTP.run(tid, p.id);
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
    db.prepare(
      `DELETE FROM session_team_players
       WHERE player_id = ?
         AND session_team_id IN (SELECT id FROM session_teams WHERE session_id = ?)`
    ).run(body.player_id, id);
    db.prepare(
      'INSERT OR IGNORE INTO session_team_players (session_team_id, player_id) VALUES (?, ?)'
    ).run(teamId, body.player_id);
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

  db.prepare(
    'DELETE FROM session_team_players WHERE session_team_id = ? AND player_id = ?'
  ).run(teamId, playerId);

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
         SUM(CASE WHEN e.type='save' THEN 1 ELSE 0 END) AS saves
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
