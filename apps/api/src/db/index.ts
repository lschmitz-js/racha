import Database from 'better-sqlite3';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

export type DB = Database.Database;

let _db: DB | null = null;

export function getDb(): DB {
  if (_db) return _db;
  const path = process.env.DB_PATH || join(process.cwd(), 'data', 'racha.db');
  const db = new Database(path);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  // schema.sql lives next to compiled index.js (apps/api/dist/db/) at runtime
  // and src/db/ during tsx dev — try both.
  const candidates = [
    join(__dirname, 'schema.sql'),
    join(__dirname, '..', '..', 'src', 'db', 'schema.sql'),
  ];
  let schema: string | null = null;
  for (const p of candidates) {
    try {
      schema = readFileSync(p, 'utf8');
      break;
    } catch {
      // try next
    }
  }
  if (!schema) throw new Error('schema.sql not found');
  db.exec(schema);
  migrateMatchEventsCheck(db);
  migrateSessionPlayersArrived(db);
  migrateSessionCode(db);
  migratePlayerEmergency(db);
  migrateAuth(db);
  migratePlayerTypeCheck(db); // after the column-adding migrations above
  migrateGameCancellations(db);

  // Exit cleanly on both signals. SIGTERM is what `docker stop` and most
  // process managers send — previously we only closed the DB without exiting,
  // so the HTTP server kept the event loop alive and the container waited out
  // its full stop-grace timeout on every deploy.
  const shutdown = () => {
    try {
      db.close();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  _db = db;
  return db;
}

// Existing prod DBs were created when match_events had a CHECK constraint that
// only allowed the original event types. SQLite can't ALTER a CHECK in place,
// so on boot we rebuild the table if the new types ('caneta', 'quasegol')
// aren't listed in its CREATE statement. No-op on fresh DBs created from the
// current schema.sql.
function migrateMatchEventsCheck(db: DB) {
  const row = db
    .prepare(
      "SELECT sql FROM sqlite_master WHERE type='table' AND name='match_events'"
    )
    .get() as { sql: string } | undefined;
  if (!row || row.sql.includes("'caneta'")) return;

  db.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN;
    CREATE TABLE match_events_new (
      id         TEXT PRIMARY KEY,
      match_id   TEXT NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
      clock_ms   INTEGER NOT NULL,
      type       TEXT NOT NULL CHECK(type IN
                 ('goal','assist','beautiful','silly','bad','save','caneta','quasegol','sub_in','sub_out')),
      player_id  TEXT NOT NULL REFERENCES players(id),
      team_id    TEXT NOT NULL REFERENCES session_teams(id),
      link_id    TEXT,
      created_at INTEGER NOT NULL
    );
    INSERT INTO match_events_new SELECT * FROM match_events;
    DROP TABLE match_events;
    ALTER TABLE match_events_new RENAME TO match_events;
    CREATE INDEX IF NOT EXISTS idx_events_match  ON match_events(match_id, clock_ms);
    CREATE INDEX IF NOT EXISTS idx_events_player ON match_events(player_id, type);
    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

// Existing prod DBs created the players table with a CHECK that only allowed
// ('season','dropin'). Guests need a third type, and SQLite can't ALTER a CHECK
// in place, so rebuild the table with the widened CHECK when 'guest' isn't in
// its CREATE statement. Columns are copied by name (not SELECT *) because older
// DBs appended is_admin/emergency_token via ALTER, so physical order can differ.
// Runs after the column-adding migrations so every listed column exists.
function migratePlayerTypeCheck(db: DB) {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='players'")
    .get() as { sql: string } | undefined;
  if (!row || row.sql.includes("'guest'")) return;

  db.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN;
    CREATE TABLE players_new (
      id              TEXT PRIMARY KEY,
      name            TEXT NOT NULL,
      type            TEXT NOT NULL CHECK(type IN ('season','dropin','guest')),
      role            TEXT NOT NULL CHECK(role IN ('player','gk')),
      skills_json     TEXT NOT NULL,
      active          INTEGER NOT NULL DEFAULT 1,
      emergency_token TEXT,
      is_admin        INTEGER NOT NULL DEFAULT 0,
      password_hash   TEXT,
      created_at      INTEGER NOT NULL
    );
    INSERT INTO players_new
      (id, name, type, role, skills_json, active, emergency_token, is_admin, password_hash, created_at)
      SELECT id, name, type, role, skills_json, active, emergency_token, is_admin, password_hash, created_at
        FROM players;
    DROP TABLE players;
    ALTER TABLE players_new RENAME TO players;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_players_emergency_token
      ON players(emergency_token) WHERE emergency_token IS NOT NULL;
    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
}

// Pre-existing DBs lack the arrived flag used for late-arrival tracking.
function migrateSessionPlayersArrived(db: DB) {
  const cols = db.prepare('PRAGMA table_info(session_players)').all() as Array<{ name: string }>;
  if (cols.some((c) => c.name === 'arrived')) return;
  db.exec('ALTER TABLE session_players ADD COLUMN arrived INTEGER NOT NULL DEFAULT 1');
}

// Per-session operator code (lets non-admins run the live game). Additive.
// One-off game cancellations the admin calls (a Monday that isn't a listed
// holiday). Additive — a no-op once the table exists.
function migrateGameCancellations(db: DB) {
  db.exec(`CREATE TABLE IF NOT EXISTS game_cancellations (
    date TEXT PRIMARY KEY,
    reason TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  )`);
}

function migrateSessionCode(db: DB) {
  const cols = db.prepare('PRAGMA table_info(sessions)').all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'code')) {
    db.exec('ALTER TABLE sessions ADD COLUMN code TEXT');
  }
}

// Emergency contacts feature: pre-existing DBs lack players.emergency_token.
// Add the column (schema.sql only adds it to freshly created player tables),
// backfill an unguessable token for every player so their personal self-service
// link works, then enforce uniqueness. The partial index allows multiple NULLs.
function migratePlayerEmergency(db: DB) {
  const cols = db.prepare('PRAGMA table_info(players)').all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'emergency_token')) {
    db.exec('ALTER TABLE players ADD COLUMN emergency_token TEXT');
  }
  const missing = db
    .prepare('SELECT id FROM players WHERE emergency_token IS NULL')
    .all() as Array<{ id: string }>;
  if (missing.length) {
    const upd = db.prepare('UPDATE players SET emergency_token = ? WHERE id = ?');
    const tx = db.transaction((rows: Array<{ id: string }>) => {
      for (const r of rows) upd.run(randomBytes(18).toString('base64url'), r.id);
    });
    tx(missing);
  }
  db.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_players_emergency_token ON players(emergency_token) WHERE emergency_token IS NOT NULL'
  );
}

// Per-user auth: pre-existing DBs lack players.is_admin / password_hash.
// (auth_sessions and audit_log are created by schema.sql via IF NOT EXISTS.)
function migrateAuth(db: DB) {
  const cols = db.prepare('PRAGMA table_info(players)').all() as Array<{ name: string }>;
  if (!cols.some((c) => c.name === 'is_admin')) {
    db.exec('ALTER TABLE players ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0');
  }
  if (!cols.some((c) => c.name === 'password_hash')) {
    db.exec('ALTER TABLE players ADD COLUMN password_hash TEXT');
  }
  // The goalkeeper role was removed; normalize any existing 'gk' to 'player'.
  db.exec("UPDATE players SET role = 'player' WHERE role = 'gk'");
}
