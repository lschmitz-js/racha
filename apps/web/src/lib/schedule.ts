// The season calendar now lives in @racha/shared so the API can use it too.
// Re-exported here to keep the web import paths (`../lib/schedule.js`) stable.
export {
  SEASON_START,
  SEASON_END,
  CHECKIN_CAP,
  NO_GAME_DATES,
  type NoGameDate,
  isNoGameDate,
  todayISO,
  nextGameDateISO,
  seasonMondays,
  isGameMonday,
  upcomingMondayISO,
} from '@racha/shared';
