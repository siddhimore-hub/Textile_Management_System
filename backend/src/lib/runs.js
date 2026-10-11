// Production runs: "make N metres of product X". One run issues the yarn from the product's bill of
// materials, then walks spinning -> weaving -> dyeing -> finishing by itself (each finished stage starts the
// next one on a free machine at once), and ends as named rolls of that product waiting for QC.
// Everything here is plain functions over the shared db so routes and tests can call them.
import { db } from './db.js';
import { bad, notFound, conflict } from './http.js';
import { publish } from './events.js';
import { notify, checkLowStock } from './notify.js';
import crypto from 'node:crypto';

export const STAGES = ['spinning', 'weaving', 'dyeing', 'finishing'];
export const STAGE_LABEL = { spinning: 'Spinning', weaving: 'Loom', dyeing: 'Dyeing', finishing: 'Finishing' };
// A finished batch is cut into rolls of at most this many metres (last roll takes the remainder).
export const ROLL_LENGTH_M = Number(process.env.ROLL_LENGTH_M || 100);
const INTERNAL_BUYER = 'Internal Stock';

const r2 = (n) => Math.round(n * 100) / 100;
const r4 = (n) => Math.round(n * 10000) / 10000;

export const shiftNow = (d = new Date()) => {
  const h = d.getHours();
  return h >= 6 && h < 14 ? 'morning' : h >= 14 && h < 22 ? 'evening' : 'night';
};

const producedOf = (jobId) => db.prepare('SELECT COALESCE(SUM(metres),0) m FROM production_logs WHERE job_card_id=?').get(jobId).m;
const wasteOf = (jobId) => db.prepare('SELECT COALESCE(SUM(waste_metres),0) m FROM production_logs WHERE job_card_id=?').get(jobId).m;
const rolledOf = (jobId) => db.prepare('SELECT COALESCE(SUM(metres),0) m FROM rolls WHERE job_card_id=?').get(jobId).m;

// ---------- yarn position ----------
// Same maths as GET /stock: available = on hand - (required by orders and not yet issued).
export function yarnPosition(materialId) {
  const on_hand = db.prepare('SELECT COALESCE(SUM(qty),0) q FROM stock_movements WHERE material_id=?').get(materialId).q;
  const required = db.prepare('SELECT COALESCE(SUM(qty_required),0) q FROM order_requirements WHERE material_id=?').get(materialId).q;
  const issued = -db.prepare("SELECT COALESCE(SUM(qty),0) q FROM stock_movements WHERE material_id=? AND kind='issue'").get(materialId).q;
  const reserved = Math.max(0, required - issued);
  return { on_hand: r2(on_hand), reserved: r2(reserved), available: r2(on_hand - reserved) };
}

// What a run of `qty` metres of the product needs, and whether stock covers it.
export function planFor(productId, qty) {
  const product = db.prepare('SELECT * FROM products WHERE id=?').get(productId);
  if (!product) throw notFound('Product');
  const bom = db.prepare(
    `SELECT b.material_id, b.qty_per_metre, m.name AS material, m.unit, m.yarn_type, m.colour
     FROM product_bom b JOIN materials m ON m.id=b.material_id WHERE b.product_id=? ORDER BY m.name`).all(productId);
  const yarn = bom.map((b) => {
    const required = r4(b.qty_per_metre * qty);
    const pos = yarnPosition(b.material_id);
    const short = Math.max(0, r2(required - pos.available));
    return { ...b, required: r2(required), required_exact: required, ...pos, short };
  });
  const machines = {};
  for (const s of STAGES) {
    const rows = db.prepare('SELECT status FROM machines WHERE stage=?').all(s);
    machines[s] = { total: rows.length, idle: rows.filter((m) => m.status === 'idle').length };
  }
  const problems = [];
  if (!product.active) problems.push('This product is switched off.');
  if (!bom.length) problems.push('This product has no yarn recipe yet. Add it on the Products page.');
  for (const y of yarn) if (y.short > 0) problems.push(`${y.material}: need ${y.required} ${y.unit}, only ${y.available} ${y.unit} free (short ${y.short}).`);
  for (const s of STAGES) if (!machines[s].total) problems.push(`The mill has no ${STAGE_LABEL[s]} machine. Add one on the Machines page.`);
  return { product: { id: product.id, code: product.code, name: product.name, fabric_type: product.fabric_type, colour: product.colour, active: !!product.active },
    qty_metres: qty, yarn, machines, can_start: problems.length === 0, problems };
}

// ---------- creating a run ----------
function internalBuyerId() {
  const b = db.prepare('SELECT id FROM buyers WHERE name=?').get(INTERNAL_BUYER);
  return b ? b.id : db.prepare('INSERT INTO buyers (name) VALUES (?)').run(INTERNAL_BUYER).lastInsertRowid;
}
const nextRunCode = () => `PR-${String(db.prepare('SELECT COALESCE(MAX(id),0)+1 n FROM production_runs').get().n).padStart(4, '0')}`;

export function createRun({ product_id, qty_metres, started_by = null }) {
  const plan = planFor(product_id, qty_metres);
  if (!plan.product.active) throw bad(`${plan.product.name} is switched off`, 'PRODUCT_INACTIVE');
  if (!plan.yarn.length) throw bad(`${plan.product.name} has no yarn recipe. Add it on the Products page first.`, 'NO_RECIPE');
  const missing = STAGES.find((s) => !plan.machines[s].total);
  if (missing) throw bad(`The mill has no ${STAGE_LABEL[missing]} machine. Add one on the Machines page.`, 'NO_MACHINE');
  const shortYarn = plan.yarn.filter((y) => y.short > 0);
  if (shortYarn.length)
    throw bad(`Not enough yarn: ${shortYarn.map((y) => `${y.material} needs ${y.required} ${y.unit}, only ${y.available} free`).join('; ')}`, 'INSUFFICIENT_YARN');

  const create = db.transaction(() => {
    const code = nextRunCode();
    const order = db.prepare(
      `INSERT INTO orders (buyer_id,fabric_type,colour,qty_metres,price_per_metre,deadline,is_internal,product_id,tracking_token)
       VALUES (?,?,?,?,0,date('now'),1,?,?)`)
      .run(internalBuyerId(), plan.product.fabric_type, plan.product.colour, qty_metres, product_id, crypto.randomBytes(8).toString('hex'));
    const orderId = order.lastInsertRowid;
    const run = db.prepare('INSERT INTO production_runs (code,product_id,order_id,qty_metres,started_by) VALUES (?,?,?,?,?)')
      .run(code, product_id, orderId, qty_metres, started_by);
    for (const y of plan.yarn) {
      // The requirement is booked and the yarn issued in the same step, so stock drops straight away.
      db.prepare('INSERT INTO order_requirements (order_id,material_id,qty_required) VALUES (?,?,?)').run(orderId, y.material_id, y.required_exact);
      db.prepare("INSERT INTO stock_movements (material_id,kind,qty,order_id,note) VALUES (?, 'issue', ?, ?, ?)")
        .run(y.material_id, -y.required_exact, orderId, `Issued to ${code}`);
      db.prepare('INSERT INTO production_run_materials (run_id,material_id,qty_per_metre,qty_issued) VALUES (?,?,?,?)')
        .run(run.lastInsertRowid, y.material_id, y.qty_per_metre, y.required_exact);
    }
    return { id: run.lastInsertRowid, code, order_id: orderId };
  });
  const made = create();
  for (const y of plan.yarn) checkLowStock(y.material_id);
  publish('stock'); publish('orders'); publish('runs');
  advanceRuns();
  return made;
}

// ---------- moving a run forward ----------
const jobsOf = (runId) => db.prepare('SELECT * FROM job_cards WHERE run_id=? ORDER BY id').all(runId);

// Metres the given stage job started with (what the previous stage handed over, or the run quantity).
export function inputMetres(run, job) {
  if (job.source_job_id) return producedOf(job.source_job_id);
  return run.qty_metres;
}

function pickMachine(stage) {
  return db.prepare("SELECT * FROM machines WHERE stage=? AND status='idle' ORDER BY id LIMIT 1").get(stage);
}

function startJob(run, stage, source) {
  const machine = pickMachine(stage);
  if (!machine) return false; // no free machine: the run waits and is picked up when one frees
  db.transaction(() => {
    const claim = db.prepare("UPDATE machines SET status='running' WHERE id=? AND status='idle'").run(machine.id);
    if (claim.changes !== 1) throw conflict(`${machine.name} is no longer available`);
    db.prepare('INSERT INTO job_cards (order_id,machine_id,stage,shift,source_job_id,run_id) VALUES (?,?,?,?,?,?)')
      .run(run.order_id, machine.id, stage, shiftNow(), source ? source.id : null, run.id);
  })();
  return true;
}

// Cut finished material into named rolls: <product code>-<run code without dash>-<nn>, e.g. P-0001-PR0003-02.
function makeRolls(run, job) {
  const left = r2(producedOf(job.id) - rolledOf(job.id));
  if (left <= 0) return 0;
  const product = db.prepare('SELECT code FROM products WHERE id=?').get(run.product_id);
  const have = db.prepare('SELECT COUNT(*) c FROM rolls WHERE job_card_id=?').get(job.id).c;
  let n = have; let remaining = left; let made = 0;
  while (remaining > 0.0001) {
    const metres = r2(Math.min(ROLL_LENGTH_M, remaining));
    n += 1;
    db.prepare('INSERT INTO rolls (code,order_id,machine_id,job_card_id,metres,product_id) VALUES (?,?,?,?,?,?)')
      .run(`${product.code}-${run.code.replace('-', '')}-${String(n).padStart(2, '0')}`, run.order_id, job.machine_id, job.id, metres, run.product_id);
    remaining = r2(remaining - metres); made += 1;
  }
  return made;
}

// One step for one run. Returns true if anything changed.
function stepRun(run) {
  const jobs = jobsOf(run.id);
  const last = jobs[jobs.length - 1];
  if (!last) return startJob(run, 'spinning', null);
  if (last.status !== 'done') return false; // a stage is running: it moves on when it is completed
  if (last.stage !== 'finishing') {
    const next = STAGES[STAGES.indexOf(last.stage) + 1];
    return startJob(run, next, last);
  }
  // Finishing is done: cut rolls, close the run.
  let rolls = 0;
  db.transaction(() => {
    rolls = makeRolls(run, last);
    db.prepare("UPDATE production_runs SET status='completed', completed_at=CURRENT_TIMESTAMP WHERE id=?").run(run.id);
  })();
  const product = db.prepare('SELECT name FROM products WHERE id=?').get(run.product_id);
  notify('run_complete', `${run.code}: ${product.name} ${r2(producedOf(last.id))} m finished as ${rolls} roll${rolls === 1 ? '' : 's'}, waiting for quality check`, '/rolls', 'qc,supervisor');
  publish('rolls');
  return true;
}

// Move every running run as far as machines allow, oldest first so older runs get machines first.
export function advanceRuns() {
  let moved = false;
  for (let guard = 0; guard < 50; guard += 1) {
    let progress = false;
    for (const run of db.prepare("SELECT * FROM production_runs WHERE status='running' ORDER BY id").all())
      if (stepRun(run)) progress = true;
    if (!progress) break;
    moved = true;
  }
  if (moved) { publish('machines'); publish('orders'); publish('runs'); }
  return moved;
}

// Complete the running stage of a run (logs the output, frees the machine) and start the next stage at once.
export function completeStage(runId, { metres, waste_metres = 0 } = {}) {
  const run = db.prepare('SELECT * FROM production_runs WHERE id=?').get(runId);
  if (!run) throw notFound('Run');
  if (run.status !== 'running') throw bad(`${run.code} is ${run.status}`, 'RUN_NOT_ACTIVE');
  const job = jobsOf(run.id).find((j) => j.status === 'in_progress');
  if (!job) throw bad('Nothing is running for this run. It is waiting for a free machine.', 'NOTHING_RUNNING');
  const input = inputMetres(run, job);
  const out = metres === undefined ? input : metres;
  if (!(out > 0)) throw bad('Metres must be more than 0', 'BAD_METRES');
  if (out > input + 0.0001) throw bad(`This stage started with ${r2(input)} m, so it cannot make ${out} m`, 'EXCEEDS_INPUT');
  db.transaction(() => {
    const machine = db.prepare('SELECT status FROM machines WHERE id=?').get(job.machine_id);
    if (!machine || machine.status !== 'running') throw bad('The job machine is not running', 'MACHINE_NOT_RUNNING');
    db.prepare('INSERT INTO production_logs (job_card_id,metres,waste_metres) VALUES (?,?,?)').run(job.id, out, waste_metres);
    db.prepare("UPDATE job_cards SET status='done' WHERE id=? AND status='in_progress'").run(job.id);
    db.prepare("UPDATE machines SET status='idle' WHERE id=? AND status='running'").run(job.machine_id);
  })();
  publish('machines'); publish('orders');
  advanceRuns();
  return { run_id: run.id, stage: job.stage, metres: out };
}

// Cancel a run that has not made anything yet: yarn goes back to stock, machine is released.
export function cancelRun(runId) {
  const run = db.prepare('SELECT * FROM production_runs WHERE id=?').get(runId);
  if (!run) throw notFound('Run');
  if (run.status !== 'running') throw bad(`${run.code} is ${run.status}`, 'RUN_NOT_ACTIVE');
  const jobs = jobsOf(run.id);
  if (jobs.some((j) => j.status === 'done' || producedOf(j.id) > 0))
    throw bad('A stage has already produced output, so this run cannot be cancelled', 'ALREADY_PRODUCING');
  db.transaction(() => {
    for (const j of jobs) {
      db.prepare("UPDATE machines SET status='idle' WHERE id=? AND status='running'").run(j.machine_id);
      db.prepare('DELETE FROM job_cards WHERE id=?').run(j.id);
    }
    for (const m of db.prepare('SELECT * FROM production_run_materials WHERE run_id=?').all(run.id))
      db.prepare("INSERT INTO stock_movements (material_id,kind,qty,order_id,note) VALUES (?, 'return', ?, ?, ?)")
        .run(m.material_id, m.qty_issued, run.order_id, `Returned from cancelled ${run.code}`);
    db.prepare("UPDATE production_runs SET status='cancelled', completed_at=CURRENT_TIMESTAMP WHERE id=?").run(run.id);
  })();
  publish('stock'); publish('machines'); publish('orders'); publish('runs');
  advanceRuns();
  return { ok: true };
}

// ---------- reading ----------
export function describeRun(run) {
  const product = db.prepare('SELECT id,code,name,fabric_type,colour FROM products WHERE id=?').get(run.product_id);
  const jobs = jobsOf(run.id);
  const stages = STAGES.map((stage, i) => {
    const job = jobs.find((j) => j.stage === stage);
    if (!job) {
      const prev = i === 0 ? null : jobs.find((j) => j.stage === STAGES[i - 1]);
      const waiting = run.status === 'running' && (i === 0 ? true : prev?.status === 'done');
      return { stage, label: STAGE_LABEL[stage], status: waiting ? 'waiting' : 'pending', job_id: null, machine: null,
        input_metres: waiting ? (i === 0 ? run.qty_metres : r2(producedOf(prev.id))) : null, produced_metres: 0, waste_metres: 0 };
    }
    const machine = db.prepare('SELECT name FROM machines WHERE id=?').get(job.machine_id);
    return { stage, label: STAGE_LABEL[stage], status: job.status === 'done' ? 'done' : 'running', job_id: job.id, machine: machine?.name ?? null,
      input_metres: r2(inputMetres(run, job)), produced_metres: r2(producedOf(job.id)), waste_metres: r2(wasteOf(job.id)), shift: job.shift };
  });
  const current = stages.find((s) => s.status === 'running' || s.status === 'waiting') || null;
  const rolls = db.prepare('SELECT id,code,metres,qc_status,dispatch_id FROM rolls WHERE order_id=? ORDER BY id').all(run.order_id);
  const yarn = db.prepare(
    `SELECT pm.material_id, m.name AS material, m.unit, pm.qty_per_metre, pm.qty_issued
     FROM production_run_materials pm JOIN materials m ON m.id=pm.material_id WHERE pm.run_id=? ORDER BY m.name`).all(run.id);
  const sum = (f) => r2(rolls.filter(f).reduce((s, x) => s + x.metres, 0));
  return {
    ...run, product, stages, current_stage: current?.stage ?? null, current_status: current?.status ?? run.status, yarn,
    rolls, rolls_count: rolls.length,
    finished_metres: sum(() => true), qc_pending_metres: sum((x) => x.qc_status === 'pending' || x.qc_status === 'rework'),
    qc_passed_metres: sum((x) => x.qc_status === 'pass'), dispatched_metres: sum((x) => x.dispatch_id),
    can_cancel: run.status === 'running' && !jobs.some((j) => j.status === 'done' || producedOf(j.id) > 0),
  };
}

// Stock of every product in one place: being made, in QC, ready (passed, not dispatched), promised, sent.
export function productStock() {
  return db.prepare('SELECT * FROM products ORDER BY name').all().map((p) => {
    const runs = db.prepare("SELECT id, qty_metres FROM production_runs WHERE product_id=? AND status='running'").all(p.id);
    const q = (where) => db.prepare(`SELECT COALESCE(SUM(metres),0) m FROM rolls WHERE product_id=? AND ${where}`).get(p.id).m;
    const in_production = runs.reduce((s, x) => s + x.qty_metres, 0);
    const ready = q("qc_status='pass' AND dispatch_id IS NULL");
    const reserved = db.prepare('SELECT COALESCE(SUM(qty_metres),0) q FROM stock_allocations WHERE product_id=?').get(p.id).q;
    return {
      product_id: p.id, code: p.code, name: p.name, fabric_type: p.fabric_type, colour: p.colour, active: !!p.active,
      in_production: r2(in_production), runs_active: runs.length,
      in_qc: r2(q("qc_status IN ('pending','rework') AND dispatch_id IS NULL")),
      ready: r2(ready), reserved: r2(reserved), free: r2(ready - reserved),
      rejected: r2(q("qc_status='reject'")), dispatched: r2(q('dispatch_id IS NOT NULL')),
    };
  });
}
