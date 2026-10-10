// OWNER: M1  |  Scene 1: new order + "is there enough yarn?" check
import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from '../lib/db.js';
import { validate, notFound } from '../lib/http.js';
import { orderProgress } from '../lib/orderStatus.js';
import { stockOf } from './inventory.js';
import { publish } from '../lib/events.js';

const r = Router();

r.get('/buyers', (_q, res) => res.json({ data: db.prepare('SELECT * FROM buyers ORDER BY name').all() }));
r.post('/buyers', validate(z.object({
  name: z.string().trim().min(2), phone: z.string().trim().regex(/^\d{10}$/, 'Phone must be 10 digits'),
  email: z.string().email().optional().or(z.literal('')),
})), (req, res) => {
  const b = req.body;
  const info = db.prepare('INSERT INTO buyers (name,phone,email) VALUES (?,?,?)').run(b.name, b.phone, b.email || null);
  res.status(201).json({ data: { id: info.lastInsertRowid } });
});

r.get('/orders', (_q, res) => {
  const rows = db.prepare(`SELECT o.*, b.name AS buyer FROM orders o JOIN buyers b ON b.id=o.buyer_id ORDER BY o.id DESC`).all()
    .map((o) => ({ ...o, ...orderProgress(o.id) }));
  res.json({ data: rows });
});

r.post('/orders', validate(z.object({
  buyer_id: z.coerce.number().int().positive(), fabric_type: z.string().trim().min(2), colour: z.string().trim().min(2),
  qty_metres: z.coerce.number().positive(), price_per_metre: z.coerce.number().min(0),
  deadline: z.string().refine((d) => !Number.isNaN(Date.parse(d)) && new Date(d) >= new Date(new Date().toDateString()), 'Deadline cannot be in the past'),
  requirements: z.array(z.object({ material_id: z.coerce.number().int().positive(), qty_required: z.coerce.number().positive() })).default([]),
})), (req, res) => {
  const b = req.body;
  const token = crypto.randomBytes(8).toString('hex');
  const tx = db.transaction(() => {
    const info = db.prepare('INSERT INTO orders (buyer_id,fabric_type,colour,qty_metres,price_per_metre,deadline,tracking_token) VALUES (?,?,?,?,?,?,?)')
      .run(b.buyer_id, b.fabric_type, b.colour, b.qty_metres, b.price_per_metre, b.deadline, token);
    for (const q of b.requirements)
      db.prepare('INSERT INTO order_requirements (order_id,material_id,qty_required) VALUES (?,?,?)').run(info.lastInsertRowid, q.material_id, q.qty_required);
    return info.lastInsertRowid;
  });
  const id = tx();
  publish('orders');
  res.status(201).json({ data: { id, tracking_token: token } });
});

// Can we start this order? Compares requirement vs on-hand stock.
r.get('/orders/:id/feasibility', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM orders WHERE id=?').get(id)) throw notFound('Order');
  const lines = db.prepare(`SELECT q.material_id, m.name, q.qty_required FROM order_requirements q JOIN materials m ON m.id=q.material_id WHERE q.order_id=?`).all(id)
    .map((l) => { const on_hand = stockOf(l.material_id); return { ...l, on_hand, shortfall: Math.max(0, l.qty_required - on_hand) }; });
  res.json({ data: { can_start: lines.every((l) => l.shortfall === 0), lines } });
});

export default r;
