// OWNER: M1  |  Purchase requests: ask for yarn, track it ordered -> received (receiving also books the stock)
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { validate, bad, notFound } from '../lib/http.js';
import { publish } from '../lib/events.js';
import { notify } from '../lib/notify.js';
import { stockOf } from './inventory.js';

const r = Router();
const NEXT = { requested: ['ordered', 'cancelled'], ordered: ['received', 'cancelled'], received: [], cancelled: [] };

r.get('/purchase-requests', (_q, res) => res.json({ data: db.prepare(
  `SELECT p.*, m.name AS material, m.unit, s.name AS supplier FROM purchase_requests p
   JOIN materials m ON m.id=p.material_id LEFT JOIN suppliers s ON s.id=p.supplier_id ORDER BY p.id DESC`).all() }));

// Low-stock materials with no open request, and a sensible quantity to ask for (back up to twice the reorder level).
r.get('/purchase-requests/suggestions', (_q, res) => {
  const rows = db.prepare('SELECT * FROM materials ORDER BY name').all().map((m) => {
    const required = db.prepare('SELECT COALESCE(SUM(qty_required),0) q FROM order_requirements WHERE material_id=?').get(m.id).q;
    const issued = -db.prepare("SELECT COALESCE(SUM(qty),0) q FROM stock_movements WHERE material_id=? AND kind='issue'").get(m.id).q;
    const available = stockOf(m.id) - Math.max(0, required - issued);
    const open = db.prepare("SELECT COALESCE(SUM(qty),0) q FROM purchase_requests WHERE material_id=? AND status IN ('requested','ordered')").get(m.id).q;
    return { material_id: m.id, material: m.name, unit: m.unit, available, reorder_level: m.reorder_level, on_order: open,
      suggested_qty: Math.max(0, Math.ceil(m.reorder_level * 2 - available - open)) };
  }).filter((x) => x.available < x.reorder_level && x.on_order === 0 && x.suggested_qty > 0);
  res.json({ data: rows });
});

r.post('/purchase-requests', validate(z.object({
  material_id: z.coerce.number().int().positive(), supplier_id: z.coerce.number().int().positive().optional(),
  qty: z.coerce.number().positive('Quantity must be more than 0'), note: z.string().trim().max(200).optional(),
})), (req, res) => {
  const b = req.body;
  const m = db.prepare('SELECT name FROM materials WHERE id=?').get(b.material_id);
  if (!m) throw notFound('Material');
  const info = db.prepare('INSERT INTO purchase_requests (material_id,supplier_id,qty,note,requested_by) VALUES (?,?,?,?,?)')
    .run(b.material_id, b.supplier_id ?? null, b.qty, b.note ?? null, req.user?.name ?? null);
  notify('purchase_request', `Purchase request: ${b.qty} of ${m.name}`, '/purchase-requests', 'accounts');
  publish('purchasing');
  res.status(201).json({ data: { id: info.lastInsertRowid } });
});

// Move a request forward. "received" needs a lot number and books the yarn into stock in the same step.
r.patch('/purchase-requests/:id/status', validate(z.object({
  status: z.enum(['ordered', 'received', 'cancelled']), supplier_id: z.coerce.number().int().positive().optional(), lot_no: z.string().trim().min(1).optional(),
})), (req, res) => {
  const p = db.prepare('SELECT * FROM purchase_requests WHERE id=?').get(req.params.id);
  if (!p) throw notFound('Purchase request');
  const b = req.body;
  if (!NEXT[p.status].includes(b.status)) throw bad(`A ${p.status} request cannot become ${b.status}`, 'BAD_TRANSITION');
  const supplier = b.supplier_id ?? p.supplier_id;
  if (b.status === 'ordered' && !supplier) throw bad('Choose a supplier before marking as ordered', 'SUPPLIER_REQUIRED');
  if (b.status === 'received' && !b.lot_no) throw bad('Enter the lot number to receive this yarn', 'LOT_REQUIRED');
  db.transaction(() => {
    db.prepare('UPDATE purchase_requests SET status=?, supplier_id=? WHERE id=?').run(b.status, supplier ?? null, p.id);
    if (b.status === 'received')
      db.prepare("INSERT INTO stock_movements (material_id,kind,qty,supplier_id,lot_no,note) VALUES (?, 'receipt', ?, ?, ?, ?)")
        .run(p.material_id, p.qty, supplier, b.lot_no, `Purchase request ${p.id}`);
  })();
  publish('purchasing'); if (b.status === 'received') publish('stock');
  res.json({ data: { ok: true } });
});

export default r;
