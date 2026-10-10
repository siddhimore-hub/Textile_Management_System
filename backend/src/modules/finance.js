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

// Metres made per day for the dashboard chart (days with no output show 0).
r.get('/dashboard/trend', (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 14, 3), 90);
  const rows = db.prepare(`SELECT date(created_at) d, SUM(metres) m FROM production_logs WHERE date(created_at) >= date('now', ?) GROUP BY d`).all(`-${days - 1} days`);
  const byDay = new Map(rows.map((x) => [x.d, x.m]));
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    out.push({ day: d, metres: byDay.get(d) || 0 });
  }
  res.json({ data: out });
});

// Orders that need attention. overdue = past deadline; due_soon = 3 days or less and not finished;
// behind = progress is 15+ points below where a straight line from start to deadline would be.
r.get('/dashboard/at-risk', (_q, res) => {
  const day = 86400000; const today = new Date(new Date().toISOString().slice(0, 10)).getTime();
  const out = [];
  for (const o of db.prepare('SELECT o.*, b.name AS buyer FROM orders o JOIN buyers b ON b.id=o.buyer_id').all()) {
    const p = orderProgress(o.id);
    if (p.status === 'dispatched') continue;
    const daysLeft = Math.round((new Date(o.deadline).getTime() - today) / day);
    const start = new Date(o.created_at.slice(0, 10)).getTime();
    const expected = Math.min(100, Math.max(0, ((today - start) / Math.max(day, new Date(o.deadline).getTime() - start)) * 100));
    const shortYarn = db.prepare('SELECT material_id, qty_required FROM order_requirements WHERE order_id=?').all(o.id).some((l) => {
      const given = -db.prepare("SELECT COALESCE(SUM(qty),0) q FROM stock_movements WHERE order_id=? AND material_id=? AND kind='issue'").get(o.id, l.material_id).q;
      return l.qty_required - given > stockOf(l.material_id);
    });
    let risk = null;
    if (daysLeft < 0) risk = 'overdue'; else if (daysLeft <= 3) risk = 'due_soon'; else if (p.percent + 15 < expected) risk = 'behind';
    if (!risk && !(shortYarn && p.percent === 0 && daysLeft <= 7)) continue;
    out.push({ order_id: o.id, buyer: o.buyer, fabric_type: o.fabric_type, deadline: o.deadline, days_left: daysLeft, percent: p.percent,
      status: p.status, risk: risk || 'yarn_short', yarn_short: shortYarn });
  }
  const rank = { overdue: 0, due_soon: 1, behind: 2, yarn_short: 3 };
  res.json({ data: out.sort((a, b) => rank[a.risk] - rank[b.risk] || a.days_left - b.days_left) });
});

// Money still to collect, per buyer.
r.get('/finance/receivables', (_q, res) => res.json({ data: db.prepare(
  `SELECT b.id AS buyer_id, b.name AS buyer, COUNT(i.id) AS invoices, COALESCE(SUM(i.total),0) AS billed,
     COALESCE(SUM((SELECT SUM(amount) FROM payments WHERE invoice_id=i.id)),0) AS paid
   FROM buyers b JOIN orders o ON o.buyer_id=b.id JOIN dispatches d ON d.order_id=o.id JOIN invoices i ON i.dispatch_id=d.id
   GROUP BY b.id ORDER BY b.name`).all().map((x) => ({ ...x, outstanding: Math.round((x.billed - x.paid) * 100) / 100 })) }));

export default r;
