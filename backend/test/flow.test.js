import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { call, anon, stop, makeOrder, pipeline, inDays } from '../test-support/helpers.js';
after(stop);

test('full flow: receive, order, issue, produce through every stage, inspect, dispatch, pay', async () => {
  const o = await makeOrder({ metres: 100 });
  assert.ok(o.id && o.tracking_token);
  assert.equal((await call(`/orders/${o.id}/feasibility`, { role: 'sales' })).data.can_start, true);
  assert.equal((await call('/stock/issue', { role: 'store', method: 'POST', body: { material_id: 1, order_id: o.id, qty: 300 } })).status, 201);
  const over = await call('/stock/issue', { role: 'store', method: 'POST', body: { material_id: 1, order_id: o.id, qty: 1 } });
  assert.equal(over.error.code, 'OVER_REQUIREMENT');
  // Spinning starts from an order and marks its machine busy.
  const spin = await call('/jobs', { role: 'supervisor', method: 'POST', body: { order_id: o.id, machine_id: 1, shift: 'morning' } });
  assert.equal(spin.status, 201);
  assert.equal((await call('/jobs', { role: 'supervisor', method: 'POST', body: { order_id: o.id, machine_id: 1, shift: 'morning' } })).error.code, 'MACHINE_BUSY');
  // A running spinning job cannot make a roll.
  assert.equal((await call('/rolls', { role: 'supervisor', method: 'POST', body: { job_card_id: spin.data.id, metres: 100 } })).error.code, 'NOT_FINISHED');
  // Finish the whole line; the helper returns the finishing batch that is ready for rolls.
  const p = await pipeline(o.id, { metres: 100, spinning: spin.data.id });
  assert.equal(p.error, undefined);
  const roll = await call('/rolls', { role: 'supervisor', method: 'POST', body: { job_card_id: p.finishing, metres: 100 } });
  assert.match(roll.data.code, /^R-\d{4}-\d{5}$/);
  const noDefect = await call(`/rolls/${roll.data.id}/inspect`, { role: 'qc', method: 'POST', body: { result: 'reject' } });
  assert.equal(noDefect.status, 400);
  await call(`/rolls/${roll.data.id}/inspect`, { role: 'qc', method: 'POST', body: { result: 'pass', inspector: 'QC One' } });
  assert.equal((await call('/orders')).data.find((x) => x.id === o.id).status, 'ready_to_ship');
  const d = await call('/dispatches', { role: 'sales', method: 'POST', body: { order_id: o.id, roll_ids: [roll.data.id], vehicle_no: 'tn09ab1234' } });
  assert.equal(d.data.total, 10000);
  // A sale invoice is raised for every dispatch, straight away (one document per transaction).
  const sale = (await call('/invoices', { role: 'accounts' })).data.find((i) => i.dispatch_id === d.data.dispatch_id);
  assert.ok(sale); assert.equal(sale.kind, 'sale'); assert.equal(sale.total, 10000); assert.equal(sale.outstanding, 10000);
  assert.equal(sale.payment_status, 'unpaid');
  assert.equal((await call('/dispatches', { role: 'sales', method: 'POST', body: { order_id: o.id, roll_ids: [roll.data.id], vehicle_no: 'TN09AB1234' } })).error.code, 'ALREADY_DISPATCHED');
  assert.equal((await call('/payments', { role: 'accounts', method: 'POST', body: { dispatch_id: d.data.dispatch_id, amount: 20000 } })).error.code, 'OVERPAYMENT');
  // A part payment flips the same invoice to partial.
  const partial = await call('/payments', { role: 'accounts', method: 'POST', body: { dispatch_id: d.data.dispatch_id, amount: 4000 } });
  assert.equal(partial.status, 201); assert.equal(partial.data.invoice_id, sale.id); assert.equal(partial.data.outstanding, 6000);
  const pending = (await call('/pending-payments', { role: 'accounts' })).data.find((x) => x.id === d.data.dispatch_id);
  assert.equal(pending.outstanding, 6000); assert.equal(pending.status, 'partial'); assert.equal(pending.invoice_id, sale.id);
  // Paying the rest marks the same invoice paid, carrying its line items and payments.
  const done = await call('/payments', { role: 'accounts', method: 'POST', body: { dispatch_id: d.data.dispatch_id, amount: 6000 } });
  assert.equal(done.status, 201); assert.equal(done.data.invoice_id, sale.id); assert.equal(done.data.outstanding, 0);
  const paid = (await call(`/invoices/${sale.id}`, { role: 'accounts' })).data;
  assert.equal(paid.status, 'paid'); assert.equal(paid.payment_status, 'paid'); assert.equal(paid.payments.length, 2);
  assert.ok(paid.items.length >= 1 && paid.items[0].qty > 0);
  assert.equal((await call('/orders')).data.find((x) => x.id === o.id).status, 'dispatched');
});

test('buyer tracking is public and hides money', async () => {
  const o = await makeOrder({ yarn: 0, receive: 0 });
  const t = await anon(`/track/${o.tracking_token}`);
  assert.equal(t.status, 200); assert.equal(t.data.status, 'confirmed'); assert.equal(t.data.price_per_metre, undefined);
  assert.equal((await anon('/track/doesnotexist')).status, 404);
});

test('order rules: past deadline and bad input are refused', async () => {
  const bad = await call('/orders', { role: 'sales', method: 'POST', body: { buyer_id: 1, fabric_type: 'x', colour: 'y', qty_metres: 5, price_per_metre: 1, deadline: '2000-01-01' } });
  assert.equal(bad.status, 400); assert.ok(bad.error.fields.deadline);
  assert.equal((await call('/buyers', { role: 'sales', method: 'POST', body: { name: 'Bob', phone: '123' } })).status, 400);
  assert.equal((await call('/materials', { role: 'store', method: 'POST', body: { name: 'Cotton 20s Red', yarn_type: 'cotton', colour: 'red', reorder_level: 50 } })).status, 201);
});

test('rework and reject need a defect and raise a quality alert for QC and supervisors only', async () => {
  const o = await makeOrder({ yarn: 0, receive: 0 });
  const p = await pipeline(o.id, { metres: 50 });
  const roll = await call('/rolls', { role: 'supervisor', method: 'POST', body: { job_card_id: p.finishing, metres: 50 } });
  await call(`/rolls/${roll.data.id}/inspect`, { role: 'qc', method: 'POST', body: { result: 'rework', defect_type: 'hole' } });
  await call(`/rolls/${roll.data.id}/inspect`, { role: 'qc', method: 'POST', body: { result: 'pass' } });
  const qc = (await call('/notifications', { role: 'qc' })).data.items.filter((n) => n.kind === 'qc_fail');
  assert.equal(qc.length, 1);
  assert.equal((await call('/notifications', { role: 'sales' })).data.items.filter((n) => n.kind === 'qc_fail').length, 0);
  const hist = await call(`/rolls/by-code/${roll.data.code}`);
  assert.deepEqual(hist.data.inspections.map((i) => i.result), ['pass', 'rework']); // newest first = re-inspection history
});

test('notifications: role scoping, unread count, mark read', async () => {
  const o = await makeOrder({ yarn: 0, receive: 0 });
  const job = await call('/jobs', { role: 'supervisor', method: 'POST', body: { order_id: o.id, machine_id: 1, shift: 'evening' } });
  await call('/machines/3/status', { role: 'supervisor', method: 'PATCH', body: { status: 'breakdown' } });
  const sup = await call('/notifications', { role: 'supervisor' });
  assert.ok(sup.data.items.some((n) => n.kind === 'breakdown'));
  assert.ok(!(await call('/notifications', { role: 'accounts' })).data.items.some((n) => n.kind === 'breakdown'));
  const before = sup.data.unread; assert.ok(before >= 1);
  await call('/notifications/read', { role: 'supervisor', method: 'POST', body: { ids: [sup.data.items[0].id] } });
  assert.equal((await call('/notifications', { role: 'supervisor' })).data.unread, before - 1);
  await call('/notifications/read', { role: 'supervisor', method: 'POST', body: {} });
  assert.equal((await call('/notifications', { role: 'supervisor' })).data.unread, 0);
  assert.ok(job.data.id);
});
