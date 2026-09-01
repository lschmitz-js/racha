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

test('check-in: season only, public, toggle to clear', async () => {
  const sea = await (
    await api('/api/players', { method: 'POST', headers: M, body: JSON.stringify(newPlayer({ name: 'Sea1', type: 'season' })) })
  ).json();
  const drop = await (
    await api('/api/players', { method: 'POST', headers: M, body: JSON.stringify(newPlayer({ name: 'Drop1', type: 'dropin' })) })
  ).json();

  // Public write (no auth): a season player checks in.
  const board = await (await api('/api/checkin', { method: 'POST', body: JSON.stringify({ player_id: sea.id, status: 'in' }) })).json();
  assert.ok(board.confirmed.some((e) => e.id === sea.id), 'season player is confirmed');

  // Drop-ins can't check in.
  assert.equal(
    (await api('/api/checkin', { method: 'POST', body: JSON.stringify({ player_id: drop.id, status: 'in' }) })).status,
    400,
    'check-in is season-only'
  );

  // Pressing again ('none') clears the check-in entirely.
  const cleared = await (await api('/api/checkin', { method: 'POST', body: JSON.stringify({ player_id: sea.id, status: 'none' }) })).json();
  assert.ok(!cleared.confirmed.some((e) => e.id === sea.id) && !cleared.out.some((e) => e.id === sea.id), 'cleared back to no response');

  // Unknown player is rejected.
  assert.equal((await api('/api/checkin', { method: 'POST', body: JSON.stringify({ player_id: 'nope', status: 'in' }) })).status, 404);
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

test('invalid input -> 400 (not 500)', async () => {
  assert.equal(
    (await api('/api/players', { method: 'POST', headers: M, body: JSON.stringify({ name: '' }) })).status,
    400
  );
});
