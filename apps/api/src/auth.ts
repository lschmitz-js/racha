import { scrypt as _scrypt, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { uid } from '@racha/shared';
import { getDb } from './db/index.js';

const scrypt = promisify(_scrypt) as (
  password: string | Buffer,
  salt: Buffer,
  keylen: number
) => Promise<Buffer>;

// Sessions live 30 days; each request refreshes nothing (fixed expiry keeps it
// simple), and logout / rotation revoke immediately by deleting the row.
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;

export type AuthUser = { id: string; name: string; master: boolean };

// A caller authenticated by the day's session code (not an admin login). Allowed
// to run the live game, but never an admin action or a finished-game edit.
export const OPERATOR_ID = '__operator__';
export const isOperatorUser = (u: AuthUser | null | undefined): boolean =>
  !!u && u.id === OPERATOR_ID;
export const isRealAdmin = (u: AuthUser | null | undefined): boolean =>
  !!u && u.id !== OPERATOR_ID;

// Per-request context variables shared by the server middleware and routes.
export type AppVariables = { user: AuthUser | null; auditName?: string };

// --- Passwords (scrypt, no native dependency) ------------------------------

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const dk = await scrypt(pw, salt, 32);
  return `scrypt$${salt.toString('base64')}$${dk.toString('base64')}`;
}

// A throwaway salt used to burn an equivalent scrypt on the failure path so a
// missing/invalid stored hash can't be told apart from a wrong password by
// response timing (defeats username enumeration).
const DUMMY_SALT = randomBytes(16);

export async function verifyPassword(pw: string, stored: string | null | undefined): Promise<boolean> {
  const [scheme, saltB64, hashB64] = (stored ?? '').split('$');
  if (scheme !== 'scrypt' || !saltB64 || !hashB64) {
    await scrypt(pw, DUMMY_SALT, 32); // constant-work miss path
    return false;
  }
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(hashB64, 'base64');
  const dk = await scrypt(pw, salt, expected.length);
  return dk.length === expected.length && timingSafeEqual(dk, expected);
}

// --- Session tokens (server-side, revocable) -------------------------------

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createSession(user: { id: string; name: string }): string {
  const token = randomBytes(32).toString('base64url');
  const now = Date.now();
  getDb()
    .prepare(
      `INSERT INTO auth_sessions (token_hash, user_id, user_name, created_at, expires_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(hashToken(token), user.id, user.name, now, now + SESSION_TTL_MS);
  return token;
}

export function destroySession(token: string): void {
  getDb().prepare('DELETE FROM auth_sessions WHERE token_hash = ?').run(hashToken(token));
}

// Revoke every active session for a user (e.g. when their admin rights or
// password change, or they are removed).
export function destroyUserSessions(userId: string): void {
  getDb().prepare('DELETE FROM auth_sessions WHERE user_id = ?').run(userId);
}

export function sessionUser(token: string): AuthUser | null {
  const row = getDb()
    .prepare('SELECT user_id, user_name, expires_at FROM auth_sessions WHERE token_hash = ?')
    .get(hashToken(token)) as
    | { user_id: string; user_name: string; expires_at: number }
    | undefined;
  if (!row) return null;
  if (row.expires_at <= Date.now()) {
    destroySession(token);
    return null;
  }
  return { id: row.user_id, name: row.user_name, master: false };
}

export function purgeExpiredSessions(): void {
  getDb().prepare('DELETE FROM auth_sessions WHERE expires_at <= ?').run(Date.now());
}

// --- Audit log -------------------------------------------------------------

export function logAudit(e: {
  user_id: string;
  user_name: string;
  action: string;
  path: string;
  status: number;
  detail?: string | null;
}): void {
  try {
    getDb()
      .prepare(
        `INSERT INTO audit_log (id, user_id, user_name, action, path, status, detail, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(uid(), e.user_id, e.user_name, e.action, e.path, e.status, e.detail ?? null, Date.now());
  } catch (err) {
    // Auditing must never break the request it is recording.
    console.error('[racha] audit write failed:', err);
  }
}
