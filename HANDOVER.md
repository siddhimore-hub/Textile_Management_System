# HANDOVER (state of the build). Update this file before you stop working.

## Done and verified
- Project skeleton, git-ready, handbook, naming rules, API contract, prompts for M1 to M4.
- SQLite schema + seed (`db/`), auto-created on first backend start.
- Backend (Express + zod), all verified by `scripts/smoke.sh` (full flow: receipt -> order -> feasibility -> issue -> job -> output -> roll -> reject without defect fails -> pass -> dispatch -> second dispatch fails -> status -> dashboard -> finance):
  inventory, orders, production, qc, dispatch, workforce, finance, SSE live events, derived order status.
- Frontend (React + Vite) builds cleanly: sidebar (grouped menu with owner tags), navbar, responsive layout (drawer menu under 860px), Dashboard (live), Process flow, generic live list pages for every module, public buyer Track page, reusable `EntryForm` and `DataTable`. One working form: Receive yarn.

## Not built yet (give these to the members)
- Real forms/pages beyond the generic lists and the receive-yarn form (see each member prompt in `docs/prompts/`).
- Login/roles, audit log writes, purchase requests, notifications table, PDF/print views, QR labels, charts.
- Automated tests beyond the smoke script; offline queue (PWA) for floor entries.
- Frontend not yet visually checked in a browser by the author (it compiles; run it and look).

## Gotchas
- Order status is derived, not stored (`backend/src/lib/orderStatus.js`). A partly shipped order stays `in_production`.
- Stock `reserved` = required by orders minus yarn already issued; `available` = on hand minus reserved; `low` uses available.
- `npm run db:reset` deletes `backend/data/mill.db`; seed data comes from `db/seed.sql`.
- Do not `pkill -f "node src/index.js"` from a script that contains that text; use the process id.
- Vite proxies `/api` to port 4000 in dev; there is no production server config yet.
- Vehicle number must look like TN09AB1234 (see dispatch validation).

## How to continue (AI agent)
1. Read `AGENTS.md`, `HANDBOOK.md`, `docs/api-contract.md`.
2. Ask the human which member (M1 to M4) you are; open that prompt in `docs/prompts/`.
3. Do the first unfinished item, verify, update this file.
