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
];
export const VESTS = ['white', 'black', 'green'];
export const PlayerType = z.enum(['season', 'dropin']);
export const PlayerRole = z.enum(['player', 'gk']);
export const Skills = z
    .array(z.number().int().min(1).max(5))
    .length(8);
export const Player = z.object({
    id: z.string(),
    name: z.string().min(1),
    type: PlayerType,
    role: PlayerRole,
    skills: Skills,
    active: z.boolean().default(true),
});
export const Session = z.object({
    id: z.string(),
    date: z.string(),
    status: z.enum(['draft', 'live', 'done']),
    notes: z.string().nullable(),
    created_at: z.number(),
    ended_at: z.number().nullable(),
});
export const SessionTeam = z.object({
    id: z.string(),
    session_id: z.string(),
    vest: z.enum(VESTS),
    player_ids: z.array(z.string()),
});
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
export const MatchPlayer = z.object({
    match_id: z.string(),
    player_id: z.string(),
    team_id: z.string(),
    starting: z.boolean(),
});
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
export const ImportEnvelope = z.object({
    db: z.array(z.object({
        id: z.string(),
        name: z.string(),
        type: PlayerType,
        role: PlayerRole,
        skills: Skills,
    })),
    weekIds: z.array(z.string()).optional().default([]),
});
export const NewEventInput = z.object({
    id: z.string(),
    match_id: z.string(),
    type: EventType,
    player_id: z.string(),
    team_id: z.string(),
    link_id: z.string().nullable().optional(),
    clock_offset_ms: z.number().int().optional(),
});
