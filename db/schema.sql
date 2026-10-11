-- Everest Textile Mills - SQLite schema. Owner tags show which member edits which tables.
-- Naming: snake_case, plural table names, <thing>_id foreign keys, created_at on every table.
PRAGMA foreign_keys = ON;

-- ===== SHARED / M4 =====
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner','store','supervisor','qc','sales','accounts')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY, actor TEXT, action TEXT NOT NULL, entity TEXT, entity_id INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ===== M1 : INVENTORY + ORDERS =====
CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS buyers (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT, email TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS materials (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, yarn_type TEXT NOT NULL, colour TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'kg', reorder_level REAL NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
-- Ledger: never UPDATE quantities. qty is signed (+ receipt/return, - issue).
CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY, material_id INTEGER NOT NULL REFERENCES materials(id),
  kind TEXT NOT NULL CHECK (kind IN ('receipt','issue','return','adjust')),
  qty REAL NOT NULL, supplier_id INTEGER REFERENCES suppliers(id),
  order_id INTEGER REFERENCES orders(id), lot_no TEXT, note TEXT,
  purchase_request_id INTEGER REFERENCES purchase_requests(id),
  unit_price REAL, -- optional purchase price per unit on a goods receipt (drives the supplier bill)
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY, buyer_id INTEGER NOT NULL REFERENCES buyers(id),
  fabric_type TEXT NOT NULL, colour TEXT NOT NULL, qty_metres REAL NOT NULL CHECK (qty_metres > 0),
  price_per_metre REAL NOT NULL CHECK (price_per_metre >= 0), deadline TEXT NOT NULL,
  extra_cost REAL NOT NULL DEFAULT 0 CHECK (extra_cost >= 0),
  is_internal INTEGER NOT NULL DEFAULT 0, -- 1 = stock production with no customer order
  product_id INTEGER REFERENCES products(id), -- for single-product / stock-production orders
  tracking_token TEXT UNIQUE NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
  -- NOTE: no status column. Status is DERIVED (see backend/src/lib/orderStatus.js)
);
CREATE TABLE IF NOT EXISTS order_requirements (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id),
  material_id INTEGER NOT NULL REFERENCES materials(id), qty_required REAL NOT NULL CHECK (qty_required > 0),
  blend_ratio REAL -- % of this yarn in a blend, optional
);
-- Which yarn families can make which fabric (editable in the app). yarn_type is a fibre family
-- (cotton, linen, polyester, ...) matched against materials.yarn_type.
CREATE TABLE IF NOT EXISTS fabric_yarn_compatibility (
  id INTEGER PRIMARY KEY, fabric_type TEXT NOT NULL, yarn_type TEXT NOT NULL,
  blend_ratio REAL, note TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (fabric_type, yarn_type)
);

-- Product catalogue (fixed list sales picks from). One row per sellable fabric.
-- Replacements/upgrades are additive, so older databases get these tables on next start.
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  fabric_type TEXT NOT NULL, colour TEXT NOT NULL DEFAULT '',
  unit TEXT NOT NULL DEFAULT 'metres',
  price_per_metre REAL NOT NULL DEFAULT 0 CHECK (price_per_metre >= 0),
  cost_per_metre REAL NOT NULL DEFAULT 0 CHECK (cost_per_metre >= 0),
  active INTEGER NOT NULL DEFAULT 1, notes TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
-- Structured fibre composition of a product (blends). Percentages must total 100.
CREATE TABLE IF NOT EXISTS product_composition (
  id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  fibre_type TEXT NOT NULL, percentage REAL NOT NULL CHECK (percentage > 0),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE (product_id, fibre_type)
);
-- Bill of materials: yarn (material) used per metre of finished fabric.
CREATE TABLE IF NOT EXISTS product_bom (
  id INTEGER PRIMARY KEY, product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  material_id INTEGER NOT NULL REFERENCES materials(id), qty_per_metre REAL NOT NULL CHECK (qty_per_metre > 0),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE (product_id, material_id)
);
-- Cart line items: one row per product in an order. Snapshots keep history readable after price changes.
CREATE TABLE IF NOT EXISTS order_lines (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER REFERENCES products(id),
  name TEXT NOT NULL, fabric_type TEXT NOT NULL, colour TEXT NOT NULL,
  unit TEXT NOT NULL DEFAULT 'metres', qty_metres REAL NOT NULL CHECK (qty_metres > 0),
  unit_price REAL NOT NULL CHECK (unit_price >= 0), amount REAL NOT NULL CHECK (amount >= 0),
  composition TEXT, bom TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
-- Finished-stock reservations: how much QC-passed stock of a product is promised to an order line.
CREATE TABLE IF NOT EXISTS stock_allocations (
  id INTEGER PRIMARY KEY, order_line_id INTEGER NOT NULL REFERENCES order_lines(id),
  product_id INTEGER NOT NULL REFERENCES products(id), qty_metres REAL NOT NULL CHECK (qty_metres > 0),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ===== M2 : PRODUCTION + QC =====
CREATE TABLE IF NOT EXISTS machines (
  id INTEGER PRIMARY KEY, name TEXT UNIQUE NOT NULL,
  stage TEXT NOT NULL CHECK (stage IN ('spinning','weaving','dyeing','finishing')),
  status TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('running','idle','breakdown','maintenance')),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
-- A job card is one production stage for one order. source_job_id is the completed job of the
-- previous stage whose material this job consumes (NULL for spinning). One-to-one, so material
-- cannot be consumed twice; the partial unique index below enforces it.
CREATE TABLE IF NOT EXISTS job_cards (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id),
  machine_id INTEGER NOT NULL REFERENCES machines(id),
  stage TEXT NOT NULL CHECK (stage IN ('spinning','weaving','dyeing','finishing')),
  shift TEXT NOT NULL CHECK (shift IN ('morning','evening','night')),
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress','done')),
  source_job_id INTEGER REFERENCES job_cards(id),
  order_line_id INTEGER REFERENCES order_lines(id), -- which cart line this job produces
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS production_logs (
  id INTEGER PRIMARY KEY, job_card_id INTEGER NOT NULL REFERENCES job_cards(id),
  metres REAL NOT NULL CHECK (metres > 0), waste_metres REAL NOT NULL DEFAULT 0 CHECK (waste_metres >= 0),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS rolls (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL,
  order_id INTEGER NOT NULL REFERENCES orders(id), machine_id INTEGER NOT NULL REFERENCES machines(id),
  job_card_id INTEGER REFERENCES job_cards(id), metres REAL NOT NULL CHECK (metres > 0),
  qc_status TEXT NOT NULL DEFAULT 'pending' CHECK (qc_status IN ('pending','pass','rework','reject')),
  dispatch_id INTEGER REFERENCES dispatches(id),
  product_id INTEGER REFERENCES products(id), order_line_id INTEGER REFERENCES order_lines(id),
  fulfilled_order_line_id INTEGER REFERENCES order_lines(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS qc_inspections (
  id INTEGER PRIMARY KEY, roll_id INTEGER NOT NULL REFERENCES rolls(id),
  result TEXT NOT NULL CHECK (result IN ('pass','rework','reject')),
  defect_type TEXT CHECK (defect_type IN ('hole','colour_mismatch','uneven_weave','other')),
  notes TEXT, inspector TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ===== M3 : DISPATCH + INVOICE =====
CREATE TABLE IF NOT EXISTS dispatches (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id),
  vehicle_no TEXT NOT NULL, total REAL NOT NULL DEFAULT 0, -- amount due for this dispatch
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
-- One invoice per transaction: a sale invoice for each dispatch (buyer) and a purchase bill for each
-- goods receipt (supplier). dispatch_id / receipt_id are UNIQUE so a transaction is never billed twice.
CREATE TABLE IF NOT EXISTS invoices (
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
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
-- Frozen snapshot of what an invoice billed, so the document stays readable after prices/stock move on.
CREATE TABLE IF NOT EXISTS invoice_items (
  id INTEGER PRIMARY KEY, invoice_id INTEGER NOT NULL REFERENCES invoices(id),
  description TEXT NOT NULL, product_id INTEGER REFERENCES products(id),
  fabric_type TEXT, colour TEXT, unit TEXT NOT NULL DEFAULT 'metres',
  qty REAL NOT NULL, unit_price REAL NOT NULL DEFAULT 0, amount REAL NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
-- Payment receipts are recorded against a dispatch (invoice_id fills in once the invoice is generated).
CREATE TABLE IF NOT EXISTS payments (
  id INTEGER PRIMARY KEY, invoice_id INTEGER REFERENCES invoices(id),
  dispatch_id INTEGER REFERENCES dispatches(id),
  amount REAL NOT NULL CHECK (amount > 0), created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ===== M4 : WORKFORCE + FINANCE =====
CREATE TABLE IF NOT EXISTS workers (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, daily_wage REAL NOT NULL CHECK (daily_wage >= 0),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS attendance (
  id INTEGER PRIMARY KEY, worker_id INTEGER NOT NULL REFERENCES workers(id),
  work_date TEXT NOT NULL, status TEXT NOT NULL CHECK (status IN ('present','absent','half')),
  UNIQUE (worker_id, work_date)
);
CREATE TABLE IF NOT EXISTS wage_payouts (
  id INTEGER PRIMARY KEY, worker_id INTEGER NOT NULL REFERENCES workers(id),
  month TEXT NOT NULL, amount REAL NOT NULL CHECK (amount >= 0), created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (worker_id, month)
);
CREATE TABLE IF NOT EXISTS cost_entries (
  id INTEGER PRIMARY KEY, order_id INTEGER REFERENCES orders(id),
  kind TEXT NOT NULL CHECK (kind IN ('material','labour','overhead','supplier_bill')),
  amount REAL NOT NULL CHECK (amount >= 0), note TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
-- General business expenses (rent, power, ...). Kept apart from production/order costs (cost_entries)
-- and from supplier purchase records (stock_movements) so nothing is counted twice.
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY, category TEXT NOT NULL, description TEXT,
  amount REAL NOT NULL CHECK (amount >= 0), expense_date TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- ===== PLATFORM (added: auth, notifications, purchasing, offline replay) =====
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY, kind TEXT NOT NULL, message TEXT NOT NULL, link TEXT,
  roles TEXT NOT NULL DEFAULT 'owner', read_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS purchase_requests (
  id INTEGER PRIMARY KEY, material_id INTEGER NOT NULL REFERENCES materials(id),
  supplier_id INTEGER REFERENCES suppliers(id), qty REAL NOT NULL CHECK (qty > 0), note TEXT,
  status TEXT NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','ordered','received','cancelled')),
  requested_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY, status INTEGER NOT NULL, body TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
-- Extra permissions granted to a user on top of (or instead of) their base role. Several per user allowed.
CREATE TABLE IF NOT EXISTS user_permissions (
  id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
  permission TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP, UNIQUE (user_id, permission)
);
-- ===== PRODUCTION RUNS (product-led, automated stage chain) =====
-- A run = "make N metres of catalogue product X". It issues the yarn the product's BOM needs, then moves
-- through spinning -> weaving -> dyeing -> finishing on its own (job_cards.run_id), and ends as named rolls
-- of that product in QC. order_id is the internal stock order that carries the jobs and rolls.
CREATE TABLE IF NOT EXISTS production_runs (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL,
  product_id INTEGER NOT NULL REFERENCES products(id),
  order_id INTEGER NOT NULL REFERENCES orders(id),
  qty_metres REAL NOT NULL CHECK (qty_metres > 0),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','cancelled')),
  started_by TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, completed_at TEXT
);
-- Yarn issued to a run (a copy of what was booked out of stock, so the run page can show it).
CREATE TABLE IF NOT EXISTS production_run_materials (
  id INTEGER PRIMARY KEY, run_id INTEGER NOT NULL REFERENCES production_runs(id),
  material_id INTEGER NOT NULL REFERENCES materials(id), qty_per_metre REAL NOT NULL, qty_issued REAL NOT NULL
);
