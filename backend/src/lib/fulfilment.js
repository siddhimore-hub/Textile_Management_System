// Finished-stock fulfilment: how much QC-passed, undispatched stock a product has, how much of it is
// reserved for open order lines, and each line's derived fulfilment status. Reservations live in
// `stock_allocations` and are recomputed (oldest order line first) whenever stock or orders change,
// so two orders can never promise the same roll twice. (Owner: M1/M3 shared lib.)
import { db } from './db.js';

const r2 = (n) => Math.round(n * 100) / 100;

// QC-passed metres of a product that have not been dispatched yet.
export const passedStock = (productId) =>
  db.prepare("SELECT COALESCE(SUM(metres),0) m FROM rolls WHERE product_id=? AND qc_status='pass' AND dispatch_id IS NULL").get(productId).m;


export const dispatchedForLine = (lineId) =>
  db.prepare(`
    SELECT COALESCE(SUM(metres), 0) AS m
    FROM rolls
    WHERE dispatch_id IS NOT NULL
      AND (
        fulfilled_order_line_id = ?
        OR (
          fulfilled_order_line_id IS NULL
          AND order_line_id = ?
        )
      )
  `).get(lineId, lineId).m;


export const allocatedForLine = (lineId) =>
  db.prepare('SELECT COALESCE(SUM(qty_metres),0) q FROM stock_allocations WHERE order_line_id=?').get(lineId).q;

// Rewrite the reservations for one product: clear them, then promise free stock to the oldest open
// lines first. Called inside the caller's transaction after any change to stock or order lines.
export function reallocate(productId) {
  if (!productId) return;
  db.prepare('DELETE FROM stock_allocations WHERE product_id=?').run(productId);
  let free = passedStock(productId);
  const lines = db.prepare(
    `SELECT l.id, l.qty_metres FROM order_lines l JOIN orders o ON o.id=l.order_id
     WHERE l.product_id=? AND o.is_internal=0 ORDER BY l.id`).all(productId);
  for (const l of lines) {
    if (free <= 0) break;
    const outstanding = Math.max(0, l.qty_metres - dispatchedForLine(l.id));
    const give = Math.min(outstanding, free);
    if (give > 0) {
      db.prepare('INSERT INTO stock_allocations (order_line_id,product_id,qty_metres) VALUES (?,?,?)').run(l.id, productId, give);
      free -= give;
    }
  }
}

// Recompute reservations for every product (cheap: only products that have orders or stock).
export function reallocateAll() {
  const products = db.prepare('SELECT DISTINCT product_id FROM order_lines WHERE product_id IS NOT NULL').all()
    .concat(db.prepare('SELECT DISTINCT product_id FROM rolls WHERE product_id IS NOT NULL').all());
  for (const p of new Set(products.map((x) => x.product_id))) reallocate(p);
}

// One line with its live fulfilment numbers. dashboard an order in full with this.

export function lineFulfilment(line) {
  const dispatched = dispatchedForLine(line.id);
  const allocated = allocatedForLine(line.id);

  const ordered = Number(line.qty_metres) || 0;
  const outstanding = Math.max(0, ordered - dispatched);

  const produced = db.prepare(`
    SELECT COALESCE(SUM(p.metres), 0) AS m
    FROM production_logs p
    JOIN job_cards j ON j.id = p.job_card_id
    WHERE j.order_line_id = ?
      AND j.stage = 'finishing'
  `).get(line.id).m;

  const qcApproved = db.prepare(`
    SELECT COALESCE(SUM(metres), 0) AS m
    FROM rolls
    WHERE order_line_id = ?
      AND qc_status = 'pass'
  `).get(line.id).m;

  const qcPending = db.prepare(`
    SELECT COALESCE(SUM(metres), 0) AS m
    FROM rolls
    WHERE order_line_id = ?
      AND qc_status = 'pending'
      AND dispatch_id IS NULL
  `).get(line.id).m;

  const reserved = Math.min(
    outstanding,
    Math.max(0, allocated)
  );

  let status;

  if (outstanding <= 0) {
    status = 'fulfilled';
  } else if (reserved >= outstanding) {
    status = 'available';
  } else if (reserved > 0) {
    status = 'partial';
  } else if (qcPending > 0 && produced > qcApproved) {
    status = 'qc_pending';
  } else {
    status = 'stock_unavailable';
  }

  return {
    ...line,
    ordered_metres: r2(ordered),
    produced_metres: r2(produced),
    qc_approved_metres: r2(qcApproved),
    reserved_metres: r2(reserved),
    allocated_metres: r2(reserved),
    dispatched_metres: r2(dispatched),
    pending_metres: r2(outstanding),
    outstanding_metres: r2(outstanding),
    qc_pending_metres: r2(qcPending),
    fulfilment: status,
  };
}

export const linesOf = (orderId) =>
  db.prepare('SELECT * FROM order_lines WHERE order_id=? ORDER BY id').all(orderId).map(lineFulfilment);

// Roll a set of per-line statuses up to one word for a multi-product order.
export function orderFulfilment(lines) {
  if (!lines.length) return null;
  const done = lines.filter((l) => l.fulfilment === 'fulfilled').length;
  if (done === lines.length) return 'fulfilled';
  if (lines.some((l) => l.fulfilment === 'available' || l.fulfilment === 'partial')) return 'partially_available';
  return 'stock_unavailable';
}
