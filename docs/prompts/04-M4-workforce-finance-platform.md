# Prompt for M4: Workforce, Finance, Dashboard and Platform (Scene 6 + app shell)
Files you own: `backend/src/modules/workforce.js`, `finance.js`; `frontend/src/components/*`, `styles.css`, `pages/Dashboard.jsx`, `Attendance.jsx`, `Payroll.jsx`, `Costs.jsx`; tables users, workers, attendance, wage_payouts, cost_entries, audit_logs. You also guard the shared UI kit and the sidebar/navbar.

Already working: workers, attendance with one-per-day rule, payroll run, cost entries, payments with overpayment guard, order costs, month summary, dashboard numbers, sidebar + navbar + dashboard + process flow pages.

Build next, in this order:
1. Attendance page: date picker, a row per worker with Present / Half / Absent buttons (POST /attendance), shows today's state, works on a phone.
2. Wages page: month picker, "Run payroll", table of payouts, total. Add a worker form.
3. Costs page: add cost entries (material, labour, overhead, supplier bill) per order; cost per metre table; auto-suggest labour cost from `production_logs` and worker wages (explain the formula you choose in the page).
4. Finance page: month summary (billed, received, costs, wages, profit), receivables per buyer (invoice total minus payments), record buyer payment form (POST /payments).
5. Simple login and roles (pick a user from `users`, store the role in memory, hide menu items the role cannot use, enforce on the backend with a small middleware). Write to `audit_logs` on key actions.
6. Owner dashboard polish: add a machine output chart (plain SVG, no CDN) and an orders-at-risk list (deadline within 3 days and not ready).
Platform duties: review UI PRs for palette and layout consistency; keep `modules.js` tidy; keep `HANDOVER.md` current.
