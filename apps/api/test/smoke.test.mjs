import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Spawns the built server on a random port with a throwaway DB and exercises the
// security-critical paths (auth gating, login/session/logout, emergency
// self-service). Run with: npm run test --workspace=apps/api

const TOKEN = 'test-master-token';
const PORT = 8900 + Math.floor(Math.random() * 90);
const BASE = `http://127.0.0.1:${PORT}`;
const M = { 'x-racha-token': TOKEN };

let proc;
let dbDir;

const api = (path, opts = {}) =>
  fetch(BASE + path, {
    ...opts,
    headers: { 'content-type': 'application/json', ...(opts.headers || {}) },
  });

before(async () => {
  dbDir = mkdtempSync(join(tmpdir(), 'racha-test-'));
  proc = spawn('node', ['dist/server.js'], {
    cwd: new URL('..', import.meta.url).pathname,
    env: {
      ...process.env,
      RACHA_TOKEN: TOKEN,
      DB_PATH: join(dbDir, 'test.db'),
      PORT: String(PORT),
      RATE_LIMIT_MAX: '0', // disable rate limiting for tests
      GUEST_RATE_MAX: '0', // disable the guest add rate limiter; test the per-game cap instead
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(BASE + '/api/health')).ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
});

after(() => {
  proc?.kill('SIGKILL');
  if (dbDir) rmSync(dbDir, { recursive: true, force: true });
});

const newPlayer = (over = {}) => ({
  name: 'X',
  type: 'dropin',
  skills: [3, 3, 3, 3, 3, 3, 3, 3],
  ...over,
});

test('reads are public, writes require auth', async () => {
  assert.equal((await api('/api/players')).status, 200);
  const r = await api('/api/players', { method: 'POST', body: JSON.stringify(newPlayer()) });
  assert.equal(r.status, 401);
});

test('master creates an admin; login issues a session that can write; logout revokes it', async () => {
  const create = await api('/api/players', {
    method: 'POST',
    headers: M,
    body: JSON.stringify(newPlayer({ name: 'Ana', type: 'season', is_admin: true, password: 'anapass1' })),
  });
  assert.equal(create.status, 201);
  const player = await create.json();
  assert.equal(player.is_admin, true);
  assert.ok(!('password_hash' in player), 'password hash must never be returned');

  assert.equal(
    (await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ name: 'Ana', password: 'wrong' }) })).status,
    401
  );

  const login = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ name: 'Ana', password: 'anapass1' }) });
  assert.equal(login.status, 200);
  const { token, user } = await login.json();
  assert.equal(user.name, 'Ana');

  const S = { 'x-racha-token': token };
  assert.equal(
    (await api('/api/players', { method: 'POST', headers: S, body: JSON.stringify(newPlayer({ name: 'Bob' })) })).status,
    201
  );

  await api('/api/auth/logout', { method: 'POST', headers: S });
  assert.equal(
    (await api('/api/players', { method: 'POST', headers: S, body: JSON.stringify(newPlayer({ name: 'Zed' })) })).status,
    401,
    'session must be dead after logout'
  );
});

test('public roster hides is_admin; admins see it', async () => {
  const pub = await (await api('/api/players')).json();
  const anaPub = pub.find((p) => p.name === 'Ana');
  assert.ok(anaPub, 'Ana is in the public list');
  assert.equal(anaPub.is_admin, false, 'is_admin must be hidden from unauthenticated callers');

  const priv = await (await api('/api/players', { headers: M })).json();
  const anaPriv = priv.find((p) => p.name === 'Ana');
  assert.equal(anaPriv.is_admin, true, 'authenticated admins see the real is_admin flag');
});

test('emergency self-service flow + PII never leaks', async () => {
  const p = await (
    await api('/api/players', { method: 'POST', headers: M, body: JSON.stringify(newPlayer({ name: 'Cid' })) })
  ).json();

  const admin = await (await api(`/api/players/${p.id}/emergency`, { headers: M })).json();
  assert.ok(admin.token);

  assert.equal((await api(`/api/emergency/${admin.token}`)).status, 200);
  assert.equal(
    (await api(`/api/emergency/${admin.token}`, { method: 'PUT', body: JSON.stringify({ contact_name: 'Mom', contact_phone: '1' }) })).status,
    200
  );
  assert.equal((await api('/api/emergency/bogus-token')).status, 404);
  assert.equal((await api(`/api/players/${p.id}/emergency`)).status, 401, 'admin PII read must be gated');

  const list = await (await api('/api/players')).json();
  for (const pl of list) assert.ok(!('password_hash' in pl) && !('role' in pl));
});

test('check-in: public, season ranks above drop-ins, toggle to clear', async () => {
  const sea = await (
    await api('/api/players', { method: 'POST', headers: M, body: JSON.stringify(newPlayer({ name: 'Sea1', type: 'season' })) })
  ).json();
  const drop = await (
    await api('/api/players', { method: 'POST', headers: M, body: JSON.stringify(newPlayer({ name: 'Drop1', type: 'dropin' })) })
  ).json();

  // Public writes (no auth): a drop-in may check in too; they just rank after season.
  assert.equal((await api('/api/checkin', { method: 'POST', body: JSON.stringify({ player_id: drop.id, status: 'in' }) })).status, 200);
  const board = await (await api('/api/checkin', { method: 'POST', body: JSON.stringify({ player_id: sea.id, status: 'in' }) })).json();
  const names = board.confirmed.map((e) => e.name);
  assert.ok(names.indexOf('Sea1') < names.indexOf('Drop1'), 'season player ranks above the earlier drop-in');

  // Pressing again ('none') clears the check-in entirely.
  const cleared = await (await api('/api/checkin', { method: 'POST', body: JSON.stringify({ player_id: sea.id, status: 'none' }) })).json();
  assert.ok(!cleared.confirmed.some((e) => e.id === sea.id) && !cleared.out.some((e) => e.id === sea.id), 'cleared back to no response');

  // Unknown player is rejected.
  assert.equal((await api('/api/checkin', { method: 'POST', body: JSON.stringify({ player_id: 'nope', status: 'in' }) })).status, 404);

  // Clear-all is admin-only: no token -> 401, unchanged board.
  assert.equal((await api('/api/checkin/all', { method: 'DELETE' })).status, 401);
  // With the master token it wipes every check-in for the game.
  const wiped = await (await api('/api/checkin/all', { method: 'DELETE', headers: M })).json();
  assert.equal(wiped.confirmed.length, 0);
  assert.equal(wiped.waitlist.length, 0);
  assert.equal(wiped.out.length, 0);
});

test('check-in cap: drop-ins stop at 15, season players can stretch it to 18', async () => {
  // 16 season players all check in; the cap should grow to 16 and confirm them all.
  const seasonIds = [];
  for (let i = 0; i < 16; i++) {
    const p = await (
      await api('/api/players', { method: 'POST', headers: M, body: JSON.stringify(newPlayer({ name: 'Cap' + i, type: 'season' })) })
    ).json();
    seasonIds.push(p.id);
    await api('/api/checkin', { method: 'POST', body: JSON.stringify({ player_id: p.id, status: 'in' }) });
  }
  const drop = await (
    await api('/api/players', { method: 'POST', headers: M, body: JSON.stringify(newPlayer({ name: 'CapDrop', type: 'dropin' })) })
  ).json();
  const board = await (
    await api('/api/checkin', { method: 'POST', body: JSON.stringify({ player_id: drop.id, status: 'in' }) })
  ).json();

  const confirmedIds = new Set(board.confirmed.map((e) => e.id));
  assert.equal(board.cap, 16, 'cap stretches to the 16 season players who checked in');
  for (const id of seasonIds) assert.ok(confirmedIds.has(id), 'every season player is confirmed');
  assert.ok(!confirmedIds.has(drop.id), 'the drop-in is waitlisted — season already fills past 15');
  assert.ok(board.waitlist.some((e) => e.id === drop.id), 'the drop-in shows on the waitlist');
});

test('guests: public self-add, dedupe, validation, lowest priority, cap, kill-switch', async () => {
  await api('/api/checkin/all', { method: 'DELETE', headers: M }); // start clean

  // Public add (no auth) creates a guest and checks them in.
  const first = await api('/api/checkin/guest', { method: 'POST', body: JSON.stringify({ name: 'Guest One' }) });
  assert.equal(first.status, 200);
  const b1 = await first.json();
  assert.ok(b1.confirmed.some((e) => e.name === 'Guest One' && e.type === 'guest'), 'guest is on the board');
  assert.equal(b1.guest_count, 1);

  // Dedupe (case-insensitive, any active player) -> 409; too-short name -> 400.
  assert.equal((await api('/api/checkin/guest', { method: 'POST', body: JSON.stringify({ name: 'guest one' }) })).status, 409);
  assert.equal((await api('/api/checkin/guest', { method: 'POST', body: JSON.stringify({ name: 'x' }) })).status, 400);

  // Priority: season > drop-in > guest in the confirmed order.
  const sea = await (
    await api('/api/players', { method: 'POST', headers: M, body: JSON.stringify(newPlayer({ name: 'GPSeason', type: 'season' })) })
  ).json();
  const drop = await (
    await api('/api/players', { method: 'POST', headers: M, body: JSON.stringify(newPlayer({ name: 'GPDrop', type: 'dropin' })) })
  ).json();
  await api('/api/checkin', { method: 'POST', body: JSON.stringify({ player_id: sea.id, status: 'in' }) });
  const b2 = await (await api('/api/checkin', { method: 'POST', body: JSON.stringify({ player_id: drop.id, status: 'in' }) })).json();
  const order = b2.confirmed.map((e) => e.name);
  assert.ok(order.indexOf('GPSeason') < order.indexOf('GPDrop'), 'season ranks above drop-in');
  assert.ok(order.indexOf('GPDrop') < order.indexOf('Guest One'), 'drop-in ranks above guest');

  // Per-game cap (5): we have 1 guest; add 4 more, the 6th is refused.
  for (let i = 0; i < 4; i++) {
    assert.equal(
      (await api('/api/checkin/guest', { method: 'POST', body: JSON.stringify({ name: 'GuestFill' + i }) })).status,
      200
    );
  }
  assert.equal((await api('/api/checkin/guest', { method: 'POST', body: JSON.stringify({ name: 'GuestOver' }) })).status, 429);

  // Kill-switch: admin turns self-add off -> 403 (checked before the cap).
  await api('/api/settings', { method: 'PUT', headers: M, body: JSON.stringify({ guests: { selfAdd: false } }) });
  assert.equal((await api('/api/checkin/guest', { method: 'POST', body: JSON.stringify({ name: 'GuestBlocked' }) })).status, 403);
  await api('/api/settings', { method: 'PUT', headers: M, body: JSON.stringify({ guests: { selfAdd: true } }) });
});

test('team loans: borrow tops up a short team, return-on-loss sends them home', async () => {
  // 12 season players -> the draw makes white/black 5 each and green 2.
  const ids = [];
  for (let i = 0; i < 12; i++) {
    const p = await (
      await api('/api/players', { method: 'POST', headers: M, body: JSON.stringify(newPlayer({ name: 'Loan' + i, type: 'season' })) })
    ).json();
    ids.push(p.id);
  }
  const s = await (await api('/api/sessions', { method: 'POST', headers: M, body: JSON.stringify({ player_ids: ids }) })).json();
  const drawn = await (await api('/api/sessions/' + s.id + '/draw', { method: 'POST', headers: M, body: JSON.stringify({}) })).json();
  const team = (v) => drawn.teams.find((t) => t.vest === v);
  const white = team('white'), black = team('black'), green = team('green');
  assert.equal(green.player_ids.length, 2, 'green starts short (2)');

  const sizeOf = (full, v) => full.teams.find((t) => t.vest === v).player_ids.length;
  const post = (body) => api('/api/matches', { method: 'POST', headers: M, body: JSON.stringify(body) });

  // Match 1: white v black, green benched.
  await post({ session_id: s.id, team_a_id: white.id, team_b_id: black.id, bench_team_id: green.id });

  // Match 2: white stays, green comes on and borrows 3 from black (the losers).
  await post({
    session_id: s.id, team_a_id: white.id, team_b_id: green.id, bench_team_id: black.id,
    borrow: { player_ids: black.player_ids.slice(0, 3) },
  });
  let full = await (await api('/api/sessions/' + s.id)).json();
  assert.equal(sizeOf(full, 'green'), 5, 'green topped up to 5');
  assert.equal(sizeOf(full, 'black'), 2, 'black lent 3 away');

  // Match 3: green loses -> green benched. Its borrowed players return to black.
  await post({ session_id: s.id, team_a_id: white.id, team_b_id: black.id, bench_team_id: green.id });
  full = await (await api('/api/sessions/' + s.id)).json();
  assert.equal(sizeOf(full, 'black'), 5, 'black got its 3 back when green lost');
  assert.equal(sizeOf(full, 'green'), 2, 'green back to its originals');
});

test('finished games are frozen: teams/draw/matches locked, admin stat fixes still allowed', async () => {
  // A prior test may have left an active session; only one can exist at a time.
  const active = await (await api('/api/sessions/active')).json();
  if (active && active.id) await api('/api/sessions/' + active.id + '/end', { method: 'POST', headers: M });

  const ids = [];
  for (let i = 0; i < 12; i++) {
    const p = await (
      await api('/api/players', { method: 'POST', headers: M, body: JSON.stringify(newPlayer({ name: 'Frz' + i, type: 'season' })) })
    ).json();
    ids.push(p.id);
  }
  const s = await (await api('/api/sessions', { method: 'POST', headers: M, body: JSON.stringify({ player_ids: ids }) })).json();
  const drawn = await (await api('/api/sessions/' + s.id + '/draw', { method: 'POST', headers: M, body: JSON.stringify({}) })).json();
  const team = (v) => drawn.teams.find((t) => t.vest === v);
  const white = team('white'), black = team('black'), green = team('green');
  const match = await (
    await api('/api/matches', {
      method: 'POST', headers: M,
      body: JSON.stringify({ session_id: s.id, team_a_id: white.id, team_b_id: black.id, bench_team_id: green.id }),
    })
  ).json();

  // While the game is live, the day's code lets anyone log stats; no code fails.
  const codeH = { 'x-racha-code': s.code };
  assert.equal(
    (await api('/api/events', { method: 'POST', body: JSON.stringify({ id: 'nocode' + Date.now(), match_id: match.id, type: 'goal', player_id: ids[0], team_id: white.id }) })).status,
    401,
    'no code -> cannot log stats'
  );
  const liveEv = await api('/api/events', {
    method: 'POST', headers: codeH,
    body: JSON.stringify({ id: 'liveev' + Date.now(), match_id: match.id, type: 'goal', player_id: ids[0], team_id: white.id }),
  });
  assert.equal(liveEv.status, 201, 'the day code can record stats during a live game');

  // End the game -> it is now frozen and the code stops working.
  assert.equal((await api('/api/sessions/' + s.id + '/end', { method: 'POST', headers: M })).status, 200);
  assert.equal(
    (await api('/api/events', { method: 'POST', headers: codeH, body: JSON.stringify({ id: 'frzcode' + Date.now(), match_id: match.id, type: 'goal', player_id: ids[0], team_id: white.id }) })).status,
    401,
    'the code no longer works once the game is finished'
  );

  // Structural changes are locked, even for an admin (master token).
  const P = (path, opts) => api(path, { headers: M, ...opts });
  assert.equal((await P('/api/sessions/' + s.id + '/draw', { method: 'POST', body: '{}' })).status, 409, 'draw locked');
  assert.equal(
    (await P('/api/sessions/' + s.id + '/teams/' + white.id + '/players', { method: 'POST', body: JSON.stringify({ player_id: ids[0] }) })).status,
    409, 'assign locked'
  );
  assert.equal(
    (await P('/api/sessions/' + s.id + '/teams/' + white.id + '/players/' + ids[0], { method: 'DELETE' })).status,
    409, 'remove locked'
  );
  assert.equal(
    (await P('/api/matches', { method: 'POST', body: JSON.stringify({ session_id: s.id, team_a_id: white.id, team_b_id: green.id, bench_team_id: black.id }) })).status,
    409, 'new match locked'
  );
  assert.equal((await P('/api/matches/' + match.id + '/start', { method: 'POST' })).status, 409, 'clock locked');

  // Stat corrections stay open to admins (events are not frozen).
  const ev = await P('/api/events', {
    method: 'POST',
    body: JSON.stringify({ id: 'frzev' + Date.now(), match_id: match.id, type: 'goal', player_id: ids[0], team_id: white.id }),
  });
  assert.equal(ev.status, 201, 'admin can still fix stats on a finished game');
});

test('delete match: tidy-up removes it and renumbers the rest; frozen locks it', async () => {
  const active = await (await api('/api/sessions/active')).json();
  if (active && active.id) await api('/api/sessions/' + active.id + '/end', { method: 'POST', headers: M });

  const ids = [];
  for (let i = 0; i < 12; i++) {
    const p = await (
      await api('/api/players', { method: 'POST', headers: M, body: JSON.stringify(newPlayer({ name: 'Del' + i, type: 'season' })) })
    ).json();
    ids.push(p.id);
  }
  const s = await (await api('/api/sessions', { method: 'POST', headers: M, body: JSON.stringify({ player_ids: ids }) })).json();
  const drawn = await (await api('/api/sessions/' + s.id + '/draw', { method: 'POST', headers: M, body: JSON.stringify({}) })).json();
  const team = (v) => drawn.teams.find((t) => t.vest === v);
  const white = team('white'), black = team('black'), green = team('green');
  const mk = (a, b, bench) =>
    api('/api/matches', { method: 'POST', headers: M, body: JSON.stringify({ session_id: s.id, team_a_id: a, team_b_id: b, bench_team_id: bench }) });
  const m1 = await (await mk(white.id, black.id, green.id)).json();
  const m2 = await (await mk(white.id, green.id, black.id)).json();
  assert.equal(m1.ordinal, 1);
  assert.equal(m2.ordinal, 2);

  // Delete match 1 -> match 2 renumbers to ordinal 1.
  assert.equal((await api('/api/matches/' + m1.id, { method: 'DELETE', headers: M })).status, 200);
  const full = await (await api('/api/sessions/' + s.id)).json();
  assert.equal(full.matches.length, 1, 'one match remains');
  assert.equal(full.matches[0].id, m2.id);
  assert.equal(full.matches[0].ordinal, 1, 'remaining match renumbered to 1');

  // Freeze the session -> deleting a match is locked.
  await api('/api/sessions/' + s.id + '/end', { method: 'POST', headers: M });
  assert.equal((await api('/api/matches/' + m2.id, { method: 'DELETE', headers: M })).status, 409);
});

test("the day's code runs the live game; opening/closing/deleting stays admin", async () => {
  const active = await (await api('/api/sessions/active')).json();
  if (active && active.id) await api('/api/sessions/' + active.id + '/end', { method: 'POST', headers: M });

  const ids = [];
  for (let i = 0; i < 12; i++) {
    const p = await (
      await api('/api/players', { method: 'POST', headers: M, body: JSON.stringify(newPlayer({ name: 'Open' + i, type: 'season' })) })
    ).json();
    ids.push(p.id);
  }

  // Opening a session needs an admin.
  assert.equal(
    (await api('/api/sessions', { method: 'POST', body: JSON.stringify({ player_ids: ids }) })).status,
    401, 'opening a session needs admin'
  );
  const created = await (await api('/api/sessions', { method: 'POST', headers: M, body: JSON.stringify({ player_ids: ids }) })).json();
  const s = created.id;
  assert.match(created.code, /^\d{4}$/, 'session gets a 4-digit code');
  const C = { 'x-racha-code': created.code };
  const wrong = { 'x-racha-code': created.code === '0000' ? '9999' : '0000' };

  // Without the code you can't run the game; a wrong code is refused; the code works.
  assert.equal((await api('/api/sessions/' + s + '/draw', { method: 'POST', body: '{}' })).status, 401, 'no code -> blocked');
  assert.equal((await api('/api/sessions/' + s + '/draw', { method: 'POST', headers: wrong, body: '{}' })).status, 401, 'wrong code -> blocked');
  const drawn = await (await api('/api/sessions/' + s + '/draw', { method: 'POST', headers: C, body: '{}' })).json();
  assert.ok(Array.isArray(drawn.teams) && drawn.teams.length === 3, 'the code can draw teams');
  const team = (v) => drawn.teams.find((t) => t.vest === v);
  const white = team('white'), black = team('black'), green = team('green');
  const match = await api('/api/matches', {
    method: 'POST', headers: C, body: JSON.stringify({ session_id: s, team_a_id: white.id, team_b_id: black.id, bench_team_id: green.id }),
  });
  assert.equal(match.status, 201, 'the code can create a match');
  const mj = await match.json();
  assert.equal((await api('/api/matches/' + mj.id + '/start', { method: 'POST', headers: C })).status, 200, 'the code can start the clock');
  // Can't pile up a new match while one is on the clock (running/paused).
  assert.equal(
    (await api('/api/matches', { method: 'POST', headers: C, body: JSON.stringify({ session_id: s, team_a_id: white.id, team_b_id: green.id, bench_team_id: black.id }) })).status,
    409, 'no new match while one is in progress'
  );
  assert.equal(
    (await api('/api/sessions/' + s + '/teams/' + green.id + '/players', { method: 'POST', headers: C, body: JSON.stringify({ player_id: ids[0] }) })).status,
    200, 'the code can move a player'
  );

  // The code can't delete a match or the session — that stays a real admin.
  assert.equal((await api('/api/matches/' + mj.id, { method: 'DELETE', headers: C })).status, 401, 'code cannot delete a match');
  assert.equal((await api('/api/matches/' + mj.id, { method: 'DELETE', headers: M })).status, 200);
  assert.equal((await api('/api/sessions/' + s, { method: 'DELETE', headers: C })).status, 401, 'code cannot delete the session');
  await api('/api/sessions/' + s, { method: 'DELETE', headers: M }); // cleanup

  // The code is admin-only to read back: a non-admin GET must not expose it.
  const created2 = await (await api('/api/sessions', { method: 'POST', headers: M, body: JSON.stringify({ player_ids: ids }) })).json();
  const pubActive = await (await api('/api/sessions/active')).json();
  assert.equal(pubActive.code, null, 'the code is hidden from non-admins');
  const admActive = await (await api('/api/sessions/active', { headers: M })).json();
  assert.equal(admActive.code, created2.code, 'admins see the code');
  await api('/api/sessions/' + created2.id, { method: 'DELETE', headers: M }); // cleanup
});

test('invalid input -> 400 (not 500)', async () => {
  assert.equal(
    (await api('/api/players', { method: 'POST', headers: M, body: JSON.stringify({ name: '' }) })).status,
    400
  );
});
