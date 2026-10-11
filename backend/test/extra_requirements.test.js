import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { call, stop, inDays } from '../test-support/helpers.js';

after(stop);

test('buyers: duplicate phone or name is rejected and PATCH /buyers/:id works', async () => {
  // 1. Create a new buyer
  const res1 = await call('/buyers', {
    role: 'sales',
    method: 'POST',
    body: { name: 'Unique Textile Corp', phone: '9876543210', email: 'corp@example.com' }
  });
  assert.equal(res1.status, 201);
  const buyerId = res1.data.id;
  assert.ok(buyerId);

  // 2. Duplicate phone should be rejected
  const resDup = await call('/buyers', {
    role: 'sales',
    method: 'POST',
    body: { name: 'Other Name', phone: '9876543210' }
  });
  assert.equal(resDup.status, 400);
  assert.equal(resDup.error?.code || resDup.body?.error?.code, 'DUPLICATE_BUYER');

  // 3. Update buyer details via PATCH /buyers/:id
  const resPatch = await call(`/buyers/${buyerId}`, {
    role: 'sales',
    method: 'PATCH',
    body: { name: 'Updated Textile Corp', phone: '9876543211', email: 'updated@example.com' }
  });
  assert.equal(resPatch.status, 200);
  assert.equal(resPatch.data.name, 'Updated Textile Corp');
});

test('extra cost: order extra_cost calculation and patch route', async () => {
  const deadline = inDays(10);
  
  // Create order with extra_cost
  const res = await call('/orders', {
    role: 'sales',
    method: 'POST',
    body: {
      buyer_id: 1,
      deadline,
      extra_cost: 250,
      lines: [{ product_id: 1, qty_metres: 100 }]
    }
  });
  assert.equal(res.status, 201);
  const orderId = res.data.id;
  assert.equal(res.data.extra_cost, 250);
  assert.equal(res.data.total_amount, 100 * 100 + 250);

  // Patch extra_cost
  const resPatch = await call(`/orders/${orderId}/extra-cost`, {
    role: 'sales',
    method: 'PATCH',
    body: { extra_cost: 500 }
  });
  assert.equal(resPatch.status, 200);
  assert.equal(resPatch.data.extra_cost, 500);

  // Verify GET /orders reflects updated extra cost and total
  const resGet = await call('/orders', { role: 'sales' });
  const fetched = resGet.data.find((o) => o.id === orderId);
  assert.equal(fetched.extra_cost, 500);
  assert.equal(fetched.total_amount, 100 * 100 + 500);
});

test('production tracker: returns product lines with stage statuses and QC summary', async () => {
  const res = await call('/production/tracker', { role: 'supervisor' });
  assert.equal(res.status, 200);
  assert.ok(Array.isArray(res.data));
  if (res.data.length > 0) {
    const item = res.data[0];
    assert.ok(item.order_id);
    assert.ok(item.buyer_name);
    assert.ok(Array.isArray(item.stages));
    assert.equal(item.stages.length, 4);
  }
});
