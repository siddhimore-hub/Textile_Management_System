# Prompt for M1: Inventory and Orders (Scene 1: yarn arrives, new order)
Files you own: `backend/src/modules/inventory.js`, `orders.js`; frontend pages for Orders and Raw material stock (create `frontend/src/pages/Orders.jsx`, `Stock.jsx`); tables suppliers, buyers, materials, stock_movements, orders, order_requirements.

Already working (backend + Orders page UI + receive-yarn form): receipts, stock with low flag, issue, order create, derived status list, feasibility, receive-yarn form on the stock page.

Build next (items already done in the UI are noted in HANDOVER.md; skip them), in this order:
1. Orders page: "New order" form (buyer, fabric, colour, metres, price, deadline, yarn requirements as repeatable rows). Show server errors under fields. After saving, show the tracking link `/track/<token>` with a copy button.
2. Order detail panel: feasibility result (enough yarn or shortfall per material) and a button "Issue yarn" that calls `POST /stock/issue` per line.
3. Stock page: coloured low-stock rows, movement history table (`/stock/movements`), "Add material" form (`POST /materials`), "Add supplier" and "Add buyer" forms (add `POST /suppliers` to the backend).
4. Purchase requests: when shortfall exists, button "Request yarn" that records a purchase request (new table `purchase_requests`; propose the schema change by PR to `db/schema.sql`).
5. Validation sweep: quantity limits, duplicate material names, phone format.
Hand-off checks: M2 needs `GET /orders` and `POST /stock/issue` to stay stable. Do not rename fields without updating `docs/api-contract.md` and telling M2, M3, M4.
