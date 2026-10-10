// OWNER: M2  |  Scene 2: machines, job cards, output
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { validate, bad, notFound } from '../lib/http.js';
import { publish } from '../lib/events.js';

const r = Router();

r.get('/machines', (_q, res) => {
  const rows = db.prepare(`
    SELECT m.*, j.id AS job_id, j.order_id,
      (SELECT COALESCE(SUM(p.metres),0) FROM production_logs p JOIN job_cards jj ON jj.id=p.job_card_id
        WHERE jj.machine_id=m.id AND date(p.created_at)=date('now')) AS today_metres
    FROM machines m LEFT JOIN job_cards j ON j.machine_id=m.id AND j.status='in_progress' ORDER BY m.name`).all();
  res.json({ data: rows });
});

r.patch('/machines/:id/status', validate(z.object({ status: z.enum(['running', 'idle', 'breakdown', 'maintenance']) })), (req, res) => {
  const info = db.prepare('UPDATE machines SET status=? WHERE id=?').run(req.body.status, req.params.id);
  if (!info.changes) throw notFound('Machine');
  publish('machines');
  res.json({ data: { ok: true } });
});

r.get('/jobs', (_q, res) => res.json({ data: db.prepare(
  `SELECT j.*, m.name AS machine, o.fabric_type, o.colour FROM job_cards j
   JOIN machines m ON m.id=j.machine_id JOIN orders o ON o.id=j.order_id ORDER BY j.id DESC`).all() }));

// Assign an order to a machine. Rule: cannot use a broken/maintenance/busy machine.
r.post('/jobs', validate(z.object({
  order_id: z.coerce.number().int().positive(), machine_id: z.coerce.number().int().positive(),
  shift: z.enum(['morning', 'evening', 'night']),
})), (req, res) => {
  const b = req.body;
  const m = db.prepare('SELECT * FROM machines WHERE id=?').get(b.machine_id);
  if (!m) throw notFound('Machine');
  if (['breakdown', 'maintenance'].includes(m.status)) throw bad(`${m.name} is in ${m.status}`, 'MACHINE_UNAVAILABLE');
  if (m.status === 'running') throw bad(`${m.name} already has a job`, 'MACHINE_BUSY');
  if (!db.prepare('SELECT 1 FROM orders WHERE id=?').get(b.order_id)) throw notFound('Order');
  const tx = db.transaction(() => {
    const info = db.prepare('INSERT INTO job_cards (order_id,machine_id,stage,shift) VALUES (?,?,?,?)').run(b.order_id, b.machine_id, m.stage, b.shift);
    db.prepare("UPDATE machines SET status='running' WHERE id=?").run(b.machine_id);
    return info.lastInsertRowid;
  });
  const id = tx();
  publish('machines'); publish('orders');
  res.status(201).json({ data: { id } });
});

// Log output (metres) against a job.
r.post('/jobs/:id/output', validate(z.object({ metres: z.coerce.number().positive('Metres must be more than 0') })), (req, res) => {
  const job = db.prepare('SELECT * FROM job_cards WHERE id=?').get(req.params.id);
  if (!job) throw notFound('Job');
  if (job.status === 'done') throw bad('Job already finished');
  db.prepare('INSERT INTO production_logs (job_card_id,metres) VALUES (?,?)').run(job.id, req.body.metres);
  publish('machines');
  res.status(201).json({ data: { ok: true } });
});

// Finish a job: frees the machine.
r.post('/jobs/:id/finish', (req, res) => {
  const job = db.prepare('SELECT * FROM job_cards WHERE id=?').get(req.params.id);
  if (!job) throw notFound('Job');
  db.transaction(() => {
    db.prepare("UPDATE job_cards SET status='done' WHERE id=?").run(job.id);
    db.prepare("UPDATE machines SET status='idle' WHERE id=? AND status='running'").run(job.machine_id);
  })();
  publish('machines'); publish('orders');
  res.json({ data: { ok: true } });
});

export default r;
