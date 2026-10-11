// ONE place that defines the main sidebar modules and their topbar tabs.
// owner: member code. endpoint: GET path. live: SSE topics. columns: [key, header].

export const MODULES = [
  {
    id: 'overview',
    label: 'Overview',
    icon: 'home',
    path: '/',
    title: 'Dashboard Overview',
    desc: 'Live overview of textile mill operations, production metrics, and key indicators.',
    items: [
      { path: '/', label: 'Dashboard', owner: 'M4' },
    ]
  },
  {
    id: 'orders-stock',
    label: 'Orders & Stock',
    icon: 'clipboard',
    path: '/orders',
    title: 'Orders & Stock Workspace',
    desc: 'Manage sales orders, raw material stock, purchase requests, buyers, suppliers, and products.',
    items: [
      { path: '/orders', roles: ['sales','store','supervisor','accounts'], label: 'Orders', owner: 'M1', endpoint: '/orders', live: ['orders'],
        hint: 'New order form with the yarn check goes here (POST /orders, GET /orders/:id/feasibility).',
        columns: [['id', 'Order'], ['buyer', 'Buyer'], ['fabric_type', 'Fabric'], ['colour', 'Colour'], ['qty_metres', 'Metres'], ['deadline', 'Deadline'], ['status', 'Status'], ['percent', 'Done %']] },
      { path: '/purchase-requests', label: 'Purchase requests', owner: 'M1', roles: ['store', 'accounts'], endpoint: '/purchase-requests', live: ['purchasing', 'stock'], columns: [] },
      { path: '/parties', label: 'Buyers and suppliers', owner: 'M1', roles: ['sales', 'store', 'accounts'], endpoint: '/buyers', live: [], columns: [] },
      { path: '/stock', roles: ['store','supervisor','accounts','sales'], label: 'Raw material stock', owner: 'M1', endpoint: '/stock', live: ['stock'], form: 'stock',
        columns: [['name', 'Material'], ['on_hand', 'On hand'], ['reserved', 'Reserved'], ['available', 'Available'], ['reorder_level', 'Reorder at'], ['low', 'Low?']] },
      { path: '/supplier-history', roles: ['store','accounts'], label: 'Supplier yarn history', owner: 'M1', endpoint: '/suppliers/material-history', live: ['stock'], columns: [] },
      { path: '/products', roles: ['store','supervisor','accounts','products'], label: 'Products', owner: 'M1', endpoint: '/products', live: ['products', 'orders'], columns: [] },
    ]
  },
  {
    id: 'production',
    label: 'Production',
    icon: 'cog',
    path: '/runs',
    title: 'Production Workspace',
    desc: 'Monitor mill machinery, stage jobs (Spinning, Loom, Dyeing, Finishing), and quality inspections.',
    items: [
      { path: '/runs', roles: ['supervisor', 'store', 'sales'], label: 'Make a product', owner: 'M2', endpoint: '/runs', live: ['runs', 'machines', 'rolls', 'orders'], columns: [] },
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
    ]
  },
  {
    id: 'dispatch',
    label: 'Dispatch',
    icon: 'truck',
    path: '/finished',
    title: 'Dispatch & Invoicing Workspace',
    desc: 'Fulfill customer orders from finished products stock, issue dispatches, and track payments.',
    items: [
      { path: '/finished', roles: ['sales','supervisor'], label: 'Finished Products', owner: 'M3', endpoint: '/finished-products', live: ['rolls', 'products'],
        hint: 'Pick QC-passed rolls and dispatch them (POST /dispatches). Only eligible, approved stock can be dispatched.',
        columns: [['code', 'Roll'], ['order_id', 'Order'], ['fabric_type', 'Fabric'], ['colour', 'Colour'], ['metres', 'Metres']] },
      { path: '/dispatches', roles: ['sales','accounts'], label: 'Dispatches', owner: 'M3', endpoint: '/dispatches', live: ['dispatch'],
        columns: [['id', 'No.'], ['buyer', 'Buyer'], ['order_id', 'Order'], ['rolls', 'Rolls'], ['vehicle_no', 'Vehicle'], ['total', 'Invoice total']] },
      { path: '/invoices', roles: ['sales','accounts'], label: 'Invoices & bills', owner: 'M3', endpoint: '/invoices', live: ['dispatch', 'stock'],
        columns: [['invoice_no', 'Number'], ['kind', 'Type'], ['party', 'Party'], ['total', 'Total'], ['outstanding', 'Outstanding'], ['payment_status', 'Payment']] },
      { path: '/buyer-history', roles: ['sales','accounts'], label: 'Buyer history', owner: 'M3', endpoint: '/buyers/history', live: ['orders', 'dispatch'], columns: [] },
      { path: '/pending-payments', roles: ['accounts','sales'], label: 'Pending payments', owner: 'M3', endpoint: '/pending-payments', live: ['dispatch'], columns: [] },
    ]
  },
  {
    id: 'income-expenses',
    label: 'Income & Expenses',
    icon: 'chart',
    path: '/income-expenses',
    title: 'Income & Expenses Workspace',
    desc: 'Financial ledger summary: realized payment income, business operational expenses, and net profit.',
    items: [
      { path: '/income-expenses', roles: ['accounts'], label: 'Income and expenses', owner: 'M4', endpoint: '/ledger/summary', live: ['stock', 'dispatch', 'ledger'], columns: [] },
    ]
  },
  {
    id: 'people-money',
    label: 'People & Money',
    icon: 'calendar',
    path: '/attendance',
    title: 'Workforce & Cost Management',
    desc: 'Track daily attendance, monthly wage payouts, and detailed job order production costs.',
    items: [
      { path: '/attendance', roles: ['supervisor','accounts'], label: 'Attendance', owner: 'M4', endpoint: '/attendance', hint: 'Mark present, absent or half day (POST /attendance).',
        columns: [['name', 'Worker'], ['status', 'Today']] },
      { path: '/payroll', roles: ['accounts'], label: 'Wages', owner: 'M4', endpoint: '/payroll', hint: 'Run monthly payroll (POST /payroll/run).',
        columns: [['name', 'Worker'], ['month', 'Month'], ['amount', 'Amount']] },
      { path: '/costs', roles: ['accounts'], label: 'Order costs', owner: 'M4', endpoint: '/finance/order-costs',
        columns: [['order_id', 'Order'], ['buyer', 'Buyer'], ['good_metres', 'Good metres'], ['cost', 'Cost'], ['cost_per_metre', 'Cost per metre']] },
    ]
  },
  {
    id: 'admin',
    label: 'Admin',
    icon: 'users',
    path: '/users',
    title: 'Administration',
    desc: 'Manage user access, role permissions, and system activity logs.',
    items: [
      { path: '/users', label: 'Users and roles', owner: 'M4', roles: [], endpoint: '/users', live: [], columns: [] },
      { path: '/audit', label: 'Audit log', owner: 'M4', roles: [], endpoint: '/audit-logs', live: [], columns: [] },
    ]
  },
];

export const NAV = MODULES.map((m) => ({ group: m.label, items: m.items }));
export const ALL_ITEMS = MODULES.flatMap((m) => m.items);
