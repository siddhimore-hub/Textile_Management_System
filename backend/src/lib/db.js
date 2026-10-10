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
if (!hasCol('orders', 'is_internal')) db.exec('ALTER TABLE orders ADD COLUMN is_internal INTEGER NOT NULL DEFAULT 0');
if (!hasCol('order_requirements', 'blend_ratio')) db.exec('ALTER TABLE order_requirements ADD COLUMN blend_ratio REAL');
if (!hasCol('stock_movements', 'purchase_request_id')) db.exec('ALTER TABLE stock_movements ADD COLUMN purchase_request_id INTEGER');
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
