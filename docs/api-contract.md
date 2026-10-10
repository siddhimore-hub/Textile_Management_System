# API Contract (base `/api`). Success `{data}`, error `{error:{code,message,fields?}}`.
Owner updates their section in the same PR that changes an endpoint.

## System
- GET `/health` | GET `/events` (SSE; messages `{topic,at}`)

## M1 Inventory and Orders
- GET `/materials`, `/suppliers`, `/buyers`
- POST `/materials` {name, yarn_type, colour, unit?, reorder_level}
- POST `/buyers` {name, phone(10 digits), email?}
- POST `/receipts` {material_id, supplier_id, qty>0, lot_no, order_id?} -> stock +
- POST `/stock/issue` {material_id, order_id, qty>0} -> 400 INSUFFICIENT_STOCK if over stock
- GET `/stock` -> [{..material, on_hand, reserved, available, low}]
- GET `/stock/movements`
- GET `/orders` -> orders + derived `status, produced_metres, target_metres, percent`
- POST `/orders` {buyer_id, fabric_type, colour, qty_metres>0, price_per_metre>=0, deadline(not past), requirements:[{material_id,qty_required}]} -> {id, tracking_token}
- GET `/orders/:id/feasibility` -> {can_start, lines:[{name,qty_required,on_hand,shortfall}]}

## M2 Production and QC
- GET `/machines` (with job_id, order_id, is_internal, today_metres) | POST `/machines` {name (unique), stage, status?} -> 409 CONFLICT if the name exists | PATCH `/machines/:id/status` {status}
- POST `/stock-production` {fabric_type, colour, qty_metres>0, machine_id (free *spinning* machine), shift, requirements:[{material_id,qty_required,blend_ratio?}]} -> {order_id, job_id}. Creates an internal order (buyer "Internal Stock", is_internal=1) + a spinning job. 400 `MACHINE_BUSY`/`WRONG_STAGE`/`INCOMPATIBLE_YARN`.
- GET `/orders/assignable` -> customer orders not dispatched and not yet fully produced (internal stock orders are excluded)
- POST `/jobs` {machine_id, shift, order_id? (spinning only), source_job_id? (weaving/dyeing/finishing)}. Spinning refuses an order whose full quantity is already rolled (400 `ORDER_COMPLETE`). Other 400s if machine broken/busy; weaving/dyeing/finishing require the completed previous-stage batch, once.
- GET `/jobs` (each with produced_metres, available_metres, stage, source_job_id, order_is_internal) | GET `/jobs/available?stage=spinning|weaving|dyeing|finishing` -> material from completed jobs not yet consumed
- POST `/jobs/:id/output` {metres>0} | POST `/jobs/:id/finish`
- GET `/rolls?qc_status=` | POST `/rolls` {job_card_id (must be a *completed finishing* job), metres>0} -> {id, code} (400 `EXCEEDS_AVAILABLE` if metres > finished batch left)
- POST `/rolls/:id/inspect` {result: pass|rework|reject, defect_type? (required unless pass), notes?, inspector?}
- GET `/qc/defects` -> counts by machine and defect

## M3 Dispatch and Buyer tracking
- GET `/finished-stock` | GET `/dispatches` (each with `total` = amount due, `paid`, `invoice_id` when raised)
- POST `/dispatches` {order_id, roll_ids[], vehicle_no like TN09AB1234} -> {dispatch_id, total}. **No invoice here**: the amount due is stored on the dispatch.
- GET `/pending-payments` -> every dispatch with `total, paid, outstanding, status: pending|partial|paid, invoice_id, payments:[{amount,created_at}]` (accounts, sales)
- GET `/invoices` -> only fully paid dispatches (invoice 1 per dispatch)
- GET `/track/:token` (public) -> order, status, percent

## Fabric - yarn compatibility (M1)
- GET `/compatibility/fabrics` -> [{fabric_type, yarns:[{yarn_type, blend_ratio}], is_blend}] (drives the fabric + yarn dropdowns)
- GET `/compatibility/materials?fabric_type=` -> materials that suit the fabric (fabric with no rule = all materials)
- GET `/compatibility` -> rule rows | POST `/compatibility` {fabric_type, yarn_type, blend_ratio?, note?} (store) | DELETE `/compatibility/:id`
- POST `/orders` validates each yarn line: incompatible yarn -> 400 `INCOMPATIBLE_YARN`; a multi-family blend whose ratios don't sum to ~100% -> 400 `BAD_BLEND_RATIO`. `requirements[].blend_ratio` is stored. `/stock/issue` also refuses incompatible yarn.

## M4 People and Money
- GET/POST `/workers` {name, daily_wage}
- GET `/attendance?date=` | POST `/attendance` {worker_id, work_date, status}
- POST `/payroll/run` {month YYYY-MM} | GET `/payroll?month=`
- POST `/costs` {order_id?, kind, amount>0, note?}
- POST `/payments` {dispatch_id or invoice_id, amount>0} -> {id, invoice_id, outstanding}. Partial payment allowed; total can never exceed the dispatch amount due (400 `OVERPAYMENT`). The invoice (unique per dispatch) is raised automatically the moment the last rupee arrives.
- GET `/payments` (with dispatch_id) | GET `/finance/order-costs` | GET `/finance/summary?month=` (billed from `dispatches.total`) | GET `/dashboard`
- GET `/finance/receivables` (per buyer, based on dispatches; internal stock orders excluded)
- GET `/ledger/summary?from=&to=` -> {income (payments received), expenses (cost_entries + expenses), profit} | GET `/ledger/income?from=&to=` | GET `/ledger/expenses?from=&to=&category=`
- POST `/expenses` {category, description?, amount>0, expense_date?(YYYY-MM-DD)} -> general business expense (accounts). Production costs keep using `/costs`.

## Supplier yarn history (M1 / M4)
- GET `/suppliers/material-history?supplier_id=` (store, accounts) -> per supplier: deliveries, total delivered kg, `by_yarn` totals, and `receipts` with FIFO `remaining_kg` per lot (received minus issued, first lot first).

## Login, roles, audit (M4)
Every `/api` call except `GET /health`, `POST /auth/login` and `GET /track/:token` needs `Authorization: Bearer <token>`
(the live stream `GET /events?token=` takes it in the query because browsers cannot add headers to EventSource). Missing/expired -> 401 `UNAUTHENTICATED`; wrong role -> 403 `FORBIDDEN`.
- POST `/auth/login` {email, password} -> {token, user:{id,name,email,role}} (5 wrong tries in 10 minutes -> 429) | POST `/auth/logout` | GET `/auth/me` | POST `/auth/password` {current, next>=8 chars} (logs out other devices)
- GET/POST `/users` {name, email, role, password>=8} | PATCH `/users/:id` {role?, active?, password?} (owner only; cannot switch yourself off)
- GET `/audit-logs?actor=&limit=` (owner only). Every successful POST/PATCH is written automatically (who, `METHOD /path`, area, record id), plus logins and failed logins.
- Roles: owner (all), store (materials, suppliers, receipts, issue yarn, purchase requests, compatibility rules, supplier history), sales (buyers, orders, dispatches, pending payments), supervisor (machines, jobs including stock-production, rolls, attendance), qc (inspections), accounts (payments, costs, expenses, payroll, workers, attendance, ledger, pending payments). Rules live in one table: `backend/src/lib/auth.js`.

## Purchasing and notifications (M1 / M3)
- GET `/purchase-requests` | GET `/purchase-requests/suggestions` (low stock, no open request, suggested_qty) | POST `/purchase-requests` {material_id, qty>0, supplier_id?, note?}
- PATCH `/purchase-requests/:id/status` {status: ordered|received|cancelled, supplier_id?, lot_no?}. requested -> ordered (supplier needed) -> received (lot_no needed; books a stock receipt). Anything else -> 400 `BAD_TRANSITION`.
- GET `/notifications` -> {unread, items} for the caller's role | POST `/notifications/read` {ids?} (no ids = all mine). Raised automatically for: low stock, purchase request, QC rework/reject, order ready to ship, machine breakdown, invoice raised. Live topic: `notifications`.

## Roll labels and scan (M2)
- GET `/rolls/labels?ids=1,2,3` (no ids = rolls waiting for QC) -> label data | GET `/rolls/by-code/:code` -> roll + `inspections` history (newest first)
- The QR on a label encodes `<site>/scan/<roll code>`. UI routes: `/labels?ids=` (print sheet), `/scan/:code`.

## Dashboard extras (M4)
- GET `/dashboard/trend?days=14` -> [{day, metres}] | GET `/dashboard/at-risk` -> orders with risk overdue | due_soon | behind | yarn_short | GET `/finance/receivables` (billed, paid, outstanding per buyer)

## Offline writes
Send an `Idempotency-Key` header on a write; repeating the same key (per user) replays the first answer with `Idempotent-Replay: true` instead of writing again. The frontend queue (`frontend/src/lib/api.js`) uses this for: output logs, new rolls, inspections, attendance, machine status.

## Order status values (derived)
confirmed, in_production, in_qc, ready_to_ship, dispatched
