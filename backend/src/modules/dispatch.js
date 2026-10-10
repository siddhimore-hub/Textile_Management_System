// OWNER: M3  |  Scenes 4+5: dispatch, invoice, buyer tracking
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { validate, bad, notFound } from '../lib/http.js';
import { orderProgress } from '../lib/orderStatus.js';
import { publish } from '../lib/events.js';
import { notify } from '../lib/notify.js';

const r = Router();

// Finished-goods stock: passed rolls not yet dispatched.
r.get('/finished-stock', (_q, res) => res.json({ data: db.prepare(
  `SELECT r.id, r.code, r.metres, r.order_id, o.fabric_type, o.colour FROM rolls r JOIN orders o ON o.id=r.order_id
   WHERE r.qc_status='pass' AND r.dispatch_id IS NULL ORDER BY r.id`).all() }));

r.get('/dispatches', (_q, res) => res.json({ data: db.prepare(
  `SELECT d.id, d.order_id, d.vehicle_no, d.created_at, b.name AS buyer, i.id AS invoice_id, i.total,
     (SELECT COUNT(*) FROM rolls WHERE dispatch_id=d.id) AS rolls
   FROM dispatches d JOIN orders o ON o.id=d.order_id JOIN buyers b ON b.id=o.buyer_id
   LEFT JOIN invoices i ON i.dispatch_id=d.id ORDER BY d.id DESC`).all() }));

// Dispatch rolls to the right buyer. Rules: rolls must be QC-passed, belong to the order, not already sent.
r.post('/dispatches', validate(z.object({
  order_id: z.coerce.number().int().positive(),
  roll_ids: z.array(z.coerce.number().int().positive()).min(1, 'Select at least one roll'),
  vehicle_no: z.string().trim().toUpperCase().regex(/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/, 'Use a vehicle number like TN09AB1234'),
})), (req, res) => {
  const b = req.body;
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(b.order_id);
  if (!order) throw notFound('Order');
  const rolls = b.roll_ids.map((id) => db.prepare('SELECT * FROM rolls WHERE id=?').get(id));
  for (const [i, roll] of rolls.entries()) {
    if (!roll) throw notFound(`Roll ${b.roll_ids[i]}`);
    if (roll.order_id !== order.id) throw bad(`${roll.code} belongs to a different order`, 'WRONG_ORDER');
    if (roll.qc_status !== 'pass') throw bad(`${roll.code} has not passed QC`, 'NOT_PASSED');
    if (roll.dispatch_id) throw bad(`${roll.code} was already dispatched`, 'ALREADY_DISPATCHED');
  }
  const metres = rolls.reduce((s, x) => s + x.metres, 0);
  const total = Math.round(metres * order.price_per_metre * 100) / 100; // invoice always = rolls x price
  const result = db.transaction(() => {
    const d = db.prepare('INSERT INTO dispatches (order_id,vehicle_no) VALUES (?,?)').run(order.id, b.vehicle_no);
    for (const roll of rolls) db.prepare('UPDATE rolls SET dispatch_id=? WHERE id=?').run(d.lastInsertRowid, roll.id);
    const inv = db.prepare('INSERT INTO invoices (dispatch_id,total) VALUES (?,?)').run(d.lastInsertRowid, total);
    return { dispatch_id: d.lastInsertRowid, invoice_id: inv.lastInsertRowid, total };
  })();
  notify('invoice', `Invoice ${result.invoice_id} raised: ${result.total.toLocaleString('en-IN')} for order ${order.id}`, '/invoices', 'accounts,sales');
  publish('rolls'); publish('orders'); publish('dispatch');
  res.status(201).json({ data: result });
});

r.get('/invoices', (_q, res) => res.json({ data: db.prepare(
  `SELECT i.id, i.total, i.created_at, d.order_id, b.name AS buyer,
     COALESCE((SELECT SUM(amount) FROM payments WHERE invoice_id=i.id),0) AS paid
   FROM invoices i JOIN dispatches d ON d.id=i.dispatch_id JOIN orders o ON o.id=d.order_id JOIN buyers b ON b.id=o.buyer_id
   ORDER BY i.id DESC`).all() }));

// PUBLIC buyer tracking (no login). Only exposes stage + progress, never costs.
r.get('/track/:token', (req, res) => {
  const o = db.prepare('SELECT o.id, o.fabric_type, o.colour, o.qty_metres, o.deadline, b.name AS buyer FROM orders o JOIN buyers b ON b.id=o.buyer_id WHERE tracking_token=?').get(req.params.token);
  if (!o) throw notFound('Order');
  res.json({ data: { ...o, ...orderProgress(o.id) } });
});

export default r;
