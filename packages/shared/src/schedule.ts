// Season calendar — the single source of truth for both the web app and the API
// (so the server can decide which game a check-in belongs to). All dates are
// `YYYY-MM-DD` strings in the league's timezone, and every computation is done
// on strings + UTC weekday math, so it behaves identically on a browser and on
// the (UTC) server — the board never flips to next week mid-game.
//
// The Rules screen's "No Game Dates" list mirrors NO_GAME_DATES below; keep the
// two in sync when a season changes.

export const LEAGUE_TZ = 'America/Vancouver';
export const SEASON_START = '2026-09-14'; // Monday — season opener
export const SEASON_END = '2027-06-21'; // Monday — last game
// Confirmed-spot rules. The normal cap is 15 (three teams of five). Season
// players are guaranteed a spot, so an all-season night can stretch the cap up
// to SEASON_CAP (18); drop-ins only ever fill up to CONFIRMED_CAP (15).
export const CONFIRMED_CAP = 15; // normal confirmed cap; drop-ins never exceed this
export const SEASON_CAP = 18; // hard ceiling, reached only if that many season players check in
export const CHECKIN_CAP = SEASON_CAP; // back-compat alias (hard ceiling)
export const GUEST_CAP = 5; // max self-added guests per game (spam guard)
export const MIN_PLAYERS = 10; // minimum present players needed to start a racha

export interface NoGameDate {
  date: string; // YYYY-MM-DD
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

// Weekday of a YYYY-MM-DD (0=Sun … 6=Sat), computed in UTC so it never shifts.
function isoWeekday(iso: string): number {
  return new Date(iso + 'T00:00:00Z').getUTCDay();
}

// Add days to a YYYY-MM-DD, staying on calendar dates (UTC math, no TZ drift).
function addDaysISO(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Today's calendar date in the league timezone, as YYYY-MM-DD. en-CA renders
// exactly YYYY-MM-DD. Uses Intl (ICU), so no system tzdata is required.
export function todayISO(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: LEAGUE_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function isNoGameDate(iso: string): boolean {
  return NO_GAME_SET.has(iso);
}

// The next date we actually play (this/next Monday within the season, skipping
// no-game Mondays), as YYYY-MM-DD — or null once the season is over. `cancelled`
// carries the admin's one-off cancellations (Mondays not in NO_GAME_DATES), so a
// called-off game rolls forward to the next one just like a holiday does.
export function nextGameDateISO(
  now: Date = new Date(),
  cancelled: readonly string[] = []
): string | null {
  const off = new Set(cancelled);
  let d = todayISO(now);
  d = addDaysISO(d, (1 - isoWeekday(d) + 7) % 7); // advance to Monday (today if Mon)
  if (d < SEASON_START) d = SEASON_START;
  while (d <= SEASON_END) {
    if (!isNoGameDate(d) && !off.has(d)) return d;
    d = addDaysISO(d, 7);
  }
  return null;
}

// The Monday of the current game-week — today if it's Monday, else the coming
// Monday — as YYYY-MM-DD, ignoring season bounds and holidays. The Home banner
// uses it to ask "is this coming Monday on or off?".
export function upcomingMondayISO(now: Date = new Date()): string {
  const d = todayISO(now);
  return addDaysISO(d, (1 - isoWeekday(d) + 7) % 7);
}

// Every Monday we're scheduled to play, from `from` (default season start)
// through the end of the season — YYYY-MM-DD strings, holidays excluded. Used to
// offer the admin a cancellable-games list and to lay out the calendar.
export function seasonMondays(from: string = SEASON_START): string[] {
  let d = from < SEASON_START ? SEASON_START : from;
  d = addDaysISO(d, (1 - isoWeekday(d) + 7) % 7);
  const out: string[] = [];
  while (d <= SEASON_END) {
    if (!isNoGameDate(d)) out.push(d);
    d = addDaysISO(d, 7);
  }
  return out;
}

// True when `iso` is a Monday the season actually plays on (in season, not a
// listed holiday). The calendar uses it to decide which days are game days.
export function isGameMonday(iso: string): boolean {
  return (
    iso >= SEASON_START &&
    iso <= SEASON_END &&
    isoWeekday(iso) === 1 &&
    !isNoGameDate(iso)
  );
}
