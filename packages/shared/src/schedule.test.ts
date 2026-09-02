import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  nextGameDateISO,
  seasonMondays,
  isGameMonday,
  upcomingMondayISO,
  isNoGameDate,
  SEASON_START,
  SEASON_END,
} from './schedule.js';

// A fixed "now" so the tests don't drift: a Saturday before the opener.
const beforeOpener = new Date('2026-09-05T12:00:00Z');
// Mid-season, a Saturday before the Thanksgiving Monday (2026-10-12).
const beforeThanks = new Date('2026-10-10T12:00:00Z');

test('nextGameDateISO clamps to the opener and skips holidays', () => {
  assert.equal(nextGameDateISO(beforeOpener), '2026-09-14'); // season opener
  assert.equal(nextGameDateISO(beforeThanks), '2026-10-19'); // skips 10-12 Thanksgiving
});

test('nextGameDateISO also skips admin cancellations', () => {
  // Cancel the opener -> rolls to the next Monday.
  assert.equal(nextGameDateISO(beforeOpener, ['2026-09-14']), '2026-09-21');
  // Cancel two in a row.
  assert.equal(nextGameDateISO(beforeOpener, ['2026-09-14', '2026-09-21']), '2026-09-28');
});

test('isGameMonday: in-season Mondays that are not holidays', () => {
  assert.equal(isGameMonday('2026-09-14'), true); // opener Monday
  assert.equal(isGameMonday('2026-10-12'), false); // Thanksgiving holiday
  assert.equal(isGameMonday('2026-09-15'), false); // a Tuesday
  assert.equal(isGameMonday('2026-09-07'), false); // before season
  assert.equal(isNoGameDate('2026-10-12'), true);
});

test('seasonMondays lists only playable Mondays, holidays excluded', () => {
  const all = seasonMondays();
  assert.ok(all.includes('2026-09-14'));
  assert.ok(!all.includes('2026-10-12')); // holiday excluded
  assert.ok(all.every((d) => d >= SEASON_START && d <= SEASON_END));
  assert.ok(all.every((d) => isGameMonday(d)));
});

test('upcomingMondayISO returns this/next Monday', () => {
  assert.equal(upcomingMondayISO(beforeOpener), '2026-09-07');
  assert.equal(upcomingMondayISO(new Date('2026-09-14T12:00:00Z')), '2026-09-14'); // Monday itself
});
