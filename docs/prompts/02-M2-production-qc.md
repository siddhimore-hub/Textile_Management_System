# Prompt for M2: Production floor and Quality control (Scenes 2 and 3)
Files you own: `backend/src/modules/production.js`, `qc.js`; pages `Machines.jsx`, `Rolls.jsx` (create in `frontend/src/pages/`); tables machines, job_cards, production_logs, rolls, qc_inspections.

Already working: machine list with today's output, status change, job assignment with rules, output logging, finish job, roll creation with code, inspection with required defect, defect counts.

Build next, in this order:
1. Machines page as a live board: one card per machine (name, stage, status pill, current order, metres today). Buttons: change status (running/idle/breakdown/maintenance), "Assign job" (pick order + shift), "Log output" (metres), "Finish job". Board refreshes by itself (topic `machines`).
2. Rolls page: "Create roll" from an active job (metres), list with filter tabs (pending, rework, pass, reject), inspection dialog (pass / rework / reject, defect type required for rework or reject, notes). Show a printable roll label with the roll code (a simple QR can be generated offline with a small library, only if you can explain it).
3. Rework loop: a roll marked rework can be re-inspected; keep every inspection row (history).
4. Defect report: table and bar of defects by machine and type from `/qc/defects`.
5. Block assigning a job if the order has no issued yarn (coordinate with M1: use `stock_movements` rows with `kind='issue'` for that order).
Hand-off checks: M3 depends on `rolls.qc_status` and `rolls.order_id`; M4 depends on `production_logs` and `job_cards`. Keep them stable.
