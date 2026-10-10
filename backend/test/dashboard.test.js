import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { call, stop, db, makeOrder, pipeline, inDays } from '../test-support/helpers.js';
after(stop);

const risk = async () => (await call('/dashboard/at-risk')).data;

test('trend returns one row per day, oldest first, with today\'s output', async () => {
  const o = await makeOrder({ yarn: 0, receive: 0 });
  const job = await call('/jobs', { role: 'supervisor', method: 'POST', body: { order_id: o.id, machine_id: 1, shift: 'morning' } });
  await call(`/jobs/${job.data.id}/output`, { role: 'supervisor', method: 'POST', body: { metres: 75 } });
  await call(`/jobs/${job.data.id}/finish`, { role: 'supervisor', method: 'POST' });
  const t = (await call('/dashboard/trend?days=7')).data;
  assert.equal(t.length, 7); assert.ok(t[0].day < t[6].day);
  assert.equal(t[6].metres, 75); assert.equal(t[0].metres, 0);
  assert.equal((await call('/dashboard/trend?days=500')).data.length, 90); // capped
});

test('orders at risk: overdue, due soon, behind schedule; healthy orders are left out', async () => {
  const ok = await makeOrder({ yarn: 0, receive: 0, deadline: inDays(60) });
  const soon = await makeOrder({ yarn: 0, receive: 0, deadline: inDays(2) });
  const late = await makeOrder({ yarn: 0, receive: 0, deadline: inDays(10) });
  db.prepare("UPDATE orders SET deadline=date('now','-3 days') WHERE id=?").run(late.id); // pushed into the past
  const behind = await makeOrder({ yarn: 0, receive: 0, deadline: inDays(10) });
  db.prepare("UPDATE orders SET created_at=datetime('now','-18 days') WHERE id=?").run(behind.id); // 18 of 28 days gone, 0% made
  const r = await risk(); const by = Object.fromEntries(r.map((x) => [x.order_id, x]));
  assert.equal(by[late.id].risk, 'overdue'); assert.equal(by[late.id].days_left, -3);
  assert.equal(by[soon.id].risk, 'due_soon');
  assert.equal(by[behind.id].risk, 'behind');
  assert.equal(by[ok.id], undefined);
  const order = r.map((x) => x.risk); assert.ok(order.indexOf('overdue') < order.indexOf('due_soon') && order.indexOf('due_soon') < order.indexOf('behind'));
});

test('a dispatched order is never at risk, even if late', async () => {
  const o = await makeOrder({ yarn: 0, receive: 0, metres: 10, deadline: inDays(5) });
  const p = await pipeline(o.id, { metres: 10 });
  const roll = await call('/rolls', { role: 'supervisor', method: 'POST', body: { job_card_id: p.finishing, metres: 10 } });
  await call(`/rolls/${roll.data.id}/inspect`, { role: 'qc', method: 'POST', body: { result: 'pass' } });
  await call('/dispatches', { role: 'sales', method: 'POST', body: { order_id: o.id, roll_ids: [roll.data.id], vehicle_no: 'TN09AB1234' } });
  db.prepare("UPDATE orders SET deadline=date('now','-9 days') WHERE id=?").run(o.id);
  assert.ok(!(await risk()).some((x) => x.order_id === o.id));
});

test('yarn shortage with a near deadline is flagged', async () => {
  const o = await makeOrder({ yarn: 99999, receive: 0, deadline: inDays(6) });
  const hit = (await risk()).find((x) => x.order_id === o.id);
  assert.ok(hit); assert.equal(hit.yarn_short, true);
});

test('receivables per buyer show billed, paid and outstanding', async () => {
  const get = async () => (await call('/finance/receivables', { role: 'accounts' })).data.find((x) => x.buyer_id === 1) || { billed: 0, paid: 0, outstanding: 0 };
  const was = await get();
  const o = await makeOrder({ yarn: 0, receive: 0, metres: 20 });
  const p = await pipeline(o.id, { metres: 20 });
  const roll = await call('/rolls', { role: 'supervisor', method: 'POST', body: { job_card_id: p.finishing, metres: 20 } });
  await call(`/rolls/${roll.data.id}/inspect`, { role: 'qc', method: 'POST', body: { result: 'pass' } });
  const d = await call('/dispatches', { role: 'sales', method: 'POST', body: { order_id: o.id, roll_ids: [roll.data.id], vehicle_no: 'TN09AB1234' } });
  await call('/payments', { role: 'accounts', method: 'POST', body: { invoice_id: d.data.invoice_id, amount: 500 } });
  const rec = await get();
  assert.equal(rec.billed - was.billed, 2000); assert.equal(rec.paid - was.paid, 500); assert.equal(rec.outstanding - was.outstanding, 1500);
  assert.equal((await call('/finance/receivables', { role: 'store' })).status, 403);
});
