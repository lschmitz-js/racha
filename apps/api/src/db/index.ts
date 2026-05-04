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
