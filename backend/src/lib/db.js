// Single shared SQLite connection. Every module imports { db } from here.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const file = process.env.DB_FILE || path.resolve(here, '../../data/mill.db');
fs.mkdirSync(path.dirname(file), { recursive: true });

export const db = new Database(file);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

const root = path.resolve(here, '../../../db');
const fresh = !db.prepare("SELECT name FROM sqlite_master WHERE name='orders'").get();
// schema.sql is all CREATE ... IF NOT EXISTS, so running it every start upgrades older databases safely.
db.exec(fs.readFileSync(path.join(root, 'schema.sql'), 'utf8'));
const hasCol = (t, c) => db.prepare(`PRAGMA table_info(${t})`).all().some((x) => x.name === c);
const tableSql = (t) => db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name=?").get(t)?.sql || '';
if (!hasCol('users', 'password_hash')) db.exec('ALTER TABLE users ADD COLUMN password_hash TEXT');
if (!hasCol('users', 'active')) db.exec('ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1');

if (!hasCol('rolls', 'fulfilled_order_line_id')) {
  db.exec(
    'ALTER TABLE rolls ADD COLUMN fulfilled_order_line_id INTEGER REFERENCES order_lines(id)'
  );
}

// Older databases have machines/job_cards CHECKs without 'finishing'. SQLite cannot change a
// CHECK in place, so rebuild the two tables (same columns, new CHECK) and keep every row.
function rebuild(name, createSql, copySql) {
  db.pragma('foreign_keys = OFF');
  try {
    db.transaction(() => {
      db.exec(`DROP TABLE IF EXISTS ${name}_new`);
      db.exec(createSql);
      db.exec(copySql);
      db.exec(`DROP TABLE ${name}`);
      db.exec(`ALTER TABLE ${name}_new RENAME TO ${name}`);
    })();
  } finally { db.pragma('foreign_keys = ON'); }
}
if (!tableSql('machines').includes("'finishing'")) rebuild('machines',
  `CREATE TABLE machines_new (
     id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL,
     stage TEXT NOT NULL CHECK (stage IN ('spinning','weaving','dyeing','finishing')),
     status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('running','idle','breakdown','maintenance')),
     created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `INSERT INTO machines_new (id,name,stage,status,created_at) SELECT id,name,stage,status,created_at FROM machines`);
if (!tableSql('job_cards').includes("'finishing'")) {
  const src = hasCol('job_cards', 'source_job_id') ? 'source_job_id' : 'NULL';
  rebuild('job_cards',
    `CREATE TABLE job_cards_new (
       id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id),
       machine_id INTEGER NOT NULL REFERENCES machines(id),
       stage TEXT NOT NULL CHECK (stage IN ('spinning','weaving','dyeing','finishing')),
       shift TEXT NOT NULL CHECK (shift IN ('morning','evening','night')),
       status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','done')),
       source_job_id INTEGER REFERENCES job_cards(id),
       created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `INSERT INTO job_cards_new (id,order_id,machine_id,stage,shift,status,source_job_id,created_at)
     SELECT id,order_id,machine_id,stage,shift,status,${src},created_at FROM job_cards`);
}
if (!hasCol('job_cards', 'source_job_id')) db.exec('ALTER TABLE job_cards ADD COLUMN source_job_id INTEGER REFERENCES job_cards(id)');
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_job_cards_source ON job_cards(source_job_id) WHERE source_job_id IS NOT NULL');

// ---- Additive upgrades for older databases (records are never deleted) ----
if (!hasCol('production_logs', 'waste_metres'))
  db.exec('ALTER TABLE production_logs ADD COLUMN waste_metres REAL NOT NULL DEFAULT 0 CHECK (waste_metres >= 0)');
if (!hasCol('orders', 'extra_cost')) db.exec('ALTER TABLE orders ADD COLUMN extra_cost REAL NOT NULL DEFAULT 0');

if (!hasCol('orders', 'is_internal')) db.exec('ALTER TABLE orders ADD COLUMN is_internal INTEGER NOT NULL DEFAULT 0');
if (!hasCol('order_requirements', 'blend_ratio')) db.exec('ALTER TABLE order_requirements ADD COLUMN blend_ratio REAL');
if (!hasCol('stock_movements', 'purchase_request_id')) db.exec('ALTER TABLE stock_movements ADD COLUMN purchase_request_id INTEGER');
// Optional purchase price on a goods receipt; drives the supplier bill amount.
if (!hasCol('stock_movements', 'unit_price')) db.exec('ALTER TABLE stock_movements ADD COLUMN unit_price REAL');
// A purchase request can only be received once, so its quantity can never be booked twice.
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_stock_receipt_pr ON stock_movements(purchase_request_id) WHERE purchase_request_id IS NOT NULL');
// Dispatch amount due, so pending payments and invoices are driven by dispatches, not by invoices.
if (!hasCol('dispatches', 'total')) {
  db.exec('ALTER TABLE dispatches ADD COLUMN total REAL NOT NULL DEFAULT 0');
  db.exec('UPDATE dispatches SET total = COALESCE((SELECT total FROM invoices WHERE invoices.dispatch_id=dispatches.id), 0)');
}
// Payments now reference a dispatch; invoice_id becomes optional (filled in when the invoice is generated).
if (hasCol('payments', 'invoice_id') && !hasCol('payments', 'dispatch_id')) {
  rebuild('payments',
    `CREATE TABLE payments_new (
       id INTEGER PRIMARY KEY, invoice_id INTEGER REFERENCES invoices(id),
       dispatch_id INTEGER REFERENCES dispatches(id),
       amount REAL NOT NULL CHECK (amount > 0), created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
    `INSERT INTO payments_new (id,invoice_id,dispatch_id,amount,created_at)
     SELECT p.id, p.invoice_id, (SELECT dispatch_id FROM invoices i WHERE i.id=p.invoice_id), p.amount, p.created_at FROM payments p`);
}
// Older databases billed a buyer only once a dispatch was fully paid, so `invoices` had a single
// NOT NULL dispatch_id. Evolve it into one document per transaction (sale per dispatch, purchase per
// receipt) and keep every existing invoice.
if (!hasCol('invoices', 'kind')) rebuild('invoices',
  `CREATE TABLE invoices_new (
     id INTEGER PRIMARY KEY,
     kind TEXT NOT NULL DEFAULT 'sale' CHECK (kind IN ('sale','purchase')),
     invoice_no TEXT UNIQUE,
     dispatch_id INTEGER UNIQUE REFERENCES dispatches(id),
     receipt_id INTEGER UNIQUE REFERENCES stock_movements(id),
     order_id INTEGER REFERENCES orders(id),
     buyer_id INTEGER REFERENCES buyers(id),
     supplier_id INTEGER REFERENCES suppliers(id),
     material_id INTEGER REFERENCES materials(id),
     subtotal REAL NOT NULL DEFAULT 0,
     tax REAL NOT NULL DEFAULT 0,
     discount REAL NOT NULL DEFAULT 0,
     total REAL NOT NULL,
     status TEXT NOT NULL DEFAULT 'unpaid' CHECK (status IN ('unpaid','partial','paid','na')),
     notes TEXT,
     created_at TEXT DEFAULT CURRENT_TIMESTAMP)`,
  `INSERT INTO invoices_new (id,kind,invoice_no,dispatch_id,order_id,buyer_id,subtotal,total,status,created_at)
   SELECT i.id, 'sale',
     'INV-' || COALESCE(substr(i.created_at,1,4),'0000') || '-' || substr('00000' || i.id, -5),
     i.dispatch_id, d.order_id, o.buyer_id, i.total, i.total,
     CASE WHEN COALESCE((SELECT SUM(amount) FROM payments WHERE dispatch_id=i.dispatch_id),0) >= i.total THEN 'paid'
          WHEN COALESCE((SELECT SUM(amount) FROM payments WHERE dispatch_id=i.dispatch_id),0) > 0 THEN 'partial'
          ELSE 'unpaid' END,
     i.created_at
   FROM invoices i JOIN dispatches d ON d.id=i.dispatch_id LEFT JOIN orders o ON o.id=d.order_id`);

// Backfill line items for any sale invoice that has none (invoices migrated from the old one-per-paid-
// dispatch shape, or created before invoice_items existed). One line per dispatch, priced per metre.
db.exec(`INSERT INTO invoice_items (invoice_id, description, unit, qty, unit_price, amount)
  SELECT i.id,
         TRIM(COALESCE(o.fabric_type,'') || ' ' || COALESCE(o.colour,'')),
         'metres',
         COALESCE((SELECT SUM(r.metres) FROM rolls r WHERE r.dispatch_id=i.dispatch_id), 0),
         CASE WHEN COALESCE((SELECT SUM(r.metres) FROM rolls r WHERE r.dispatch_id=i.dispatch_id),0) > 0
              THEN i.total / (SELECT SUM(r.metres) FROM rolls r WHERE r.dispatch_id=i.dispatch_id) ELSE 0 END,
         i.total
  FROM invoices i LEFT JOIN orders o ON o.id=i.order_id
  WHERE i.kind='sale' AND NOT EXISTS (SELECT 1 FROM invoice_items it WHERE it.invoice_id=i.id)`);

// Default (editable) fabric -> yarn compatibility. INSERT OR IGNORE keeps any user edits/additions.
const COMPAT = [
  ['cotton', 'cotton', null], ['linen', 'linen', null], ['polyester', 'polyester', null],
  ['wool', 'wool', null], ['silk', 'silk', null],
  ['cotton_polyester', 'cotton', 60], ['cotton_polyester', 'polyester', 40],
  ['cotton_linen', 'cotton', 50], ['cotton_linen', 'linen', 50],
];
for (const [f, y, r] of COMPAT)
  db.prepare('INSERT OR IGNORE INTO fabric_yarn_compatibility (fabric_type,yarn_type,blend_ratio) VALUES (?,?,?)').run(f, y, r);

if (fresh) {
  db.exec(fs.readFileSync(path.join(root, 'seed.sql'), 'utf8'));
  console.log('Database created and seeded at', file);
}
// A finishing machine is needed for the last production stage; add one if the mill has none.
if (!db.prepare("SELECT 1 FROM machines WHERE stage='finishing' LIMIT 1").get())
  db.prepare("INSERT INTO machines (name,stage,status) VALUES ('Finish-01','finishing','idle')").run();

// ---- Product catalogue + order lines + reservations (additive; keeps every existing row) ----
if (!hasCol('orders', 'product_id')) db.exec('ALTER TABLE orders ADD COLUMN product_id INTEGER REFERENCES products(id)');
if (!hasCol('job_cards', 'order_line_id')) db.exec('ALTER TABLE job_cards ADD COLUMN order_line_id INTEGER REFERENCES order_lines(id)');
if (!hasCol('rolls', 'product_id')) db.exec('ALTER TABLE rolls ADD COLUMN product_id INTEGER REFERENCES products(id)');
if (!hasCol('rolls', 'order_line_id')) db.exec('ALTER TABLE rolls ADD COLUMN order_line_id INTEGER REFERENCES order_lines(id)');
if (!hasCol('rolls', 'fulfilled_order_line_id'))
  db.exec('ALTER TABLE rolls ADD COLUMN fulfilled_order_line_id INTEGER REFERENCES order_lines(id)');

if (!hasCol('job_cards', 'run_id')) db.exec('ALTER TABLE job_cards ADD COLUMN run_id INTEGER REFERENCES production_runs(id)');

// Backfill: single-product orders that inherited a product keep their rolls attributable to that product.
db.exec(`UPDATE rolls SET product_id = (SELECT o.product_id FROM orders o WHERE o.id = rolls.order_id)
         WHERE product_id IS NULL AND (SELECT o.product_id FROM orders o WHERE o.id = rolls.order_id) IS NOT NULL`);

// Default catalogue so a fresh install (and older databases) has products to order. INSERT OR IGNORE by code.
const DEFAULT_PRODUCTS = [
  { code: 'P-0001', name: 'Cotton Poplin White', fabric_type: 'cotton', colour: 'white', price: 100, cost: 60,
    composition: [['cotton', 100]], bom: [['Cotton 30s White', 0.30]] },
  { code: 'P-0002', name: 'Cotton-Poly Poplin Grey', fabric_type: 'cotton_polyester', colour: 'grey', price: 120, cost: 75,
    composition: [['cotton', 60], ['polyester', 40]], bom: [['Cotton 30s White', 0.18], ['Poly Blend Black', 0.12]] },
  { code: 'P-0003', name: 'Polyester Twill Black', fabric_type: 'polyester', colour: 'black', price: 130, cost: 80,
    composition: [['polyester', 100]], bom: [['Poly Blend Black', 0.32]] },
  { code: 'P-0004', name: 'Cotton Voile Blue', fabric_type: 'voile', colour: 'blue', price: 90, cost: 55,
    composition: [['cotton', 100]], bom: [['Cotton 40s Blue', 0.25]] },
];
for (const p of DEFAULT_PRODUCTS) {
  db.prepare('INSERT OR IGNORE INTO products (code,name,fabric_type,colour,unit,price_per_metre,cost_per_metre) VALUES (?,?,?,?, \'metres\',?,?)')
    .run(p.code, p.name, p.fabric_type, p.colour, p.price, p.cost);
  const prod = db.prepare('SELECT id FROM products WHERE code=?').get(p.code);
  if (!prod) continue;
  for (const [fibre, pct] of p.composition)
    db.prepare('INSERT OR IGNORE INTO product_composition (product_id,fibre_type,percentage) VALUES (?,?,?)').run(prod.id, fibre, pct);
  for (const [matName, qpm] of p.bom) {
    const mat = db.prepare('SELECT id FROM materials WHERE name=?').get(matName);
    if (mat) db.prepare('INSERT OR IGNORE INTO product_bom (product_id,material_id,qty_per_metre) VALUES (?,?,?)').run(prod.id, mat.id, qpm);
  }
}
