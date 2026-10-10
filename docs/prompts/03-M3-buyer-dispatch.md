# Prompt for M3: Buyer tracking, Dispatch and Invoicing (Scenes 4 and 5)
Files you own: `backend/src/modules/dispatch.js`, `backend/src/lib/orderStatus.js`; pages `Finished.jsx`, `Dispatches.jsx`, `Invoices.jsx`, `Track.jsx`; tables dispatches, invoices, payments (with M4 for payments).

Already working: finished stock list, dispatch with rules (QC-passed, right order, once only), invoice total from rolls, invoices list, public `/track/:token` API and a basic Track page, derived order status.

Build next, in this order:
1. Finished stock page: group rolls by order, checkboxes, a "Dispatch selected" form (vehicle number validated like TN09AB1234). Show the server error if a rule fails.
2. Dispatch note and invoice print view (`window.print()` with a print stylesheet): lists rolls, metres, price, total; matches the invoice exactly.
3. Buyer tracking page polish: stages shown as a stepper (confirmed, in production, quality check, ready to ship, dispatched), percent bar, estimated delivery vs deadline, rolls ready count. Refreshes live. Never show costs or other buyers' data.
4. Partial dispatches: status stays `in_production` until all metres are made and shipped (already handled; test it) and show remaining metres.
5. Buyer notification stub: when status changes, write a row to a new `notifications` table (propose schema by PR) that M3 shows in a log; real SMS/email is optional and must degrade offline.
Hand-off checks: M4 reads `invoices` and `payments`; M2 owns rolls (you only set `dispatch_id`).
