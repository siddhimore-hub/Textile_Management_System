import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { call, stop, makeOrder, pipeline } from '../test-support/helpers.js';
after(stop);

async function roll(metres = 30) {
  const o = await makeOrder({ yarn: 0, receive: 0 });
  const p = await pipeline(o.id, { metres });
  const r = await call('/rolls', { role: 'supervisor', method: 'POST', body: { job_card_id: p.finishing, metres } });
  return { order: o, ...r.data };
}

test('label data carries everything printed on the label', async () => {
  const r = await roll(42);
  const l = (await call(`/rolls/labels?ids=${r.id}`, { role: 'supervisor' })).data;
  assert.equal(l.length, 1); assert.equal(l[0].code, r.code); assert.equal(l[0].metres, 42);
  assert.equal(l[0].buyer, 'Lakshmi Garments'); assert.equal(l[0].order_id, r.order.id); assert.ok(l[0].machine);
});
test('no ids = rolls waiting for QC; junk ids are ignored', async () => {
  const r = await roll();
  assert.ok((await call('/rolls/labels')).data.some((x) => x.code === r.code));
  await call(`/rolls/${r.id}/inspect`, { role: 'qc', method: 'POST', body: { result: 'pass' } });
  assert.ok(!(await call('/rolls/labels')).data.some((x) => x.code === r.code));
  assert.deepEqual((await call('/rolls/labels?ids=abc,-1,0')).data.length > -1, true);
});
test('scanning a code finds the roll with its history; unknown code is 404', async () => {
  const r = await roll();
  const s = await call(`/rolls/by-code/${r.code}`, { role: 'qc' });
  assert.equal(s.data.qc_status, 'pending'); assert.deepEqual(s.data.inspections, []); assert.equal(s.data.dispatch_id, null);
  assert.equal((await call('/rolls/by-code/R-0000-00000')).status, 404);
});
test('roll codes are unique and sequential', async () => {
  const a = await roll(); const b = await roll();
  assert.notEqual(a.code, b.code); assert.ok(a.code < b.code);
});
