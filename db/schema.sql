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
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY, buyer_id INTEGER NOT NULL REFERENCES buyers(id),
  fabric_type TEXT NOT NULL, colour TEXT NOT NULL, qty_metres REAL NOT NULL CHECK (qty_metres > 0),
  price_per_metre REAL NOT NULL CHECK (price_per_metre >= 0), deadline TEXT NOT NULL,
  is_internal INTEGER NOT NULL DEFAULT 0, -- 1 = stock production with no customer order
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
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS production_logs (
  id INTEGER PRIMARY KEY, job_card_id INTEGER NOT NULL REFERENCES job_cards(id),
  metres REAL NOT NULL CHECK (metres > 0), created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS rolls (
  id INTEGER PRIMARY KEY, code TEXT UNIQUE NOT NULL,
  order_id INTEGER NOT NULL REFERENCES orders(id), machine_id INTEGER NOT NULL REFERENCES machines(id),
  job_card_id INTEGER REFERENCES job_cards(id), metres REAL NOT NULL CHECK (metres > 0),
  qc_status TEXT NOT NULL DEFAULT 'pending' CHECK (qc_status IN ('pending','pass','rework','reject')),
  dispatch_id INTEGER REFERENCES dispatches(id), created_at TEXT DEFAULT CURRENT_TIMESTAMP
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
-- An invoice is only created once the whole amount due for a dispatch is received (see lib/invoicing.js).
CREATE TABLE IF NOT EXISTS invoices (
  id INTEGER PRIMARY KEY, dispatch_id INTEGER UNIQUE NOT NULL REFERENCES dispatches(id),
  total REAL NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
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
