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

const __dirname = dirname(fileURLToPath(import.meta.url));

// Ensure /data directory exists for SQLite
const dbPath = process.env.DB_PATH || join(process.cwd(), 'data', 'racha.db');
mkdirSync(dirname(dbPath), { recursive: true });

// Open DB once on boot so schema is applied before any request.
getDb();

const app = new Hono();
app.use(logger());

// Optional shared admin token. If RACHA_TOKEN is set, the routes below require
// the X-Racha-Token header: editing players (any write under /api/players)
// and creating, deleting, or ending a session. Live match recording (events,
// match clock, draws, team-roster edits, subs) stays open so games are not
// interrupted by auth prompts.
const TOKEN = process.env.RACHA_TOKEN;
const requireAdmin = async (c: any, next: any) => {
  if (!TOKEN) return next();
  if (c.req.header('x-racha-token') !== TOKEN) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  return next();
};
const gateWrites = async (c: any, next: any) => {
  if (c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'OPTIONS') {
    return next();
  }
  return requireAdmin(c, next);
};

if (TOKEN) {
  // All player writes (create, update, delete, import) are admin-only.
  app.use('/api/players', gateWrites);
  app.use('/api/players/*', gateWrites);
  // Specific session writes are admin-only; other session mutations stay open.
  app.use('/api/sessions', async (c, next) =>
    c.req.method === 'POST' ? requireAdmin(c, next) : next()
  );
  app.use('/api/sessions/:id', async (c, next) =>
    c.req.method === 'DELETE' ? requireAdmin(c, next) : next()
  );
  app.use('/api/sessions/:id/end', async (c, next) =>
    c.req.method === 'POST' ? requireAdmin(c, next) : next()
  );
  // Editing past events is admin-only; live create/delete (recording + undo)
  // stays open.
  app.use('/api/events/:id', async (c, next) =>
    c.req.method === 'PUT' ? requireAdmin(c, next) : next()
  );
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
