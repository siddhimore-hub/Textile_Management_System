// Adds demo people to an existing database: 250 mill workers (with ~2 months of attendance and last
// month's payroll), plus 20 buyers and 12 suppliers. Safe to re-run: it does nothing if the
// workers are already there. Run:  npm run db:seed-people   (from the project root or backend/)
import { db } from './db.js';

const WORKERS = 250;
const FIRST = ['Ravi', 'Meena', 'Arun', 'Suresh', 'Lakshmi', 'Kumar', 'Priya', 'Murugan', 'Kavitha', 'Selvam', 'Anitha', 'Karthik', 'Deepa', 'Mohan', 'Sangeetha', 'Vijay', 'Revathi', 'Prakash', 'Geetha', 'Senthil', 'Radha', 'Ganesh', 'Malathi', 'Bala', 'Saranya', 'Dinesh', 'Uma', 'Rajesh', 'Jothi', 'Manoj', 'Sunita', 'Ramesh', 'Pooja', 'Anil', 'Rekha', 'Sunil', 'Nirmala', 'Ashok', 'Shanti', 'Vinod'];
const LAST = ['Kumar', 'Devi', 'Raj', 'Patel', 'Nair', 'Reddy', 'Iyer', 'Pillai', 'Shah', 'Gupta', 'Singh', 'Yadav', 'Naidu', 'Chauhan', 'Mehta', 'Joshi', 'Verma', 'Das', 'Bose', 'Menon', 'Rao', 'Kulkarni', 'Patil', 'Shinde', 'More', 'Jadhav', 'Pawar', 'Gawande', 'Thakur', 'Mishra'];
const COMPANY_A = ['Shree', 'Sri', 'Royal', 'Metro', 'Global', 'Classic', 'Orient', 'Sunrise', 'Prime', 'National'];
const COMPANY_B = ['Garments', 'Apparel', 'Fashions', 'Exports', 'Textiles', 'Clothing', 'Retail', 'Uniforms'];
const SUPPLIER_B = ['Yarn Co', 'Spinners', 'Dyes & Chemicals', 'Fibres', 'Cotton Traders', 'Polymers', 'Industrial Supplies'];

// Small deterministic random generator, so every run gives the same people.
let seed = 20261011;
const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const iso = (d) => d.toISOString().slice(0, 10);

const have = db.prepare('SELECT COUNT(*) n FROM workers').get().n;
if (have >= 200) { console.log(`Skipped: ${have} workers already exist.`); process.exit(0); }

const used = new Set(db.prepare('SELECT name FROM workers').all().map((w) => w.name));
const names = [];
while (names.length < WORKERS) { const n = `${pick(FIRST)} ${pick(LAST)}`; if (!used.has(n)) { used.add(n); names.push(n); } }

// Daily wage by rough skill band (Rs per day).
const wage = () => { const r = rnd(); return r < .5 ? 500 + Math.round(rnd() * 12) * 25 : r < .85 ? 700 + Math.round(rnd() * 12) * 25 : 1000 + Math.round(rnd() * 10) * 50; };

const now = new Date();
const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)); // first day of last month
const prevMonth = iso(start).slice(0, 7);
const days = [];
for (let d = new Date(start); d < new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())); d.setUTCDate(d.getUTCDate() + 1))
  if (d.getUTCDay() !== 0) days.push(iso(d)); // mill is closed on Sundays

const addWorker = db.prepare('INSERT INTO workers (name,daily_wage) VALUES (?,?)');
const addAtt = db.prepare('INSERT OR IGNORE INTO attendance (worker_id,work_date,status) VALUES (?,?,?)');
const addBuyer = db.prepare('INSERT INTO buyers (name,phone,email) VALUES (?,?,?)');
const addSupplier = db.prepare('INSERT INTO suppliers (name,phone) VALUES (?,?)');
const phone = () => '9' + String(Math.floor(rnd() * 1e9)).padStart(9, '0');

db.transaction(() => {
  for (const name of names) {
    const id = addWorker.run(name, wage()).lastInsertRowid;
    const reliability = .82 + rnd() * .17; // some workers miss more days than others
    for (const day of days) {
      const r = rnd();
      addAtt.run(id, day, r < reliability * .94 ? 'present' : r < reliability ? 'half' : 'absent');
    }
  }
  // Last month's payroll, calculated the same way as the app's "Run payroll" button.
  db.prepare(`INSERT OR IGNORE INTO wage_payouts (worker_id,month,amount)
    SELECT w.id, ?, COALESCE(SUM(CASE a.status WHEN 'present' THEN 1 WHEN 'half' THEN 0.5 ELSE 0 END),0) * w.daily_wage
    FROM workers w LEFT JOIN attendance a ON a.worker_id=w.id AND substr(a.work_date,1,7)=? GROUP BY w.id`).run(prevMonth, prevMonth);

  const buyerNames = new Set(); while (buyerNames.size < 20) buyerNames.add(`${pick(COMPANY_A)} ${pick(COMPANY_B)}`);
  [...buyerNames].forEach((n, i) => addBuyer.run(n, phone(), `buy${i + 1}@${n.split(' ')[0].toLowerCase()}${i + 1}.test`));
  const supNames = new Set(); while (supNames.size < 12) supNames.add(`${pick(COMPANY_A)} ${pick(SUPPLIER_B)}`);
  [...supNames].forEach((n) => addSupplier.run(n, phone()));
})();

console.log(`Added ${WORKERS} workers (${days.length} working days of attendance, payroll for ${prevMonth}), 20 buyers and 12 suppliers.`);