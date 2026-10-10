// OWNER: M2  |  Scene 2: machines + staged job cards
// Production line: spinning -> weaving (loom) -> dyeing -> finishing -> rolls.
// A job card consumes the completed job of the previous stage (source_job_id) and never skips one.
import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from '../lib/db.js';
import { validate, bad, notFound, conflict } from '../lib/http.js';
import { orderProgress } from '../lib/orderStatus.js';
import { familiesOf, allowedFamilies } from '../lib/compatibility.js';
import { publish } from '../lib/events.js';
import { notify } from '../lib/notify.js';

const r = Router();

export const STAGES = ['spinning', 'weaving', 'dyeing', 'finishing'];
const INTERNAL_BUYER = 'Internal Stock';
// One shared "buyer" for stock production, so internal jobs use the normal order/roll pipeline.
function internalBuyerId() {
  const b = db.prepare('SELECT id FROM buyers WHERE name=?').get(INTERNAL_BUYER);
  return b ? b.id : db.prepare('INSERT INTO buyers (name) VALUES (?)').run(INTERNAL_BUYER).lastInsertRowid;
}
function checkYarn(fabricType, requirements) {
  const allowed = allowedFamilies(fabricType);
  if (!allowed) return;
  for (const q of requirements) {
    const mat = db.prepare('SELECT name, yarn_type FROM materials WHERE id=?').get(q.material_id);
    if (!mat) throw notFound('Material');
    if (!familiesOf(mat.yarn_type).some((f) => allowed.includes(f)))
      throw bad(`${mat.name} (${mat.yarn_type}) cannot make ${fabricType} fabric`, 'INCOMPATIBLE_YARN');
  }
}
export const PREV_STAGE = { weaving: 'spinning', dyeing: 'weaving', finishing: 'dyeing' };
const producedOf = (id) => db.prepare('SELECT COALESCE(SUM(metres),0) m FROM production_logs WHERE job_card_id=?').get(id).m;
const rolledOf = (id) => db.prepare('SELECT COALESCE(SUM(metres),0) m FROM rolls WHERE job_card_id=?').get(id).m;
// What is left of a job's output: finishing is consumed by rolls, other stages by the next job.
const availableOf = (job) => (job.stage === 'finishing'
  ? Math.max(0, producedOf(job.id) - rolledOf(job.id))
  : (db.prepare('SELECT 1 FROM job_cards WHERE source_job_id=?').get(job.id) ? 0 : producedOf(job.id)));

r.get('/machines', (_q, res) => {
  const rows = db.prepare(`
    SELECT m.*, j.id AS job_id, j.order_id,
      (SELECT COALESCE(SUM(p.metres),0) FROM production_logs p JOIN job_cards jj ON jj.id=p.job_card_id
        WHERE jj.machine_id=m.id AND date(p.created_at)=date('now')) AS today_metres
    FROM machines m LEFT JOIN job_cards j ON j.machine_id=m.id AND j.status='in_progress' ORDER BY m.id`).all();
  res.json({ data: rows });
});

// Add a machine to the floor.
r.post('/machines', validate(z.object({
  name: z.string().trim().min(2, 'Give the machine a name or number'),
  stage: z.enum(STAGES),
  status: z.enum(['running', 'idle', 'breakdown', 'maintenance']).default('idle'),
})), (req, res) => {
  const b = req.body;
  if (db.prepare('SELECT 1 FROM machines WHERE lower(name)=lower(?)').get(b.name)) throw conflict(`${b.name} already exists`);
  const info = db.prepare('INSERT INTO machines (name,stage,status) VALUES (?,?,?)').run(b.name, b.stage, b.status);
  publish('machines');
  res.status(201).json({ data: { id: info.lastInsertRowid } });
});

r.patch('/machines/:id/status', validate(z.object({ status: z.enum(['running', 'idle', 'breakdown', 'maintenance']) })), (req, res) => {
  const info = db.prepare('UPDATE machines SET status=? WHERE id=?').run(req.body.status, req.params.id);
  if (!info.changes) throw notFound('Machine');
  if (req.body.status === 'breakdown') notify('breakdown', `${db.prepare('SELECT name FROM machines WHERE id=?').get(req.params.id).name} has broken down`, '/machines', 'supervisor');
  publish('machines');
  res.json({ data: { ok: true } });
});

// Every job with its order details, output so far and what is still available for the next stage.
r.get('/jobs', (_q, res) => {
  const rows = db.prepare(
    `SELECT j.*, m.name AS machine, o.fabric_type, o.colour, o.is_internal, b.name AS buyer,
       (SELECT COALESCE(SUM(p.metres),0) FROM production_logs p WHERE p.job_card_id=j.id) AS produced_metres,
       (SELECT COUNT(*) FROM job_cards c WHERE c.source_job_id=j.id) AS child_count,
       (SELECT COALESCE(SUM(r.metres),0) FROM rolls r WHERE r.job_card_id=j.id) AS rolled_metres
     FROM job_cards j JOIN machines m ON m.id=j.machine_id JOIN orders o ON o.id=j.order_id
     JOIN buyers b ON b.id=o.buyer_id ORDER BY j.id DESC`).all();
  res.json({ data: rows.map((j) => ({ ...j, available_metres: availableOf(j) })) });
});

// Material from completed jobs of `stage` that no later job has consumed yet. Used by the next
// stage's page and by Rolls (stage=finishing). Unfinished jobs never appear here.
r.get('/jobs/available', (req, res) => {
  const stage = String(req.query.stage || '');
  if (!STAGES.includes(stage)) throw bad('Unknown stage', 'BAD_STAGE');
  const rows = db.prepare(
    `SELECT j.id, j.order_id, j.stage, j.machine_id, j.status, j.created_at, o.is_internal,
       m.name AS machine, o.fabric_type, o.colour, b.name AS buyer,
       (SELECT COALESCE(SUM(p.metres),0) FROM production_logs p WHERE p.job_card_id=j.id) AS produced_metres,
       (SELECT COALESCE(SUM(r.metres),0) FROM rolls r WHERE r.job_card_id=j.id) AS rolled_metres
     FROM job_cards j JOIN machines m ON m.id=j.machine_id JOIN orders o ON o.id=j.order_id JOIN buyers b ON b.id=o.buyer_id
     WHERE j.stage=? AND j.status='done'
       AND NOT EXISTS (SELECT 1 FROM job_cards c WHERE c.source_job_id=j.id)
     ORDER BY j.id`).all(stage);
  res.json({ data: rows.map((x) => ({ ...x, available_metres: Math.max(0, x.produced_metres - x.rolled_metres) }))
    .filter((x) => x.available_metres > 0) });
});

// Assign a job to a machine. Spinning starts from an order; every later stage must name the
// completed previous-stage material (source_job_id) and keeps the original order id.
r.post('/jobs', validate(z.object({
  order_id: z.coerce.number().int().positive().optional(),
  source_job_id: z.coerce.number().int().positive().optional(),
  machine_id: z.coerce.number().int().positive(),
  shift: z.enum(['morning', 'evening', 'night']),
})), (req, res) => {
  const b = req.body;
  const m = db.prepare('SELECT * FROM machines WHERE id=?').get(b.machine_id);
  if (!m) throw notFound('Machine');
  if (['breakdown', 'maintenance'].includes(m.status)) throw bad(`${m.name} is in ${m.status}`, 'MACHINE_UNAVAILABLE');
  if (m.status === 'running') throw bad(`${m.name} already has a job`, 'MACHINE_BUSY');

  let orderId; let sourceJobId = null;
  if (m.stage === 'spinning') {
    if (!b.order_id) throw bad('Choose an order for a spinning job', 'ORDER_REQUIRED');
    const order = db.prepare('SELECT * FROM orders WHERE id=?').get(b.order_id);
    if (!order) throw notFound('Order');
    if (orderProgress(order.id).produced_metres >= order.qty_metres)
      throw bad(`Order ${order.id} is already fully produced`, 'ORDER_COMPLETE');
    orderId = b.order_id;
  } else {
    const prev = PREV_STAGE[m.stage];
    if (!b.source_job_id) throw bad(`Choose a completed ${prev} batch first`, 'MATERIAL_REQUIRED');
    const src = db.prepare('SELECT * FROM job_cards WHERE id=?').get(b.source_job_id);
    if (!src) throw notFound('Material');
    if (src.stage !== prev) throw bad(`Only completed ${prev} material can enter ${m.stage}`, 'WRONG_STAGE');
    if (src.status !== 'done') throw bad(`The ${src.stage} job is not finished yet`, 'STAGE_INCOMPLETE');
    if (db.prepare('SELECT 1 FROM job_cards WHERE source_job_id=?').get(src.id)) throw bad('This material is already in the next stage', 'ALREADY_CONSUMED');
    orderId = src.order_id; sourceJobId = src.id;
  }
  const tx = db.transaction(() => {
    const info = db.prepare('INSERT INTO job_cards (order_id,machine_id,stage,shift,source_job_id) VALUES (?,?,?,?,?)')
      .run(orderId, m.id, m.stage, b.shift, sourceJobId);
    db.prepare("UPDATE machines SET status='running' WHERE id=?").run(m.id);
    return info.lastInsertRowid;
  });
  const id = tx();
  publish('machines'); publish('orders');
  res.status(201).json({ data: { id } });
});

// Produce for stock: manufacture extra fabric with no customer order. Creates an internal order
// (buyer "Internal Stock", is_internal=1) plus a spinning job, so the normal stage -> QC -> finished
// stock pipeline applies. Customer orders and stock jobs stay distinguishable by is_internal.
r.post('/stock-production', validate(z.object({
  fabric_type: z.string().trim().min(2), colour: z.string().trim().min(2),
  qty_metres: z.coerce.number().positive('Metres must be more than 0'),
  machine_id: z.coerce.number().int().positive(), shift: z.enum(['morning', 'evening', 'night']),
  requirements: z.array(z.object({ material_id: z.coerce.number().int().positive(), qty_required: z.coerce.number().positive(), blend_ratio: z.coerce.number().positive().max(100).optional() })).default([]),
})), (req, res) => {
  const b = req.body;
  const m = db.prepare('SELECT * FROM machines WHERE id=?').get(b.machine_id);
  if (!m) throw notFound('Machine');
  if (m.stage !== 'spinning') throw bad('Stock production starts on a spinning machine', 'WRONG_STAGE');
  if (['breakdown', 'maintenance'].includes(m.status)) throw bad(`${m.name} is in ${m.status}`, 'MACHINE_UNAVAILABLE');
  if (m.status === 'running') throw bad(`${m.name} already has a job`, 'MACHINE_BUSY');
  checkYarn(b.fabric_type, b.requirements);
  const buyerId = internalBuyerId(); const token = crypto.randomBytes(8).toString('hex');
  const id = db.transaction(() => {
    const order = db.prepare('INSERT INTO orders (buyer_id,fabric_type,colour,qty_metres,price_per_metre,deadline,is_internal,tracking_token) VALUES (?,?,?,?,0,date(\'now\'),1,?)')
      .run(buyerId, b.fabric_type, b.colour, b.qty_metres, token);
    for (const q of b.requirements)
      db.prepare('INSERT INTO order_requirements (order_id,material_id,qty_required,blend_ratio) VALUES (?,?,?,?)')
        .run(order.lastInsertRowid, q.material_id, q.qty_required, q.blend_ratio ?? null);
    const job = db.prepare("INSERT INTO job_cards (order_id,machine_id,stage,shift,source_job_id) VALUES (?,?, 'spinning', ?, NULL)")
      .run(order.lastInsertRowid, m.id, b.shift);
    db.prepare("UPDATE machines SET status='running' WHERE id=?").run(m.id);
    return { order_id: order.lastInsertRowid, job_id: job.lastInsertRowid };
  })();
  publish('machines'); publish('orders');
  res.status(201).json({ data: id });
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

// Finish a job: frees the machine and makes the output available to the next stage.
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
