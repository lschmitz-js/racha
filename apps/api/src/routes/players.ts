import { Hono } from 'hono';
import { ImportEnvelope, Player, uid } from '@racha/shared';
import { z } from 'zod';
import { getDb } from '../db/index.js';

type PlayerRow = {
  id: string;
  name: string;
  type: 'season' | 'dropin';
  role: 'player' | 'gk';
  skills_json: string;
  active: number;
  created_at: number;
};

function rowToPlayer(r: PlayerRow): Player {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    role: r.role,
    skills: JSON.parse(r.skills_json),
    active: !!r.active,
  };
}

export const players = new Hono();

players.get('/', (c) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM players ORDER BY name').all() as PlayerRow[];
  return c.json(rows.map(rowToPlayer));
});

const PlayerInput = z.object({
  name: z.string().min(1),
  type: z.enum(['season', 'dropin']),
  role: z.enum(['player', 'gk']),
  skills: z.array(z.number().int().min(1).max(5)).length(8),
  active: z.boolean().optional().default(true),
});

players.post('/', async (c) => {
  const body = PlayerInput.parse(await c.req.json());
  const id = uid();
  const db = getDb();
  db.prepare(
    `INSERT INTO players (id, name, type, role, skills_json, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(id, body.name, body.type, body.role, JSON.stringify(body.skills), body.active ? 1 : 0, Date.now());
  const row = db.prepare('SELECT * FROM players WHERE id = ?').get(id) as PlayerRow;
  return c.json(rowToPlayer(row), 201);
});

players.put('/:id', async (c) => {
  const id = c.req.param('id');
  const body = PlayerInput.parse(await c.req.json());
  const db = getDb();
  const existing = db.prepare('SELECT id FROM players WHERE id = ?').get(id);
  if (!existing) return c.json({ error: 'not found' }, 404);
  db.prepare(
    `UPDATE players SET name=?, type=?, role=?, skills_json=?, active=? WHERE id=?`
  ).run(body.name, body.type, body.role, JSON.stringify(body.skills), body.active ? 1 : 0, id);
  const row = db.prepare('SELECT * FROM players WHERE id = ?').get(id) as PlayerRow;
  return c.json(rowToPlayer(row));
});

players.delete('/:id', (c) => {
  const id = c.req.param('id');
  const db = getDb();
  // soft delete to preserve historical event references
  const res = db.prepare('UPDATE players SET active = 0 WHERE id = ?').run(id);
  if (res.changes === 0) return c.json({ error: 'not found' }, 404);
  return c.json({ ok: true });
});

players.post('/import', async (c) => {
  const body = ImportEnvelope.parse(await c.req.json());
  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO players (id, name, type, role, skills_json, active, created_at)
     VALUES (@id, @name, @type, @role, @skills_json, 1, @created_at)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       type = excluded.type,
       role = excluded.role,
       skills_json = excluded.skills_json,
       active = 1`
  );
  const tx = db.transaction((rows: typeof body.db) => {
    for (const r of rows) {
      upsert.run({
        id: r.id,
        name: r.name,
        type: r.type,
        role: r.role,
        skills_json: JSON.stringify(r.skills),
        created_at: Date.now(),
      });
    }
  });
  tx(body.db);
  return c.json({ ok: true, imported: body.db.length });
});

players.get('/export', (c) => {
  const db = getDb();
  const rows = db
    .prepare('SELECT * FROM players WHERE active = 1 ORDER BY name')
    .all() as PlayerRow[];
  return c.json({
    db: rows.map((r) => ({
      id: r.id,
      name: r.name,
      type: r.type,
      role: r.role,
      skills: JSON.parse(r.skills_json),
    })),
    weekIds: [] as string[],
  });
});
