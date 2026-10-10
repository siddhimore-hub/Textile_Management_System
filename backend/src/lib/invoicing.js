// Invoice rule: a dispatch's invoice is generated only once the whole amount due is received.
// Until then the dispatch stays in Pending Payments. The unique invoice per dispatch means the final
// payment can be recorded repeatedly without ever creating a second invoice.
import { db } from './db.js';

export function dispatchDue(dispatchId) {
  const d = db.prepare('SELECT id, total FROM dispatches WHERE id=?').get(dispatchId);
  if (!d) return null;
  const paid = db.prepare('SELECT COALESCE(SUM(amount),0) p FROM payments WHERE dispatch_id=?').get(dispatchId).p;
  const total = Math.round(d.total * 100) / 100;
  return { dispatch_id: d.id, total, paid: Math.round(paid * 100) / 100, outstanding: Math.round((total - paid) * 100) / 100 };
}

// Create the invoice only when nothing is outstanding. Returns {invoice_id, created}. Safe to call twice.
export function ensureInvoiceForDispatch(dispatchId) {
  const existing = db.prepare('SELECT id FROM invoices WHERE dispatch_id=?').get(dispatchId);
  if (existing) return { invoice_id: existing.id, created: false };
  const due = dispatchDue(dispatchId);
  if (!due || due.outstanding > 0) return { invoice_id: null, created: false };
  const info = db.prepare('INSERT INTO invoices (dispatch_id,total) VALUES (?,?)').run(dispatchId, due.total);
  db.prepare('UPDATE payments SET invoice_id=? WHERE dispatch_id=? AND invoice_id IS NULL').run(info.lastInsertRowid, dispatchId);
  return { invoice_id: info.lastInsertRowid, created: true };
}
