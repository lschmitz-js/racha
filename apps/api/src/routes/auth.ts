import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/index.js';
import { verifyPassword, createSession, destroySession, type AppVariables } from '../auth.js';

// Login / logout for per-user admin auth. `/api/auth/login` is intentionally
// left open by the global write gate (it is how you obtain a session); it is
// still covered by the general and login-specific rate limits in server.ts.
export const auth = new Hono<{ Variables: AppVariables }>();

const LoginInput = z.object({
  name: z.string().min(1),
  password: z.string().min(1),
});

auth.post('/login', async (c) => {
  const { name, password } = LoginInput.parse(await c.req.json());
  // Record the attempted name for the audit trail (success or failure).
  c.set('auditName', name);

  const row = getDb()
    .prepare(
      `SELECT id, name, password_hash
       FROM players
       WHERE name = ? AND is_admin = 1 AND active = 1`
    )
    .get(name) as { id: string; name: string; password_hash: string | null } | undefined;

  // Always run verifyPassword (even when no such admin) so the response time
  // does not reveal whether the name exists — see DUMMY_SALT in auth.ts.
  const ok = await verifyPassword(password, row?.password_hash ?? null);
  if (!row || !ok) {
    return c.json({ error: 'invalid credentials' }, 401);
  }

  const token = createSession({ id: row.id, name: row.name });
  // Attribute this successful request to the now-logged-in user in the audit.
  c.set('user', { id: row.id, name: row.name, master: false });
  return c.json({ token, user: { id: row.id, name: row.name, master: false } });
});

auth.post('/logout', (c) => {
  const provided = c.req.header('x-racha-token');
  if (provided) destroySession(provided); // no-op for the master token
  return c.json({ ok: true });
});
