// OWNER: M2  |  Scene 3: rolls + inspection
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { validate, bad, notFound } from '../lib/http.js';
import { publish } from '../lib/events.js';

const r = Router();

r.get('/rolls', (req, res) => {
  const where = req.query.qc_status ? 'WHERE r.qc_status = ?' : '';
  const rows = db.prepare(`SELECT r.*, m.name AS machine FROM rolls r JOIN machines m ON m.id=r.machine_id ${where} ORDER BY r.id DESC`)
    .all(...(req.query.qc_status ? [req.query.qc_status] : []));
  res.json({ data: rows });
});

// Create a finished roll (gets a code that can be printed as a QR label later).
r.post('/rolls', validate(z.object({
  job_card_id: z.coerce.number().int().positive(), metres: z.coerce.number().positive('Metres must be more than 0'),
})), (req, res) => {
  const job = db.prepare('SELECT * FROM job_cards WHERE id=?').get(req.body.job_card_id);
  if (!job) throw notFound('Job');
  const next = db.prepare('SELECT COALESCE(MAX(id),0)+1 n FROM rolls').get().n;
  const code = `R-${new Date().getFullYear()}-${String(next).padStart(5, '0')}`;
  const info = db.prepare('INSERT INTO rolls (code,order_id,machine_id,job_card_id,metres) VALUES (?,?,?,?,?)')
    .run(code, job.order_id, job.machine_id, job.id, req.body.metres);
  publish('rolls'); publish('orders');
  res.status(201).json({ data: { id: info.lastInsertRowid, code } });
});

// Inspect a roll. Rework/reject MUST name a defect.
r.post('/rolls/:id/inspect', validate(z.object({
  result: z.enum(['pass', 'rework', 'reject']),
  defect_type: z.enum(['hole', 'colour_mismatch', 'uneven_weave', 'other']).optional(),
  notes: z.string().trim().max(300).optional(), inspector: z.string().trim().min(2).default('QC'),
}).refine((v) => v.result === 'pass' || v.defect_type, { message: 'Choose a defect type for rework or reject', path: ['defect_type'] })),
(req, res) => {
  const roll = db.prepare('SELECT * FROM rolls WHERE id=?').get(req.params.id);
  if (!roll) throw notFound('Roll');
  if (roll.dispatch_id) throw bad('Roll already dispatched', 'ALREADY_DISPATCHED');
  const b = req.body;
  db.transaction(() => {
    db.prepare('INSERT INTO qc_inspections (roll_id,result,defect_type,notes,inspector) VALUES (?,?,?,?,?)')
      .run(roll.id, b.result, b.defect_type ?? null, b.notes ?? null, b.inspector);
    db.prepare('UPDATE rolls SET qc_status=? WHERE id=?').run(b.result, roll.id);
  })();
  publish('rolls'); publish('orders');
  res.json({ data: { ok: true } });
});

// Defect counts by machine -> trace cause.
r.get('/qc/defects', (_q, res) => res.json({ data: db.prepare(
  `SELECT m.name AS machine, q.defect_type, COUNT(*) AS count FROM qc_inspections q
   JOIN rolls r ON r.id=q.roll_id JOIN machines m ON m.id=r.machine_id
   WHERE q.defect_type IS NOT NULL GROUP BY m.name, q.defect_type ORDER BY count DESC`).all() }));

export default r;
