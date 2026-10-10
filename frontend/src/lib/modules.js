// ONE place that defines the menu AND the list pages. Adding a page = adding an entry here + (optionally) a custom page.
// owner: which member edits it. endpoint: GET path. live: SSE topics that refresh it. columns: [key, header].
export const NAV = [
  { group: 'Overview', items: [
    { path: '/', label: 'Dashboard', owner: 'M4' },
    { path: '/flow', label: 'Process flow', owner: 'All' },
  ] },
  { group: 'Orders and stock', items: [
    { path: '/orders', label: 'Orders', owner: 'M1', endpoint: '/orders', live: ['orders'],
      hint: 'New order form with the yarn check goes here (POST /orders, GET /orders/:id/feasibility).',
      columns: [['id', 'Order'], ['buyer', 'Buyer'], ['fabric_type', 'Fabric'], ['colour', 'Colour'], ['qty_metres', 'Metres'], ['deadline', 'Deadline'], ['status', 'Status'], ['percent', 'Done %']] },
    { path: '/stock', label: 'Raw material stock', owner: 'M1', endpoint: '/stock', live: ['stock'], form: 'receipt',
      columns: [['name', 'Material'], ['on_hand', 'On hand'], ['reserved', 'Reserved'], ['available', 'Available'], ['reorder_level', 'Reorder at'], ['low', 'Low?']] },
  ] },
  { group: 'Production', items: [
    { path: '/machines', label: 'Machines', owner: 'M2', endpoint: '/machines', live: ['machines'],
      hint: 'Assign job and log output forms go here (POST /jobs, POST /jobs/:id/output, PATCH /machines/:id/status).',
      columns: [['name', 'Machine'], ['stage', 'Stage'], ['status', 'Status'], ['order_id', 'Order'], ['today_metres', 'Metres today']] },
    { path: '/rolls', label: 'Rolls and quality', owner: 'M2', endpoint: '/rolls', live: ['rolls'],
      hint: 'Create roll and inspection forms go here (POST /rolls, POST /rolls/:id/inspect).',
      columns: [['code', 'Roll'], ['order_id', 'Order'], ['machine', 'Machine'], ['metres', 'Metres'], ['qc_status', 'Quality']] },
  ] },
  { group: 'Dispatch', items: [
    { path: '/finished', label: 'Finished stock', owner: 'M3', endpoint: '/finished-stock', live: ['rolls'],
      hint: 'Pick rolls and dispatch form goes here (POST /dispatches).',
      columns: [['code', 'Roll'], ['order_id', 'Order'], ['fabric_type', 'Fabric'], ['colour', 'Colour'], ['metres', 'Metres']] },
    { path: '/dispatches', label: 'Dispatches', owner: 'M3', endpoint: '/dispatches', live: ['dispatch'],
      columns: [['id', 'No.'], ['buyer', 'Buyer'], ['order_id', 'Order'], ['rolls', 'Rolls'], ['vehicle_no', 'Vehicle'], ['total', 'Invoice total']] },
    { path: '/invoices', label: 'Invoices', owner: 'M3', endpoint: '/invoices', live: ['dispatch'],
      columns: [['id', 'Invoice'], ['buyer', 'Buyer'], ['order_id', 'Order'], ['total', 'Total'], ['paid', 'Paid']] },
  ] },
  { group: 'People and money', items: [
    { path: '/attendance', label: 'Attendance', owner: 'M4', endpoint: '/attendance', hint: 'Mark present, absent or half day (POST /attendance).',
      columns: [['name', 'Worker'], ['status', 'Today']] },
    { path: '/payroll', label: 'Wages', owner: 'M4', endpoint: '/payroll', hint: 'Run monthly payroll (POST /payroll/run).',
      columns: [['name', 'Worker'], ['month', 'Month'], ['amount', 'Amount']] },
    { path: '/costs', label: 'Order costs', owner: 'M4', endpoint: '/finance/order-costs',
      columns: [['order_id', 'Order'], ['buyer', 'Buyer'], ['good_metres', 'Good metres'], ['cost', 'Cost'], ['cost_per_metre', 'Cost per metre']] },
  ] },
];
export const ALL_ITEMS = NAV.flatMap((g) => g.items);
