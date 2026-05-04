import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { balanceTeams, calcScore } from './balance.js';
import type { Player } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturePath = join(__dirname, '..', '..', '..', 'racha_de_segunda_2026-04-28.json');
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  db: Player[];
};

test('calcScore matches existing HTML rounding (nearest 0.5)', () => {
  // Verbatim cases verifying Math.round(avg*2)/2 — same as racha_de_segunda.html:487
  assert.equal(calcScore([5, 4, 3, 5, 5, 3, 4, 3]), 4); // sum 32 / 8 = 4.0
  assert.equal(calcScore([5, 5, 5, 4, 4, 4, 4, 4]), 4.5); // sum 35 / 8 = 4.375 → 4.5
  assert.equal(calcScore([1, 1, 1, 1, 1, 1, 1, 1]), 1);
  assert.equal(calcScore([5, 5, 5, 5, 5, 5, 5, 5]), 5);
});

test('normal mode produces 3 teams with totals within 2 points', () => {
  const players = fixture.db.slice(0, 18);
  const teams = balanceTeams(players, false, 'normal');
  assert.equal(teams.length, 3);
  const totals = teams.map((t) => t.total);
  const diff = Math.max(...totals) - Math.min(...totals);
  assert.ok(diff <= 2, `Expected diff <= 2, got ${diff}`);
});

test('dropin-split mode packs dropins into the green vest first', () => {
  const players = fixture.db;
  const teams = balanceTeams(players, false, 'dropin-split');
  const green = teams.find((t) => t.vest === 'green')!;
  const dropinsInGreen = green.players.filter((p) => p.type === 'dropin').length;
  assert.ok(dropinsInGreen > 0, 'Green vest should contain dropins');
});

test('refuses fewer than 6 players', () => {
  assert.throws(() => balanceTeams(fixture.db.slice(0, 5), false));
});
