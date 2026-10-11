import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { call, stop, db } from '../test-support/helpers.js';
after(stop);

const sup = (p, body, method = 'POST') => call(p, { role: 'supervisor', method, body });
const stockOf = async (id) => (await call('/stock')).data.find((m) => m.id === id);
const stagesOf = async (id) => (await call(`/runs/${id}`)).data.stages.map((s) => `${s.stage}:${s.status}`).join(' ');

test('plan shows the yarn a product needs and whether stock covers it', async () => {
  // P-0001 Cotton Poplin White = 0.30 kg of Cotton 30s White per metre.
  let plan = (await call('/runs/plan?product_id=1&qty_metres=100')).data;
  assert.equal(plan.product.name, 'Cotton Poplin White');
  assert.equal(plan.yarn[0].material, 'Cotton 30s White');
  assert.equal(plan.yarn[0].required, 30);
  assert.equal(plan.can_start, false); // nothing in stock yet
  assert.ok(plan.yarn[0].short > 0);
  const refused = await sup('/runs', { product_id: 1, qty_metres: 100 });
  assert.equal(refused.error.code, 'INSUFFICIENT_YARN');
  await call('/receipts', { role: 'store', method: 'POST', body: { material_id: 1, supplier_id: 1, qty: 1000, lot_no: 'LOT-RUN-1' } });
  plan = (await call('/runs/plan?product_id=1&qty_metres=100')).data;
  assert.equal(plan.can_start, true); assert.deepEqual(plan.problems, []);
});

test('one click starts spinning; every completed stage starts the next at once; rolls are named after the product', async () => {
  const before = (await stockOf(1)).on_hand;
  const made = await sup('/runs', { product_id: 1, qty_metres: 250 });
  assert.equal(made.status, 201); assert.equal(made.data.code, 'PR-0001');
  // Yarn was issued immediately: 250 m x 0.30 = 75 kg.
  assert.equal((await stockOf(1)).on_hand, before - 75);
  assert.equal(await stagesOf(made.data.id), 'spinning:running weaving:pending dyeing:pending finishing:pending');
  const id = made.data.id;

  // A stage cannot make more than it was given.
  assert.equal((await sup(`/runs/${id}/complete-stage`, { metres: 300 })).error.code, 'EXCEEDS_INPUT');
  // Spinning done with 5 m of waste: weaving starts by itself with the 245 m that came out.
  assert.equal((await sup(`/runs/${id}/complete-stage`, { metres: 245, waste_metres: 5 })).status, 200);
  assert.equal(await stagesOf(id), 'spinning:done weaving:running dyeing:pending finishing:pending');
  const run = (await call(`/runs/${id}`)).data;
  assert.equal(run.stages[1].input_metres, 245);
  assert.equal(run.stages[1].machine, 'Loom-01');
  assert.equal(run.current_stage, 'weaving');

  await sup(`/runs/${id}/complete-stage`, {});            // default = everything it was given
  await sup(`/runs/${id}/complete-stage`, {});
  assert.equal(await stagesOf(id), 'spinning:done weaving:done dyeing:done finishing:running');
  await sup(`/runs/${id}/complete-stage`, { metres: 240 });
  const done = (await call(`/runs/${id}`)).data;
  assert.equal(done.status, 'completed');
  // 240 m -> rolls of at most 100 m, named product-code + run + number.
  assert.deepEqual(done.rolls.map((x) => x.code), ['P-0001-PR0001-01', 'P-0001-PR0001-02', 'P-0001-PR0001-03']);
  assert.deepEqual(done.rolls.map((x) => x.metres), [100, 100, 40]);
  assert.ok(done.rolls.every((x) => x.qc_status === 'pending'));
  // Every machine is free again.
  assert.ok(db.prepare('SELECT status FROM machines').all().every((m) => m.status === 'idle'));

  // Rolls carry the product, so they show up in QC with its name and in product stock once passed.
  const listed = (await call('/rolls?qc_status=pending')).data;
  assert.equal(listed[0].product_name, 'Cotton Poplin White');
  let ps = (await call('/product-stock')).data.find((p) => p.code === 'P-0001');
  assert.equal(ps.in_qc, 240); assert.equal(ps.ready, 0); assert.equal(ps.in_production, 0);
  for (const roll of done.rolls) await call(`/rolls/${roll.id}/inspect`, { role: 'qc', method: 'POST', body: { result: 'pass', inspector: 'QC' } });
  ps = (await call('/product-stock')).data.find((p) => p.code === 'P-0001');
  assert.equal(ps.ready, 240); assert.equal(ps.in_qc, 0); assert.equal(ps.free, 240);
  const finished = (await call('/finished-products')).data;
  assert.equal(finished.length, 3); assert.equal(finished[0].product_name, 'Cotton Poplin White');
  // A notification told QC.
  assert.ok((await call('/notifications', { role: 'qc' })).data.some?.((n) => n.kind === 'run_complete')
    || db.prepare("SELECT 1 FROM notifications WHERE kind='run_complete'").get());
});

test('a second run waits for a free machine and starts by itself when one frees up', async () => {
  const a = (await sup('/runs', { product_id: 1, qty_metres: 100 })).data;
  const b = (await sup('/runs', { product_id: 1, qty_metres: 50 })).data; // only one spinning machine
  assert.equal(await stagesOf(a.id), 'spinning:running weaving:pending dyeing:pending finishing:pending');
  assert.equal(await stagesOf(b.id), 'spinning:waiting weaving:pending dyeing:pending finishing:pending');
  assert.equal((await sup(`/runs/${b.id}/complete-stage`, {})).error.code, 'NOTHING_RUNNING');
  await sup(`/runs/${a.id}/complete-stage`, {}); // frees Spin-01: run b takes it, run a moves to the loom
  assert.equal(await stagesOf(a.id), 'spinning:done weaving:running dyeing:pending finishing:pending');
  assert.equal(await stagesOf(b.id), 'spinning:running weaving:pending dyeing:pending finishing:pending');
  for (const id of [a.id, b.id]) for (let i = 0; i < 4; i += 1) await sup(`/runs/${id}/complete-stage`, {});
  assert.equal((await call(`/runs/${a.id}`)).data.status, 'completed');
  assert.equal((await call(`/runs/${b.id}`)).data.status, 'completed');
});

test('a run can be cancelled before it produces anything and the yarn goes back', async () => {
  const before = (await stockOf(1)).on_hand;
  const r = (await sup('/runs', { product_id: 1, qty_metres: 100 })).data;
  assert.equal((await stockOf(1)).on_hand, before - 30);
  assert.equal((await sup(`/runs/${r.id}/cancel`)).status, 200);
  assert.equal((await stockOf(1)).on_hand, before);
  assert.equal((await call(`/runs/${r.id}`)).data.status, 'cancelled');
  assert.ok(db.prepare('SELECT status FROM machines').all().every((m) => m.status === 'idle'));
  // Once a stage has produced, cancelling is refused.
  const r2 = (await sup('/runs', { product_id: 1, qty_metres: 100 })).data;
  await sup(`/runs/${r2.id}/complete-stage`, {});
  assert.equal((await sup(`/runs/${r2.id}/cancel`)).error.code, 'ALREADY_PRODUCING');
  for (let i = 0; i < 3; i += 1) await sup(`/runs/${r2.id}/complete-stage`, {});
});

test('a mixed-fibre product issues every yarn in its recipe; broken machines hold a run until repaired', async () => {
  // P-0002 = 0.18 kg Cotton 30s White + 0.12 kg Poly Blend Black per metre.
  await call('/receipts', { role: 'store', method: 'POST', body: { material_id: 3, supplier_id: 1, qty: 100, lot_no: 'LOT-POLY' } });
  const plan = (await call('/runs/plan?product_id=2&qty_metres=200')).data;
  assert.deepEqual(plan.yarn.map((y) => [y.material, y.required]), [['Cotton 30s White', 36], ['Poly Blend Black', 24]]);
  const polyBefore = (await stockOf(3)).on_hand;
  // The only dyeing machine breaks down: the run stops at dyeing and carries on after repair.
  const r = (await sup('/runs', { product_id: 2, qty_metres: 200 })).data;
  assert.equal((await stockOf(3)).on_hand, polyBefore - 24);
  await sup('/machines/4/status', { status: 'breakdown' }, 'PATCH');
  await sup(`/runs/${r.id}/complete-stage`, {}); await sup(`/runs/${r.id}/complete-stage`, {});
  assert.equal(await stagesOf(r.id), 'spinning:done weaving:done dyeing:waiting finishing:pending');
  await sup('/machines/4/status', { status: 'idle' }, 'PATCH');
  assert.equal(await stagesOf(r.id), 'spinning:done weaving:done dyeing:running finishing:pending');
  await sup(`/runs/${r.id}/complete-stage`, {}); await sup(`/runs/${r.id}/complete-stage`, {});
  assert.equal((await call(`/runs/${r.id}`)).data.status, 'completed');
});

test('finishing a run job from the stage pages moves the run too; roles are enforced', async () => {
  const r = (await sup('/runs', { product_id: 1, qty_metres: 60 })).data;
  const spin = (await call('/jobs')).data.find((j) => j.run_code === 'PR-0006' || (j.stage === 'spinning' && j.status === 'in_progress'));
  assert.equal(spin.product_name, 'Cotton Poplin White');
  await sup(`/jobs/${spin.id}/output`, { metres: 60 });
  await sup(`/jobs/${spin.id}/finish`);
  assert.equal(await stagesOf(r.id), 'spinning:done weaving:running dyeing:pending finishing:pending');
  assert.equal((await call('/runs', { role: 'sales', method: 'POST', body: { product_id: 1, qty_metres: 10 } })).status, 403);
  assert.equal((await call('/runs', { role: 'sales' })).status, 200);
  assert.equal((await sup('/runs', { product_id: 1, qty_metres: 0 })).status, 400);
  assert.equal((await sup('/runs', { product_id: 999, qty_metres: 10 })).status, 404);
  for (let i = 0; i < 3; i += 1) await sup(`/runs/${r.id}/complete-stage`, {});
});
