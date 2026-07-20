import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/index.js';

// Public, secret-token-authenticated emergency-contact endpoints. There is no
// admin gate here: knowing a player's unguessable `emergency_token` IS the
// authorization. The token is shared privately with each player by the
// organizer (see the admin panel in the Players screen). This replaces the
// former external Google Sheet / Form.

export const emergency = new Hono();

const EmergencyInput = z.object({
  player_phone: z.string().trim().max(40).optional().default(''),
  contact_name: z.string().trim().max(120).optional().default(''),
  contact_phone: z.string().trim().max(40).optional().default(''),
  relationship: z.string().trim().max(60).optional().default(''),
  medical_notes: z.string().trim().max(1000).optional().default(''),
});

type ContactRow = {
  player_phone: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  relationship: string | null;
  medical_notes: string | null;
};

function playerByToken(token: string) {
  return getDb()
    .prepare('SELECT id, name FROM players WHERE emergency_token = ? AND active = 1')
    .get(token) as { id: string; name: string } | undefined;
}

function getContact(playerId: string): ContactRow | null {
  return (
    (getDb()
      .prepare(
        `SELECT player_phone, contact_name, contact_phone, relationship, medical_notes
         FROM player_emergency WHERE player_id = ?`
      )
      .get(playerId) as ContactRow | undefined) ?? null
  );
}

// Load the player's name + any previously saved contact so the form prefills.
emergency.get('/:token', (c) => {
  const p = playerByToken(c.req.param('token'));
  if (!p) return c.json({ error: 'invalid link' }, 404);
  return c.json({ name: p.name, contact: getContact(p.id) });
});

// Upsert the player's emergency contact.
emergency.put('/:token', async (c) => {
  const p = playerByToken(c.req.param('token'));
  if (!p) return c.json({ error: 'invalid link' }, 404);
  const body = EmergencyInput.parse(await c.req.json());
  getDb()
    .prepare(
      `INSERT INTO player_emergency
         (player_id, player_phone, contact_name, contact_phone, relationship, medical_notes, updated_at)
       VALUES (@pid, @pp, @cn, @cp, @rel, @mn, @ts)
       ON CONFLICT(player_id) DO UPDATE SET
         player_phone  = excluded.player_phone,
         contact_name  = excluded.contact_name,
         contact_phone = excluded.contact_phone,
         relationship  = excluded.relationship,
         medical_notes = excluded.medical_notes,
         updated_at    = excluded.updated_at`
    )
    .run({
      pid: p.id,
      pp: body.player_phone,
      cn: body.contact_name,
      cp: body.contact_phone,
      rel: body.relationship,
      mn: body.medical_notes,
      ts: Date.now(),
    });
  return c.json({ ok: true });
});
