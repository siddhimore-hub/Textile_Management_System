// OWNER: M3  |  Scenes 4+5: dispatch, invoice, buyer tracking
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { validate, bad, notFound } from '../lib/http.js';
import { orderProgress } from '../lib/orderStatus.js';
import { dispatchDue, ensureInvoiceForDispatch, refreshInvoice } from '../lib/invoicing.js';
import { allocatedForLine, dispatchedForLine, reallocate } from '../lib/fulfilment.js';
import { publish } from '../lib/events.js';
import { notify } from '../lib/notify.js';

const r = Router();
const r2 = (n) => Math.round(n * 100) / 100;
const EPS = 1e-6;

// Finished-products stock: passed rolls not yet dispatched, with the product they belong to.
const finishedRows = () => db.prepare(
  `SELECT r.id, r.code, r.metres, r.order_id, r.product_id, r.order_line_id, o.fabric_type, o.colour, p.name AS product_name
   FROM rolls r JOIN orders o ON o.id=r.order_id LEFT JOIN products p ON p.id=r.product_id
   WHERE r.qc_status='pass' AND r.dispatch_id IS NULL ORDER BY r.id`).all();

r.get('/finished-stock', (_q, res) => res.json({ data: finishedRows() }));
r.get('/finished-products', (_q, res) => res.json({ data: finishedRows() }));

r.get('/dispatches', (_q, res) => res.json({ data: db.prepare(
  `SELECT d.id, d.order_id, d.vehicle_no, d.total, d.created_at, b.name AS buyer, i.id AS invoice_id,
     (SELECT COUNT(*) FROM rolls WHERE dispatch_id=d.id) AS rolls,
     COALESCE((SELECT SUM(amount) FROM payments WHERE dispatch_id=d.id),0) AS paid
   FROM dispatches d JOIN orders o ON o.id=d.order_id JOIN buyers b ON b.id=o.buyer_id
   LEFT JOIN invoices i ON i.dispatch_id=d.id ORDER BY d.id DESC`).all() }));

// Dispatch rolls to the right buyer. Rules: rolls must be QC-passed, belong to the order (or match a
// product line of the order and be reserved for it), and not already sent. The amount due is recorded
// on the dispatch and its sale invoice is raised immediately (one invoice per transaction).
r.post('/dispatches', validate(z.object({
  order_id: z.coerce.number().int().positive(),
  roll_ids: z.array(z.coerce.number().int().positive()).min(1, 'Select at least one roll')
    .refine((ids) => new Set(ids).size === ids.length, 'A roll can only be selected once'),
  vehicle_no: z.string().trim().toUpperCase().regex(/^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{4}$/, 'Use a vehicle number like TN09AB1234'),
})), (req, res) => {
  const b = req.body;
  const order = db.prepare('SELECT * FROM orders WHERE id=?').get(b.order_id);
  if (!order) throw notFound('Order');
  const lines = db.prepare('SELECT * FROM order_lines WHERE order_id=? ORDER BY id').all(order.id);
  const rolls = b.roll_ids.map((id) => db.prepare('SELECT * FROM rolls WHERE id=?').get(id));

  const resolved = [];
  for (const [i, roll] of rolls.entries()) {
    if (!roll) throw notFound(`Roll ${b.roll_ids[i]}`);
    if (roll.qc_status !== 'pass') throw bad(`${roll.code} has not passed QC`, 'NOT_PASSED');
    if (roll.dispatch_id) throw bad(`${roll.code} was already dispatched`, 'ALREADY_DISPATCHED');
    let line = null;
    if (lines.length) {
      line = (roll.order_line_id && lines.find((l) => l.id === roll.order_line_id))
        || (roll.product_id && lines.find((l) => l.product_id && l.product_id === roll.product_id)) || null;
      if (roll.order_id !== order.id && !line) throw bad(`${roll.code} belongs to a different order`, 'WRONG_ORDER');
    } else if (roll.order_id !== order.id) {
      throw bad(`${roll.code} belongs to a different order`, 'WRONG_ORDER');
    }
    resolved.push({ roll, line });
  }

  // Per-line limits: never dispatch more than ordered, and product stock taken from other orders
  // must stay within what was reserved for this line.
  const perLine = new Map(); const crossLine = new Map();
  for (const { roll, line } of resolved) {
    if (!line) continue;
    perLine.set(line.id, (perLine.get(line.id) || 0) + roll.metres);
    if (roll.order_id !== order.id) crossLine.set(line.id, (crossLine.get(line.id) || 0) + roll.metres);
  }
  for (const [lineId, metres] of perLine) {
    const line = lines.find((l) => l.id === lineId);
    if (dispatchedForLine(lineId) + metres > line.qty_metres + EPS)
      throw bad(`Only ${r2(line.qty_metres - dispatchedForLine(lineId))} m of ${line.name} is still outstanding`, 'EXCEEDS_ORDER');
  }
  for (const [lineId, metres] of crossLine) {
    const reserved = allocatedForLine(lineId);
    if (metres > reserved + EPS)
      throw bad(`${metres} m is more finished stock than is reserved for that product line`, 'NOT_ALLOCATED');
  }

  let total = 0;
  for (const { roll, line } of resolved) total += roll.metres * (line ? line.unit_price : order.price_per_metre);
  total = r2(total);

  const dispatch_id = db.transaction(() => {
    // Recheck inside the write transaction so stale clients cannot dispatch the same roll twice.
    for (const { roll } of resolved) {
      const current = db.prepare('SELECT qc_status, dispatch_id FROM rolls WHERE id=?').get(roll.id);
      if (!current) throw notFound(`Roll ${roll.id}`);
      if (current.qc_status !== 'pass') throw bad(`${roll.code} has not passed QC`, 'NOT_PASSED');
      if (current.dispatch_id) throw bad(`${roll.code} was already dispatched`, 'ALREADY_DISPATCHED');
    }
    const d = db.prepare('INSERT INTO dispatches (order_id,vehicle_no,total) VALUES (?,?,?)').run(order.id, b.vehicle_no, total);
    for (const { roll, line } of resolved) {
      const changed = 
db.prepare(`
  UPDATE rolls
  SET dispatch_id = ?,
      fulfilled_order_line_id = ?
  WHERE id = ?
    AND dispatch_id IS NULL
`).run(
  d.lastInsertRowid,
  line ? line.id : null,
  roll.id
);

      if (changed.changes !== 1) throw bad(`${roll.code} is no longer available to dispatch`, 'ALREADY_DISPATCHED');
    }
    for (const productId of new Set(lines.map((l) => l.product_id).filter(Boolean))) reallocate(productId);
    return d.lastInsertRowid;
  })();

  // Raise the sale invoice for this dispatch right away (buyer pays against it). Idempotent.
  const { invoice_id } = ensureInvoiceForDispatch(dispatch_id);
  if (invoice_id) notify('invoice', `Invoice raised: ${total.toLocaleString('en-IN')} for order ${order.id}`, '/invoices', 'accounts,sales');
  publish('rolls'); publish('orders'); publish('dispatch'); publish('products');
  res.status(201).json({ data: { dispatch_id, total } });
});

// Pending payments: every dispatch with what is due, paid and outstanding, plus its payment history.
r.get('/pending-payments', (_q, res) => {
  const rows = db.prepare(
    `SELECT d.id, d.order_id, d.vehicle_no, d.total, d.created_at, b.name AS buyer, i.id AS invoice_id
     FROM dispatches d JOIN orders o ON o.id=d.order_id JOIN buyers b ON b.id=o.buyer_id
     LEFT JOIN invoices i ON i.dispatch_id=d.id ORDER BY d.id DESC`).all();
  const payments = db.prepare('SELECT id, dispatch_id, amount, created_at FROM payments ORDER BY id').all();
  const out = rows.map((d) => {
    const due = dispatchDue(d.id);
    const history = payments.filter((p) => p.dispatch_id === d.id);
    return { ...d, total: due.total, paid: due.paid, outstanding: due.outstanding,
      status: due.outstanding <= 0 ? 'paid' : (due.paid > 0 ? 'partial' : 'pending'), payments: history };
  });
  res.json({ data: out });
});

// One list for both kinds of document: sale invoices (per dispatch) and supplier bills (per receipt).
const invoiceBase = `SELECT i.*, b.name AS buyer, s.name AS supplier, m.name AS material, d.vehicle_no
  FROM invoices i
  LEFT JOIN buyers b ON b.id=i.buyer_id
  LEFT JOIN suppliers s ON s.id=i.supplier_id
  LEFT JOIN materials m ON m.id=i.material_id
  LEFT JOIN dispatches d ON d.id=i.dispatch_id`;
function withMoney(i) {
  const paid = i.dispatch_id
    ? db.prepare('SELECT COALESCE(SUM(amount),0) p FROM payments WHERE dispatch_id=?').get(i.dispatch_id).p : 0;
  const paidR = r2(paid); const total = r2(i.total);
  const outstanding = r2(Math.max(0, total - paidR));
  const payment_status = total <= 0 ? 'na' : paidR <= 0 ? 'unpaid' : paidR + EPS >= total ? 'paid' : 'partial';
  return { ...i, total, paid: paidR, outstanding, payment_status, party: i.kind === 'sale' ? i.buyer : i.supplier };
}
r.get('/invoices', (_q, res) => res.json({ data: db.prepare(`${invoiceBase} ORDER BY i.id DESC`).all().map(withMoney) }));
r.get('/invoices/:id', (req, res) => {
  const inv = db.prepare(`${invoiceBase} WHERE i.id=?`).get(Number(req.params.id));
  if (!inv) throw notFound('Invoice');
  refreshInvoice(inv.id); // keep the stored status honest even if a payment slipped in
  const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id=? ORDER BY id').all(inv.id);
  const payments = inv.dispatch_id
    ? db.prepare('SELECT id, amount, created_at FROM payments WHERE dispatch_id=? ORDER BY id').all(inv.dispatch_id) : [];
  res.json({ data: { ...withMoney(inv), items, payments } });
});

// PUBLIC buyer tracking (no login). Only exposes stage + progress, never costs.
r.get('/track/:token', (req, res) => {
  const o = db.prepare('SELECT o.id, o.fabric_type, o.colour, o.qty_metres, o.deadline, b.name AS buyer FROM orders o JOIN buyers b ON b.id=o.buyer_id WHERE tracking_token=?').get(req.params.token);
  if (!o) throw notFound('Order');
  res.json({ data: { ...o, ...orderProgress(o.id) } });
});

export default r;
