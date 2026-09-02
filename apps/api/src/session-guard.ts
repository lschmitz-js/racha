import { todayISO } from '@racha/shared';
import { getDb } from './db/index.js';

// A session is FROZEN once its game day is over: its status is 'done', or its
// date is before today in league time (covers sessions that were never
// explicitly ended). Frozen sessions are locked for everyone, admins included —
// no team, lineup, draw or match-clock changes, so a finished game's result
// can't be rewritten after the fact. Admin stat corrections (the events routes)
// and match results stay editable through their own endpoints.
export function isFrozen(status: string, date: string): boolean {
  return status === 'done' || date < todayISO();
}

export function sessionState(id: string): { status: string; date: string } | undefined {
  return getDb().prepare('SELECT status, date FROM sessions WHERE id = ?').get(id) as
    | { status: string; date: string }
    | undefined;
}

// Resolve the parent session's frozen state from a match id (for match routes).
export function sessionStateByMatch(matchId: string): { status: string; date: string } | undefined {
  return getDb()
    .prepare('SELECT s.status, s.date FROM sessions s JOIN matches m ON m.session_id = s.id WHERE m.id = ?')
    .get(matchId) as { status: string; date: string } | undefined;
}
