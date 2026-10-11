// Production runs: make a catalogue product. Yarn is worked out and issued from the product recipe, then the
// run moves through every stage by itself. See lib/runs.js for the rules.
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { validate, notFound } from '../lib/http.js';
import { planFor, createRun, completeStage, cancelRun, describeRun, productStock, advanceRuns } from '../lib/runs.js';

const r = Router();

// Preview before starting: yarn needed for N metres of a product, what is in stock, what is short.
r.get('/runs/plan', (req, res) => {
  const product_id = Number(req.query.product_id); const qty = Number(req.query.qty_metres);
  if (!Number.isInteger(product_id) || product_id <= 0) return res.json({ data: null });
  res.json({ data: planFor(product_id, qty > 0 ? qty : 1) });
});

r.get('/runs', (req, res) => {
  const status = ['running', 'completed', 'cancelled'].includes(req.query.status) ? req.query.status : null;
  const rows = db.prepare(`SELECT * FROM production_runs ${status ? 'WHERE status=?' : ''} ORDER BY id DESC LIMIT 200`).all(...(status ? [status] : []));
  res.json({ data: rows.map(describeRun) });
});

r.get('/runs/:id', (req, res) => {
  const run = db.prepare('SELECT * FROM production_runs WHERE id=?').get(req.params.id);
  if (!run) throw notFound('Run');
  res.json({ data: describeRun(run) });
});

r.post('/runs', validate(z.object({
  product_id: z.coerce.number().int().positive('Choose a product'),
  qty_metres: z.coerce.number().positive('Metres must be more than 0').max(1000000),
})), (req, res) => {
  const made = createRun({ ...req.body, started_by: req.user?.name ?? null });
  res.status(201).json({ data: made });
});

// Finish the stage that is running. Metres and waste are optional: by default the stage is taken to have
// produced everything it was given. The next stage starts straight away on a free machine.
r.post('/runs/:id/complete-stage', validate(z.object({
  metres: z.coerce.number().positive('Metres must be more than 0').optional(),
  waste_metres: z.coerce.number().min(0).default(0),
})), (req, res) => {
  res.json({ data: completeStage(Number(req.params.id), req.body) });
});

r.post('/runs/:id/cancel', (req, res) => {
  res.json({ data: cancelRun(Number(req.params.id)) });
});

// Stock of every product: in production, in QC, ready, reserved, free, dispatched.
r.get('/product-stock', (_q, res) => res.json({ data: productStock() }));

// Nudge: start anything that is waiting for a machine (also happens automatically).
r.post('/runs-advance', (_q, res) => res.json({ data: { moved: advanceRuns() } }));

export default r;
