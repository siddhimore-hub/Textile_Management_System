# HANDOVER (state of the build). Update this file before you stop working.

## Done and verified
- Skeleton, handbook, naming rules, API contract, member prompts, git-ready repo.
- SQLite schema + seed (`db/`), auto-created on first backend start.
- Backend (Express + zod) verified with `scripts/smoke.sh` plus manual checks: inventory (incl. suppliers, over-requirement issue guard), orders, production, qc, dispatch, workforce, finance (payments with overpay guard), SSE live events, derived order status.
- Frontend builds cleanly. Shell: sidebar with owner tags, navbar, responsive drawer menu, Dashboard (live), Process flow.
- Real pages now built (wired in `App.jsx` `custom` map):
  - M1: `Orders.jsx` (new order with yarn lines, buyer link, yarn check, issue yarn) and receive-yarn form on stock page.
  - M2: `Machines.jsx` (live board: assign job, log output, finish, change status), `Rolls.jsx` (create roll, tabs, inspect with required defect, defect report).
  - M3: `Finished.jsx` (pick rolls of one order, vehicle number, dispatch + invoice), `Invoices.jsx` (record payment, print), `Track.jsx` public page with stage stepper.
  - M4: `Attendance.jsx`, `Payroll.jsx` (add worker, run payroll), `Costs.jsx` (add cost, cost per metre).
- Shared helpers: `useLive`, `useAction`, `opts` (lib/api.js), `EntryForm`, `DataTable`, `Msg`.

## Not built yet (next work for the members)
- Login and roles, role-based menu, audit log writes (M4).
- Add material / add buyer forms in UI (endpoints exist), purchase requests table (M1).
- Roll QR label, rework re-inspection history view, require issued yarn before a job (M2).
- Nicer printable invoice/dispatch note layout, notifications table (M3).
- Dashboard chart and orders-at-risk list, finance receivables per buyer (M4).
- Offline queue (PWA) for floor entries, automated tests beyond smoke.
- **No page has been opened in a real browser by the author.** Pages compile and their API calls were tested by curl. Run both servers, click through every page at phone and desktop width, and fix what looks wrong.

## Gotchas
- Order status is derived, not stored (`backend/src/lib/orderStatus.js`). A partly shipped order stays `in_production`.
- Stock `reserved` = required by orders minus yarn already issued; `available` = on hand minus reserved; `low` uses available.
- `npm run db:reset` deletes `backend/data/mill.db`; seed data comes from `db/seed.sql`.
- Payroll: running it early in a month inserts a row per worker (unique per month), so later runs skip them. Run payroll at month end, or delete the rows first (M4 should add a safe re-run).
- Do not `pkill -f "node src/index.js"` from a script that contains that text; use the process id.
- Vite proxies `/api` to port 4000 in dev; there is no production server config yet.
- Vehicle number must look like TN09AB1234 (see dispatch validation).

## How to continue (AI agent)
1. Read `AGENTS.md`, `HANDBOOK.md`, `docs/api-contract.md`.
2. Ask the human which member (M1 to M4) you are; open that prompt in `docs/prompts/`.
3. Do the first unfinished item, verify, update this file.
