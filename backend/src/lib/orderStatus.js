// Order status is DERIVED from rolls + jobs. Never store it. (Owner: M3, used by everyone.)
import { db } from './db.js';

export function orderProgress(orderId) {
  const o = db.prepare('SELECT qty_metres FROM orders WHERE id=?').get(orderId);
  if (!o) return null;
  const produced = db.prepare('SELECT COALESCE(SUM(metres),0) m FROM rolls WHERE order_id=? AND qc_status != ?').get(orderId, 'reject').m;
  const count = (where, ...a) => db.prepare(`SELECT COUNT(*) c FROM rolls WHERE order_id=? AND ${where}`).get(orderId, ...a).c;
  const total = count('1=1');
  const pending = count("qc_status IN ('pending','rework')");
  const passedUnsent = count("qc_status='pass' AND dispatch_id IS NULL");
  const sent = count('dispatch_id IS NOT NULL');
  const activeJobs = db.prepare("SELECT COUNT(*) c FROM job_cards WHERE order_id=? AND status='in_progress'").get(orderId).c;

  let status = 'confirmed';
  if (activeJobs > 0 || total > 0) status = 'in_production';
  if (pending > 0 && activeJobs === 0) status = 'in_qc';
  if (passedUnsent > 0 && pending === 0) status = 'ready_to_ship';
  if (sent > 0 && passedUnsent === 0 && pending === 0 && activeJobs === 0)
    status = produced >= o.qty_metres ? 'dispatched' : 'in_production'; // partly shipped, more to make
  return { status, produced_metres: produced, target_metres: o.qty_metres, percent: Math.min(100, Math.round((produced / o.qty_metres) * 100)) };
}
