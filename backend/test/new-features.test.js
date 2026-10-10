import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { call, stop, db, makeOrder, pipeline } from '../test-support/helpers.js';
after(stop);

async function passAndDispatch(orderId, metres, vehicle = 'TN09AB1234') {
  const p = await pipeline(orderId, { metres });
  const roll = await call('/rolls', { role: 'supervisor', method: 'POST', body: { job_card_id: p.finishing, metres } });
  await call(`/rolls/${roll.data.id}/inspect`, { role: 'qc', method: 'POST', body: { result: 'pass' } });
  return (await call('/dispatches', { role: 'sales', method: 'POST', body: { order_id: orderId, roll_ids: [roll.data.id], vehicle_no: vehicle } })).data;
}

// 1. Income & Expenses: only realised money counts, expenses can be added by accounts, roles enforced.
test('ledger: income from received payments, expenses recorded, profit derived', async () => {
  const s0 = await call('/ledger/summary', { role: 'accounts' }).then((r) => r.data);
  const o = await makeOrder({ metres: 20, yarn: 60, receive: 100 });
  const d = await passAndDispatch(o.id, 20);
  await call('/payments', { role: 'accounts', method: 'POST', body: { dispatch_id: d.dispatch_id, amount: 500 } }); // 2000 due, partial
  assert.equal((await call('/expenses', { role: 'store', method: 'POST', body: { category: 'Power', amount: 10 } })).status, 403);
  assert.equal((await call('/expenses', { role: 'accounts', method: 'POST', body: { category: 'Power', amount: 300, description: 'June bill' } })).status, 201);
  const row = (await call('/ledger/expenses', { role: 'accounts' })).data.find((x) => x.source === 'general');
  assert.equal(row.category, 'Power'); assert.equal(row.amount, 300);
  const inc = (await call('/ledger/income', { role: 'accounts' })).data.find((x) => x.amount === 500);
  assert.ok(inc && /Order/.test(inc.description));
  const s1 = await call('/ledger/summary', { role: 'accounts' }).then((r) => r.data);
  assert.equal(s1.income - s0.income, 500); // unpaid 1500 never counted
  assert.equal(s1.expenses - s0.expenses, 300);
  assert.equal(s1.profit - s0.profit, 200);
  // An unpaid dispatch does not add income.
  const o2 = await makeOrder({ metres: 10, yarn: 0, receive: 0 });
  await passAndDispatch(o2.id, 10);
  const s2 = await call('/ledger/summary', { role: 'accounts' }).then((r) => r.data);
  assert.equal(s2.income, s1.income);
});

// 2. Add a machine; duplicate names are refused.
test('machines: a new machine can be added, duplicate names conflict', async () => {
  const add = await call('/machines', { role: 'supervisor', method: 'POST', body: { name: 'Spin-02', stage: 'spinning', status: 'idle' } });
  assert.equal(add.status, 201);
  assert.ok((await call('/machines', { role: 'supervisor' })).data.some((m) => m.name === 'Spin-02'));
  const dup = await call('/machines', { role: 'supervisor', method: 'POST', body: { name: ' spin-02 ', stage: 'weaving' } });
  assert.equal(dup.error.code, 'CONFLICT');
  assert.equal((await call('/machines', { role: 'store', method: 'POST', body: { name: 'x', stage: 'spinning' } })).status, 403);
});

// 2. A spinning job cannot start once the order has rolled its full quantity.
test('spinning refuses an order that is already fully produced', async () => {
  const o = await makeOrder({ metres: 50, yarn: 130, receive: 200 });
  const p = await pipeline(o.id, { metres: 50 });
  const roll = await call('/rolls', { role: 'supervisor', method: 'POST', body: { job_card_id: p.finishing, metres: 50 } });
  await call(`/rolls/${roll.data.id}/inspect`, { role: 'qc', method: 'POST', body: { result: 'pass' } });
  const spin = await call('/jobs', { role: 'supervisor', method: 'POST', body: { order_id: o.id, machine_id: 1, shift: 'morning' } });
  assert.equal(spin.error.code, 'ORDER_COMPLETE');
});

// 2 + 3. Produce for stock: internal order through the normal pipeline, machine goes busy,
// incompatible yarn is refused, no fabric rule means any yarn is allowed.
test('produce for stock: internal order, busy machine, compatibility enforced', async () => {
  const o = await makeOrder({ yarn: 0, receive: 0 });
  await call('/receipts', { role: 'store', method: 'POST', body: { material_id: 1, supplier_id: 1, qty: 500, lot_no: 'CP-1' } });
  const sp = await call('/stock-production', { role: 'supervisor', method: 'POST', body: {
    fabric_type: 'cotton', colour: 'white', qty_metres: 200, machine_id: 1, shift: 'morning',
    requirements: [{ material_id: 1, qty_required: 120 }] } });
  assert.equal(sp.status, 201); assert.ok(sp.data.order_id && sp.data.job_id);
  // It is an internal order with the synthetic buyer, hidden from order assignment.
  const order = db.prepare('SELECT is_internal, buyer_id FROM orders WHERE id=?').get(sp.data.order_id);
  assert.equal(order.is_internal, 1);
  const buyer = db.prepare('SELECT name FROM buyers WHERE id=?').get(order.buyer_id).name;
  assert.equal(buyer, 'Internal Stock');
  assert.ok(!(await call('/orders/assignable', { role: 'sales' })).data.some((x) => x.id === sp.data.order_id));
  assert.ok((await call('/jobs', { role: 'supervisor' })).data.find((j) => j.id === sp.data.job_id).is_internal === 1);
  // The machine is now busy.
  const busy = await call('/stock-production', { role: 'supervisor', method: 'POST', body: {
    fabric_type: 'cotton', colour: 'red', qty_metres: 10, machine_id: 1, shift: 'morning' } });
  assert.equal(busy.error.code, 'MACHINE_BUSY');
  // Polyester yarn cannot make a cotton fabric on a fresh spinning machine.
  const spin2 = (await call('/machines', { role: 'supervisor', method: 'POST', body: { name: 'Spin-09', stage: 'spinning' } })).data.id;
  const bad = await call('/stock-production', { role: 'supervisor', method: 'POST', body: {
    fabric_type: 'cotton', colour: 'black', qty_metres: 10, machine_id: spin2, shift: 'morning',
    requirements: [{ material_id: 3, qty_required: 10 }] } });
  assert.equal(bad.error.code, 'INCOMPATIBLE_YARN'); assert.ok(/cannot make/.test(bad.error.message));
  // A fabric with no rule accepts any yarn.
  const free = await call('/stock-production', { role: 'supervisor', method: 'POST', body: {
    fabric_type: 'voile', colour: 'blue', qty_metres: 10, machine_id: spin2, shift: 'morning',
    requirements: [{ material_id: 3, qty_required: 10 }] } });
  assert.equal(free.status, 201);
  // Free machine 1 so later tests can use it; the internal order simply stays in production.
  await call(`/jobs/${sp.data.job_id}/output`, { role: 'supervisor', method: 'POST', body: { metres: 200 } });
  await call(`/jobs/${sp.data.job_id}/finish`, { role: 'supervisor', method: 'POST' });
  // Roles: store and sales are refused.
  assert.equal((await call('/stock-production', { role: 'store', method: 'POST', body: { fabric_type: 'x', colour: 'y', qty_metres: 1, machine_id: 1, shift: 'morning' } })).status, 403);
});

// 3. Orders validate compatibility and store blend ratios.
test('orders: incompatible yarn is refused, blend ratio stored for blends', async () => {
  // A cotton yarn cannot make a pure polyester fabric.
  const purePoly = await call('/orders', { role: 'sales', method: 'POST', body: {
    buyer_id: 1, fabric_type: 'polyester', colour: 'black', qty_metres: 100, price_per_metre: 100, deadline: '2099-01-01',
    requirements: [{ material_id: 1, qty_required: 50 }] } });
  assert.equal(purePoly.error.code, 'INCOMPATIBLE_YARN');
  // Weird blend ratios that do not add to 100 are refused when more than one family is allowed.
  const odd = await call('/orders', { role: 'sales', method: 'POST', body: {
    buyer_id: 1, fabric_type: 'cotton_polyester', colour: 'grey', qty_metres: 100, price_per_metre: 100, deadline: '2099-01-01',
    requirements: [{ material_id: 1, qty_required: 50, blend_ratio: 70 }, { material_id: 3, qty_required: 50, blend_ratio: 20 }] } });
  assert.equal(odd.error.code, 'BAD_BLEND_RATIO');
  const ok = await call('/orders', { role: 'sales', method: 'POST', body: {
    buyer_id: 1, fabric_type: 'cotton_polyester', colour: 'grey', qty_metres: 100, price_per_metre: 100, deadline: '2099-01-01',
    requirements: [{ material_id: 1, qty_required: 50, blend_ratio: 60 }, { material_id: 3, qty_required: 50, blend_ratio: 40 }] } });
  assert.equal(ok.status, 201);
  const blend = db.prepare('SELECT blend_ratio FROM order_requirements WHERE order_id=? ORDER BY material_id').all(ok.data.id);
  assert.equal(blend[0].blend_ratio, 60); assert.equal(blend[1].blend_ratio, 40);
  // The fabric list only contains fabrics with at least one rule.
  const fabrics = (await call('/compatibility/fabrics', { role: 'store' })).data.map((f) => f.fabric_type);
  assert.ok(fabrics.includes('cotton') && fabrics.includes('cotton_polyester') && !fabrics.includes('voile'));
});

// 4. Supplier yarn tracking: history shows deliveries and how much is still in stock.
test('supplier history tracks deliveries and remaining stock per lot', async () => {
  const before = (await call('/suppliers/material-history?supplier_id=1', { role: 'store' })).data[0] || { total_kg: 0, deliveries: 0, receipts: [] };
  await call('/receipts', { role: 'store', method: 'POST', body: { material_id: 1, supplier_id: 1, qty: 200, lot_no: 'L1' } });
  await call('/receipts', { role: 'store', method: 'POST', body: { material_id: 1, supplier_id: 1, qty: 100, lot_no: 'L2' } });
  await call('/stock/issue', { role: 'store', method: 'POST', body: { material_id: 1, order_id: (await makeOrder({ yarn: 0, receive: 0 })).id, qty: 150 } });
  const rows = (await call('/suppliers/material-history?supplier_id=1', { role: 'store' })).data;
  assert.equal(rows.length, 1); assert.equal(rows[0].supplier, 'Coimbatore Yarn Co');
  assert.equal(rows[0].deliveries - before.deliveries, 2);
  assert.equal(rows[0].total_kg - before.total_kg, 300);
  const lot = Object.fromEntries(rows[0].receipts.map((r) => [r.lot_no, r]));
  assert.equal(lot.L2.qty_kg, 100); assert.equal(lot.L2.remaining_kg, 100); // never touched
  const beforeRemaining = before.receipts.reduce((s, r) => s + r.remaining_kg, 0);
  const afterRemaining = rows[0].receipts.reduce((s, r) => s + r.remaining_kg, 0);
  assert.equal(afterRemaining - beforeRemaining, 150); // 300 received, 150 issued (FIFO) in this test
  const yarn = rows[0].by_yarn.find((y) => y.material === 'Cotton 30s White');
  assert.ok(yarn.qty_kg >= 300);
  assert.equal((await call('/suppliers/material-history', { role: 'sales' })).status, 403);
});

// 5. Pending payments + invoice raised only when a dispatch is fully paid, exactly once.
test('invoice is raised only on full payment and never twice', async () => {
  const o = await makeOrder({ metres: 10, yarn: 0, receive: 0 });
  const d = await passAndDispatch(o.id, 10);
  assert.equal(d.total, 1000); assert.equal(d.invoice_id, undefined);
  const before = (await call('/pending-payments', { role: 'accounts' })).data.find((x) => x.id === d.dispatch_id);
  assert.equal(before.status, 'pending'); assert.equal(before.outstanding, 1000); assert.equal(before.invoice_id, null);
  // Half of it: still no invoice.
  await call('/payments', { role: 'accounts', method: 'POST', body: { dispatch_id: d.dispatch_id, amount: 400 } });
  const mid = (await call('/pending-payments', { role: 'sales' })).data.find((x) => x.id === d.dispatch_id);
  assert.equal(mid.status, 'partial'); assert.equal(mid.invoice_id, null); assert.equal(mid.outstanding, 600);
  assert.equal((await call('/invoices', { role: 'accounts' })).data.length, 0);
  // Final payment creates the invoice; further attempts to pay are refused as overpayment.
  const full = await call('/payments', { role: 'accounts', method: 'POST', body: { dispatch_id: d.dispatch_id, amount: 600 } });
  assert.equal(full.data.invoice_id, 1); assert.equal(full.data.outstanding, 0);
  const done = (await call('/pending-payments', { role: 'accounts' })).data.find((x) => x.id === d.dispatch_id);
  assert.equal(done.status, 'paid'); assert.equal(done.invoice_id, 1); assert.equal(done.payments.length, 2);
  assert.equal((await call('/invoices', { role: 'accounts' })).data.length, 1);
  assert.equal((await call('/payments', { role: 'accounts', method: 'POST', body: { dispatch_id: d.dispatch_id, amount: 1 } })).error.code, 'OVERPAYMENT');
  // Receivables also track dispatch-based outstanding; a fully paid dispatch adds nothing.
  const rec0 = (await call('/finance/receivables', { role: 'accounts' })).data.find((r) => r.buyer_id === 1).outstanding;
  const rec = (await call('/finance/receivables', { role: 'accounts' })).data.find((r) => r.buyer_id === 1);
  assert.equal(rec.outstanding - rec0, 0);
});