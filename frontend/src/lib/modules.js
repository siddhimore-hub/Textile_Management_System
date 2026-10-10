// ONE place that defines the menu AND the list pages. Adding a page = adding an entry here + (optionally) a custom page.
// owner: which member edits it. endpoint: GET path. live: SSE topics that refresh it. columns: [key, header].
export const NAV = [
  { group: 'Overview', items: [
    { path: '/', label: 'Dashboard', owner: 'M4' },
    { path: '/flow', label: 'Process flow', owner: 'All' },
  ] },
  { group: 'Orders and stock', items: [
    { path: '/orders', roles: ['sales','store','supervisor','accounts'], label: 'Orders', owner: 'M1', endpoint: '/orders', live: ['orders'],
      hint: 'New order form with the yarn check goes here (POST /orders, GET /orders/:id/feasibility).',
      columns: [['id', 'Order'], ['buyer', 'Buyer'], ['fabric_type', 'Fabric'], ['colour', 'Colour'], ['qty_metres', 'Metres'], ['deadline', 'Deadline'], ['status', 'Status'], ['percent', 'Done %']] },
    { path: '/purchase-requests', label: 'Purchase requests', owner: 'M1', roles: ['store', 'accounts'], endpoint: '/purchase-requests', live: ['purchasing', 'stock'], columns: [] },
    { path: '/parties', label: 'Buyers and suppliers', owner: 'M1', roles: ['sales', 'store', 'accounts'], endpoint: '/buyers', live: [], columns: [] },
    { path: '/stock', roles: ['store','supervisor','accounts','sales'], label: 'Raw material stock', owner: 'M1', endpoint: '/stock', live: ['stock'], form: 'stock',
      columns: [['name', 'Material'], ['on_hand', 'On hand'], ['reserved', 'Reserved'], ['available', 'Available'], ['reorder_level', 'Reorder at'], ['low', 'Low?']] },
  ] },
  { group: 'Production', items: [
    { path: '/machines', roles: ['supervisor'], label: 'Machines', owner: 'M2', endpoint: '/machines', live: ['machines'],
      hint: 'Assign job and log output forms go here (POST /jobs, POST /jobs/:id/output, PATCH /machines/:id/status).',
      columns: [['name', 'Machine'], ['stage', 'Stage'], ['status', 'Status'], ['order_id', 'Order'], ['today_metres', 'Metres today']] },
    { path: '/spinning', roles: ['supervisor'], label: 'Spinning', owner: 'M2', endpoint: '/jobs', live: ['machines', 'orders'], columns: [] },
    { path: '/loom', roles: ['supervisor'], label: 'Loom', owner: 'M2', endpoint: '/jobs', live: ['machines', 'orders'], columns: [] },
    { path: '/dyeing', roles: ['supervisor'], label: 'Dyeing', owner: 'M2', endpoint: '/jobs', live: ['machines', 'orders'], columns: [] },
    { path: '/finishing', roles: ['supervisor'], label: 'Finishing', owner: 'M2', endpoint: '/jobs', live: ['machines', 'orders'], columns: [] },
    { path: '/rolls', roles: ['supervisor','qc'], label: 'Rolls and quality', owner: 'M2', endpoint: '/rolls', live: ['rolls'],
      hint: 'Create roll and inspection forms go here (POST /rolls, POST /rolls/:id/inspect).',
      columns: [['code', 'Roll'], ['order_id', 'Order'], ['machine', 'Machine'], ['metres', 'Metres'], ['qc_status', 'Quality']] },
  ] },
  { group: 'Dispatch', items: [
    { path: '/finished', roles: ['sales','supervisor'], label: 'Finished stock', owner: 'M3', endpoint: '/finished-stock', live: ['rolls'],
      hint: 'Pick rolls and dispatch form goes here (POST /dispatches).',
      columns: [['code', 'Roll'], ['order_id', 'Order'], ['fabric_type', 'Fabric'], ['colour', 'Colour'], ['metres', 'Metres']] },
    { path: '/dispatches', roles: ['sales','accounts'], label: 'Dispatches', owner: 'M3', endpoint: '/dispatches', live: ['dispatch'],
      columns: [['id', 'No.'], ['buyer', 'Buyer'], ['order_id', 'Order'], ['rolls', 'Rolls'], ['vehicle_no', 'Vehicle'], ['total', 'Invoice total']] },
    { path: '/invoices', roles: ['sales','accounts'], label: 'Invoices', owner: 'M3', endpoint: '/invoices', live: ['dispatch'],
      columns: [['id', 'Invoice'], ['buyer', 'Buyer'], ['order_id', 'Order'], ['total', 'Total'], ['paid', 'Paid']] },
  ] },
  { group: 'People and money', items: [
    { path: '/attendance', roles: ['supervisor','accounts'], label: 'Attendance', owner: 'M4', endpoint: '/attendance', hint: 'Mark present, absent or half day (POST /attendance).',
      columns: [['name', 'Worker'], ['status', 'Today']] },
    { path: '/payroll', roles: ['accounts'], label: 'Wages', owner: 'M4', endpoint: '/payroll', hint: 'Run monthly payroll (POST /payroll/run).',
      columns: [['name', 'Worker'], ['month', 'Month'], ['amount', 'Amount']] },
    { path: '/costs', roles: ['accounts'], label: 'Order costs', owner: 'M4', endpoint: '/finance/order-costs',
      columns: [['order_id', 'Order'], ['buyer', 'Buyer'], ['good_metres', 'Good metres'], ['cost', 'Cost'], ['cost_per_metre', 'Cost per metre']] },
  ] },
  { group: 'Admin', items: [
    { path: '/users', label: 'Users and roles', owner: 'M4', roles: [], endpoint: '/users', live: [], columns: [] },
    { path: '/audit', label: 'Audit log', owner: 'M4', roles: [], endpoint: '/audit-logs', live: [], columns: [] },
  ] },
];
export const ALL_ITEMS = NAV.flatMap((g) => g.items);
