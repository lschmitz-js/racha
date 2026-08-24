import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/index.js';

// App settings. Currently the vest colours: the three team "slots" stay
// white/black/green internally, but each maps to a display colour + label the
// organizer can configure. GET is public (every device needs the colours);
// PUT is admin-gated by the global write gate in server.ts.
export const settings = new Hono();

const DEFAULT_VESTS = {
  white: { color: '#f3f4f6', label: 'White' },
  black: { color: '#111827', label: 'Black' },
  green: { color: '#16a34a', label: 'Green' },
};

const HEX = /^#[0-9a-fA-F]{6}$/;
const VestSlot = z.object({
  color: z.string().regex(HEX),
  label: z.string().trim().min(1).max(20),
});
const VestsInput = z.object({
  white: VestSlot,
  black: VestSlot,
  green: VestSlot,
});

function readVests() {
  const row = getDb().prepare("SELECT value FROM settings WHERE key = 'vests'").get() as
    | { value: string }
    | undefined;
  if (!row) return DEFAULT_VESTS;
  try {
    return { ...DEFAULT_VESTS, ...JSON.parse(row.value) };
  } catch {
    return DEFAULT_VESTS;
  }
}

settings.get('/', (c) => {
  return c.json({ vests: readVests() });
});

settings.put('/', async (c) => {
  const body = z.object({ vests: VestsInput }).parse(await c.req.json());
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES ('vests', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(JSON.stringify(body.vests), Date.now());
  return c.json({ vests: body.vests });
});
