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

test('normal mode fills white and black with 5 each, green takes the rest', () => {
  for (const n of [10, 11, 13, 15, 18]) {
    const players = fixture.db.slice(0, n);
    const teams = balanceTeams(players, false, 'normal');
    assert.equal(teams.length, 3);
    assert.equal(teams[0]!.players.length, 5, `white with ${n} players`);
    assert.equal(teams[1]!.players.length, 5, `black with ${n} players`);
    assert.equal(teams[2]!.players.length, n - 10, `green with ${n} players`);
  }
});

test('normal mode keeps the two playing teams within 2 points of each other', () => {
  const players = fixture.db.slice(0, 13);
  const teams = balanceTeams(players, false, 'normal');
  const diff = Math.abs(teams[0]!.total - teams[1]!.total);
  assert.ok(diff <= 2, `Expected white/black diff <= 2, got ${diff}`);
});

test('normal mode keeps green average near the overall average', () => {
  const players = fixture.db.slice(0, 13);
  const teams = balanceTeams(players, false, 'normal');
  const overallAvg =
    teams.reduce((s, t) => s + t.total, 0) / players.length;
  const greenAvg = teams[2]!.avg;
  assert.ok(
    Math.abs(greenAvg - overallAvg) <= 0.75,
    `Expected green avg ${greenAvg} within 0.75 of overall ${overallAvg}`
  );
});

test('normal mode below 10 players splits evenly', () => {
  const players = fixture.db.slice(0, 8);
  const teams = balanceTeams(players, false, 'normal');
  const sizes = teams.map((t) => t.players.length).sort();
  assert.deepEqual(sizes, [2, 3, 3]);
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
