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

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure /data directory exists for SQLite
const dbPath = process.env.DB_PATH || join(process.cwd(), 'data', 'racha.db');
mkdirSync(dirname(dbPath), { recursive: true });

// Open DB once on boot so schema is applied before any request.
getDb();

const app = new Hono();

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

// Security response headers (defense-in-depth; Caddy also sets these at the edge
// in production). `no-referrer` keeps the emergency link token out of the
// Referer header when a player follows a link from their form.
app.use('*', async (c, next) => {
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('X-Frame-Options', 'DENY');
  c.header('Referrer-Policy', 'no-referrer');
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

// Shared admin token. When RACHA_TOKEN is set, every state-changing request
// requires the X-Racha-Token header (fail-closed: writes are denied by default,
// so any new endpoint is protected automatically). Reads stay open, and the
// player-facing emergency self-service flow under /api/emergency/:token is
// authorized by its own unguessable token rather than the admin one.
//
// If RACHA_TOKEN is NOT set the whole API is open — only acceptable for a
// trusted local/network deployment, never for a public host.
const TOKEN = process.env.RACHA_TOKEN;
if (!TOKEN) {
  console.warn(
    '[racha] WARNING: RACHA_TOKEN is not set — all write endpoints are UNAUTHENTICATED. ' +
      'Set RACHA_TOKEN to lock down a public deployment.'
  );
}
// Constant-time admin-token check over fixed-length SHA-256 digests, so neither
// the token value nor its length leaks through response timing.
function tokenMatches(provided: string | undefined): boolean {
  if (!TOKEN) return false;
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return timingSafeEqual(digest(provided ?? ''), digest(TOKEN));
}
const requireAdmin = async (c: any, next: any) => {
  if (!TOKEN) return next();
  if (!tokenMatches(c.req.header('x-racha-token'))) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  return next();
};
// A write is any non-safe method. The player self-service submit
// (PUT /api/emergency/:token) is exempt — its path token is the authorization.
const isPublicSelfService = (path: string) => path.startsWith('/api/emergency/');
const isReadMethod = (m: string) => m === 'GET' || m === 'HEAD' || m === 'OPTIONS';

if (TOKEN) {
  // Emergency-contact reads expose sensitive PII + the private link token, so
  // they are admin-only even though they are GETs. Registered before the global
  // gate so requireAdmin short-circuits first.
  app.use('/api/players/emergency-status', requireAdmin);
  app.use('/api/players/emergency-export', requireAdmin);
  app.use('/api/players/:id/emergency', requireAdmin);
  // Fail-closed global write gate: everything that changes state requires the
  // admin token, except the player self-service emergency submit. Reads pass.
  app.use('/api/*', async (c, next) => {
    if (isReadMethod(c.req.method)) return next();
    if (isPublicSelfService(c.req.path)) return next();
    return requireAdmin(c, next);
  });
}

// Tells the client whether admin auth is configured, and (when called with the
// header) whether the given token is valid. Used to drive UI gating.
app.get('/api/auth/check', (c) => {
  if (!TOKEN) return c.json({ required: false, ok: true });
  const ok = tokenMatches(c.req.header('x-racha-token'));
  return c.json({ required: true, ok });
});

app.get('/api/health', (c) => c.json({ ok: true }));
app.route('/api/players', players);
app.route('/api/emergency', emergency);
app.route('/api/sessions', sessions);
app.route('/api/matches', matches);
app.route('/api/events', events);
app.route('/api/stats', stats);

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
