// OWNER: M1  |  Scene 1: yarn arrives, stock, low-stock warning
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { validate, bad, notFound } from '../lib/http.js';
import { publish } from '../lib/events.js';
import { checkLowStock } from '../lib/notify.js';
import { isCompatible } from '../lib/compatibility.js';

const r = Router();

export const stockOf = (materialId) =>
  db.prepare('SELECT COALESCE(SUM(qty),0) q FROM stock_movements WHERE material_id=?').get(materialId).q;

r.get('/materials', (_q, res) => res.json({ data: db.prepare('SELECT * FROM materials ORDER BY name').all() }));
r.get('/suppliers', (_q, res) => res.json({ data: db.prepare('SELECT * FROM suppliers ORDER BY name').all() }));

r.post('/suppliers', validate(z.object({ name: z.string().trim().min(2), phone: z.string().trim().regex(/^\d{10}$/, 'Phone must be 10 digits') })), (req, res) => {
  const info = db.prepare('INSERT INTO suppliers (name,phone) VALUES (?,?)').run(req.body.name, req.body.phone);
  res.status(201).json({ data: { id: info.lastInsertRowid } });
});

r.post('/materials', validate(z.object({
  name: z.string().trim().min(2), yarn_type: z.string().trim().min(2), colour: z.string().trim().min(2),
  unit: z.enum(['kg', 'bale']).default('kg'), reorder_level: z.coerce.number().min(0),
})), (req, res) => {
  const b = req.body;
  const info = db.prepare('INSERT INTO materials (name,yarn_type,colour,unit,reorder_level) VALUES (?,?,?,?,?)')
    .run(b.name, b.yarn_type, b.colour, b.unit, b.reorder_level);
  res.status(201).json({ data: { id: info.lastInsertRowid } });
});

// Goods receipt: yarn arrives at the gate. Ties to a purchase request when one exists.
r.post('/receipts', validate(z.object({
  material_id: z.coerce.number().int().positive(), supplier_id: z.coerce.number().int().positive(),
  qty: z.coerce.number().positive('Quantity must be more than 0'),
  lot_no: z.string().trim().min(1, 'Lot number is required'), order_id: z.coerce.number().int().positive().optional(),
  purchase_request_id: z.coerce.number().int().positive().optional(),
})), (req, res) => {
  const b = req.body;
  const info = db.prepare("INSERT INTO stock_movements (material_id,kind,qty,supplier_id,order_id,lot_no,purchase_request_id) VALUES (?, 'receipt', ?, ?, ?, ?, ?)")
    .run(b.material_id, b.qty, b.supplier_id, b.order_id ?? null, b.lot_no, b.purchase_request_id ?? null);
  publish('stock'); checkLowStock(b.material_id);
  res.status(201).json({ data: { id: info.lastInsertRowid } });
});

// Issue yarn to production. Cannot exceed stock, and the yarn must suit the order's fabric.
r.post('/stock/issue', validate(z.object({
  material_id: z.coerce.number().int().positive(), order_id: z.coerce.number().int().positive(),
  qty: z.coerce.number().positive(),
})), (req, res) => {
  const b = req.body;
  const order = db.prepare('SELECT id, fabric_type FROM orders WHERE id=?').get(b.order_id);
  if (!order) throw notFound('Order');
  const material = db.prepare('SELECT name, yarn_type FROM materials WHERE id=?').get(b.material_id);
  if (!material) throw notFound('Material');
  if (!isCompatible(order.fabric_type, material.yarn_type))
    throw bad(`${material.name} cannot make ${order.fabric_type} fabric`, 'INCOMPATIBLE_YARN');
  const have = stockOf(b.material_id);
  if (b.qty > have) throw bad(`Only ${have} in stock`, 'INSUFFICIENT_STOCK');
  const need = db.prepare('SELECT COALESCE(SUM(qty_required),0) q FROM order_requirements WHERE order_id=? AND material_id=?').get(b.order_id, b.material_id).q;
  const given = -db.prepare("SELECT COALESCE(SUM(qty),0) q FROM stock_movements WHERE order_id=? AND material_id=? AND kind='issue'").get(b.order_id, b.material_id).q;
  if (need && b.qty > need - given) throw bad(`This order needs only ${need - given} more of this yarn`, 'OVER_REQUIREMENT');
  db.prepare("INSERT INTO stock_movements (material_id,kind,qty,order_id) VALUES (?, 'issue', ?, ?)").run(b.material_id, -b.qty, b.order_id);
  publish('stock'); checkLowStock(b.material_id);
  res.status(201).json({ data: { ok: true } });
});

// Live stock with low-stock flag. reserved = open order requirements not yet issued.
r.get('/stock', (_q, res) => {
  const rows = db.prepare('SELECT * FROM materials ORDER BY name').all().map((m) => {
    const on_hand = stockOf(m.id);
    const required = db.prepare('SELECT COALESCE(SUM(qty_required),0) q FROM order_requirements WHERE material_id=?').get(m.id).q;
    const issued = -db.prepare("SELECT COALESCE(SUM(qty),0) q FROM stock_movements WHERE material_id=? AND kind='issue'").get(m.id).q;
    const reserved = Math.max(0, required - issued);
    return { ...m, on_hand, reserved, available: on_hand - reserved, low: on_hand - reserved < m.reorder_level };
  });
  res.json({ data: rows });
});

r.get('/stock/movements', (_q, res) => res.json({ data: db.prepare(
  `SELECT s.id, m.name AS material, s.kind, s.qty, s.lot_no, s.order_id, s.created_at
   FROM stock_movements s JOIN materials m ON m.id=s.material_id ORDER BY s.id DESC LIMIT 100`).all() }));

// How much yarn each supplier has delivered. Built only from completed receipts (kind='receipt'),
// never from purchase requests that have not been received. Remaining per lot is FIFO against issues.
r.get('/suppliers/material-history', (_q, res) => {
  const suppliers = db.prepare('SELECT id, name FROM suppliers ORDER BY name').all();
  const receipts = db.prepare(
    `SELECT s.id, s.supplier_id, s.material_id, s.qty, s.lot_no, s.created_at, s.purchase_request_id,
       m.name AS material, m.yarn_type
     FROM stock_movements s JOIN materials m ON m.id=s.material_id
     WHERE s.kind='receipt' ORDER BY s.id`).all();
  const pool = {};
  for (const x of db.prepare("SELECT material_id, COALESCE(SUM(-qty),0) q FROM stock_movements WHERE kind='issue' GROUP BY material_id").all())
    pool[x.material_id] = x.q;
  const remaining = {};
  for (const r of receipts) {
    const left = pool[r.material_id] || 0; const used = Math.min(left, r.qty);
    pool[r.material_id] = left - used;
    remaining[r.id] = Math.round((r.qty - used) * 100) / 100;
  }
  const bySupplier = new Map(suppliers.map((s) => [s.id, { supplier_id: s.id, supplier: s.name, total_kg: 0, deliveries: 0, by_yarn: [], receipts: [] }]));
  for (const r of receipts) {
    const s = bySupplier.get(r.supplier_id); if (!s) continue;
    s.total_kg += r.qty; s.deliveries += 1;
    s.receipts.push({ id: r.id, material: r.material, yarn_type: r.yarn_type, qty_kg: r.qty, lot_no: r.lot_no,
      receipt_date: String(r.created_at).slice(0, 10), purchase_request_id: r.purchase_request_id, remaining_kg: remaining[r.id] });
  }
  const out = [...bySupplier.values()].map((s) => {
    const g = new Map();
    for (const x of s.receipts) {
      if (!g.has(x.material)) g.set(x.material, { material: x.material, yarn_type: x.yarn_type, qty_kg: 0, deliveries: 0 });
      const e = g.get(x.material); e.qty_kg += x.qty_kg; e.deliveries += 1;
    }
    return { ...s, total_kg: Math.round(s.total_kg * 100) / 100, by_yarn: [...g.values()], receipts: s.receipts.sort((a, b) => b.id - a.id) };
  });
  const only = _q.query.supplier_id ? Number(_q.query.supplier_id) : null;
  res.json({ data: only ? out.filter((s) => s.supplier_id === only) : out });
});

export default r;
