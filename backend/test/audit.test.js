import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { call, anon, stop, db } from '../test-support/helpers.js';
after(stop);
// Warm up: the first call per role logs in, and a login is itself an audit row.
import { before } from 'node:test';
before(async () => { for (const role of ['sales', 'store']) await call('/buyers', { role }); });
const count = () => db.prepare('SELECT COUNT(*) c FROM audit_logs').get().c;

test('a successful change is logged with who, what and the record id', async () => {
  const before = count();
  const r = await call('/buyers', { role: 'sales', method: 'POST', body: { name: 'Audit Buyer', phone: '9111111111' } });
  assert.equal(count(), before + 1);
  const row = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 1').get();
  assert.match(row.actor, /Sales \(sales\)/); assert.equal(row.action, 'POST /buyers'); assert.equal(row.entity, 'buyers'); assert.equal(row.entity_id, r.data.id);
});
test('reads, refused and invalid requests are not logged as changes', async () => {
  const before = count();
  await call('/buyers', { role: 'sales' });
  await call('/buyers', { role: 'store', method: 'POST', body: { name: 'No', phone: '9111111112' } }); // 403
  await call('/buyers', { role: 'sales', method: 'POST', body: { name: 'X', phone: '1' } }); // 400
  assert.equal(count(), before);
});
test('logins (good and bad) are logged', async () => {
  await anon('/auth/login', { method: 'POST', body: { email: 'qc@everest.test', password: 'everest123' } });
  await anon('/auth/login', { method: 'POST', body: { email: 'qc@everest.test', password: 'wrong' } });
  const actions = db.prepare('SELECT action FROM audit_logs ORDER BY id DESC LIMIT 2').all().map((x) => x.action);
  assert.deepEqual(actions, ['LOGIN FAILED', 'LOGIN']);
});
test('owner can read and filter the log', async () => {
  const all = await call('/audit-logs'); assert.ok(all.data.length >= 3);
  const f = await call('/audit-logs?actor=Sales'); assert.ok(f.data.length >= 1 && f.data.every((x) => x.actor.includes('Sales')));
});
