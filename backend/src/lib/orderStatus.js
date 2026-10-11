// Orders never store a status. It is derived here from the whole pipeline so every screen (order
// list, dashboard, buyer tracking, buyer history) agrees on one truth. A cart order is credited with
// the *finished stock reserved for its lines*, so an order met from stock - even stock rolled for a
// different order - is never wrongly shown as "not started". (Owner: M3, used by everyone.)
import { db } from './db.js';
import { dispatchedForLine, allocatedForLine } from './fulfilment.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const EPS = 1e-6;

// Progress + status for one order. `target_metres` and `produced_metres` keep their original meaning
// so existing screens (order list, public tracking, assignable filter) keep working.
export function orderProgress(orderId) {
  const o = db.prepare('SELECT id, qty_metres FROM orders WHERE id=?').get(orderId);
  if (!o) return null;

  const lines = db.prepare('SELECT id, qty_metres FROM order_lines WHERE order_id=? ORDER BY id').all(orderId);
  const target = r2(lines.length
    ? lines.reduce((s, l) => s + (Number(l.qty_metres) || 0), 0)
    : (Number(o.qty_metres) || 0));

  let dispatched = 0; let reserved = 0; let qcApproved = 0; let qcPending = 0;
  if (lines.length) {
    const ids = lines.map((l) => l.id);
    const ph = ids.map(() => '?').join(',');
    for (const l of lines) { dispatched += dispatchedForLine(l.id); reserved += allocatedForLine(l.id); }
    // QC-passed metres credited to this order's lines (its own rolls or stock fulfilled onto a line).
    qcApproved = db.prepare(`SELECT COALESCE(SUM(metres),0) m FROM rolls
      WHERE qc_status='pass' AND (fulfilled_order_line_id IN (${ph}) OR order_line_id IN (${ph}))`).get(...ids, ...ids).m;
    qcPending = db.prepare(`SELECT COALESCE(SUM(metres),0) m FROM rolls
      WHERE qc_status IN ('pending','rework') AND dispatch_id IS NULL AND order_line_id IN (${ph})`).get(...ids).m;
  } else {
    dispatched = db.prepare('SELECT COALESCE(SUM(metres),0) m FROM rolls WHERE order_id=? AND dispatch_id IS NOT NULL').get(orderId).m;
    reserved = db.prepare("SELECT COALESCE(SUM(metres),0) m FROM rolls WHERE order_id=? AND qc_status='pass' AND dispatch_id IS NULL").get(orderId).m;
    qcApproved = db.prepare("SELECT COALESCE(SUM(metres),0) m FROM rolls WHERE order_id=? AND qc_status='pass'").get(orderId).m;
    qcPending = db.prepare("SELECT COALESCE(SUM(metres),0) m FROM rolls WHERE order_id=? AND qc_status IN ('pending','rework') AND dispatch_id IS NULL").get(orderId).m;
  }
  // Metres actually produced for this order (its own non-rejected rolls).
  const producedOwn = db.prepare("SELECT COALESCE(SUM(metres),0) m FROM rolls WHERE order_id=? AND qc_status!='reject'").get(orderId).m;

  const activeJobs = db.prepare("SELECT COUNT(*) c FROM job_cards WHERE order_id=? AND status='in_progress'").get(orderId).c;
  const anyJobs = db.prepare('SELECT COUNT(*) c FROM job_cards WHERE order_id=?').get(orderId).c;
  const runs = db.prepare('SELECT COUNT(*) c FROM production_runs WHERE order_id=?').get(orderId).c;

  const outstanding = Math.max(0, target - dispatched);
  const committed = Math.min(target, dispatched + reserved);        // shipped + promised
  const producedMetres = Math.max(producedOwn, 0);
  const progressMetres = Math.min(target, Math.max(producedOwn, committed));
  const percent = target > 0 ? Math.min(100, Math.round((progressMetres / target) * 100)) : 0;

  // Priority: fully sent > partly sent > stock reserved > partly reserved > making > waiting for QC > making > not started.
  let status = 'confirmed';
  if (target > 0) {
    if (outstanding <= EPS) status = 'dispatched';
    else if (dispatched > EPS) status = 'partially_dispatched';
    else if (reserved >= outstanding - EPS) status = 'ready_to_ship';
    else if (reserved > EPS) status = 'partially_fulfilled';
    else if (activeJobs > 0) status = 'in_production';
    else if (qcPending > EPS) status = 'in_qc';
    else if (anyJobs > 0 || runs > 0 || producedMetres > EPS || qcApproved > EPS) status = 'in_production';
  }

  return {
    status,
    target_metres: target,
    produced_metres: r2(producedMetres),
    progress_metres: r2(progressMetres),
    dispatched_metres: r2(dispatched),
    reserved_metres: r2(Math.min(reserved, outstanding)),
    qc_approved_metres: r2(qcApproved),
    qc_pending_metres: r2(qcPending),
    outstanding_metres: r2(outstanding),
    fulfilled_metres: r2(committed),
    percent,
  };
}
