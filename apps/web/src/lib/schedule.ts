// Single source of truth for the season calendar. The "Next racha" card
// (screens/Home.tsx) computes the next playable Monday from this, and the
// Rules screen's "No Game Dates" list is the human-readable mirror of
// NO_GAME_DATES below — keep the two in sync when a season changes.
//
// All dates are local (America/Vancouver) calendar dates as `YYYY-MM-DD`.
// Season runs weekly on Mondays; SEASON_START and SEASON_END are inclusive
// and are themselves Mondays.

export const SEASON_START = '2026-09-14'; // Monday — season opener
export const SEASON_END = '2027-06-21'; // Monday — last game

// Mondays with no game (statutory holidays + school closures).
export interface NoGameDate {
  date: string; // YYYY-MM-DD (local)
  en: string;
  pt: string;
}
export const NO_GAME_DATES: NoGameDate[] = [
  { date: '2026-10-12', en: 'Thanksgiving', pt: 'Thanksgiving' },
  { date: '2026-12-21', en: 'Winter Break', pt: 'Recesso de inverno' },
  { date: '2026-12-28', en: 'Winter Break', pt: 'Recesso de inverno' },
  { date: '2027-02-15', en: 'Family Day', pt: 'Family Day' },
  { date: '2027-03-15', en: 'Spring Break', pt: 'Spring Break' },
  { date: '2027-03-22', en: 'Spring Break', pt: 'Spring Break' },
  { date: '2027-03-29', en: 'Easter Monday', pt: 'Segunda de Páscoa' },
  { date: '2027-05-24', en: 'Victoria Day', pt: 'Victoria Day' },
];

const NO_GAME_SET = new Set(NO_GAME_DATES.map((d) => d.date));

// Parse a `YYYY-MM-DD` string into a Date at local midnight (avoids the
// UTC-parsing off-by-one that `new Date('2026-09-14')` would cause).
function parseLocal(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d);
}

// Format a Date as a local `YYYY-MM-DD` key.
function localKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function isNoGameDate(d: Date): boolean {
  return NO_GAME_SET.has(localKey(d));
}

// The next date we actually play, given "now". Returns the season opener if
// the season hasn't started yet, skips holidays and out-of-season Mondays,
// and returns null once the season is over.
export function nextGameDate(now: Date = new Date()): Date | null {
  const start = parseLocal(SEASON_START);
  const end = parseLocal(SEASON_END);

  // This week's Monday (today if today is Monday), at local midnight.
  let d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const delta = (1 - d.getDay() + 7) % 7; // 1 = Monday
  d.setDate(d.getDate() + delta);

  // Before the season opens, the next game is the opener.
  if (d.getTime() < start.getTime()) d = new Date(start);

  // Walk forward week by week, skipping no-game Mondays, until the season ends.
  while (d.getTime() <= end.getTime()) {
    if (!isNoGameDate(d)) return d;
    d.setDate(d.getDate() + 7);
  }
  return null; // season complete
}
