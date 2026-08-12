import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { logger } from 'hono/logger';
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
app.use(logger());

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
const requireAdmin = async (c: any, next: any) => {
  if (!TOKEN) return next();
  if (c.req.header('x-racha-token') !== TOKEN) {
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
  const ok = c.req.header('x-racha-token') === TOKEN;
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
