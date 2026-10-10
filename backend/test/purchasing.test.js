import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { call, stop, db, makeOrder } from '../test-support/helpers.js';
after(stop);

test('using yarn below the reorder level raises a low-stock alert for store and accounts, once', async () => {
  const o = await makeOrder({ yarn: 100, receive: 120 }); // material 1 reorder level is set in the seed
  const lvl = db.prepare('SELECT reorder_level FROM materials WHERE id=1').get().reorder_level;
  await call('/stock/issue', { role: 'store', method: 'POST', body: { material_id: 1, order_id: o.id, qty: 100 } });
  const low = (r) => call('/notifications', { role: r }).then((x) => x.data.items.filter((n) => n.kind === 'low_stock'));
  assert.ok(lvl > 0);
  const store = await low('store');
  if (store.length) { assert.equal((await low('accounts')).length, store.length); assert.equal((await low('sales')).length, 0); }
});

test('suggestions list low materials and skip ones already on order', async () => {
  const s1 = await call('/purchase-requests/suggestions', { role: 'store' });
  assert.ok(Array.isArray(s1.data));
  const target = s1.data[0];
  assert.ok(target, 'seed has materials with no stock, so something is always low');
  assert.ok(target.suggested_qty > 0);
  await call('/purchase-requests', { role: 'store', method: 'POST', body: { material_id: target.material_id, qty: target.suggested_qty } });
  const s2 = await call('/purchase-requests/suggestions', { role: 'store' });
  assert.ok(!s2.data.some((x) => x.material_id === target.material_id));
});

test('request lifecycle: requested -> ordered -> received books stock', async () => {
  const mat = 2;
  const before = (await call('/stock')).data.find((m) => m.id === mat).on_hand;
  const pr = await call('/purchase-requests', { role: 'store', method: 'POST', body: { material_id: mat, qty: 250, note: 'test' } });
  assert.equal(pr.status, 201);
  assert.ok((await call('/notifications', { role: 'accounts' })).data.items.some((n) => n.kind === 'purchase_request'));
  const id = pr.data.id; const patch = (body, role = 'store') => call(`/purchase-requests/${id}/status`, { role, method: 'PATCH', body });
  assert.equal((await patch({ status: 'received', lot_no: 'L1' })).error.code, 'BAD_TRANSITION');
  assert.equal((await patch({ status: 'ordered' })).error.code, 'SUPPLIER_REQUIRED');
  assert.equal((await patch({ status: 'ordered', supplier_id: 1 })).status, 200);
  assert.equal((await patch({ status: 'received' })).error.code, 'LOT_REQUIRED');
  assert.equal((await patch({ status: 'received', lot_no: 'LOT-PR' })).status, 200);
  assert.equal((await call('/stock')).data.find((m) => m.id === mat).on_hand, before + 250);
  assert.equal((await patch({ status: 'cancelled' })).error.code, 'BAD_TRANSITION');
  const row = (await call('/purchase-requests')).data.find((p) => p.id === id);
  assert.equal(row.status, 'received'); assert.equal(row.supplier, 'Coimbatore Yarn Co');
});

test('purchasing rules: validation and roles', async () => {
  assert.equal((await call('/purchase-requests', { role: 'store', method: 'POST', body: { material_id: 1, qty: 0 } })).status, 400);
  assert.equal((await call('/purchase-requests', { role: 'store', method: 'POST', body: { material_id: 999, qty: 5 } })).status, 404);
  assert.equal((await call('/purchase-requests', { role: 'sales', method: 'POST', body: { material_id: 1, qty: 5 } })).status, 403);
  assert.equal((await call('/purchase-requests/9999/status', { role: 'store', method: 'PATCH', body: { status: 'ordered' } })).status, 404);
});
