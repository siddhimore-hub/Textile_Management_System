import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { call, stop, db, makeOrder, anon } from '../test-support/helpers.js';
after(stop);

test('the same Idempotency-Key writes only once and replays the first answer', async () => {
  const o = await makeOrder({ yarn: 0, receive: 0 });
  const job = await call('/jobs', { role: 'supervisor', method: 'POST', body: { order_id: o.id, machine_id: 1, shift: 'morning' } });
  const headers = { 'Idempotency-Key': 'queued-entry-1' };
  const a = await call(`/jobs/${job.data.id}/output`, { role: 'supervisor', method: 'POST', body: { metres: 40 }, headers });
  const b = await call(`/jobs/${job.data.id}/output`, { role: 'supervisor', method: 'POST', body: { metres: 40 }, headers });
  assert.equal(a.status, 201); assert.equal(b.status, 201); assert.equal(b.headers.get('idempotent-replay'), 'true');
  assert.equal(db.prepare('SELECT COUNT(*) c FROM production_logs WHERE job_card_id=?').get(job.data.id).c, 1);
  await call(`/jobs/${job.data.id}/output`, { role: 'supervisor', method: 'POST', body: { metres: 40 }, headers: { 'Idempotency-Key': 'queued-entry-2' } });
  assert.equal(db.prepare('SELECT COUNT(*) c FROM production_logs WHERE job_card_id=?').get(job.data.id).c, 2);
  await call(`/jobs/${job.data.id}/finish`, { role: 'supervisor', method: 'POST' }); // free the machine for the next test
});

test('keys are per user, so one user cannot replay another user\'s answer', async () => {
  const headers = { 'Idempotency-Key': 'shared-key' };
  const a = await call('/attendance', { role: 'supervisor', method: 'POST', body: { worker_id: 1, work_date: '2026-01-05', status: 'present' }, headers });
  const b = await call('/attendance', { role: 'accounts', method: 'POST', body: { worker_id: 2, work_date: '2026-01-05', status: 'present' }, headers });
  assert.equal(a.status, 201); assert.equal(b.status, 201); assert.equal(b.headers.get('idempotent-replay'), null);
});

test('a refused request is also replayed as refused (no surprise second try)', async () => {
  const headers = { 'Idempotency-Key': 'bad-one' };
  const a = await call('/attendance', { role: 'supervisor', method: 'POST', body: { worker_id: 1, work_date: '2026-01-05', status: 'present' }, headers });
  assert.equal(a.status, 409);
  assert.equal((await call('/attendance', { role: 'supervisor', method: 'POST', body: { worker_id: 1, work_date: '2026-01-05', status: 'present' }, headers })).status, 409);
});

test('queued floor entries keep working after the data they refer to moves on', async () => {
  // A phone queued "log 30 m" for a job that was finished meanwhile: the server must refuse it cleanly, not crash.
  const o = await makeOrder({ yarn: 0, receive: 0 });
  const job = await call('/jobs', { role: 'supervisor', method: 'POST', body: { order_id: o.id, machine_id: 1, shift: 'evening' } });
  await call(`/jobs/${job.data.id}/finish`, { role: 'supervisor', method: 'POST' });
  const late = await call(`/jobs/${job.data.id}/output`, { role: 'supervisor', method: 'POST', body: { metres: 30 }, headers: { 'Idempotency-Key': 'late-1' } });
  assert.equal(late.status, 400); assert.match(late.error.message, /already finished/);
  assert.equal((await anon('/health')).status, 200);
});
