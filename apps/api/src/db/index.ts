import Database from 'better-sqlite3';
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

  process.on('SIGTERM', () => {
    db.close();
  });
  process.on('SIGINT', () => {
    db.close();
    process.exit(0);
  });

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

// Pre-existing DBs lack the arrived flag used for late-arrival tracking.
function migrateSessionPlayersArrived(db: DB) {
  const cols = db.prepare('PRAGMA table_info(session_players)').all() as Array<{ name: string }>;
  if (cols.some((c) => c.name === 'arrived')) return;
  db.exec('ALTER TABLE session_players ADD COLUMN arrived INTEGER NOT NULL DEFAULT 1');
}
