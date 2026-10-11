# Everest Textile Mills - Manufacturing System

One system to replace notebooks and phone calls: yarn stock, orders, machines, quality checks, buyer tracking, dispatch, wages and costs.

**Start here:** read `HANDBOOK.md` (rules for all members), then your prompt in `docs/prompts/`. If you are an AI agent, read `AGENTS.md` and `HANDOVER.md` first.

## Run it (needs Node 20+)
```bash
npm run setup          # installs backend + frontend
npm run dev:backend    # API on http://localhost:4000 (creates + seeds the SQLite DB on first run)
npm run dev:frontend   # UI on http://localhost:5173 (new terminal)
npm run smoke          # optional: runs the whole flow against a fresh DB
```
Reset data any time: `npm run db:reset`.

**Log in** with a seeded account, password `everest123` (change it under Users and roles after first login):
`owner@everest.test`, `store@everest.test`, `sup@everest.test`, `qc@everest.test`, `sales@everest.test`, `acc@everest.test`. Each role sees only its own menu.

**Tests:** `npm test` (backend API tests + frontend offline-queue and render tests). `npm run smoke` needs a running backend and a fresh DB.
**Phone/offline:** `npm run build` then serve `frontend/dist` (it registers a service worker that keeps the app and last-seen data available offline).

## Layout
```
db/                schema.sql + seed.sql (SQLite)         shared, change via PR only
backend/src/lib/   db, http (validation/errors), events (live updates), orderStatus, invoicing, compatibility
backend/src/modules/  inventory, orders, compatibility (M1) | production, qc (M2) | dispatch (M3) | workforce, finance, ledger (M4)
frontend/src/lib/  api.js (fetch + live hook), modules.js (menu + list pages)
frontend/src/components/  Layout (sidebar + navbar), DataTable, EntryForm
frontend/src/pages/       Dashboard, Track (public), ModulePage + custom pages (Machines, Orders, PendingPayments, IncomeExpenses, ...)
docs/              api-contract, work-distribution, prompts for each member
scripts/smoke.sh   end-to-end flow check
```


## Making a product (new)
Production > **Make a product**: choose a catalogue product and metres. Yarn needed is calculated from the product recipe and checked against stock; Start production issues it and begins Spinning. Completing each stage starts the next one by itself; after Finishing, named rolls (e.g. `P-0001-PR0001-01`) go to quality check and then appear under Finished Products. Receive yarn first (Orders & Stock > Raw material stock) or the page will say how much is short.
