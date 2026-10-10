// OWNER: M2  |  Scene 3: rolls + inspection
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { validate, bad, notFound } from '../lib/http.js';
import { publish } from '../lib/events.js';
import { notify } from '../lib/notify.js';
import { orderProgress } from '../lib/orderStatus.js';

const r = Router();

r.get('/rolls', (req, res) => {
  const where = req.query.qc_status ? 'WHERE r.qc_status = ?' : '';
  const rows = db.prepare(`SELECT r.*, m.name AS machine FROM rolls r JOIN machines m ON m.id=r.machine_id ${where} ORDER BY r.id DESC`)
    .all(...(req.query.qc_status ? [req.query.qc_status] : []));
  res.json({ data: rows });
});

const labelSql = `SELECT r.id, r.code, r.metres, r.qc_status, r.created_at, r.order_id, o.fabric_type, o.colour, b.name AS buyer, m.name AS machine
  FROM rolls r JOIN orders o ON o.id=r.order_id JOIN buyers b ON b.id=o.buyer_id JOIN machines m ON m.id=r.machine_id`;
// Data for printing QR labels: ?ids=1,2,3  (or ?pending=1 for rolls still waiting for QC)
r.get('/rolls/labels', (req, res) => {
  const ids = String(req.query.ids || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 100);
  const rows = ids.length ? db.prepare(`${labelSql} WHERE r.id IN (${ids.map(() => '?').join(',')}) ORDER BY r.id`).all(...ids)
    : db.prepare(`${labelSql} WHERE r.qc_status='pending' ORDER BY r.id DESC LIMIT 50`).all();
  res.json({ data: rows });
});
// What a scanned QR opens: the roll, where it is, and its full inspection history (incl. rework re-inspections).
r.get('/rolls/by-code/:code', (req, res) => {
  const roll = db.prepare(`${labelSql.replace('r.created_at,', 'r.created_at, r.dispatch_id,')} WHERE r.code=?`).get(req.params.code);
  if (!roll) throw notFound('Roll');
  const inspections = db.prepare('SELECT id,result,defect_type,notes,inspector,created_at FROM qc_inspections WHERE roll_id=? ORDER BY id DESC').all(roll.id);
  res.json({ data: { ...roll, inspections } });
});

// Create a finished roll from a completed finishing batch (gets a code printed as a QR label later).
// A roll can never be made from a running stage, and cannot use more metres than the batch has left.
r.post('/rolls', validate(z.object({
  job_card_id: z.coerce.number().int().positive(), metres: z.coerce.number().positive('Metres must be more than 0'),
})), (req, res) => {
  const job = db.prepare('SELECT * FROM job_cards WHERE id=?').get(req.body.job_card_id);
  if (!job) throw notFound('Job');
  if (job.stage !== 'finishing' || job.status !== 'done')
    throw bad('Rolls can only be created from a completed finishing batch', 'NOT_FINISHED');
  const produced = db.prepare('SELECT COALESCE(SUM(metres),0) m FROM production_logs WHERE job_card_id=?').get(job.id).m;
  const rolled = db.prepare('SELECT COALESCE(SUM(metres),0) m FROM rolls WHERE job_card_id=?').get(job.id).m;
  const left = produced - rolled;
  if (req.body.metres > left) throw bad(`Only ${left} m of finished material is available for this batch`, 'EXCEEDS_AVAILABLE');
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
  if (b.result !== 'pass') notify('qc_fail', `${roll.code} marked ${b.result}: ${b.defect_type.replaceAll('_', ' ')}`, '/rolls', 'supervisor,qc');
  else if (orderProgress(roll.order_id)?.status === 'ready_to_ship') notify('ready_to_ship', `Order ${roll.order_id} is ready to ship`, '/finished', 'sales');
  publish('rolls'); publish('orders');
  res.json({ data: { ok: true } });
});

// Defect counts by machine -> trace cause.
r.get('/qc/defects', (_q, res) => res.json({ data: db.prepare(
  `SELECT m.name AS machine, q.defect_type, COUNT(*) AS count FROM qc_inspections q
   JOIN rolls r ON r.id=q.roll_id JOIN machines m ON m.id=r.machine_id
   WHERE q.defect_type IS NOT NULL GROUP BY m.name, q.defect_type ORDER BY count DESC`).all() }));

export default r;
