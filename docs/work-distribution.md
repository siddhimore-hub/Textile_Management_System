# Work Distribution (4 members, interlinked)
See HANDBOOK section 1 for ownership. Hand-offs between members:
- **M1 -> M2:** `order_id`, yarn issue (`POST /stock/issue`) before a job starts. M2 may call the feasibility check.
- **M2 -> M3:** rolls with `qc_status = pass` appear in `/finished-stock`. M3 never edits rolls except setting `dispatch_id` on dispatch.
- **M2 -> M4:** `production_logs` and `job_cards` give machine output and labour time for costing.
- **M3 -> M4:** `invoices` and `payments` feed the dashboard and profit.
- **M1 -> M4:** stock receipts give supplier bills / material cost (`cost_entries`).
- **M4 -> all:** layout, UI kit, login/roles, dashboard.

Order of dependency: M1 and M4 can start immediately; M2 needs orders (use the seed + `POST /orders` while M1 builds the form); M3 needs rolls (use curl or `scripts/smoke.sh` data while M2 builds the UI).
