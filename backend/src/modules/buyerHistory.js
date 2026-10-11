// Buyer relationship history (mirrors Supplier yarn history from the other side of the ledger):
// every order a buyer placed, how far each one got, and every sale invoice with its payment status.
// Owner: M3 (shared with sales/accounts).
import { Router } from 'express';
import { db } from '../lib/db.js';
import { orderProgress } from '../lib/orderStatus.js';
import { orderPayment } from '../lib/invoicing.js';

const r = Router();
const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

r.get('/buyers/history', (req, res) => {
  const only = req.query.buyer_id ? Number(req.query.buyer_id) : null;
  const buyers = db.prepare('SELECT id, name, phone, email FROM buyers ORDER BY name').all();
  const byBuyer = new Map(buyers.map((b) => [b.id, { ...b, buyer: b.name, orders: [], invoices: [] }]));

  const orders = db.prepare(
    `SELECT o.* FROM orders o WHERE o.is_internal=0 ORDER BY o.id DESC`).all();
  for (const o of orders) {
    const entry = byBuyer.get(o.buyer_id); if (!entry) continue;
    const p = orderProgress(o.id); const pay = orderPayment(o.id);
    const lineTotal = db.prepare('SELECT COALESCE(SUM(amount),0) t FROM order_lines WHERE order_id=?').get(o.id).t;
    const order_amount = r2((lineTotal || r2(o.qty_metres * o.price_per_metre)) + (o.extra_cost || 0));
    entry.orders.push({
      order_id: o.id, created_at: o.created_at, deadline: o.deadline,
      fabric_type: o.fabric_type, colour: o.colour,
      qty_metres: p.target_metres, dispatched_metres: p.dispatched_metres, reserved_metres: p.reserved_metres,
      progress_metres: p.progress_metres, status: p.status, percent: p.percent,
      order_amount, billed: pay.billed, paid: pay.paid, outstanding: pay.outstanding, payment_status: pay.payment_status,
    });
  }

  const invoices = db.prepare(
    `SELECT id, invoice_no, created_at, total, dispatch_id, order_id, status, buyer_id
       FROM invoices WHERE kind='sale' AND buyer_id IS NOT NULL ORDER BY id DESC`).all();
  for (const inv of invoices) {
    const entry = byBuyer.get(inv.buyer_id); if (!entry) continue;
    const paid = inv.dispatch_id
      ? db.prepare('SELECT COALESCE(SUM(amount),0) p FROM payments WHERE dispatch_id=?').get(inv.dispatch_id).p : 0;
    const total = r2(inv.total); const paidR = r2(paid);
    entry.invoices.push({
      ...inv, total, paid: paidR, outstanding: r2(Math.max(0, total - paidR)),
      payment_status: total <= 0 ? 'na' : paidR <= 0 ? 'unpaid' : paidR + 1e-6 >= total ? 'paid' : 'partial',
    });
  }

  const out = [...byBuyer.values()].map((b) => ({
    ...b,
    orders_count: b.orders.length,
    total_order_value: r2(b.orders.reduce((s, o) => s + o.order_amount, 0)),
    total_billed: r2(b.orders.reduce((s, o) => s + o.billed, 0)),
    total_received: r2(b.orders.reduce((s, o) => s + o.paid, 0)),
    total_outstanding: r2(b.orders.reduce((s, o) => s + o.outstanding, 0)),
    total_dispatched_metres: r2(b.orders.reduce((s, o) => s + o.dispatched_metres, 0)),
  }));
  res.json({ data: only ? out.filter((b) => b.id === only) : out });
});

export default r;
