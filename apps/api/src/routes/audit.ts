import { Hono } from 'hono';
import { getDb } from '../db/index.js';

// Read-only audit trail for the admin History screen. Admin-gated in server.ts.
export const audit = new Hono();

type AuditRow = {
  id: string;
  user_id: string;
  user_name: string;
  action: string;
  path: string;
  status: number;
  detail: string | null;
  created_at: number;
};

audit.get('/', (c) => {
  const db = getDb();
  const userId = c.req.query('user');
  const limit = Math.min(Math.max(Number(c.req.query('limit') || 200), 1), 1000);

  const entries = (
    userId
      ? db
          .prepare(
            'SELECT * FROM audit_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?'
          )
          .all(userId, limit)
      : db.prepare('SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?').all(limit)
  ) as AuditRow[];

  // Distinct actors, for the filter dropdown.
  const users = db
    .prepare('SELECT user_id, user_name, MAX(created_at) AS last FROM audit_log GROUP BY user_id ORDER BY user_name')
    .all() as Array<{ user_id: string; user_name: string; last: number }>;

  return c.json({ entries, users });
});
