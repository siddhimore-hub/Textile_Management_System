// OWNER: M1 | Fixed product catalogue: products, fibre composition, bill of materials, availability.
// Sales pick from here instead of typing product names; the order form reads prices, composition and
// BOM from these records. Writes are limited to store / products permission (owner always allowed).
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { validate, bad, notFound, conflict } from '../lib/http.js';
import { isCompatible, familiesOf } from '../lib/compatibility.js';
import { passedStock, allocatedForLine } from '../lib/fulfilment.js';
import { publish } from '../lib/events.js';

const r = Router();

const compositionSchema = z.array(z.object({
  fibre_type: z.string().trim().toLowerCase().min(2),
  percentage: z.coerce.number().positive().max(100),
}));
const bomSchema = z.array(z.object({
  material_id: z.coerce.number().int().positive(),
  qty_per_metre: z.coerce.number().positive(),
}));

// A blend must add up to exactly 100% (small tolerance for decimals).
function checkComposition(fabricType, composition) {
  if (!composition?.length) return;
  const total = composition.reduce((s, c) => s + c.percentage, 0);
  if (Math.abs(total - 100) > 0.01)
    throw bad(`Fibre composition must total 100% (currently ${Math.round(total * 100) / 100}%)`, 'BAD_COMPOSITION');
  const seen = new Set();
  for (const c of composition) {
    if (seen.has(c.fibre_type)) throw bad(`Fibre ${c.fibre_type} is listed twice`, 'BAD_COMPOSITION');
    seen.add(c.fibre_type);
  }
}

// Every BOM yarn must be a fibre the fabric can be made from (same rule the order check uses), and it
// must belong to one of the declared composition fibres, so a blend's BOM matches its stated composition.
function checkBom(fabricType, bom, composition = []) {
  if (!bom?.length) return;
  const fibres = new Set((composition || []).map((c) => c.fibre_type));
  for (const b of bom) {
    const mat = db.prepare('SELECT name, yarn_type FROM materials WHERE id=?').get(b.material_id);
    if (!mat) throw notFound('Material');
    if (!isCompatible(fabricType, mat.yarn_type))
      throw bad(`${mat.name} (${mat.yarn_type}) cannot make ${fabricType} fabric`, 'INCOMPATIBLE_YARN');
    if (fibres.size) {
      const fams = familiesOf(mat.yarn_type);
      if (fams.length && !fams.some((f) => fibres.has(f)))
        throw bad(`${mat.name} (${mat.yarn_type}) is not part of the declared composition (${[...fibres].join(', ')})`, 'BOM_COMPOSITION_MISMATCH');
    }
  }
}

const compositionOf = (id) => db.prepare('SELECT fibre_type, percentage FROM product_composition WHERE product_id=? ORDER BY percentage DESC').all(id);
const bomOf = (id) => db.prepare(
  `SELECT b.material_id, m.name AS material, m.yarn_type, m.colour, m.unit, b.qty_per_metre
   FROM product_bom b JOIN materials m ON m.id=b.material_id WHERE b.product_id=? ORDER BY m.name`).all(id);

function withParts(p) {
  const on_hand = passedStock(p.id);
  const allocated = db.prepare('SELECT COALESCE(SUM(qty_metres),0) q FROM stock_allocations WHERE product_id=?').get(p.id).q;
  return {
    ...p,
    composition: compositionOf(p.id),
    bom: bomOf(p.id),
    availability: { on_hand: Math.round(on_hand * 100) / 100, allocated: Math.round(allocated * 100) / 100,
      free: Math.round((on_hand - allocated) * 100) / 100 },
  };
}

const nextCode = () => `P-${String(db.prepare('SELECT COALESCE(MAX(id),0)+1 n FROM products').get().n).padStart(4, '0')}`;

r.get('/products', (req, res) => {
  const activeOnly = req.query.active === '1';
  const rows = db.prepare(`SELECT * FROM products ${activeOnly ? 'WHERE active=1' : ''} ORDER BY name`).all();
  res.json({ data: rows.map(withParts) });
});

r.get('/products/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(req.params.id);
  if (!p) throw notFound('Product');
  res.json({ data: withParts(p) });
});

const productBody = z.object({
  code: z.string().trim().min(2).max(40).optional(),
  name: z.string().trim().min(2), fabric_type: z.string().trim().toLowerCase().min(2),
  colour: z.string().trim().default(''),
  unit: z.enum(['metres', 'kg']).default('metres'),
  price_per_metre: z.coerce.number().min(0), cost_per_metre: z.coerce.number().min(0).default(0),
  notes: z.string().trim().max(200).optional(),
  composition: compositionSchema.default([]), bom: bomSchema.default([]),
});

r.post('/products', validate(productBody), (req, res) => {
  const b = req.body;
  const code = b.code || nextCode();
  if (db.prepare('SELECT 1 FROM products WHERE lower(code)=lower(?)').get(code)) throw conflict(`${code} already exists`);
  checkComposition(b.fabric_type, b.composition);
  checkBom(b.fabric_type, b.bom, b.composition);
  const id = db.transaction(() => {
    const info = db.prepare(
      'INSERT INTO products (code,name,fabric_type,colour,unit,price_per_metre,cost_per_metre,notes) VALUES (?,?,?,?,?,?,?,?)')
      .run(code, b.name, b.fabric_type, b.colour, b.unit, b.price_per_metre, b.cost_per_metre, b.notes ?? null);
    for (const c of b.composition)
      db.prepare('INSERT INTO product_composition (product_id,fibre_type,percentage) VALUES (?,?,?)').run(info.lastInsertRowid, c.fibre_type, c.percentage);
    for (const x of b.bom)
      db.prepare('INSERT INTO product_bom (product_id,material_id,qty_per_metre) VALUES (?,?,?)').run(info.lastInsertRowid, x.material_id, x.qty_per_metre);
    return info.lastInsertRowid;
  })();
  publish('products');
  res.status(201).json({ data: { id, code } });
});

r.patch('/products/:id', validate(z.object({
  name: z.string().trim().min(2).optional(), colour: z.string().trim().min(1).optional(),
  unit: z.enum(['metres', 'kg']).optional(),
  price_per_metre: z.coerce.number().min(0).optional(), cost_per_metre: z.coerce.number().min(0).optional(),
  active: z.boolean().optional(), notes: z.string().trim().max(200).nullable().optional(),
  composition: compositionSchema.optional(), bom: bomSchema.optional(),
})), (req, res) => {
  const id = Number(req.params.id); const b = req.body;
  const p = db.prepare('SELECT * FROM products WHERE id=?').get(id);
  if (!p) throw notFound('Product');
  if (b.composition) checkComposition(p.fabric_type, b.composition);
  if (b.bom) checkBom(p.fabric_type, b.bom, b.composition ?? compositionOf(id));
  db.transaction(() => {
    const sets = []; const args = [];
    for (const k of ['name', 'colour', 'unit', 'price_per_metre', 'cost_per_metre', 'notes']) if (b[k] !== undefined) { sets.push(`${k}=?`); args.push(b[k]); }
    if (b.active !== undefined) { sets.push('active=?'); args.push(b.active ? 1 : 0); }
    if (sets.length) db.prepare(`UPDATE products SET ${sets.join(',')} WHERE id=?`).run(...args, id);
    if (b.composition) {
      db.prepare('DELETE FROM product_composition WHERE product_id=?').run(id);
      for (const c of b.composition) db.prepare('INSERT INTO product_composition (product_id,fibre_type,percentage) VALUES (?,?,?)').run(id, c.fibre_type, c.percentage);
    }
    if (b.bom) {
      db.prepare('DELETE FROM product_bom WHERE product_id=?').run(id);
      for (const x of b.bom) db.prepare('INSERT INTO product_bom (product_id,material_id,qty_per_metre) VALUES (?,?,?)').run(id, x.material_id, x.qty_per_metre);
    }
  })();
  publish('products');
  res.json({ data: { ok: true } });
});

// Products that are on orders are deactivated instead of deleted so history stays readable.
r.delete('/products/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM products WHERE id=?').get(id)) throw notFound('Product');
  const used = db.prepare('SELECT 1 FROM order_lines WHERE product_id=? LIMIT 1').get(id);
  if (used) {
    db.prepare('UPDATE products SET active=0 WHERE id=?').run(id);
    publish('products');
    return res.json({ data: { ok: true, deactivated: true } });
  }
  db.transaction(() => {
    db.prepare('DELETE FROM product_composition WHERE product_id=?').run(id);
    db.prepare('DELETE FROM product_bom WHERE product_id=?').run(id);
    db.prepare('DELETE FROM products WHERE id=?').run(id);
  })();
  publish('products');
  res.json({ data: { ok: true } });
});

export default r;
