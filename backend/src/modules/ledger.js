// OWNER: M4 | Income & Expenses: money actually received, money actually spent, and profit.
// Income comes only from recorded payments (never from unpaid invoices). Expenses are the recorded
// production/order costs (cost_entries) plus general business expenses (expenses). Supplier purchase
// records (stock receipts) are intentionally NOT counted, so nothing is added twice.
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { validate } from '../lib/http.js';
import { publish } from '../lib/events.js';

const r = Router();

const range = (col, req) => {
  const where = []; const args = [];
  if (req.query.from) { where.push(`${col} >= ?`); args.push(String(req.query.from)); }
  if (req.query.to) { where.push(`${col} <= ?`); args.push(String(req.query.to)); }
  return { where, args };
};
const clause = ({ where }) => (where.length ? `WHERE ${where.join(' AND ')}` : '');

// Three summary cards. Realised payments only; unpaid invoices are ignored.
r.get('/ledger/summary', (req, res) => {
  const rp = range("substr(created_at,1,10)", req);
  const rc = range("substr(created_at,1,10)", req);
  const re = range("expense_date", req);
  const got = db.prepare(`SELECT COALESCE(SUM(amount),0) v FROM payments ${clause(rp)}`).get(...rp.args).v;
  const costs = db.prepare(`SELECT COALESCE(SUM(amount),0) v FROM cost_entries ${clause(rc)}`).get(...rc.args).v;
  const general = db.prepare(`SELECT COALESCE(SUM(amount),0) v FROM expenses ${clause(re)}`).get(...re.args).v;
  const income = Math.round(got * 100) / 100;
  const expenses = Math.round((costs + general) * 100) / 100;
  res.json({ data: { income, expenses, profit: Math.round((income - expenses) * 100) / 100, from: req.query.from || null, to: req.query.to || null } });
});

// Income transactions: one row per payment received (date, buyer/order, category, amount, status).
r.get('/ledger/income', (req, res) => {
  const rc = range("substr(p.created_at,1,10)", req);
  res.json({ data: db.prepare(
    `SELECT p.id, p.amount, p.created_at, p.dispatch_id, p.invoice_id,
       d.order_id, b.name AS buyer, i.id AS invoice_no
     FROM payments p
     LEFT JOIN dispatches d ON d.id = p.dispatch_id
     LEFT JOIN orders o ON o.id = d.order_id
     LEFT JOIN buyers b ON b.id = o.buyer_id
     LEFT JOIN invoices i ON i.id = p.invoice_id
     ${clause(rc)} ORDER BY p.id DESC`).all(...rc.args).map((x) => ({
      id: x.id, date: String(x.created_at).slice(0, 10), category: 'Payment received',
      description: `Order ${x.order_id ?? '-'}${x.buyer ? `, ${x.buyer}` : ''}`, amount: x.amount,
      status: 'received', invoice_no: x.invoice_no })) });
});

// Expense transactions: production/order costs + general business expenses.
r.get('/ledger/expenses', (req, res) => {
  const category = req.query.category ? String(req.query.category) : null;
  const rc = range("substr(created_at,1,10)", req);
  const re = range("expense_date", req);
  const catC = category ? 'kind = ?' : null; const catE = category ? 'category = ?' : null;
  const w = (base, cat) => {
    const parts = [...base.where]; if (cat) parts.push(cat);
    return { sql: parts.length ? `WHERE ${parts.join(' AND ')}` : '', args: [...base.args, ...(cat ? [category] : [])] };
  };
  const c = w(rc, catC); const e = w(re, catE);
  const rows = db.prepare(
    `SELECT 'production' AS source, id, kind AS category, COALESCE(note,'') AS description, amount, substr(created_at,1,10) AS date FROM cost_entries ${c.sql}
     UNION ALL
     SELECT 'general' AS source, id, category, COALESCE(description,'') AS description, amount, expense_date AS date FROM expenses ${e.sql}
     ORDER BY date DESC, id DESC`).all(...c.args, ...e.args);
  res.json({ data: rows.map((x) => ({ ...x, status: 'recorded' })) });
});

// Record a general business expense (rent, power, transport, ...). Production costs keep using /costs.
r.post('/expenses', validate(z.object({
  category: z.string().trim().min(2).max(40), description: z.string().trim().max(200).optional(),
  amount: z.coerce.number().positive('Amount must be more than 0'),
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional(),
})), (req, res) => {
  const b = req.body;
  const date = b.expense_date || new Date().toISOString().slice(0, 10);
  const info = db.prepare('INSERT INTO expenses (category,description,amount,expense_date) VALUES (?,?,?,?)')
    .run(b.category, b.description ?? null, b.amount, date);
  publish('ledger');
  res.status(201).json({ data: { id: info.lastInsertRowid } });
});

export default r;
