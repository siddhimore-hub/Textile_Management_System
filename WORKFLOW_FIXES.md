# ERP workflow fixes (2026-10-11)

- Dispatch request validation rejects duplicate roll IDs.
- Dispatch creation rechecks QC and dispatch state inside the SQLite write transaction and uses conditional updates to prevent repeat dispatch.
- Roll production origin (`order_line_id`) is kept separate from the order line fulfilled by dispatch (`fulfilled_order_line_id`), so stock sourced from another order is credited to the correct buyer-order line.
- Order-line fulfilment responses now expose produced, QC-approved, reserved, dispatched, and pending metres; a fully dispatched line remains fulfilled even when no stock is currently available.
- Production logs now record waste metres (defaulting to zero for existing callers and existing records). Existing databases receive additive columns at startup; existing rows are preserved.

The backend applies the additive SQLite column migrations on startup. No database reset is required.
