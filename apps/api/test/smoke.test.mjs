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

test('invalid input -> 400 (not 500)', async () => {
  assert.equal(
    (await api('/api/players', { method: 'POST', headers: M, body: JSON.stringify({ name: '' }) })).status,
    400
  );
});
