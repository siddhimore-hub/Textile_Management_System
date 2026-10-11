
import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import { db } from '../lib/db.js';
import { validate, bad, notFound, conflict } from '../lib/http.js';
import { orderProgress } from '../lib/orderStatus.js';
import { familiesOf, allowedFamilies } from '../lib/compatibility.js';
import { publish } from '../lib/events.js';
import { notify } from '../lib/notify.js';
import { advanceRuns } from '../lib/runs.js';

const r = Router();

export const STAGES = ['spinning', 'weaving', 'dyeing', 'finishing'];

const INTERNAL_BUYER = 'Internal Stock';

function internalBuyerId() {
  const buyer = db.prepare(
    'SELECT id FROM buyers WHERE name = ?'
  ).get(INTERNAL_BUYER);

  return buyer
    ? buyer.id
    : db.prepare('INSERT INTO buyers (name) VALUES (?)')
        .run(INTERNAL_BUYER).lastInsertRowid;
}

function checkYarn(fabricType, requirements) {
  const allowed = allowedFamilies(fabricType);
  if (!allowed) return;

  for (const requirement of requirements) {
    const material = db.prepare(
      'SELECT name, yarn_type FROM materials WHERE id = ?'
    ).get(requirement.material_id);

    if (!material) throw notFound('Material');

    if (!familiesOf(material.yarn_type).some(
      (family) => allowed.includes(family)
    )) {
      throw bad(
        `${material.name} (${material.yarn_type}) cannot make ${fabricType} fabric`,
        'INCOMPATIBLE_YARN'
      );
    }
  }
}

export const PREV_STAGE = {
  weaving: 'spinning',
  dyeing: 'weaving',
  finishing: 'dyeing',
};

const producedOf = (id) =>
  db.prepare(`
    SELECT COALESCE(SUM(metres), 0) AS m
    FROM production_logs
    WHERE job_card_id = ?
  `).get(id).m;

const rolledOf = (id) =>
  db.prepare(`
    SELECT COALESCE(SUM(metres), 0) AS m
    FROM rolls
    WHERE job_card_id = ?
  `).get(id).m;

const availableOf = (job) => (
  job.stage === 'finishing'
    ? Math.max(0, producedOf(job.id) - rolledOf(job.id))
    : (
        db.prepare(
          'SELECT 1 FROM job_cards WHERE source_job_id = ?'
        ).get(job.id)
          ? 0
          : producedOf(job.id)
      )
);

// -----------------------------------------------------------------------------
// Machines
// -----------------------------------------------------------------------------

r.get('/machines', (_req, res) => {
  const rows = db.prepare(`
    SELECT
      m.*,
      j.id AS job_id,
      j.order_id,
      (
        SELECT COALESCE(SUM(p.metres), 0)
        FROM production_logs p
        JOIN job_cards jj ON jj.id = p.job_card_id
        WHERE jj.machine_id = m.id
          AND date(p.created_at) = date('now')
      ) AS today_metres
    FROM machines m
    LEFT JOIN job_cards j
      ON j.machine_id = m.id
      AND j.status = 'in_progress'
    ORDER BY m.id
  `).all();

  res.json({ data: rows });
});

r.post('/machines', validate(z.object({
  name: z.string().trim().min(2, 'Give the machine a name or number'),
  stage: z.enum(STAGES),
  status: z.enum([
    'running',
    'idle',
    'breakdown',
    'maintenance',
  ]).default('idle'),
})), (req, res) => {
  const { name, stage, status } = req.body;

  if (db.prepare(
    'SELECT 1 FROM machines WHERE lower(name) = lower(?)'
  ).get(name)) {
    throw conflict(`${name} already exists`);
  }

  const info = db.prepare(
    'INSERT INTO machines (name, stage, status) VALUES (?, ?, ?)'
  ).run(name, stage, status);

  publish('machines');
  advanceRuns(); // a new machine may unblock a run that was waiting

  res.status(201).json({
    data: { id: info.lastInsertRowid },
  });
});

r.patch('/machines/:id/status', validate(z.object({
  status: z.enum([
    'running',
    'idle',
    'breakdown',
    'maintenance',
  ]),
})), (req, res) => {
  const machine = db.prepare(
    'SELECT * FROM machines WHERE id = ?'
  ).get(req.params.id);

  if (!machine) throw notFound('Machine');

  const activeJob = db.prepare(`
    SELECT id
    FROM job_cards
    WHERE machine_id = ?
      AND status = 'in_progress'
    LIMIT 1
  `).get(machine.id);

  // Do not mark an occupied machine idle or maintenance while its job is active.
  if (activeJob && req.body.status !== 'running') {
    throw conflict(
      `Machine has active Job ${activeJob.id}. Finish or resolve the job first.`
    );
  }

  db.prepare(
    'UPDATE machines SET status = ? WHERE id = ?'
  ).run(req.body.status, machine.id);

  if (req.body.status === 'breakdown') {
    notify(
      'breakdown',
      `${machine.name} has broken down`,
      '/machines',
      'supervisor'
    );
  }

  publish('machines');
  if (req.body.status === 'idle') advanceRuns(); // machine freed or repaired: waiting runs can take it

  res.json({ data: { ok: true } });
});

// -----------------------------------------------------------------------------
// Production job listing
// -----------------------------------------------------------------------------

r.get('/jobs', (_req, res) => {
  const rows = db.prepare(`
    SELECT
      j.*,
      m.name AS machine,
      o.fabric_type,
      o.colour,
      o.is_internal,
      b.name AS buyer,
      ru.code AS run_code,
      pr.name AS product_name,
      pr.code AS product_code,
      (
        SELECT COALESCE(SUM(p.metres), 0)
        FROM production_logs p
        WHERE p.job_card_id = j.id
      ) AS produced_metres,
      (
        SELECT COALESCE(SUM(p.waste_metres), 0)
        FROM production_logs p
        WHERE p.job_card_id = j.id
      ) AS waste_metres,
      (
        SELECT COUNT(*)
        FROM job_cards c
        WHERE c.source_job_id = j.id
      ) AS child_count,
      (
        SELECT COALESCE(SUM(rr.metres), 0)
        FROM rolls rr
        WHERE rr.job_card_id = j.id
      ) AS rolled_metres
    FROM job_cards j
    JOIN machines m ON m.id = j.machine_id
    JOIN orders o ON o.id = j.order_id
    JOIN buyers b ON b.id = o.buyer_id
    LEFT JOIN production_runs ru ON ru.id = j.run_id
    LEFT JOIN products pr ON pr.id = ru.product_id
    ORDER BY j.id DESC
  `).all();

  res.json({
    data: rows.map((job) => ({
      ...job,
      available_metres: availableOf(job),
    })),
  });
});

// Completed output that has not been consumed by the next stage.
r.get('/jobs/available', (req, res) => {
  const stage = String(req.query.stage || '');

  if (!STAGES.includes(stage)) {
    throw bad('Unknown stage', 'BAD_STAGE');
  }

  const rows = db.prepare(`
    SELECT
      j.id,
      j.order_id,
      j.order_line_id,
      j.stage,
      j.machine_id,
      j.status,
      j.created_at,
      o.is_internal,
      m.name AS machine,
      o.fabric_type,
      o.colour,
      b.name AS buyer,
      ru.code AS run_code,
      pr.name AS product_name,
      (
        SELECT COALESCE(SUM(p.metres), 0)
        FROM production_logs p
        WHERE p.job_card_id = j.id
      ) AS produced_metres,
      (
        SELECT COALESCE(SUM(rr.metres), 0)
        FROM rolls rr
        WHERE rr.job_card_id = j.id
      ) AS rolled_metres
    FROM job_cards j
    JOIN machines m ON m.id = j.machine_id
    JOIN orders o ON o.id = j.order_id
    JOIN buyers b ON b.id = o.buyer_id
    LEFT JOIN production_runs ru ON ru.id = j.run_id
    LEFT JOIN products pr ON pr.id = ru.product_id
    WHERE j.stage = ?
      AND j.status = 'done'
      AND NOT EXISTS (
        SELECT 1
        FROM job_cards c
        WHERE c.source_job_id = j.id
      )
    ORDER BY j.id
  `).all(stage);

  res.json({
    data: rows.map((job) => ({
      ...job,
      available_metres: Math.max(
        0,
        job.produced_metres - job.rolled_metres
      ),
    })).filter((job) => job.available_metres > 0),
  });
});

// -----------------------------------------------------------------------------
// Create a job and atomically claim its machine
// -----------------------------------------------------------------------------

r.post('/jobs', validate(z.object({
  order_id: z.coerce.number().int().positive().optional(),
  order_line_id: z.coerce.number().int().positive().optional(),
  source_job_id: z.coerce.number().int().positive().optional(),
  machine_id: z.coerce.number().int().positive(),
  shift: z.enum(['morning', 'evening', 'night']),
})), (req, res) => {
  const body = req.body;

  const machine = db.prepare(
    'SELECT * FROM machines WHERE id = ?'
  ).get(body.machine_id);

  if (!machine) throw notFound('Machine');

  if (['breakdown', 'maintenance'].includes(machine.status)) {
    throw bad(
      `${machine.name} is in ${machine.status}`,
      'MACHINE_UNAVAILABLE'
    );
  }

  if (machine.status !== 'idle') {
    throw bad(
      `${machine.name} is not idle`,
      'MACHINE_BUSY'
    );
  }

  let orderId;
  let sourceJobId = null;
  let orderLineId = null;
  let runId = null;

  if (machine.stage === 'spinning') {
    if (!body.order_id) {
      throw bad('Choose an order for a spinning job', 'ORDER_REQUIRED');
    }

    const order = db.prepare(
      'SELECT * FROM orders WHERE id = ?'
    ).get(body.order_id);

    if (!order) throw notFound('Order');

    if (!body.order_line_id &&
        orderProgress(order.id).progress_metres >= order.qty_metres) {
      throw bad(
        `Order ${order.id} is already fully produced or already reserved from stock`,
        'ORDER_COMPLETE'
      );
    }

    if (body.order_line_id) {
      const line = db.prepare(`
        SELECT *
        FROM order_lines
        WHERE id = ? AND order_id = ?
      `).get(body.order_line_id, order.id);

      if (!line) {
        throw bad(
          'That product line does not belong to this order',
          'WRONG_LINE'
        );
      }

      const activeJob = db.prepare(`
        SELECT id
        FROM job_cards
        WHERE order_line_id = ?
          AND stage = 'spinning'
          AND status = 'in_progress'
        LIMIT 1
      `).get(line.id);

      if (activeJob) {
        throw conflict(
          `Production is already active for ${line.name} (Job ${activeJob.id})`
        );
      }

      if (line.product_id) {
        const product = db.prepare(
          'SELECT active FROM products WHERE id = ?'
        ).get(line.product_id);

        if (product && !product.active) {
          throw bad('That product is switched off', 'PRODUCT_INACTIVE');
        }
      }

      orderLineId = line.id;
    }

    orderId = order.id;
  } else {
    const previousStage = PREV_STAGE[machine.stage];

    if (!body.source_job_id) {
      throw bad(
        `Choose a completed ${previousStage} batch first`,
        'MATERIAL_REQUIRED'
      );
    }

    const source = db.prepare(
      'SELECT * FROM job_cards WHERE id = ?'
    ).get(body.source_job_id);

    if (!source) throw notFound('Material');

    if (source.stage !== previousStage) {
      throw bad(
        `Only completed ${previousStage} material can enter ${machine.stage}`,
        'WRONG_STAGE'
      );
    }

    if (source.status !== 'done') {
      throw bad(
        `The ${source.stage} job is not finished yet`,
        'STAGE_INCOMPLETE'
      );
    }

    if (db.prepare(
      'SELECT 1 FROM job_cards WHERE source_job_id = ?'
    ).get(source.id)) {
      throw conflict('This material is already in the next stage');
    }

    if (availableOf(source) <= 0) {
      throw bad('No unconsumed output is available', 'NO_AVAILABLE_OUTPUT');
    }

    orderId = source.order_id;
    sourceJobId = source.id;
    orderLineId = source.order_line_id ?? null;
    runId = source.run_id ?? null; // a production run stays one run if a supervisor starts the next stage by hand
  }

  const createJob = db.transaction(() => {
    const claim = db.prepare(`
      UPDATE machines
      SET status = 'running'
      WHERE id = ?
        AND stage = ?
        AND status = 'idle'
    `).run(machine.id, machine.stage);

    if (claim.changes !== 1) {
      throw conflict(`${machine.name} is no longer available`);
    }

    if (sourceJobId !== null) {
      const source = db.prepare(
        'SELECT * FROM job_cards WHERE id = ?'
      ).get(sourceJobId);

      if (!source ||
          source.status !== 'done' ||
          source.stage !== PREV_STAGE[machine.stage]) {
        throw bad(
          'Source material is not ready for this stage',
          'STAGE_INCOMPLETE'
        );
      }

      if (db.prepare(
        'SELECT 1 FROM job_cards WHERE source_job_id = ?'
      ).get(sourceJobId)) {
        throw conflict('This material has already entered the next stage');
      }
    }

    const info = db.prepare(`
      INSERT INTO job_cards
        (order_id, machine_id, stage, shift, source_job_id, order_line_id, run_id)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      orderId,
      machine.id,
      machine.stage,
      body.shift,
      sourceJobId,
      orderLineId,
      runId
    );

    return info.lastInsertRowid;
  });

  const id = createJob();

  publish('machines');
  publish('orders');

  res.status(201).json({ data: { id } });
});

// -----------------------------------------------------------------------------
// Product-independent internal stock production
// -----------------------------------------------------------------------------

r.post('/stock-production', validate(z.object({
  product_id: z.coerce.number().int().positive().optional(),
  fabric_type: z.string().trim().min(2).optional(),
  colour: z.string().trim().min(2).optional(),
  qty_metres: z.coerce.number().positive('Metres must be more than 0'),
  machine_id: z.coerce.number().int().positive(),
  shift: z.enum(['morning', 'evening', 'night']),
  requirements: z.array(z.object({
    material_id: z.coerce.number().int().positive(),
    qty_required: z.coerce.number().positive(),
    blend_ratio: z.coerce.number().positive().max(100).optional(),
  })).default([]),
})), (req, res) => {
  const body = req.body;

  const machine = db.prepare(
    'SELECT * FROM machines WHERE id = ?'
  ).get(body.machine_id);

  if (!machine) throw notFound('Machine');

  if (machine.stage !== 'spinning') {
    throw bad(
      'Stock production starts on a spinning machine',
      'WRONG_STAGE'
    );
  }

  if (['breakdown', 'maintenance'].includes(machine.status)) {
    throw bad(`${machine.name} is in ${machine.status}`, 'MACHINE_UNAVAILABLE');
  }

  if (machine.status !== 'idle') {
    throw bad(`${machine.name} is not idle`, 'MACHINE_BUSY');
  }

  let product = null;

  if (body.product_id) {
    product = db.prepare(
      'SELECT * FROM products WHERE id = ?'
    ).get(body.product_id);

    if (!product) throw notFound('Product');

    if (!product.active) {
      throw bad(`${product.name} is switched off`, 'PRODUCT_INACTIVE');
    }

    body.fabric_type = product.fabric_type;
    body.colour = product.colour;

    if (!body.requirements.length) {
      body.requirements = db.prepare(`
        SELECT material_id, qty_per_metre
        FROM product_bom
        WHERE product_id = ?
      `).all(product.id).map((item) => ({
        material_id: item.material_id,
        qty_required: Math.round(
          item.qty_per_metre * body.qty_metres * 10000
        ) / 10000,
      }));
    }
  }

  if (!body.fabric_type || !body.colour) {
    throw bad(
      'Choose a product or enter a fabric and colour',
      'PRODUCT_REQUIRED'
    );
  }

  checkYarn(body.fabric_type, body.requirements);

  const buyerId = internalBuyerId();
  const token = crypto.randomBytes(8).toString('hex');

  const createStockJob = db.transaction(() => {
    const claim = db.prepare(`
      UPDATE machines
      SET status = 'running'
      WHERE id = ?
        AND stage = 'spinning'
        AND status = 'idle'
    `).run(machine.id);

    if (claim.changes !== 1) {
      throw conflict(`${machine.name} is no longer available`);
    }

    const order = db.prepare(`
      INSERT INTO orders
        (buyer_id, fabric_type, colour, qty_metres, price_per_metre,
         deadline, is_internal, product_id, tracking_token)
      VALUES (?, ?, ?, ?, 0, date('now'), 1, ?, ?)
    `).run(
      buyerId,
      body.fabric_type,
      body.colour,
      body.qty_metres,
      product ? product.id : null,
      token
    );

    for (const requirement of body.requirements) {
      db.prepare(`
        INSERT INTO order_requirements
          (order_id, material_id, qty_required, blend_ratio)
        VALUES (?, ?, ?, ?)
      `).run(
        order.lastInsertRowid,
        requirement.material_id,
        requirement.qty_required,
        requirement.blend_ratio ?? null
      );
    }

    const job = db.prepare(`
      INSERT INTO job_cards
        (order_id, machine_id, stage, shift, source_job_id)
      VALUES (?, ?, 'spinning', ?, NULL)
    `).run(order.lastInsertRowid, machine.id, body.shift);

    return {
      order_id: order.lastInsertRowid,
      job_id: job.lastInsertRowid,
    };
  });

  const result = createStockJob();

  publish('machines');
  publish('orders');

  res.status(201).json({ data: result });
});

// -----------------------------------------------------------------------------
// Production output
// -----------------------------------------------------------------------------

r.post('/jobs/:id/output', validate(z.object({
  metres: z.coerce.number().positive('Metres must be more than 0'),
  waste_metres: z.coerce.number().min(0).default(0),
})), (req, res) => {
  const jobId = Number(req.params.id);
  const { metres, waste_metres } = req.body;

  const recordOutput = db.transaction(() => {
    const job = db.prepare(
      'SELECT * FROM job_cards WHERE id = ?'
    ).get(jobId);

    if (!job) throw notFound('Job');

    if (job.status !== 'in_progress') {
      throw bad(
        'Output can only be recorded for an active job',
        'JOB_NOT_ACTIVE'
      );
    }

    const machine = db.prepare(
      'SELECT status FROM machines WHERE id = ?'
    ).get(job.machine_id);

    if (!machine || machine.status !== 'running') {
      throw bad(
        'The job machine is not running',
        'MACHINE_NOT_RUNNING'
      );
    }

    db.prepare(`
      INSERT INTO production_logs (job_card_id, metres, waste_metres)
      VALUES (?, ?, ?)
    `).run(job.id, metres, waste_metres);

    return { ok: true, job_id: job.id };
  });

  const result = recordOutput();

  publish('machines');
  publish('orders');

  res.status(201).json({ data: result });
});

// -----------------------------------------------------------------------------
// Finish a job and release its machine
// -----------------------------------------------------------------------------

r.post('/jobs/:id/finish', (req, res) => {
  const jobId = Number(req.params.id);

  const finishJob = db.transaction(() => {
    const job = db.prepare(
      'SELECT * FROM job_cards WHERE id = ?'
    ).get(jobId);

    if (!job) throw notFound('Job');

    if (job.status !== 'in_progress') {
      throw conflict('This job has already been completed or is not active');
    }

    const output = db.prepare(`
      SELECT COALESCE(SUM(metres), 0) AS metres
      FROM production_logs
      WHERE job_card_id = ?
    `).get(job.id);

    if (output.metres <= 0) {
      throw bad(
        'Record production output before finishing this job',
        'OUTPUT_REQUIRED'
      );
    }

    const finished = db.prepare(`
      UPDATE job_cards
      SET status = 'done'
      WHERE id = ?
        AND status = 'in_progress'
    `).run(job.id);

    if (finished.changes !== 1) {
      throw conflict('The job could not be completed; refresh and try again');
    }

    const released = db.prepare(`
      UPDATE machines
      SET status = 'idle'
      WHERE id = ?
        AND status = 'running'
    `).run(job.machine_id);

    if (released.changes !== 1) {
      throw conflict('Machine status changed unexpectedly; job completion cancelled');
    }

    return {
      ok: true,
      job_id: job.id,
      output_metres: output.metres,
    };
  });

  const result = finishJob();

  publish('machines');
  publish('orders');
  advanceRuns(); // if this job belongs to a production run, its next stage starts now

  res.json({ data: result });
});

// -----------------------------------------------------------------------------
// Product-wise production tracker
// -----------------------------------------------------------------------------

r.get('/production/tracker', (_req, res) => {
  const lineRows = db.prepare(`
    SELECT
      ol.id AS line_id,
      ol.order_id,
      ol.product_id,
      ol.name AS product_name,
      ol.fabric_type,
      ol.colour,
      ol.qty_metres AS required_metres,
      o.created_at AS order_date,
      o.deadline,
      o.is_internal,
      b.name AS buyer_name,
      o.tracking_token
    FROM order_lines ol
    JOIN orders o ON o.id = ol.order_id
    JOIN buyers b ON b.id = o.buyer_id
    ORDER BY ol.order_id DESC, ol.id ASC
  `).all();

  const legacyRows = db.prepare(`
    SELECT
      0 AS line_id,
      o.id AS order_id,
      o.product_id,
      COALESCE(p.name, o.fabric_type || ' ' || o.colour) AS product_name,
      o.fabric_type,
      o.colour,
      o.qty_metres AS required_metres,
      o.created_at AS order_date,
      o.deadline,
      o.is_internal,
      b.name AS buyer_name,
      o.tracking_token
    FROM orders o
    JOIN buyers b ON b.id = o.buyer_id
    LEFT JOIN products p ON p.id = o.product_id
    WHERE NOT EXISTS (
      SELECT 1 FROM order_lines WHERE order_id = o.id
    )
    ORDER BY o.id DESC
  `).all();

  const items = [...lineRows, ...legacyRows].map((item) => {
    const jobs = item.line_id > 0
      ? db.prepare(`
          SELECT j.*, m.name AS machine_name
          FROM job_cards j
          JOIN machines m ON m.id = j.machine_id
          WHERE j.order_id = ?
            AND j.order_line_id = ?
          ORDER BY j.id
        `).all(item.order_id, item.line_id)
      : db.prepare(`
          SELECT j.*, m.name AS machine_name
          FROM job_cards j
          JOIN machines m ON m.id = j.machine_id
          WHERE j.order_id = ?
          ORDER BY j.id
        `).all(item.order_id);

    const stages = STAGES.map((stage) => {
      const stageJobs = jobs.filter((job) => job.stage === stage);
      const doneJob = stageJobs.find((job) => job.status === 'done');
      const activeJob = stageJobs.find((job) => job.status === 'in_progress');
      const selectedJob = activeJob || doneJob || stageJobs[0];

      const produced = selectedJob
        ? producedOf(selectedJob.id)
        : 0;

      return {
        stage,
        status: doneJob
          ? 'completed'
          : activeJob
            ? 'in_progress'
            : 'pending',
        job_id: selectedJob?.id || null,
        machine_name: selectedJob?.machine_name || null,
        produced_metres: produced,
      };
    });

    const rolls = item.line_id > 0
      ? db.prepare(`
          SELECT *
          FROM rolls
          WHERE order_id = ? AND order_line_id = ?
        `).all(item.order_id, item.line_id)
      : db.prepare(`
          SELECT *
          FROM rolls
          WHERE order_id = ?
        `).all(item.order_id);

    const passedMetres = rolls
      .filter((roll) => roll.qc_status === 'pass')
      .reduce((sum, roll) => sum + roll.metres, 0);

    // Count dispatches against the order line that received the rolls.
    // Fall back to the original line for older records.
    const dispatchedMetres = item.line_id > 0
      ? db.prepare(`
          SELECT COALESCE(SUM(metres), 0) AS metres
          FROM rolls
          WHERE dispatch_id IS NOT NULL
            AND (
              fulfilled_order_line_id = ?
              OR (
                fulfilled_order_line_id IS NULL
                AND order_line_id = ?
              )
            )
        `).get(item.line_id, item.line_id).metres
      : db.prepare(`
          SELECT COALESCE(SUM(metres), 0) AS metres
          FROM rolls
          WHERE order_id = ?
            AND dispatch_id IS NOT NULL
        `).get(item.order_id).metres;

    const required = Number(item.required_metres) || 0;
    const remaining = Math.max(0, required - dispatchedMetres);

    let tracker_status = 'Pending Production';

    if (remaining <= 0 && required > 0) {
      tracker_status = 'Dispatched';
    } else if (passedMetres >= remaining && remaining > 0) {
      tracker_status = 'Finished Goods Ready';
    } else if (rolls.some((roll) => roll.qc_status === 'pending')) {
      tracker_status = 'In QC Inspection';
    } else {
      const activeStage = stages.slice().reverse().find(
        (stage) => stage.status === 'completed' || stage.status === 'in_progress'
      );

      if (activeStage) {
        tracker_status = activeStage.status === 'completed'
          ? `${activeStage.stage.toUpperCase()} Completed`
          : `In ${activeStage.stage.toUpperCase()}`;
      }
    }

    return {
      ...item,
      stages,
      rolls_count: rolls.length,
      passed_metres: passedMetres,
      dispatched_metres: dispatchedMetres,
      remaining_metres: remaining,
      tracker_status,
    };
  });

  res.json({ data: items });
});

export default r;
