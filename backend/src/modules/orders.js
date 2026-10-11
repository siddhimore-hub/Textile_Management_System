// OWNER: M1  |  Scene 1: new order (cart of products) + "is there enough yarn?" check
import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from '../lib/db.js';
import { validate, bad, notFound } from '../lib/http.js';
import { orderProgress } from '../lib/orderStatus.js';
import { orderPayment } from '../lib/invoicing.js';
import { stockOf } from './inventory.js';
import { allowedFamilies, familiesOf } from '../lib/compatibility.js';
import { reallocate, linesOf, orderFulfilment } from '../lib/fulfilment.js';
import { publish } from '../lib/events.js';

const r = Router();
const r2 = (n) => Math.round(n * 100) / 100;
const r4 = (n) => Math.round(n * 10000) / 10000;

// Every yarn line must be a fibre the fabric can be made from. Unknown fabric = no rule yet, so allow.
function checkYarnCompatibility(fabricType, requirements) {
  const allowed = allowedFamilies(fabricType);
  if (!allowed) return;
  for (const q of requirements) {
    const mat = db.prepare('SELECT name, yarn_type FROM materials WHERE id=?').get(q.material_id);
    if (!mat) throw notFound('Material');
    if (!familiesOf(mat.yarn_type).some((f) => allowed.includes(f)))
      throw bad(`${mat.name} (${mat.yarn_type}) cannot make ${fabricType} fabric`, 'INCOMPATIBLE_YARN');
  }
  if (allowed.length > 1) {
    const ratios = requirements.map((q) => q.blend_ratio).filter((x) => x != null);
    if (ratios.length && Math.abs(ratios.reduce((a, b) => a + b, 0) - 100) > 1)
      throw bad('Blend ratios must add up to 100%', 'BAD_BLEND_RATIO');
  }
}

r.get('/buyers', (_q, res) => res.json({ data: db.prepare('SELECT * FROM buyers ORDER BY name').all() }));
r.post('/buyers', validate(z.object({
  name: z.string().trim().min(2), phone: z.string().trim().regex(/^\d{10}$/, 'Phone must be 10 digits'),
  email: z.string().email().optional().or(z.literal('')),
})), (req, res) => {
  const b = req.body;
  const dup = db.prepare('SELECT 1 FROM buyers WHERE lower(name)=lower(?) OR phone=?').get(b.name, b.phone);
  if (dup) throw bad('A buyer with this name or phone already exists', 'DUPLICATE_BUYER');
  const info = db.prepare('INSERT INTO buyers (name,phone,email) VALUES (?,?,?)').run(b.name, b.phone, b.email || null);
  publish('buyers');
  res.status(201).json({ data: { id: info.lastInsertRowid, name: b.name, phone: b.phone, email: b.email } });
});

r.patch('/buyers/:id', validate(z.object({
  name: z.string().trim().min(2), phone: z.string().trim().regex(/^\d{10}$/, 'Phone must be 10 digits'),
  email: z.string().email().optional().or(z.literal('')),
})), (req, res) => {
  const b = req.body;
  const id = Number(req.params.id);
  const dup = db.prepare('SELECT 1 FROM buyers WHERE (lower(name)=lower(?) OR phone=?) AND id!=?').get(b.name, b.phone, id);
  if (dup) throw bad('Another buyer with this name or phone already exists', 'DUPLICATE_BUYER');
  const info = db.prepare('UPDATE buyers SET name=?, phone=?, email=? WHERE id=?').run(b.name, b.phone, b.email || null, id);
  if (!info.changes) throw notFound('Buyer');
  publish('buyers');
  res.json({ data: { id, name: b.name, phone: b.phone, email: b.email } });
});

function decorate(o) {
  const lines = linesOf(o.id);
  const extraCost = r2(o.extra_cost || 0);
  const productTotal = lines.length
    ? r2(lines.reduce((s, l) => s + (l.amount || 0), 0))
    : r2((o.qty_metres || 0) * (o.price_per_metre || 0));
  const totalAmount = r2(productTotal + extraCost);
  return { ...o, extra_cost: extraCost, product_total: productTotal, total_amount: totalAmount,
    ...orderProgress(o.id), ...orderPayment(o.id), lines, line_fulfilment: orderFulfilment(lines) };
}
const orderRows = () => db.prepare(
  `SELECT o.*, b.name AS buyer, p.name AS product_name FROM orders o JOIN buyers b ON b.id=o.buyer_id
   LEFT JOIN products p ON p.id=o.product_id ORDER BY o.id DESC`).all().map(decorate);

r.get('/orders', (_q, res) => res.json({ data: orderRows() }));

// Build the material requirement rows from each product's bill of materials at the ordered quantity.
function requirementsFromBom(productId, qty) {
  return db.prepare('SELECT material_id, qty_per_metre FROM product_bom WHERE product_id=?').all(productId)
    .map((b) => ({ material_id: b.material_id, qty_required: r4(b.qty_per_metre * qty), blend_ratio: null }));
}

r.post('/orders', validate(z.object({
  buyer_id: z.coerce.number().int().positive(),
  deadline: z.string().refine((d) => !Number.isNaN(Date.parse(d)) && new Date(d) >= new Date(new Date().toDateString()), 'Deadline cannot be in the past'),
  extra_cost: z.coerce.number().min(0).optional().default(0),
  // Cart of products (preferred).
  lines: z.array(z.object({
    product_id: z.coerce.number().int().positive(),
    qty_metres: z.coerce.number().positive('Quantity must be more than 0'),
  })).optional(),
  // Legacy single-product order (still accepted so older clients keep working).
  fabric_type: z.string().trim().min(2).optional(), colour: z.string().trim().min(2).optional(),
  qty_metres: z.coerce.number().positive().optional(), price_per_metre: z.coerce.number().min(0).optional(),
  requirements: z.array(z.object({ material_id: z.coerce.number().int().positive(), qty_required: z.coerce.number().positive(), blend_ratio: z.coerce.number().positive().max(100).optional() })).default([]),
}).refine((v) => (v.lines && v.lines.length) || (v.fabric_type && v.colour && v.qty_metres != null && v.price_per_metre != null),
  { message: 'Add at least one product to the order', path: ['lines'] })
  .refine((v) => !v.lines || new Set(v.lines.map((l) => l.product_id)).size === v.lines.length,
    { message: 'Each product can appear only once. Change the quantity instead.', path: ['lines'] })), (req, res) => {
  const b = req.body;
  const token = crypto.randomBytes(8).toString('hex');
  const extraCost = r2(b.extra_cost || 0);

  if (b.lines?.length) {
    const built = b.lines.map((l) => {
      const p = db.prepare('SELECT * FROM products WHERE id=?').get(l.product_id);
      if (!p) throw notFound(`Product ${l.product_id}`);
      if (!p.active) throw bad(`${p.name} is not available for new orders`, 'PRODUCT_INACTIVE');
      const reqs = requirementsFromBom(p.id, l.qty_metres);
      checkYarnCompatibility(p.fabric_type, reqs);
      return { p, qty: l.qty_metres, unitPrice: p.price_per_metre, reqs };
    });
    const totalQty = built.reduce((s, x) => s + x.qty, 0);
    const productTotal = built.reduce((s, x) => s + x.qty * x.unitPrice, 0);
    const grandTotal = r2(productTotal + extraCost);
    const fabric = built.length === 1 ? built[0].p.fabric_type : 'multiple';
    const colour = built.length === 1 ? built[0].p.colour : 'mixed';
    const id = db.transaction(() => {
      const info = db.prepare('INSERT INTO orders (buyer_id,fabric_type,colour,qty_metres,price_per_metre,extra_cost,deadline,tracking_token) VALUES (?,?,?,?,?,?,?,?)')
        .run(b.buyer_id, fabric, colour, totalQty, r2(totalQty ? productTotal / totalQty : 0), extraCost, b.deadline, token);
      const orderId = info.lastInsertRowid;
      const reqByMaterial = new Map();
      for (const L of built) {
        const comp = db.prepare('SELECT fibre_type, percentage FROM product_composition WHERE product_id=? ORDER BY percentage DESC').all(L.p.id);
        const bom = db.prepare('SELECT material_id, qty_per_metre FROM product_bom WHERE product_id=? ORDER BY material_id').all(L.p.id);
        db.prepare(`INSERT INTO order_lines (order_id,product_id,name,fabric_type,colour,unit,qty_metres,unit_price,amount,composition,bom)
                    VALUES (?,?,?,?,?,?,?,?,?,?,?)`)
          .run(orderId, L.p.id, L.p.name, L.p.fabric_type, L.p.colour, L.p.unit, L.qty, L.unitPrice, r2(L.qty * L.unitPrice), JSON.stringify(comp), JSON.stringify(bom));
        for (const rq of L.reqs) reqByMaterial.set(rq.material_id, r4((reqByMaterial.get(rq.material_id) || 0) + rq.qty_required));
      }
      for (const [material_id, qty_required] of reqByMaterial)
        db.prepare('INSERT INTO order_requirements (order_id,material_id,qty_required) VALUES (?,?,?)').run(orderId, material_id, qty_required);
      for (const L of built) reallocate(L.p.id);
      return orderId;
    })();
    publish('orders'); publish('products');
    return res.status(201).json({ data: { id, tracking_token: token, product_total: r2(productTotal), extra_cost: extraCost, total_amount: grandTotal, lines: linesOf(id) } });
  }

  // Legacy single-product path.
  checkYarnCompatibility(b.fabric_type, b.requirements);
  const id = db.transaction(() => {
    const info = db.prepare('INSERT INTO orders (buyer_id,fabric_type,colour,qty_metres,price_per_metre,extra_cost,deadline,tracking_token) VALUES (?,?,?,?,?,?,?,?)')
      .run(b.buyer_id, b.fabric_type, b.colour, b.qty_metres, b.price_per_metre, extraCost, b.deadline, token);
    for (const q of b.requirements)
      db.prepare('INSERT INTO order_requirements (order_id,material_id,qty_required,blend_ratio) VALUES (?,?,?,?)').run(info.lastInsertRowid, q.material_id, q.qty_required, q.blend_ratio ?? null);
    return info.lastInsertRowid;
  })();
  publish('orders');
  res.status(201).json({ data: { id, tracking_token: token } });
});

r.patch('/orders/:id/extra-cost', validate(z.object({ extra_cost: z.coerce.number().min(0) })), (req, res) => {
  const id = Number(req.params.id);
  const info = db.prepare('UPDATE orders SET extra_cost=? WHERE id=?').run(req.body.extra_cost, id);
  if (!info.changes) throw notFound('Order');
  publish('orders');
  res.json({ data: { id, extra_cost: req.body.extra_cost } });
});

// Customer orders that still need production. Fully completed and dispatched orders are left out,
// and internal stock-production orders never appear here (they are made from the stock-production form).
r.get('/orders/assignable', (_q, res) => {
  const rows = db.prepare(`SELECT o.*, b.name AS buyer FROM orders o JOIN buyers b ON b.id=o.buyer_id
    WHERE o.is_internal=0 ORDER BY o.id DESC`).all()
    .map((o) => ({ ...o, ...orderProgress(o.id) }))
    // Still needs production only while the order is not fully committed (shipped + reserved).
    .filter((o) => o.status !== 'dispatched' && o.progress_metres < o.qty_metres);
  res.json({ data: rows });
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
