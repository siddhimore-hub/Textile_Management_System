// OWNER: M4  |  Scene 6: workers, attendance, wages
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { validate, conflict } from '../lib/http.js';

const r = Router();

r.get('/workers', (_q, res) => res.json({ data: db.prepare('SELECT * FROM workers ORDER BY name').all() }));
r.post('/workers', validate(z.object({ name: z.string().trim().min(2), daily_wage: z.coerce.number().min(0) })), (req, res) => {
  const info = db.prepare('INSERT INTO workers (name,daily_wage) VALUES (?,?)').run(req.body.name, req.body.daily_wage);
  res.status(201).json({ data: { id: info.lastInsertRowid } });
});

r.get('/attendance', (req, res) => {
  const date = String(req.query.date || new Date().toISOString().slice(0, 10));
  res.json({ data: db.prepare(
    `SELECT w.id AS worker_id, w.name, a.status FROM workers w LEFT JOIN attendance a ON a.worker_id=w.id AND a.work_date=? ORDER BY w.name`).all(date) });
});
r.post('/attendance', validate(z.object({
  worker_id: z.coerce.number().int().positive(), work_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  status: z.enum(['present', 'absent', 'half']),
})), (req, res) => {
  const b = req.body;
  try { db.prepare('INSERT INTO attendance (worker_id,work_date,status) VALUES (?,?,?)').run(b.worker_id, b.work_date, b.status); }
  catch { throw conflict('Attendance already marked for this worker today'); }
  res.status(201).json({ data: { ok: true } });
});

// Payroll for a month = days present x daily wage (half = 0.5). One payout per worker per month.
r.post('/payroll/run', validate(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/, 'Use YYYY-MM') })), (req, res) => {
  const { month } = req.body;
  const rows = db.prepare(`SELECT w.id, w.daily_wage,
      SUM(CASE a.status WHEN 'present' THEN 1 WHEN 'half' THEN 0.5 ELSE 0 END) AS days
    FROM workers w LEFT JOIN attendance a ON a.worker_id=w.id AND substr(a.work_date,1,7)=? GROUP BY w.id`).all(month);
  let created = 0;
  db.transaction(() => rows.forEach((w) => {
    const info = db.prepare('INSERT OR IGNORE INTO wage_payouts (worker_id,month,amount) VALUES (?,?,?)').run(w.id, month, (w.days || 0) * w.daily_wage);
    created += info.changes;
  }))();
  res.json({ data: { created } });
});
r.get('/payroll', (req, res) => res.json({ data: db.prepare(
  `SELECT p.id, w.name, p.month, p.amount FROM wage_payouts p JOIN workers w ON w.id=p.worker_id
   ${req.query.month ? 'WHERE p.month=?' : ''} ORDER BY p.month DESC, w.name`).all(...(req.query.month ? [req.query.month] : [])) }));

export default r;
