// New scene 1: fixed product catalogue, multi-product cart orders, finished-stock fulfilment,
// and combinable per-user permissions. (Owners M1 + M4.)
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { call, stop, db, inDays } from '../test-support/helpers.js';
after(stop);

const products = async () => (await call('/products', { role: 'owner' })).data;
const byCode = async (code) => (await products()).find((p) => p.code === code);
const orderById = async (id) => (await call('/orders', { role: 'sales' })).data.find((o) => o.id === id);

const cart = (lines, buyer_id = 1) => call('/orders', { role: 'sales', method: 'POST', body: { buyer_id, deadline: inDays(20), lines } });

// Runs one cart line through every stage and inspects a passed roll. Returns the roll id.
async function produceLine(orderId, orderLineId, metres) {
  const finishingMachine = db.prepare("SELECT id FROM machines WHERE stage='finishing' LIMIT 1").get().id;
  const make = (body) => call('/jobs', { role: 'supervisor', method: 'POST', body });
  const step = async (id) => { await call(`/jobs/${id}/output`, { role: 'supervisor', method: 'POST', body: { metres } }); await call(`/jobs/${id}/finish`, { role: 'supervisor', method: 'POST' }); };
  const spin = await make({ order_id: orderId, order_line_id: orderLineId, machine_id: 1, shift: 'morning' });
  assert.equal(spin.status, 201, JSON.stringify(spin.error));
  await step(spin.data.id);
  const weave = await make({ source_job_id: spin.data.id, machine_id: 2, shift: 'morning' });
  await step(weave.data.id);
  const dye = await make({ source_job_id: weave.data.id, machine_id: 4, shift: 'morning' });
  await step(dye.data.id);
  const fin = await make({ source_job_id: dye.data.id, machine_id: finishingMachine, shift: 'morning' });
  await step(fin.data.id);
  const roll = await call('/rolls', { role: 'supervisor', method: 'POST', body: { job_card_id: fin.data.id, metres } });
  assert.equal(roll.status, 201, JSON.stringify(roll.error));
  await call(`/rolls/${roll.data.id}/inspect`, { role: 'qc', method: 'POST', body: { result: 'pass' } });
  return roll.data.id;
}

test('catalogue: seeded products, composition must total 100, BOM compatibility, availability', async () => {
  const list = await products();
  assert.ok(list.length >= 4);
  const poplin = await byCode('P-0001');
  assert.equal(poplin.fabric_type, 'cotton');
  assert.deepEqual(poplin.composition, [{ fibre_type: 'cotton', percentage: 100 }]);
  assert.ok(poplin.bom.length >= 1);
  assert.equal(poplin.availability.free, poplin.availability.on_hand - poplin.availability.allocated);

  const bad = await call('/products', { role: 'store', method: 'POST', body: { name: 'Broken Blend', fabric_type: 'cotton_polyester', price_per_metre: 10, composition: [{ fibre_type: 'cotton', percentage: 60 }] } });
  assert.equal(bad.error.code, 'BAD_COMPOSITION');
  assert.match(bad.error.message, /100%/);

  const ok = await call('/products', { role: 'store', method: 'POST', body: { name: 'Test Blend', fabric_type: 'cotton_polyester', colour: 'grey', price_per_metre: 110, cost_per_metre: 70,
    composition: [{ fibre_type: 'cotton', percentage: 60 }, { fibre_type: 'polyester', percentage: 40 }], bom: [{ material_id: 1, qty_per_metre: 0.2 }] } });
  assert.equal(ok.status, 201); assert.match(ok.data.code, /^P-\d+$/);

  const clash = await call('/products', { role: 'store', method: 'POST', body: { name: 'Clashing', fabric_type: 'polyester', price_per_metre: 10, bom: [{ material_id: 1, qty_per_metre: 0.2 }] } });
  assert.equal(clash.error.code, 'INCOMPATIBLE_YARN');

  // A BOM yarn must match the declared composition as well as the fabric rule.
  const mismatch = await call('/products', { role: 'store', method: 'POST', body: { name: 'Mismatch', fabric_type: 'cotton_polyester', price_per_metre: 10,
    composition: [{ fibre_type: 'cotton', percentage: 100 }], bom: [{ material_id: 3, qty_per_metre: 0.2 }] } });
  assert.equal(mismatch.error.code, 'BOM_COMPOSITION_MISMATCH');

  assert.equal((await call('/products', { role: 'sales', method: 'POST', body: { name: 'Nope', fabric_type: 'cotton', price_per_metre: 1 } })).status, 403);
});

test('cart order: many products, per-line snapshots, catalogue prices, summed yarn requirement', async () => {
  await call('/receipts', { role: 'store', method: 'POST', body: { material_id: 1, supplier_id: 1, qty: 600, lot_no: 'CART-1' } });
  const p1 = await byCode('P-0001'); const p3 = await byCode('P-0003');
  const made = await cart([{ product_id: p1.id, qty_metres: 100 }, { product_id: p3.id, qty_metres: 50 }], 1);
  assert.equal(made.status, 201, JSON.stringify(made.error));
  assert.ok(made.data.tracking_token);
  assert.equal(made.data.lines.length, 2);

  const o = await orderById(made.data.id);
  assert.equal(o.qty_metres, 150);
  assert.deepEqual(o.lines.map((l) => l.name), [p1.name, p3.name]);
  assert.equal(o.lines[0].unit_price, p1.price_per_metre);
  assert.equal(o.lines[0].amount, 100 * p1.price_per_metre);
  assert.equal(o.lines[1].amount, 50 * p3.price_per_metre);
  assert.equal(o.line_fulfilment, 'stock_unavailable'); // nothing produced yet

  // The BOM is snapshotted on the line and the yarn requirement is the BOM added up.
  assert.ok(JSON.parse(o.lines[0].bom).length >= 1);
  const req = db.prepare('SELECT material_id, qty_required FROM order_requirements WHERE order_id=? ORDER BY material_id').all(o.id);
  const expected = db.prepare('SELECT SUM(qty_per_metre * ?) q FROM product_bom WHERE product_id=?').get(100, p1.id).q;
  assert.ok(Math.abs(req.find((x) => x.material_id === 1).qty_required - expected) < 0.01);

  // Feasibility uses the same catalogue BOM.
  const feas = await call(`/orders/${o.id}/feasibility`, { role: 'sales' });
  assert.ok(feas.data.lines.length >= 1);

  // Duplicate products in one cart are refused.
  const dup = await cart([{ product_id: p1.id, qty_metres: 10 }, { product_id: p1.id, qty_metres: 10 }]);
  assert.equal(dup.status, 400);
});

test('fulfilment: passed stock reserves the oldest order line; dispatch obeys the reservation', async () => {
  await call('/receipts', { role: 'store', method: 'POST', body: { material_id: 2, supplier_id: 1, qty: 500, lot_no: 'FUL-1' } });
  const p = await byCode('P-0004'); // a product no earlier test orders, so A and B are its only lines
  const a = (await cart([{ product_id: p.id, qty_metres: 100 }], 1)).data;
  const b = (await cart([{ product_id: p.id, qty_metres: 120 }], 2)).data;
  await call('/stock/issue', { role: 'store', method: 'POST', body: { material_id: 2, order_id: a.id, qty: 25 } });

  const lineA = (await orderById(a.id)).lines[0];
  const roll = await produceLine(a.id, lineA.id, 100);

  // Passed stock is reserved for the older order line; the newer one waits.
  const after = await byCode('P-0004');
  assert.equal(after.availability.on_hand, 100);
  assert.equal(after.availability.allocated, 100);
  assert.equal(after.availability.free, 0);
  const aOrder = await orderById(a.id); const bOrder = await orderById(b.id);
  assert.equal(aOrder.lines[0].fulfilment, 'available');
  assert.equal(aOrder.line_fulfilment, 'partially_available');
  assert.equal(bOrder.lines[0].fulfilment, 'stock_unavailable');

  // The roll appears in both finished-product listings.
  const stock = (await call('/finished-products', { role: 'sales' })).data;
  assert.equal(stock.length, (await call('/finished-stock', { role: 'sales' })).data.length);
  assert.ok(stock.some((r) => r.id === roll));

  // It cannot be dispatched against the newer order (nothing was reserved for it).
  const cross = await call('/dispatches', { role: 'sales', method: 'POST', body: { order_id: b.id, roll_ids: [roll], vehicle_no: 'TN09AB1234' } });
  assert.equal(cross.error.code, 'NOT_ALLOCATED');

  // It dispatches against its own order, priced at the catalogue price.
  const ok = await call('/dispatches', { role: 'sales', method: 'POST', body: { order_id: a.id, roll_ids: [roll], vehicle_no: 'TN09AB1234' } });
  assert.equal(ok.status, 201);
  assert.equal(ok.data.total, 100 * p.price_per_metre);
  assert.equal((await orderById(a.id)).line_fulfilment, 'fulfilled');
  assert.ok(!(await call('/finished-products', { role: 'sales' })).data.some((r) => r.id === roll));
});

test('permissions: a user can combine extra grants; the base role is included alongside extra permissions', async () => {
  const email = `multi${Date.now()}@everest.test`;
  const created = await call('/users', { role: 'owner', method: 'POST', body: { name: 'Multi User', email, role: 'sales', password: 'everest123', permissions: ['products', 'qc'] } });
  assert.equal(created.status, 201);
  const login = await call('/auth/login', { role: null, method: 'POST', body: { email, password: 'everest123' } });
  const token = login.data.token;
  assert.deepEqual([...login.data.user.permissions].sort(), ['products', 'qc', 'sales']);

  // Holds products (can add one) AND sales (can create an order) simultaneously.
  assert.equal((await call('/products', { token, method: 'POST', body: { name: 'Permission Product', fabric_type: 'cotton', price_per_metre: 5 } })).status, 201);
  const p1 = (await products()).find((p) => p.code === 'P-0001');
  const order = await call('/orders', { token, method: 'POST', body: { buyer_id: 1, deadline: inDays(5), lines: [{ product_id: p1.id, qty_metres: 10 }] } });
  assert.equal(order.status, 201);

  const listed = (await call('/users', { role: 'owner' })).data.find((u) => u.email === email);
  assert.deepEqual([...listed.permissions].sort(), ['products', 'qc', 'sales']);
  // Changing the base role updates the base role while keeping explicit grants.
  await call(`/users/${listed.id}`, { role: 'owner', method: 'PATCH', body: { role: 'store', permissions: ['qc'] } });
  const relisted = (await call('/users', { role: 'owner' })).data.find((u) => u.email === email);
  assert.deepEqual([...relisted.permissions].sort(), ['qc', 'store']);
});
