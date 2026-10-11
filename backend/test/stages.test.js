import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { call, stop, db, makeOrder } from '../test-support/helpers.js';
after(stop);

const finMachine = () => db.prepare("SELECT id FROM machines WHERE stage='finishing' LIMIT 1").get().id;
const avail = async (stage) => (await call(`/jobs/available?stage=${stage}`)).data;

test('spinning -> loom -> dyeing -> finishing -> rolls, nothing moves before completion', async () => {
  const o = await makeOrder({ yarn: 0, receive: 0 });
  assert.deepEqual(await avail('spinning'), []);

  // Spinning starts from the order; running output is not available to Loom.
  const spin = await call('/jobs', { role: 'supervisor', method: 'POST', body: { order_id: o.id, machine_id: 1, shift: 'morning' } });
  assert.equal(spin.status, 201);
  assert.equal((await call('/jobs', { role: 'supervisor', method: 'POST', body: { source_job_id: spin.data.id, machine_id: 2, shift: 'morning' } })).error.code, 'STAGE_INCOMPLETE');
  await call(`/jobs/${spin.data.id}/output`, { role: 'supervisor', method: 'POST', body: { metres: 120 } });
  await call(`/jobs/${spin.data.id}/finish`, { role: 'supervisor', method: 'POST' });
  // Completed spinning material cannot jump to dyeing, only to weaving.
  assert.equal((await call('/jobs', { role: 'supervisor', method: 'POST', body: { source_job_id: spin.data.id, machine_id: 4, shift: 'morning' } })).error.code, 'WRONG_STAGE');
  const spun = await avail('spinning');
  assert.equal(spun.length, 1); assert.equal(spun[0].order_id, o.id); assert.equal(spun[0].available_metres, 120);

  // Loom consumes the batch once; the same material cannot be used twice.
  const weave = await call('/jobs', { role: 'supervisor', method: 'POST', body: { source_job_id: spin.data.id, machine_id: 2, shift: 'morning' } });
  assert.equal(weave.status, 201);
  assert.equal(db.prepare('SELECT order_id, stage, source_job_id FROM job_cards WHERE id=?').get(weave.data.id).order_id, o.id);
  assert.deepEqual(await avail('spinning'), []);
  assert.equal((await call('/jobs', { role: 'supervisor', method: 'POST', body: { source_job_id: spin.data.id, machine_id: 3, shift: 'morning' } })).error.code, 'CONFLICT');
  assert.deepEqual(await avail('weaving'), []);
  await call(`/jobs/${weave.data.id}/output`, { role: 'supervisor', method: 'POST', body: { metres: 110 } });
  await call(`/jobs/${weave.data.id}/finish`, { role: 'supervisor', method: 'POST' });
  assert.equal((await avail('weaving'))[0].available_metres, 110);

  // Dyeing takes the woven batch, then finishing takes the dyed batch.
  const dye = await call('/jobs', { role: 'supervisor', method: 'POST', body: { source_job_id: weave.data.id, machine_id: 4, shift: 'morning' } });
  assert.equal(dye.status, 201);
  await call(`/jobs/${dye.data.id}/output`, { role: 'supervisor', method: 'POST', body: { metres: 100 } });
  await call(`/jobs/${dye.data.id}/finish`, { role: 'supervisor', method: 'POST' });
  const fin = await call('/jobs', { role: 'supervisor', method: 'POST', body: { source_job_id: dye.data.id, machine_id: finMachine(), shift: 'morning' } });
  assert.equal(fin.status, 201);
  // A running finishing job cannot make a roll yet.
  assert.equal((await call('/rolls', { role: 'supervisor', method: 'POST', body: { job_card_id: fin.data.id, metres: 10 } })).error.code, 'NOT_FINISHED');
  await call(`/jobs/${fin.data.id}/output`, { role: 'supervisor', method: 'POST', body: { metres: 90 } });
  await call(`/jobs/${fin.data.id}/finish`, { role: 'supervisor', method: 'POST' });

  // Finished material is now eligible, but roll length cannot exceed what is left.
  const ready = await avail('finishing');
  assert.equal(ready.length, 1); assert.equal(ready[0].order_id, o.id); assert.equal(ready[0].available_metres, 90);
  assert.equal((await call('/rolls', { role: 'supervisor', method: 'POST', body: { job_card_id: fin.data.id, metres: 91 } })).error.code, 'EXCEEDS_AVAILABLE');
  const r1 = await call('/rolls', { role: 'supervisor', method: 'POST', body: { job_card_id: fin.data.id, metres: 60 } });
  const r2 = await call('/rolls', { role: 'supervisor', method: 'POST', body: { job_card_id: fin.data.id, metres: 30 } });
  assert.equal(r1.status, 201); assert.equal(r2.status, 201);
  assert.equal((await call('/rolls', { role: 'supervisor', method: 'POST', body: { job_card_id: fin.data.id, metres: 1 } })).error.code, 'EXCEEDS_AVAILABLE');
  // New rolls are pending for QC and carry the original order.
  const pending = (await call('/rolls?qc_status=pending')).data;
  assert.ok(pending.some((r) => r.id === r1.data.id && r.order_id === o.id));
  assert.ok(pending.some((r) => r.id === r2.data.id));
  assert.deepEqual(await avail('finishing'), []);
});

test('machines are released after every completed stage', async () => {
  const o = await makeOrder({ yarn: 0, receive: 0 });
  const spin = await call('/jobs', { role: 'supervisor', method: 'POST', body: { order_id: o.id, machine_id: 1, shift: 'morning' } });
  await call(`/jobs/${spin.data.id}/output`, { role: 'supervisor', method: 'POST', body: { metres: 10 } });
  await call(`/jobs/${spin.data.id}/finish`, { role: 'supervisor', method: 'POST' });
  const m = db.prepare('SELECT id, status FROM machines WHERE id BETWEEN 1 AND 5').all();
  assert.ok(m.every((x) => x.status === 'idle'));
});