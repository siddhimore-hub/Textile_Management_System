// OWNER: M4  |  Scene 6: costs, payments, owner dashboard
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { validate, bad } from '../lib/http.js';
import { orderProgress } from '../lib/orderStatus.js';
import { stockOf } from './inventory.js';

const r = Router();

r.post('/costs', validate(z.object({
  order_id: z.coerce.number().int().positive().optional(), kind: z.enum(['material', 'labour', 'overhead', 'supplier_bill']),
  amount: z.coerce.number().positive(), note: z.string().trim().max(200).optional(),
})), (req, res) => {
  const b = req.body;
  const info = db.prepare('INSERT INTO cost_entries (order_id,kind,amount,note) VALUES (?,?,?,?)').run(b.order_id ?? null, b.kind, b.amount, b.note ?? null);
  res.status(201).json({ data: { id: info.lastInsertRowid } });
});

// Buyer payment against an invoice (cannot overpay).
r.post('/payments', validate(z.object({ invoice_id: z.coerce.number().int().positive(), amount: z.coerce.number().positive() })), (req, res) => {
  const inv = db.prepare('SELECT total, (SELECT COALESCE(SUM(amount),0) FROM payments WHERE invoice_id=invoices.id) paid FROM invoices WHERE id=?').get(req.body.invoice_id);
  if (!inv) throw bad('Invoice not found');
  if (req.body.amount > inv.total - inv.paid) throw bad(`Only ${inv.total - inv.paid} is outstanding`, 'OVERPAYMENT');
  const info = db.prepare('INSERT INTO payments (invoice_id,amount) VALUES (?,?)').run(req.body.invoice_id, req.body.amount);
  res.status(201).json({ data: { id: info.lastInsertRowid } });
});
r.get('/payments', (_q, res) => res.json({ data: db.prepare(
  `SELECT p.id, p.invoice_id, p.amount, p.created_at FROM payments p ORDER BY p.id DESC`).all() }));

// Cost per order (basic): yarn issued is costed by cost_entries(kind=material) the accountant records.
r.get('/finance/order-costs', (_q, res) => res.json({ data: db.prepare(
  `SELECT o.id AS order_id, b.name AS buyer, o.qty_metres,
     COALESCE((SELECT SUM(amount) FROM cost_entries WHERE order_id=o.id),0) AS cost,
     COALESCE((SELECT SUM(metres) FROM rolls WHERE order_id=o.id AND qc_status='pass'),0) AS good_metres
   FROM orders o JOIN buyers b ON b.id=o.buyer_id ORDER BY o.id DESC`).all()
  .map((x) => ({ ...x, cost_per_metre: x.good_metres ? Math.round((x.cost / x.good_metres) * 100) / 100 : null })) }));

r.get('/finance/summary', (req, res) => {
  const month = String(req.query.month || new Date().toISOString().slice(0, 7));
  const one = (sql, ...a) => db.prepare(sql).get(...a).v;
  const billed = one("SELECT COALESCE(SUM(total),0) v FROM invoices WHERE substr(created_at,1,7)=?", month);
  const received = one("SELECT COALESCE(SUM(amount),0) v FROM payments WHERE substr(created_at,1,7)=?", month);
  const costs = one("SELECT COALESCE(SUM(amount),0) v FROM cost_entries WHERE substr(created_at,1,7)=?", month);
  const wages = one("SELECT COALESCE(SUM(amount),0) v FROM wage_payouts WHERE month=?", month);
  res.json({ data: { month, billed, received, costs, wages, profit: billed - costs - wages } });
});

// Owner dashboard: one call, live numbers for the home screen.
r.get('/dashboard', (_q, res) => {
  const one = (sql) => db.prepare(sql).get().v;
  const orders = db.prepare('SELECT id FROM orders').all().map((o) => orderProgress(o.id).status);
  const low = db.prepare('SELECT id, reorder_level FROM materials').all().filter((m) => stockOf(m.id) < m.reorder_level).length;
  res.json({ data: {
    open_orders: orders.filter((s) => s !== 'dispatched').length,
    machines_running: one("SELECT COUNT(*) v FROM machines WHERE status='running'"),
    machines_idle: one("SELECT COUNT(*) v FROM machines WHERE status='idle'"),
    machines_down: one("SELECT COUNT(*) v FROM machines WHERE status IN ('breakdown','maintenance')"),
    rolls_awaiting_qc: one("SELECT COUNT(*) v FROM rolls WHERE qc_status IN ('pending','rework')"),
    rolls_ready: one("SELECT COUNT(*) v FROM rolls WHERE qc_status='pass' AND dispatch_id IS NULL"),
    low_stock_items: low,
    today_metres: one("SELECT COALESCE(SUM(metres),0) v FROM production_logs WHERE date(created_at)=date('now')"),
  } });
});

export default r;
