import { Hono } from 'hono';
import { ImportEnvelope, Player, uid } from '@racha/shared';
import { z } from 'zod';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { getDb } from '../db/index.js';

const AVATAR_DIR =
  process.env.AVATAR_DIR ||
  join(dirname(process.env.DB_PATH || join(process.cwd(), 'data', 'racha.db')), 'avatars');
mkdirSync(AVATAR_DIR, { recursive: true });

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};
const MAX_AVATAR_BYTES = 4 * 1024 * 1024;

function findAvatarFile(playerId: string): { path: string; mime: string } | null {
  for (const [mime, ext] of Object.entries(MIME_TO_EXT)) {
    const path = join(AVATAR_DIR, `${playerId}.${ext}`);
    if (existsSync(path)) return { path, mime };
  }
  return null;
}

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

// --- Avatars ---------------------------------------------------------------
// Avatars are stored on disk under /data/avatars (mounted volume) so they
// survive container rebuilds. Player JSON does not embed image data.

players.post('/:id/avatar', async (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const exists = db.prepare('SELECT 1 FROM players WHERE id = ?').get(id);
  if (!exists) return c.json({ error: 'not found' }, 404);

  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return c.json({ error: 'no file provided' }, 400);
  const ext = MIME_TO_EXT[file.type];
  if (!ext) return c.json({ error: 'unsupported image type' }, 400);
  if (file.size > MAX_AVATAR_BYTES) return c.json({ error: 'too large' }, 413);

  // Wipe any prior avatar (possibly with a different extension) so we don't
  // end up with stale orphans on the disk.
  const prior = findAvatarFile(id);
  if (prior) unlinkSync(prior.path);

  const buffer = Buffer.from(await file.arrayBuffer());
  writeFileSync(join(AVATAR_DIR, `${id}.${ext}`), buffer);
  return c.json({ ok: true, ext });
});

players.get('/:id/avatar', (c) => {
  const id = c.req.param('id');
  const file = findAvatarFile(id);
  if (!file) return c.notFound();
  const buffer = readFileSync(file.path);
  const stats = statSync(file.path);
  c.header('content-type', file.mime);
  c.header('cache-control', 'no-cache, must-revalidate');
  c.header('etag', `"${stats.mtime.getTime()}"`);
  return c.body(buffer);
});

players.delete('/:id/avatar', (c) => {
  const id = c.req.param('id');
  const file = findAvatarFile(id);
  if (file) unlinkSync(file.path);
  return c.json({ ok: true });
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
