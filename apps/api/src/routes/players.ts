import { Hono } from 'hono';
import { ImportEnvelope, Player, uid } from '@racha/shared';
import { z } from 'zod';
import { randomBytes } from 'node:crypto';
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
import { hashPassword, destroyUserSessions, type AppVariables } from '../auth.js';

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

function newEmergencyToken(): string {
  return randomBytes(18).toString('base64url');
}

// RFC-4180 CSV cell. Also neutralizes spreadsheet formula injection: a value
// starting with = + - @ (or a tab/CR) is prefixed with an apostrophe so Excel /
// Sheets treat player-submitted text as data, never as an executable formula.
function csvCell(v: unknown): string {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Player ids are server-generated (uid) or come from an admin import; restrict
// them to a safe charset before they ever touch a filesystem path, so a crafted
// id like "../../secret" can't escape AVATAR_DIR (path traversal).
const SAFE_PLAYER_ID = /^[A-Za-z0-9_-]+$/;

function findAvatarFile(playerId: string): { path: string; mime: string } | null {
  if (!SAFE_PLAYER_ID.test(playerId)) return null;
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
  is_admin: number;
  created_at: number;
};

// `includeAdmin` gates the is_admin flag: only authenticated admins see who is
// an admin, so an unauthenticated caller of GET /players can't enumerate admin
// accounts to target for login. Write handlers (admin-only) pass the default.
function rowToPlayer(r: PlayerRow, includeAdmin = true): Player {
  return {
    id: r.id,
    name: r.name,
    type: r.type,
    skills: JSON.parse(r.skills_json),
    active: !!r.active,
    is_admin: includeAdmin ? !!r.is_admin : false,
  };
}

// Detect real image content from magic bytes, so a spoofed Content-Type can't
// slip a non-image (or an SVG) past the MIME whitelist.
function sniffImageExt(buf: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47
  )
    return 'png';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP')
    return 'webp';
  return null;
}

export const players = new Hono<{ Variables: AppVariables }>();

players.get('/', (c) => {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM players ORDER BY name').all() as PlayerRow[];
  const isAdmin = !!c.get('user');
  return c.json(rows.map((r) => rowToPlayer(r, isAdmin)));
});

// --- Emergency contacts (admin) --------------------------------------------
// These routes expose sensitive PII and the private per-player token, so they
// are admin-gated in server.ts (the generic /api/players/* gate lets GETs
// through, so these paths get an explicit requireAdmin there).

// Which players have already submitted their emergency contact. Drives the
// "missing" badge admins use to chase people up. Returns { [playerId]: true }.
players.get('/emergency-status', (c) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT player_id FROM player_emergency
       WHERE contact_name IS NOT NULL AND TRIM(contact_name) <> ''`
    )
    .all() as Array<{ player_id: string }>;
  const filled: Record<string, boolean> = {};
  for (const r of rows) filled[r.player_id] = true;
  return c.json(filled);
});

// CSV of every active player's emergency contact (admin), including players who
// have not filled it in yet (blank row) so gaps are visible. UTF-8 BOM is
// prepended so Excel opens accented names correctly.
players.get('/emergency-export', (c) => {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT p.name, e.player_phone, e.contact_name, e.contact_phone,
              e.relationship, e.medical_notes, e.updated_at
       FROM players p
       LEFT JOIN player_emergency e ON e.player_id = p.id
       WHERE p.active = 1
       ORDER BY p.name`
    )
    .all() as Array<{
    name: string;
    player_phone: string | null;
    contact_name: string | null;
    contact_phone: string | null;
    relationship: string | null;
    medical_notes: string | null;
    updated_at: number | null;
  }>;

  const header = [
    'Player',
    'Player Phone',
    'Contact Name',
    'Contact Phone',
    'Relationship',
    'Medical Notes',
    'Submitted',
    'Last Updated',
  ];
  const lines = [header.map(csvCell).join(',')];
  for (const r of rows) {
    const submitted = !!(r.contact_name && r.contact_name.trim());
    lines.push(
      [
        r.name,
        r.player_phone,
        r.contact_name,
        r.contact_phone,
        r.relationship,
        r.medical_notes,
        submitted ? 'yes' : 'no',
        r.updated_at ? new Date(r.updated_at).toISOString() : '',
      ]
        .map(csvCell)
        .join(',')
    );
  }
  const csv = '﻿' + lines.join('\r\n') + '\r\n';
  const date = new Date().toISOString().slice(0, 10);
  c.header('content-type', 'text/csv; charset=utf-8');
  c.header('content-disposition', `attachment; filename="emergency_contacts_${date}.csv"`);
  return c.body(csv);
});

// One player's private link token + their submitted contact (for admin view).
// Backfills a token if somehow missing so the link is always shareable.
players.get('/:id/emergency', (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const p = db
    .prepare('SELECT id, emergency_token FROM players WHERE id = ?')
    .get(id) as { id: string; emergency_token: string | null } | undefined;
  if (!p) return c.json({ error: 'not found' }, 404);
  let token = p.emergency_token;
  if (!token) {
    token = newEmergencyToken();
    db.prepare('UPDATE players SET emergency_token = ? WHERE id = ?').run(token, id);
  }
  const contact =
    db
      .prepare(
        `SELECT player_phone, contact_name, contact_phone, relationship, medical_notes, updated_at
         FROM player_emergency WHERE player_id = ?`
      )
      .get(id) ?? null;
  return c.json({ token, contact });
});

// Rotate a player's emergency link: issue a fresh token so any previously
// shared /e/<token> link stops resolving. Admin-only (write gate). The
// submitted contact data itself is kept.
players.post('/:id/emergency/rotate', (c) => {
  const id = c.req.param('id');
  if (!SAFE_PLAYER_ID.test(id)) return c.json({ error: 'invalid id' }, 400);
  const db = getDb();
  const exists = db.prepare('SELECT 1 FROM players WHERE id = ?').get(id);
  if (!exists) return c.json({ error: 'not found' }, 404);
  const token = newEmergencyToken();
  db.prepare('UPDATE players SET emergency_token = ? WHERE id = ?').run(token, id);
  return c.json({ token });
});

const PlayerInput = z.object({
  name: z.string().min(1),
  type: z.enum(['season', 'dropin']),
  skills: z.array(z.number().int().min(1).max(5)).length(8),
  active: z.boolean().optional().default(true),
  // Admin management (optional). `password` is write-only and, when present,
  // is hashed with scrypt; it is never read back.
  is_admin: z.boolean().optional(),
  password: z.string().min(8).max(200).optional(),
});

players.post('/', async (c) => {
  const body = PlayerInput.parse(await c.req.json());
  const id = uid();
  const db = getDb();
  const isAdmin = body.is_admin ? 1 : 0;
  const passwordHash = body.password ? await hashPassword(body.password) : null;
  db.prepare(
    `INSERT INTO players (id, name, type, role, skills_json, active, emergency_token, is_admin, password_hash, created_at)
     VALUES (?, ?, ?, 'player', ?, ?, ?, ?, ?, ?)`
  ).run(
    id,
    body.name,
    body.type,
    JSON.stringify(body.skills),
    body.active ? 1 : 0,
    newEmergencyToken(),
    isAdmin,
    passwordHash,
    Date.now()
  );
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
    `UPDATE players SET name=?, type=?, skills_json=?, active=? WHERE id=?`
  ).run(body.name, body.type, JSON.stringify(body.skills), body.active ? 1 : 0, id);

  // Admin flag / password are only touched when explicitly provided. Turning a
  // player into a non-admin clears their password and revokes live sessions;
  // setting a new password also revokes existing sessions.
  if (body.is_admin === false) {
    db.prepare('UPDATE players SET is_admin = 0, password_hash = NULL WHERE id = ?').run(id);
    destroyUserSessions(id);
  } else if (body.is_admin === true) {
    db.prepare('UPDATE players SET is_admin = 1 WHERE id = ?').run(id);
  }
  if (body.password) {
    const hash = await hashPassword(body.password);
    db.prepare('UPDATE players SET password_hash = ? WHERE id = ?').run(hash, id);
    destroyUserSessions(id);
  }

  const row = db.prepare('SELECT * FROM players WHERE id = ?').get(id) as PlayerRow;
  return c.json(rowToPlayer(row));
});

players.delete('/:id', (c) => {
  const id = c.req.param('id');
  const db = getDb();
  // Soft delete the player to preserve historical event references, but hard
  // delete their emergency contact so sensitive health PII is not retained for
  // someone who has left the group. The dead soft-deleted player also means
  // their link no longer resolves (playerByToken requires active = 1).
  const res = db.prepare('UPDATE players SET active = 0 WHERE id = ?').run(id);
  if (res.changes === 0) return c.json({ error: 'not found' }, 404);
  db.prepare('DELETE FROM player_emergency WHERE player_id = ?').run(id);
  // A removed player can no longer log in: clear admin rights and any sessions.
  db.prepare('UPDATE players SET is_admin = 0, password_hash = NULL WHERE id = ?').run(id);
  destroyUserSessions(id);
  return c.json({ ok: true });
});

players.post('/import', async (c) => {
  const body = ImportEnvelope.parse(await c.req.json());
  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO players (id, name, type, role, skills_json, active, emergency_token, created_at)
     VALUES (@id, @name, @type, 'player', @skills_json, 1, @emergency_token, @created_at)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name,
       type = excluded.type,
       skills_json = excluded.skills_json,
       active = 1`
  );
  const tx = db.transaction((rows: typeof body.db) => {
    for (const r of rows) {
      upsert.run({
        id: r.id,
        name: r.name,
        type: r.type,
        skills_json: JSON.stringify(r.skills),
        emergency_token: newEmergencyToken(),
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
  if (!SAFE_PLAYER_ID.test(id)) return c.json({ error: 'invalid id' }, 400);
  const db = getDb();
  const exists = db.prepare('SELECT 1 FROM players WHERE id = ?').get(id);
  if (!exists) return c.json({ error: 'not found' }, 404);

  const body = await c.req.parseBody();
  const file = body.file;
  if (!(file instanceof File)) return c.json({ error: 'no file provided' }, 400);
  const ext = MIME_TO_EXT[file.type];
  if (!ext) return c.json({ error: 'unsupported image type' }, 400);
  if (file.size > MAX_AVATAR_BYTES) return c.json({ error: 'too large' }, 413);

  // Verify the actual bytes are one of our allowed image types and match the
  // declared type — a spoofed Content-Type alone is not trusted.
  const buffer = Buffer.from(await file.arrayBuffer());
  const sniffed = sniffImageExt(buffer);
  if (!sniffed || sniffed !== ext) {
    return c.json({ error: 'file content is not a valid image of the declared type' }, 400);
  }

  // Wipe any prior avatar (possibly with a different extension) so we don't
  // end up with stale orphans on the disk.
  const prior = findAvatarFile(id);
  if (prior) unlinkSync(prior.path);

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
      skills: JSON.parse(r.skills_json),
    })),
    weekIds: [] as string[],
  });
});
