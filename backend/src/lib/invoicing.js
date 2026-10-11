// Invoices are one document per transaction: a SALE invoice is raised the moment a dispatch is
// created (buyer pays against it), and a PURCHASE bill is raised for each goods receipt (we owe the
// supplier). The UNIQUE dispatch_id / receipt_id make generation idempotent, so a retry or a second
// call can never bill the same transaction twice. Payment status is derived from the payments ledger.
import { db } from './db.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const year = (ts) => String(ts || new Date().toISOString()).slice(0, 4);
const number = (kind, id) => `${kind === 'purchase' ? 'BILL' : 'INV'}-${year()}-${String(id).padStart(5, '0')}`;

// Money due for a dispatch (kept as the single source used by pending payments and receivables).
export function dispatchDue(dispatchId) {
  const d = db.prepare('SELECT id, total FROM dispatches WHERE id=?').get(dispatchId);
  if (!d) return null;
  const paid = db.prepare('SELECT COALESCE(SUM(amount),0) p FROM payments WHERE dispatch_id=?').get(dispatchId).p;
  const total = r2(d.total);
  return { dispatch_id: d.id, total, paid: r2(paid), outstanding: r2(total - paid) };
}

// Recompute a sale invoice's status from its dispatch payments (never touches purchase bills).
export function refreshInvoice(invoiceId) {
  const inv = db.prepare('SELECT id, kind, dispatch_id, total FROM invoices WHERE id=?').get(invoiceId);
  if (!inv) return null;
  let paid = 0;
  if (inv.kind === 'sale' && inv.dispatch_id)
    paid = db.prepare('SELECT COALESCE(SUM(amount),0) p FROM payments WHERE dispatch_id=?').get(inv.dispatch_id).p;
  const total = r2(inv.total);
  const status = total <= 0 ? 'na' : paid <= 0 ? 'unpaid' : paid + 1e-6 >= total ? 'paid' : 'partial';
  db.prepare('UPDATE invoices SET status=? WHERE id=?').run(status, inv.id);
  return { paid: r2(paid), outstanding: r2(Math.max(0, total - paid)), status };
}

// Create the sale invoice for a dispatch. Safe to call again; returns {invoice_id, created}.
export function ensureInvoiceForDispatch(dispatchId) {
  const existing = db.prepare("SELECT id FROM invoices WHERE kind='sale' AND dispatch_id=?").get(dispatchId);
  if (existing) { refreshInvoice(existing.id); return { invoice_id: existing.id, created: false }; }
  const d = db.prepare(
    `SELECT d.id, d.order_id, d.total, d.vehicle_no, o.buyer_id FROM dispatches d JOIN orders o ON o.id=d.order_id WHERE d.id=?`
  ).get(dispatchId);
  if (!d) return { invoice_id: null, created: false };

  const rolls = db.prepare(
    `SELECT r.metres, r.product_id, r.fulfilled_order_line_id, r.order_line_id,
            ol.name AS line_name, ol.unit_price AS line_price, ol.unit AS line_unit, ol.product_id AS line_product,
            o.fabric_type, o.colour, o.price_per_metre, p.name AS product_name
       FROM rolls r
       JOIN orders o ON o.id=r.order_id
       LEFT JOIN order_lines ol ON ol.id=COALESCE(r.fulfilled_order_line_id, r.order_line_id)
       LEFT JOIN products p ON p.id=COALESCE(r.product_id, ol.product_id)
      WHERE r.dispatch_id=?`).all(dispatchId);

  const groups = new Map();
  for (const x of rolls) {
    const description = x.line_name || x.product_name || `${x.fabric_type} ${x.colour}`.trim();
    const unit_price = x.line_price != null ? x.line_price : (x.price_per_metre || 0);
    const unit = x.line_unit || 'metres';
    const key = `${description}|${unit_price}|${unit}`;
    const g = groups.get(key) || { description, product_id: x.product_id || x.line_product || null, fabric_type: x.fabric_type, colour: x.colour, unit, qty: 0, unit_price };
    g.qty += x.metres;
    groups.set(key, g);
  }
  const items = [...groups.values()].map((g) => ({ ...g, qty: r2(g.qty), amount: r2(g.qty * g.unit_price) }));
  const subtotal = r2(items.reduce((s, it) => s + it.amount, 0));

  const info = db.prepare(
    `INSERT INTO invoices (kind,invoice_no,dispatch_id,order_id,buyer_id,subtotal,total,status,notes)
     VALUES ('sale',?,?,?,?,?,?, 'unpaid', ?)`
  ).run(null, dispatchId, d.order_id, d.buyer_id, subtotal || d.total, d.total, `Dispatch #${dispatchId} - vehicle ${d.vehicle_no}`);
  const invoiceId = info.lastInsertRowid;
  db.prepare('UPDATE invoices SET invoice_no=? WHERE id=?').run(number('sale', invoiceId), invoiceId);
  const item = db.prepare(
    `INSERT INTO invoice_items (invoice_id,description,product_id,fabric_type,colour,unit,qty,unit_price,amount)
     VALUES (?,?,?,?,?,?,?,?,?)`);
  for (const it of items) item.run(invoiceId, it.description, it.product_id, it.fabric_type, it.colour, it.unit, it.qty, it.unit_price, it.amount);
  db.prepare('UPDATE payments SET invoice_id=? WHERE dispatch_id=? AND invoice_id IS NULL').run(invoiceId, dispatchId);
  refreshInvoice(invoiceId);
  return { invoice_id: invoiceId, created: true };
}

// Create the purchase bill for a goods receipt. Safe to call again; returns {invoice_id, created}.
export function ensureInvoiceForReceipt(receiptId) {
  const existing = db.prepare("SELECT id FROM invoices WHERE kind='purchase' AND receipt_id=?").get(receiptId);
  if (existing) return { invoice_id: existing.id, created: false };
  const m = db.prepare(
    `SELECT s.id, s.material_id, s.supplier_id, s.qty, s.lot_no, s.unit_price, mat.name AS material, mat.unit
       FROM stock_movements s JOIN materials mat ON mat.id=s.material_id
      WHERE s.id=? AND s.kind='receipt'`).get(receiptId);
  if (!m) return { invoice_id: null, created: false };

  const unit_price = m.unit_price != null ? m.unit_price : 0;
  const total = r2(m.qty * unit_price);
  const info = db.prepare(
    `INSERT INTO invoices (kind,invoice_no,receipt_id,supplier_id,material_id,subtotal,total,status,notes)
     VALUES ('purchase',?,?,?,?,?,?,?,?)`
  ).run(null, receiptId, m.supplier_id, m.material_id, total, total, total <= 0 ? 'na' : 'unpaid', `Goods receipt #${receiptId}${m.lot_no ? ` - lot ${m.lot_no}` : ''}`);
  const invoiceId = info.lastInsertRowid;
  db.prepare('UPDATE invoices SET invoice_no=? WHERE id=?').run(number('purchase', invoiceId), invoiceId);
  db.prepare(
    `INSERT INTO invoice_items (invoice_id,description,product_id,unit,qty,unit_price,amount)
     VALUES (?,?,NULL,?,?,?,?)`
  ).run(invoiceId, m.material, m.unit || 'kg', r2(m.qty), r2(unit_price), total);
  return { invoice_id: invoiceId, created: true };
}

// Buyer money position for one order: what its dispatches billed, what has been received and the status.
export function orderPayment(orderId) {
  const row = db.prepare(
    `SELECT COUNT(d.id) dispatches, COALESCE(SUM(d.total),0) billed,
       COALESCE(SUM((SELECT COALESCE(SUM(amount),0) FROM payments WHERE dispatch_id=d.id)),0) paid
     FROM dispatches d WHERE d.order_id=?`).get(orderId);
  const billed = r2(row.billed); const paid = r2(row.paid);
  const outstanding = r2(Math.max(0, billed - paid));
  const payment_status = billed <= 0 ? 'not_invoiced' : outstanding <= 0 ? 'paid' : paid > 0 ? 'partial' : 'pending';
  return { billed, paid, outstanding, payment_status };
}
