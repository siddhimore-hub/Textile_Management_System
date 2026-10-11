// Offline queue tests. Runs in plain Node with a tiny fake browser (localStorage, window events, fetch).
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
globalThis.window = new EventTarget();
let calls = []; let behave = () => ({ ok: true, status: 200, json: { data: { ok: true } } });
globalThis.fetch = async (url, init) => {
  calls.push({ url, ...init, body: init.body ? JSON.parse(init.body) : undefined });
  const r = behave(url, init, calls.length);
  if (r === 'offline') throw new TypeError('Failed to fetch');
  return { ok: r.ok, status: r.status, json: async () => r.json };
};
const { api, flushQueue, queueState, setToken, dismissFailed } = await import('../src/lib/api.js');
const OUT = '/jobs/5/output';

beforeEach(() => { store.clear(); calls = []; behave = () => ({ ok: true, status: 200, json: { data: { ok: true } } }); setToken('tok'); });

test('online write carries the login token and a fresh Idempotency-Key', async () => {
  await api(OUT, { method: 'POST', body: { metres: 10 } });
  await api(OUT, { method: 'POST', body: { metres: 10 } });
  assert.equal(calls[0].headers.Authorization, 'Bearer tok');
  assert.ok(calls[0].headers['Idempotency-Key']); assert.notEqual(calls[0].headers['Idempotency-Key'], calls[1].headers['Idempotency-Key']);
  assert.equal(queueState().pending.length, 0);
});

test('reads never get an Idempotency-Key', async () => {
  await api('/orders'); assert.equal(calls[0].headers['Idempotency-Key'], undefined);
});

test('offline floor entry is saved on the device and reported as queued', async () => {
  behave = () => 'offline';
  const r = await api(OUT, { method: 'POST', body: { metres: 25 } });
  assert.deepEqual(r, { queued: true });
  const [item] = queueState().pending;
  assert.equal(item.path, OUT); assert.deepEqual(item.body, { metres: 25 }); assert.ok(item.key);
});

test('offline entries that are not floor entries fail loudly instead of queueing', async () => {
  behave = () => 'offline';
  await assert.rejects(api('/orders', { method: 'POST', body: {} }), /No connection/);
  await assert.rejects(api('/payments', { method: 'POST', body: {} }), /No connection/);
  assert.equal(queueState().pending.length, 0);
});

test('every floor entry type can be queued', async () => {
  behave = () => 'offline';
  for (const [m, p] of [['POST', '/rolls'], ['POST', '/rolls/3/inspect'], ['POST', '/attendance'], ['PATCH', '/machines/2/status'], ['POST', OUT]]) await api(p, { method: m, body: { a: 1 } });
  assert.equal(queueState().pending.length, 5);
});

test('coming back online sends entries in order, once, with their original keys', async () => {
  behave = () => 'offline';
  await api(OUT, { method: 'POST', body: { metres: 1 } }); await api(OUT, { method: 'POST', body: { metres: 2 } });
  const keys = queueState().pending.map((p) => p.key);
  calls = []; behave = () => ({ ok: true, status: 201, json: { data: { ok: true } } });
  await flushQueue();
  assert.deepEqual(calls.map((c) => c.body.metres), [1, 2]);
  assert.deepEqual(calls.map((c) => c.headers['Idempotency-Key']), keys);
  assert.equal(queueState().pending.length, 0);
  calls = []; await flushQueue(); assert.equal(calls.length, 0);
});

test('still offline during a flush: nothing is lost and order is kept', async () => {
  behave = () => 'offline';
  await api(OUT, { method: 'POST', body: { metres: 1 } }); await api(OUT, { method: 'POST', body: { metres: 2 } });
  await flushQueue();
  assert.deepEqual(queueState().pending.map((p) => p.body.metres), [1, 2]);
});

test('connection drops half way: sent ones are removed, the rest wait', async () => {
  behave = () => 'offline';
  for (const m of [1, 2, 3]) await api(OUT, { method: 'POST', body: { metres: m } });
  behave = (_u, _i, n) => (n <= 1 ? { ok: true, status: 201, json: { data: {} } } : 'offline');
  calls = []; await flushQueue();
  assert.deepEqual(queueState().pending.map((p) => p.body.metres), [2, 3]);
});

test('an entry the server refuses moves to the failed list and the rest still go', async () => {
  behave = () => 'offline';
  for (const m of [1, 2, 3]) await api(OUT, { method: 'POST', body: { metres: m } });
  behave = (_u, i) => (JSON.parse(i.body).metres === 2 ? { ok: false, status: 400, json: { error: { message: 'Job already finished' } } } : { ok: true, status: 201, json: { data: {} } });
  await flushQueue();
  const s = queueState();
  assert.equal(s.pending.length, 0); assert.equal(s.failed.length, 1);
  assert.equal(s.failed[0].error, 'Job already finished'); assert.equal(s.failed[0].body.metres, 2);
  dismissFailed(); assert.equal(queueState().failed.length, 0);
});

test('session expired: entries are kept until the person logs in again', async () => {
  behave = () => 'offline';
  await api(OUT, { method: 'POST', body: { metres: 9 } });
  behave = () => ({ ok: false, status: 401, json: { error: { message: 'Please log in' } } });
  await flushQueue();
  assert.equal(queueState().pending.length, 1); assert.equal(queueState().failed.length, 0);
});

test('no token, no sending', async () => {
  behave = () => 'offline';
  await api(OUT, { method: 'POST', body: { metres: 9 } });
  setToken(null); behave = () => ({ ok: true, status: 201, json: { data: {} } }); calls = [];
  await flushQueue(); assert.equal(calls.length, 0); assert.equal(queueState().pending.length, 1);
});

test('queue changes announce themselves so the banner updates', async () => {
  let fired = 0; window.addEventListener('mill-queue', () => fired++);
  behave = () => 'offline'; await api(OUT, { method: 'POST', body: { metres: 1 } });
  assert.ok(fired >= 1);
});
