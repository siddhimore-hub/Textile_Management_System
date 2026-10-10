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
- GET `/machines` (with job_id, order_id, today_metres) | PATCH `/machines/:id/status` {status}
- GET `/jobs` | POST `/jobs` {order_id, machine_id, shift} (400 if machine broken/busy)
- POST `/jobs/:id/output` {metres>0} | POST `/jobs/:id/finish`
- GET `/rolls?qc_status=` | POST `/rolls` {job_card_id, metres>0} -> {id, code}
- POST `/rolls/:id/inspect` {result: pass|rework|reject, defect_type? (required unless pass), notes?, inspector?}
- GET `/qc/defects` -> counts by machine and defect

## M3 Dispatch and Buyer tracking
- GET `/finished-stock` | GET `/dispatches` | GET `/invoices`
- POST `/dispatches` {order_id, roll_ids[], vehicle_no like TN09AB1234} -> {dispatch_id, invoice_id, total}
- GET `/track/:token` (public) -> order, status, percent

## M4 People and Money
- GET/POST `/workers` {name, daily_wage}
- GET `/attendance?date=` | POST `/attendance` {worker_id, work_date, status}
- POST `/payroll/run` {month YYYY-MM} | GET `/payroll?month=`
- POST `/costs` {order_id?, kind, amount>0, note?} | POST `/payments` {invoice_id, amount>0}
- GET `/payments` | GET `/finance/order-costs` | GET `/finance/summary?month=` | GET `/dashboard`

## Order status values (derived)
confirmed, in_production, in_qc, ready_to_ship, dispatched
