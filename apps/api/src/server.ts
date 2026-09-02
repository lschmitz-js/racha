import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { ZodError } from 'zod';
import { createHash, timingSafeEqual } from 'node:crypto';
import { serveStatic } from '@hono/node-server/serve-static';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDb } from './db/index.js';
import { players } from './routes/players.js';
import { sessions } from './routes/sessions.js';
import { matches } from './routes/matches.js';
import { events } from './routes/events.js';
import { stats } from './routes/stats.js';
import { emergency } from './routes/emergency.js';
import { auth as authRoutes } from './routes/auth.js';
import { audit as auditRoutes } from './routes/audit.js';
import { settings as settingsRoutes } from './routes/settings.js';
import { checkin } from './routes/checkin.js';
import {
  sessionUser,
  logAudit,
  purgeExpiredSessions,
  isRealAdmin,
  OPERATOR_ID,
  type AuthUser,
  type AppVariables,
} from './auth.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure /data directory exists for SQLite
const dbPath = process.env.DB_PATH || join(process.cwd(), 'data', 'racha.db');
mkdirSync(dirname(dbPath), { recursive: true });

// Open DB once on boot so schema is applied before any request.
getDb();

const app = new Hono<{ Variables: AppVariables }>();

// Central error handler: bad request bodies (Zod validation) become 400s with
// the validation issues; anything else is logged server-side and returned as a
// generic 500 so internal details never leak to clients.
app.onError((err, c) => {
  if (err instanceof ZodError) {
    return c.json({ error: 'invalid input', issues: err.issues }, 400);
  }
  console.error('[racha] unhandled error:', err);
  return c.json({ error: 'internal error' }, 500);
});

// Security response headers (defense-in-depth). `no-referrer` keeps the
// emergency link token out of the Referer header when a player follows a link
// from their form. HSTS is set here (not only at the edge) so a browser that
// reaches the site over HTTPS — which it always does, via Cloudflare/Caddy — is
// told to stick to HTTPS for a year. Browsers ignore HSTS over plain HTTP and on
// localhost, so this is safe in dev too. `includeSubDomains` scopes to
// racha.lbschmitz.ca and its subdomains only, never sibling hosts. No `preload`.
app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'no-referrer');
  c.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  await next();
});

// Request logger that redacts the emergency link token from the path, so the
// secret that guards a player's PII never lands in the logs.
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const path = c.req.path.replace(/(\/api\/emergency\/)[^/?]+/, '$1<token>');
  console.log(`${c.req.method} ${path} ${c.res.status} ${Date.now() - start}ms`);
});

// Per-IP fixed-window rate limit on the API to blunt abuse / DoS. Defaults are
// generous because many players share one public IP on the gym Wi-Fi (NAT); if
// legitimate bursts ever hit 429, raise RATE_LIMIT_MAX. Set RATE_LIMIT_MAX=0 to
// disable.
//
// The client IP is taken from `CF-Connecting-IP`, which Cloudflare sets to the
// real client and a client cannot forge (the origin only accepts Cloudflare
// traffic — the host does not publish port 8080). We deliberately do NOT trust
// `X-Forwarded-For`, which a direct caller could spoof to dodge the limit.
const RL_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 10_000);
const RL_MAX = Number(process.env.RATE_LIMIT_MAX || 300);
type Bucket = { count: number; resetAt: number };
const rlBuckets = new Map<string, Bucket>();
function clientKey(c: any): string {
  return (
    c.req.header('cf-connecting-ip') ||
    c.env?.incoming?.socket?.remoteAddress ||
    'unknown'
  );
}
if (RL_MAX > 0) {
  app.use('/api/*', async (c, next) => {
    const key = clientKey(c);
    const now = Date.now();
    let b = rlBuckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + RL_WINDOW_MS };
      rlBuckets.set(key, b);
    }
    b.count++;
    if (b.count > RL_MAX) {
      c.header('Retry-After', String(Math.ceil((b.resetAt - now) / 1000)));
      return c.json({ error: 'rate limited' }, 429);
    }
    return next();
  });
  // Drop expired buckets so the map can't grow unbounded. unref() keeps this
  // timer from holding the process open on shutdown.
  setInterval(() => {
    const now = Date.now();
    for (const [k, b] of rlBuckets) if (b.resetAt <= now) rlBuckets.delete(k);
  }, 60_000).unref();
}

// --- Authentication ---------------------------------------------------------
// Admins log in with their player name + password (server-side session token in
// the X-Racha-Token header). RACHA_TOKEN is the master break-glass: presenting
// it authenticates as the synthetic 'master' user even if the players DB is
// empty/unusable. Auth is required whenever RACHA_TOKEN is set; if it is unset
// the whole API stays open (local/dev only — never for a public host).
const TOKEN = process.env.RACHA_TOKEN;
const authRequired = !!TOKEN;
if (!TOKEN) {
  if (process.env.NODE_ENV === 'production') {
    console.error(
      '[racha] FATAL: RACHA_TOKEN is not set. Refusing to start unauthenticated in production. ' +
        'Set RACHA_TOKEN to a strong secret.'
    );
    process.exit(1);
  }
  console.warn(
    '[racha] WARNING: RACHA_TOKEN is not set — all write endpoints are UNAUTHENTICATED. ' +
      'Set RACHA_TOKEN to lock down a public deployment.'
  );
}

// Constant-time master-token check over fixed-length SHA-256 digests, so neither
// the token value nor its length leaks through response timing.
function masterTokenMatches(provided: string | undefined): boolean {
  if (!TOKEN) return false;
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(provided ?? ''), digest(TOKEN));
}

// Constant-time compare of two short codes over their SHA-256 digests.
function codeMatches(a: string, b: string): boolean {
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(a), digest(b));
}

// Resolve the caller: master token → 'master'; a valid session token → that
// player; otherwise the day's session code (x-racha-code) grants a synthetic
// 'operator' — valid only while it matches the one active (draft/live) session,
// so it expires when the organizer ends that session.
function resolveUser(c: any): AuthUser | null {
  const provided = c.req.header('x-racha-token');
  if (provided) {
    if (masterTokenMatches(provided)) return { id: 'master', name: 'master', master: true };
    const u = sessionUser(provided);
    if (u) return u;
  }
  const code = c.req.header('x-racha-code');
  if (code && /^\d{4}$/.test(code)) {
    const active = getDb()
      .prepare("SELECT code FROM sessions WHERE status IN ('draft','live') AND code IS NOT NULL LIMIT 1")
      .get() as { code: string } | undefined;
    if (active?.code && codeMatches(code, active.code)) {
      return { id: OPERATOR_ID, name: 'operator', master: false };
    }
  }
  return null;
}

// Truly public writes (no login, no code): the emergency self-service form and
// the weekly check-in / guest add.
const isPublicSelfService = (path: string) =>
  path.startsWith('/api/emergency/') ||
  path === '/api/checkin' ||
  path === '/api/checkin/guest';

// Running an OPEN (live) session — draw/adjust teams, run the clock, log stats.
// These accept the day's session code (operator) OR an admin, and each route
// locks itself once the session is frozen. Opening/closing a session, deleting a
// session or match, and editing a finished game still need a real admin, so
// those paths are NOT here.
const OPEN_SESSION_WRITES: RegExp[] = [
  /^\/api\/events(\/|$)/, // log / undo / (admin) edit stats
  /^\/api\/matches$/, // create the next match
  /^\/api\/matches\/[^/]+\/(start|pause|resume|end|result)$/, // clock + result
  /^\/api\/sessions\/[^/]+\/draw$/, // draw teams
  /^\/api\/sessions\/[^/]+\/teams\//, // assign / move / remove a player
  /^\/api\/sessions\/[^/]+\/players\/[^/]+\/arrival$/, // late-arrival flag
];
const isOperationalWrite = (path: string) => OPEN_SESSION_WRITES.some((re) => re.test(path));
const isReadMethod = (m: string) => m === 'GET' || m === 'HEAD' || m === 'OPTIONS';
const redactPath = (p: string) => p.replace(/(\/api\/emergency\/)[^/?]+/, '$1<token>');

// Attach the resolved user to the context for every API request (used by the
// gate, the audit log, and route handlers).
app.use('/api/*', async (c, next) => {
  c.set('user', resolveUser(c));
  await next();
});

// Audit: after each state-changing admin request, record who/what/when. Login
// attempts are recorded too (the login route sets `user` on success and
// `auditName` for the attempted identity). Player self-service submits and
// unauthenticated (blocked) writes are not audited.
app.use('/api/*', async (c, next) => {
  await next();
  if (isReadMethod(c.req.method)) return;
  const path = c.req.path;
  if (isPublicSelfService(path) || isOperationalWrite(path)) return;
  const user = c.get('user') as AuthUser | undefined;
  const isLogin = path === '/api/auth/login';
  if (!user && !isLogin) return;
  logAudit({
    user_id: user?.id ?? 'anon',
    user_name: user?.name ?? (c.get('auditName') as string) ?? 'anon',
    action: c.req.method,
    path: redactPath(path),
    status: c.res.status,
    detail: (c.get('auditName') as string) ?? null,
  });
});

// Stricter throttle specifically on login to slow credential brute-forcing,
// independent of the generous general API limit.
const LOGIN_MAX = Number(process.env.LOGIN_RATE_MAX || 10);
const LOGIN_WINDOW_MS = Number(process.env.LOGIN_RATE_WINDOW_MS || 60_000);
const loginBuckets = new Map<string, Bucket>();
if (authRequired && LOGIN_MAX > 0) {
  app.use('/api/auth/login', async (c, next) => {
    const key = clientKey(c);
    const now = Date.now();
    let b = loginBuckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + LOGIN_WINDOW_MS };
      loginBuckets.set(key, b);
    }
    b.count++;
    if (b.count > LOGIN_MAX) {
      c.header('Retry-After', String(Math.ceil((b.resetAt - now) / 1000)));
      return c.json({ error: 'too many attempts' }, 429);
    }
    return next();
  });
}

// Stricter throttle on the public guest self-add: creating records without a
// login is a spam surface, so cap it per client independently of the general
// limit (the per-game guest cap in the route is the hard ceiling on top).
const GUEST_MAX = Number(process.env.GUEST_RATE_MAX || 6);
const GUEST_WINDOW_MS = Number(process.env.GUEST_RATE_WINDOW_MS || 3_600_000);
const guestBuckets = new Map<string, Bucket>();
if (GUEST_MAX > 0) {
  app.use('/api/checkin/guest', async (c, next) => {
    if (c.req.method !== 'POST') return next();
    const key = clientKey(c);
    const now = Date.now();
    let b = guestBuckets.get(key);
    if (!b || b.resetAt <= now) {
      b = { count: 0, resetAt: now + GUEST_WINDOW_MS };
      guestBuckets.set(key, b);
    }
    b.count++;
    if (b.count > GUEST_MAX) {
      c.header('Retry-After', String(Math.ceil((b.resetAt - now) / 1000)));
      return c.json({ error: 'too many guest adds, try later' }, 429);
    }
    return next();
  });
}

// Any authenticated caller (a real admin OR the day's operator code).
const requireUser = async (c: any, next: any) => {
  if (!authRequired) return next();
  if (!c.get('user')) return c.json({ error: 'unauthorized' }, 401);
  return next();
};
// A real admin only — the operator code does not pass.
const requireAdmin = async (c: any, next: any) => {
  if (!authRequired) return next();
  if (!isRealAdmin(c.get('user'))) return c.json({ error: 'unauthorized' }, 401);
  return next();
};

if (authRequired) {
  // Admin-only GET reads (sensitive PII + the private link token + audit trail),
  // registered before the global gate so they short-circuit first.
  app.use('/api/players/emergency-status', requireAdmin);
  app.use('/api/players/emergency-export', requireAdmin);
  app.use('/api/players/:id/emergency', requireAdmin);
  app.use('/api/audit', requireAdmin);
  app.use('/api/audit/*', requireAdmin);
  // Fail-closed global write gate. Running an open session accepts the operator
  // code or an admin; everything else (opening/closing sessions, deleting,
  // roster/settings, finished-game edits) needs a real admin.
  app.use('/api/*', async (c, next) => {
    if (isReadMethod(c.req.method)) return next();
    if (isPublicSelfService(c.req.path)) return next();
    if (c.req.path === '/api/auth/login') return next();
    if (isOperationalWrite(c.req.path)) return requireUser(c, next);
    return requireAdmin(c, next);
  });
}

// Whether auth is configured and, for the presented token, who the caller is.
app.get('/api/auth/check', (c) => {
  const user = c.get('user') as AuthUser | undefined;
  const shape = user ? { id: user.id, name: user.name, master: user.master } : null;
  if (!authRequired) return c.json({ required: false, ok: true, user: shape });
  return c.json({ required: true, ok: !!user, user: shape });
});

// Periodically drop expired sessions.
setInterval(() => purgeExpiredSessions(), 60 * 60 * 1000).unref();

app.get('/api/health', (c) => c.json({ ok: true }));
app.route('/api/auth', authRoutes);
app.route('/api/audit', auditRoutes);
app.route('/api/settings', settingsRoutes);
app.route('/api/players', players);
app.route('/api/emergency', emergency);
app.route('/api/sessions', sessions);
app.route('/api/matches', matches);
app.route('/api/events', events);
app.route('/api/stats', stats);
app.route('/api/checkin', checkin);

// Static SPA fallback. Looks at apps/web/dist next to the api dist (production
// container layout) and falls back to apps/web/dist via repo root for dev.
const publicCandidates = [
  join(__dirname, '..', 'public'),
  join(__dirname, '..', '..', '..', 'apps', 'web', 'dist'),
  join(process.cwd(), 'apps', 'web', 'dist'),
];
const publicRoot = publicCandidates.find((p) => existsSync(p));

if (publicRoot) {
  app.use('/*', serveStatic({ root: publicRoot, rewriteRequestPath: (p) => (p === '/' ? '/index.html' : p) }));
  // SPA fallback: anything unmatched and not /api → index.html
  app.get('*', (c) => {
    const indexPath = join(publicRoot, 'index.html');
    if (existsSync(indexPath)) {
      return c.html(readFileSync(indexPath, 'utf8'));
    }
    return c.text('SPA build missing', 500);
  });
} else {
  app.get('/', (c) =>
    c.text('API only. Build the web app: npm run build --workspace=apps/web')
  );
}

const port = Number(process.env.PORT || 8080);
console.log(`Racha API listening on :${port}`);
console.log(`DB: ${dbPath}`);
if (publicRoot) console.log(`Static: ${publicRoot}`);

serve({
  fetch: app.fetch,
  port,
});
