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

## Layout
```
db/                schema.sql + seed.sql (SQLite)         shared, change via PR only
backend/src/lib/   db, http (validation/errors), events (live updates), orderStatus
backend/src/modules/  inventory, orders (M1) | production, qc (M2) | dispatch (M3) | workforce, finance (M4)
frontend/src/lib/  api.js (fetch + live hook), modules.js (menu + list pages)
frontend/src/components/  Layout (sidebar + navbar), DataTable, EntryForm
frontend/src/pages/       Dashboard, Flow, Track (public), ModulePage
docs/              api-contract, work-distribution, prompts for each member
scripts/smoke.sh   end-to-end flow check
```
