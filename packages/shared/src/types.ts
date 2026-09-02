import { z } from 'zod';

export const SKILLS = [
  'Speed',
  'Position',
  'Stamina',
  'Teamwork',
  'Passing',
  'Shooting',
  'Defend',
  'Dribble',
] as const;

export const VESTS = ['white', 'black', 'green'] as const;
export type Vest = (typeof VESTS)[number];

// 'guest' is a one-off external drop-in that anyone can add by name on the
// check-in screen (no login). Guests are the lowest priority for a spot and
// play at their own risk; an admin can later promote a guest to a regular
// 'dropin' to keep their stats.
export const PlayerType = z.enum(['season', 'dropin', 'guest']);

export const Skills = z
  .array(z.number().int().min(1).max(5))
  .length(8);

export const Player = z.object({
  id: z.string(),
  name: z.string().min(1),
  type: PlayerType,
  skills: Skills,
  active: z.boolean().default(true),
  // Whether this player can log in to the admin UI. Credentials themselves
  // (password hash) are never exposed on the Player shape.
  is_admin: z.boolean().default(false),
});
export type Player = z.infer<typeof Player>;

export const Session = z.object({
  id: z.string(),
  date: z.string(),
  status: z.enum(['draft', 'live', 'done']),
  notes: z.string().nullable(),
  created_at: z.number(),
  ended_at: z.number().nullable(),
});
export type Session = z.infer<typeof Session>;

export const SessionTeam = z.object({
  id: z.string(),
  session_id: z.string(),
  vest: z.enum(VESTS),
  player_ids: z.array(z.string()),
});
export type SessionTeam = z.infer<typeof SessionTeam>;

export const MatchStatus = z.enum(['pending', 'running', 'paused', 'done']);
export const MatchResult = z.enum(['a', 'b', 'draw', 'pending']);

export const Match = z.object({
  id: z.string(),
  session_id: z.string(),
  ordinal: z.number().int().positive(),
  team_a_id: z.string(),
  team_b_id: z.string(),
  bench_team_id: z.string(),
  started_at: z.number().nullable(),
  ended_at: z.number().nullable(),
  elapsed_ms: z.number().int().nonnegative(),
  status: MatchStatus,
  result: MatchResult,
  winner_team_id: z.string().nullable(),
});
export type Match = z.infer<typeof Match>;

export const MatchPlayer = z.object({
  match_id: z.string(),
  player_id: z.string(),
  team_id: z.string(),
  starting: z.boolean(),
});
export type MatchPlayer = z.infer<typeof MatchPlayer>;

export const EventType = z.enum([
  'goal',
  'assist',
  'beautiful',
  'silly',
  'bad',
  'save',
  'caneta',
  'quasegol',
  'sub_in',
  'sub_out',
]);
export type EventType = z.infer<typeof EventType>;

export const MatchEvent = z.object({
  id: z.string(),
  match_id: z.string(),
  clock_ms: z.number().int().nonnegative(),
  type: EventType,
  player_id: z.string(),
  team_id: z.string(),
  link_id: z.string().nullable(),
  created_at: z.number(),
});
export type MatchEvent = z.infer<typeof MatchEvent>;

export const ImportEnvelope = z.object({
  db: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      type: PlayerType,
      role: z.enum(['player', 'gk']).optional(), // legacy imports; ignored
      skills: Skills,
    })
  ),
  weekIds: z.array(z.string()).optional().default([]),
});
export type ImportEnvelope = z.infer<typeof ImportEnvelope>;

export const NewEventInput = z.object({
  id: z.string(),
  match_id: z.string(),
  type: EventType,
  player_id: z.string(),
  team_id: z.string(),
  link_id: z.string().nullable().optional(),
  clock_offset_ms: z.number().int().optional(),
  // Explicit clock (admin editor adding events to past matches). When set,
  // wins over the live-clock + offset computation.
  clock_ms: z.number().int().nonnegative().optional(),
});
export type NewEventInput = z.infer<typeof NewEventInput>;
