import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/index.js';

// App settings (key/value JSON blobs). GET is public (every device needs these);
// PUT is admin-gated by the global write gate in server.ts.
//   vests   — the three team "slots" stay white/black/green internally, each
//             mapping to a display colour + label the organizer can configure.
//   contact — organizer-editable copy shown on the Rules screen (e-Transfer
//             address + site URL). Kept here, in the DB, so it is NOT hardcoded
//             in the (public) source.
export const settings = new Hono();

const DEFAULT_VESTS = {
  white: { color: '#f3f4f6', label: 'White' },
  black: { color: '#111827', label: 'Black' },
  green: { color: '#16a34a', label: 'Green' },
};
const DEFAULT_CONTACT = { etransfer: '', siteUrl: '' };

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
const ContactInput = z.object({
  etransfer: z.string().trim().max(120),
  siteUrl: z.string().trim().max(200),
});

function readJson<T>(key: string, fallback: T): T {
  const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  if (!row) return fallback;
  try {
    return { ...fallback, ...JSON.parse(row.value) };
  } catch {
    return fallback;
  }
}

function writeJson(key: string, value: unknown) {
  getDb()
    .prepare(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
    )
    .run(key, JSON.stringify(value), Date.now());
}

settings.get('/', (c) => {
  return c.json({
    vests: readJson('vests', DEFAULT_VESTS),
    contact: readJson('contact', DEFAULT_CONTACT),
  });
});

// Accepts either or both of { vests, contact }; updates whichever is present.
settings.put('/', async (c) => {
  const body = z
    .object({ vests: VestsInput.optional(), contact: ContactInput.optional() })
    .parse(await c.req.json());
  if (body.vests) writeJson('vests', body.vests);
  if (body.contact) writeJson('contact', body.contact);
  return c.json({
    vests: readJson('vests', DEFAULT_VESTS),
    contact: readJson('contact', DEFAULT_CONTACT),
  });
});
