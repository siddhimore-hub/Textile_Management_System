// OWNER: M1 | Fabric -> yarn compatibility mapping. Small and editable; used by the order form and
// validated on POST /orders and POST /stock/issue so incompatible yarn can never be issued to an order.
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { validate, bad, notFound } from '../lib/http.js';
import { allowedFamilies, familiesOf, isCompatible } from '../lib/compatibility.js';
import { publish } from '../lib/events.js';

const r = Router();

// Fabrics with the yarn families they accept (drives the "Fabric" select and the filtered yarn dropdown).
r.get('/compatibility/fabrics', (_q, res) => {
  const rules = db.prepare('SELECT fabric_type, yarn_type, blend_ratio FROM fabric_yarn_compatibility ORDER BY fabric_type, yarn_type').all();
  const byFabric = new Map();
  for (const x of rules) {
    if (!byFabric.has(x.fabric_type)) byFabric.set(x.fabric_type, []);
    byFabric.get(x.fabric_type).push({ yarn_type: x.yarn_type, blend_ratio: x.blend_ratio });
  }
  res.json({ data: [...byFabric.entries()].map(([fabric_type, yarns]) => ({ fabric_type, yarns, is_blend: yarns.length > 1 })) });
});

r.get('/compatibility', (_q, res) => res.json({ data: db.prepare('SELECT * FROM fabric_yarn_compatibility ORDER BY fabric_type, yarn_type').all() }));

// Materials that can be used for a fabric. No fabric (or no rule) = every material.
r.get('/compatibility/materials', (req, res) => {
  const fabric = String(req.query.fabric_type || '').trim();
  const rows = db.prepare('SELECT id, name, yarn_type, colour, unit FROM materials ORDER BY name').all();
  res.json({ data: fabric && allowedFamilies(fabric) ? rows.filter((m) => isCompatible(fabric, m.yarn_type)) : rows });
});

r.post('/compatibility', validate(z.object({
  fabric_type: z.string().trim().toLowerCase().min(2), yarn_type: z.string().trim().toLowerCase().min(2),
  blend_ratio: z.coerce.number().positive().max(100).optional(), note: z.string().trim().max(200).optional(),
})), (req, res) => {
  const b = req.body;
  if (!familiesOf(b.yarn_type).length)
    throw bad(`"${b.yarn_type}" is not a known yarn family (cotton, linen, polyester, wool, silk, viscose)`, 'UNKNOWN_YARN');
  const info = db.prepare('INSERT INTO fabric_yarn_compatibility (fabric_type,yarn_type,blend_ratio,note) VALUES (?,?,?,?)')
    .run(b.fabric_type, b.yarn_type, b.blend_ratio ?? null, b.note ?? null);
  publish('compatibility');
  res.status(201).json({ data: { id: info.lastInsertRowid } });
});

r.delete('/compatibility/:id', (req, res) => {
  const info = db.prepare('DELETE FROM fabric_yarn_compatibility WHERE id=?').run(req.params.id);
  if (!info.changes) throw notFound('Compatibility rule');
  publish('compatibility');
  res.json({ data: { ok: true } });
});

export default r;
