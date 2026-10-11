import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { call, anon, base, stop, db } from '../test-support/helpers.js';
after(stop);

test('every protected endpoint needs a login', async () => {
  for (const p of ['/orders', '/stock', '/dashboard', '/notifications', '/audit-logs']) assert.equal((await anon(p)).status, 401, p);
  assert.equal((await anon('/health')).status, 200);
});

test('wrong password is refused and unknown email gives the same answer', async () => {
  const a = await anon('/auth/login', { method: 'POST', body: { email: 'owner@everest.test', password: 'nope' } });
  const b = await anon('/auth/login', { method: 'POST', body: { email: 'ghost@everest.test', password: 'nope' } });
  assert.equal(a.status, 401); assert.equal(b.status, 401); assert.equal(a.error.message, b.error.message);
});

test('login gives a token that works until logout', async () => {
  const l = await anon('/auth/login', { method: 'POST', body: { email: 'OWNER@everest.test', password: 'everest123' } });
  assert.equal(l.status, 200);
  const me = await call('/auth/me', { role: null, token: l.data.token });
  assert.equal(me.data.role, 'owner');
  await call('/auth/logout', { role: null, token: l.data.token, method: 'POST' });
  assert.equal((await call('/auth/me', { role: null, token: l.data.token })).status, 401);
});

test('roles: each role can do its own job and not others', async () => {
  const order = { buyer_id: 1, fabric_type: 'xx', colour: 'yy', qty_metres: 10, price_per_metre: 1, deadline: '2999-01-01' };
  assert.equal((await call('/orders', { role: 'store', method: 'POST', body: order })).status, 403);
  assert.equal((await call('/orders', { role: 'sales', method: 'POST', body: order })).status, 201);
  assert.equal((await call('/receipts', { role: 'sales', method: 'POST', body: { material_id: 1, supplier_id: 1, qty: 1, lot_no: 'L' } })).status, 403);
  assert.equal((await call('/receipts', { role: 'store', method: 'POST', body: { material_id: 1, supplier_id: 1, qty: 1, lot_no: 'L' } })).status, 201);
  assert.equal((await call('/rolls/1/inspect', { role: 'supervisor', method: 'POST', body: { result: 'pass' } })).status, 403);
  assert.equal((await call('/payments', { role: 'qc', method: 'POST', body: { invoice_id: 1, amount: 1 } })).status, 403);
  assert.equal((await call('/machines/1/status', { role: 'qc', method: 'PATCH', body: { status: 'idle' } })).status, 403);
  assert.equal((await call('/machines/1/status', { role: 'supervisor', method: 'PATCH', body: { status: 'idle' } })).status, 200);
});

test('finance data and admin data are hidden from other roles', async () => {
  assert.equal((await call('/finance/summary', { role: 'store' })).status, 403);
  assert.equal((await call('/finance/summary', { role: 'accounts' })).status, 200);
  assert.equal((await call('/payroll', { role: 'sales' })).status, 403);
  assert.equal((await call('/users', { role: 'accounts' })).status, 403);
  assert.equal((await call('/audit-logs', { role: 'sales' })).status, 403);
  assert.equal((await call('/audit-logs', { role: 'owner' })).status, 200);
});

test('owner manages users; cannot lock themselves out', async () => {
  const add = await call('/users', { method: 'POST', body: { name: 'New Qc', email: 'newqc@everest.test', role: 'qc', password: 'longenough1' } });
  assert.equal(add.status, 201);
  assert.equal((await call('/users', { method: 'POST', body: { name: 'Dup', email: 'newqc@everest.test', role: 'qc', password: 'longenough1' } })).status, 409);
  assert.equal((await call('/users', { method: 'POST', body: { name: 'Short', email: 's@e.test', role: 'qc', password: 'short' } })).status, 400);
  const login = await anon('/auth/login', { method: 'POST', body: { email: 'newqc@everest.test', password: 'longenough1' } });
  assert.equal(login.status, 200);
  await call(`/users/${add.data.id}`, { method: 'PATCH', body: { active: false } });
  assert.equal((await call('/auth/me', { role: null, token: login.data.token })).status, 401, 'switching off ends their session');
  assert.equal((await anon('/auth/login', { method: 'POST', body: { email: 'newqc@everest.test', password: 'longenough1' } })).status, 401);
  const self = await call('/users/1', { method: 'PATCH', body: { active: false } });
  assert.equal(self.status, 400); assert.equal(self.error.code, 'SELF_LOCKOUT');
});

test('changing password needs the current one and logs out other devices', async () => {
  const mk = () => anon('/auth/login', { method: 'POST', body: { email: 'acc@everest.test', password: 'everest123' } });
  const a = await mk(); const b = await mk();
  const bad = await call('/auth/password', { role: null, token: a.data.token, method: 'POST', body: { current: 'wrong', next: 'brandnew123' } });
  assert.equal(bad.status, 400);
  assert.equal((await call('/auth/password', { role: null, token: a.data.token, method: 'POST', body: { current: 'everest123', next: 'brandnew123' } })).status, 200);
  assert.equal((await call('/auth/me', { role: null, token: b.data.token })).status, 401);
  assert.equal((await call('/auth/me', { role: null, token: a.data.token })).status, 200);
  assert.equal((await anon('/auth/login', { method: 'POST', body: { email: 'acc@everest.test', password: 'brandnew123' } })).status, 200);
});

test('too many wrong passwords locks the account for a while', async () => {
  let last;
  for (let i = 0; i < 6; i++) last = await anon('/auth/login', { method: 'POST', body: { email: 'sales@everest.test', password: `bad${i}` } });
  assert.equal(last.status, 429);
});

test('passwords are stored hashed, never plain', () => {
  const row = db.prepare("SELECT password_hash FROM users WHERE email='owner@everest.test'").get();
  assert.ok(row.password_hash.includes(':')); assert.ok(!row.password_hash.includes('everest123'));
});
