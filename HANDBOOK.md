# Team Handbook (read before writing any code)

Four members (M1 to M4) build one product. This file is the law. When in doubt, follow it; if it is wrong, fix it by pull request.

## 1. Who owns what
| Member | Scenes | Backend modules | Frontend pages | Tables |
|---|---|---|---|---|
| M1 Inventory + Orders | Yarn arrives, new order | `inventory.js`, `orders.js` | Orders, Raw material stock | suppliers, buyers, materials, stock_movements, orders, order_requirements |
| M2 Production + QC | Production floor, fabric checks | `production.js`, `qc.js` | Machines, Rolls and quality | machines, job_cards, production_logs, rolls, qc_inspections |
| M3 Buyer + Dispatch | Buyer asks, dispatch | `dispatch.js`, `lib/orderStatus.js` | Finished stock, Dispatches, Invoices, `Track.jsx` | dispatches, invoices, payments |
| M4 People + Money + Platform | Month-end, wages | `workforce.js`, `finance.js` | Dashboard, Attendance, Wages, Order costs, Layout, styles, shared components | users, workers, attendance, wage_payouts, cost_entries, audit_logs |

You edit **only your own files**. To change anything shared (`db/schema.sql`, `lib/*`, `docs/api-contract.md`, `styles.css`, `components/*`) open a PR and tag the owner (shared backend lib: M3 for orderStatus, M4 for the rest of `lib`; schema: the table's owner approves; UI kit: M4).

How the modules link:
```
M1 stock/orders -> (yarn issue, order id) -> M2 jobs/rolls/QC -> (passed rolls) -> M3 dispatch/invoice/tracking
        \________ material cost ________/        \__ machine+labour hours __/        \__ invoices, payments __/
                                      all feed -> M4 costs, wages, dashboard
```

## 2. Naming restrictions (strict)
| Thing | Rule | Example |
|---|---|---|
| Git branch | `m<N>/<type>-<short-name>`, lowercase, hyphens. Types: feat, fix, docs, chore | `m2/feat-qc-inspect-form` |
| Commit | Conventional: `type(scope): message` in present tense, under 72 chars | `feat(qc): require defect for reject` |
| DB tables | snake_case, **plural** | `job_cards` |
| DB columns | snake_case, singular; foreign keys `<table_singular>_id`; timestamps `created_at` | `machine_id` |
| API paths | lowercase, plural nouns, kebab-case for multiword, under `/api` | `/api/finished-stock` |
| JSON fields | snake_case (same as DB). Never camelCase | `qty_metres` |
| Backend files | lowercase module names; one router per file; `export default router` | `production.js` |
| React components + files | PascalCase `.jsx` | `MachineBoard.jsx` |
| Hooks and helpers | camelCase; hooks start with `use` | `useLive` |
| CSS classes | lowercase kebab-case; colours only via CSS variables in `styles.css` | `.nav-link` |
| Constants/enums | statuses are lowercase snake_case strings, defined once in the schema CHECK | `ready_to_ship` |
| Units | metres for fabric, kg for yarn, dates `YYYY-MM-DD`, months `YYYY-MM`, money in rupees (number, 2 decimals) | |
| UI text | sentence case, plain words, action buttons say what happens ("Add to stock", not "Submit") | |

## 3. Rules the code must follow
1. **No static data.** Pages read from the API; the API reads from the database. No JSON files, no hard-coded arrays (except the menu config).
2. **Stock is a ledger.** Never `UPDATE` a quantity. Insert a `stock_movements` row (receipt +, issue -).
3. **Order status is derived** (`lib/orderStatus.js`). Never add a status column to `orders`.
4. **Every endpoint validates input with zod** (see existing modules). Server validation is the law; the UI shows the errors it returns under the field (see `EntryForm.jsx`).
5. **Business rules live in the backend**, as thrown `bad()/conflict()` errors with a clear message. Rules already in place: cannot issue more yarn than stock; cannot use a broken or busy machine; reject/rework needs a defect type; only QC-passed rolls can ship, once; roll must belong to the order; invoice total is computed from the rolls; no overpayment; one attendance mark per worker per day.
6. **Response shape:** success `{ "data": ... }`, failure `{ "error": { "code", "message", "fields?" } }`. Never invent another shape.
7. **Live updates:** after any write that other screens show, call `publish('<topic>')` (topics: stock, orders, machines, rolls, dispatch). Pages list the topics they care about in `modules.js` (`live: [...]`).
8. **Transactions** (`db.transaction`) whenever one action writes several rows.
9. **Frontend calls the API only through `lib/api.js`.** No raw `fetch` in pages.
10. **Offline-friendly:** no CDN links, no web fonts, no cloud services. Everything must run on a laptop with no internet.
11. **Comments explain why, not what.** Keep files small; if a file passes about 250 lines, split it.

## 4. UI rules
- One palette, defined as CSS variables at the top of `styles.css`. No hex colours inside components.
- Layout is always: sidebar (left) + navbar (top) + content. Do not build a page outside `Layout` except public pages (`Track`).
- Menu: add or rename pages only in `frontend/src/lib/modules.js` so the sidebar stays consistent. Keep group names and order.
- Every list has a loading state, an empty state with a hint, and an error state with a fix.
- Forms: label above field, error under the field, one primary button. Use `EntryForm` or copy its pattern.
- Must work at 360px wide (phone) and 1280px (desktop). Test both before opening a PR.
- Status colours: green = good/done, amber = waiting/attention, red = failed/blocked, grey = idle.

## 5. Git rules (everyone commits, nobody is "the repo person")
1. `main` = always runs. `develop` = integration. Work on branches from `develop`.
2. Commit at least once per working session; small commits.
3. Open a PR into `develop`. **Another member reviews** (M1 reviews M2, M2 reviews M3, M3 reviews M4, M4 reviews M1). No self-merge.
4. PR description: what changed, how to test, screenshots for UI.
5. Before the PR: `npm run db:reset`, start backend, `npm run smoke` passes, frontend builds (`npm --prefix frontend run build`).
6. Merge `develop` into `main` only at agreed checkpoints, together.
7. Never commit `node_modules`, `.env`, `*.db`.
8. Resolve merge conflicts in the file you own; if it is a shared file, ask the owner.

## 5b. Using OpenCode (or any AI agent)
- Put the member prompt from `docs/prompts/` plus `AGENTS.md` into the session first.
- Ask for one small task at a time. Read every line it writes. If you cannot explain it, simplify it.
- AI output must obey this handbook (names, validation, response shape). Reject output that does not.
- Never paste secrets. Never let the agent edit another member's files.
- Each member uses their own branch and their own agent session.

## 6. Definition of done (per feature)
- [ ] Works against the real database, no hard-coded data
- [ ] Input validated on the server, errors shown in the UI
- [ ] Loading, empty and error states exist
- [ ] Looks right at phone and desktop width
- [ ] Menu entry exists in `modules.js` with the right owner
- [ ] `npm run smoke` still passes; new endpoints added to `docs/api-contract.md`
- [ ] PR reviewed by another member

## 7. Build order
1. Day 1 (all): run the project, read this file, agree on any schema changes.
2. Core: each member turns their stub pages into real forms (see `HANDOVER.md` for what exists).
3. Integration: run the demo script below end to end; fix the seams between modules together.
4. Polish: validation sweep, responsive check, empty and error states, README screenshots.

**Demo script:** receive yarn (M1) -> create order, check yarn (M1) -> assign loom, log output (M2) -> create roll, inspect pass and reject (M2) -> open buyer tracking link (M3) -> dispatch, invoice (M3) -> wages and costs, owner dashboard (M4).
