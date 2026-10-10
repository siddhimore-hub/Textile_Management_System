// Dependency-free icon set (inline SVG, works offline). Strokes use currentColor, so CSS decides the colour.
const PATHS = {
  home: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  flow: 'M5 4h5v5H5zM14 15h5v5h-5zM10 6.5h4a2 2 0 0 1 2 2V15',
  clipboard: 'M9 4h6v3H9zM7 5.5H5V21h14V5.5h-2M8.5 12h7M8.5 16h5',
  cart: 'M3 4h2l2.2 11h11l2-8H6M9.5 20.2h.01M17.5 20.2h.01',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2.5 20c0-3.4 2.9-5.5 6.5-5.5s6.5 2.1 6.5 5.5M16.5 4.6a3.5 3.5 0 0 1 0 6.3M18 14.6c2.2.6 3.5 2.4 3.5 5.4',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  cog: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.3l2-1.5-2-3.4-2.3.9a7 7 0 0 0-2.2-1.3L14 3h-4l-.4 2.4a7 7 0 0 0-2.2 1.3l-2.3-.9-2 3.4 2 1.5a7 7 0 0 0 0 2.6l-2 1.5 2 3.4 2.3-.9a7 7 0 0 0 2.2 1.3L10 21h4l.4-2.4a7 7 0 0 0 2.2-1.3l2.3.9 2-3.4-2-1.5c.1-.4.1-.9.1-1.3z',
  shield: 'M12 3l8 3v6c0 4.5-3.2 8.2-8 9-4.8-.8-8-4.5-8-9V6zM8.5 12l2.5 2.5 5-5',
  cube: 'M12 3l8 4.5v9L12 21l-8-4.5v-9zM4 7.5l8 4.5 8-4.5M12 12v9',
  truck: 'M2 6h11v10H2zM13 9h4l4 4v3h-8M6.5 19.2h.01M17.5 19.2h.01',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4M9 15l2 2 4-4',
  wallet: 'M3 7h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM3 7l12-3v3M16 14h2',
  chart: 'M4 20V10M10 20V4M16 20v-8M22 20H2',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.5-4.5',
  bell: 'M6 16v-5a6 6 0 1 1 12 0v5l2 2H4zM10 21h4',
  down: 'M6 9l6 6 6-6',
  right: 'M9 6l6 6-6 6',
  arrow: 'M5 12h14M13 6l6 6-6 6',
  check: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12l3 3 5-6',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  plus: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8v8M8 12h8',
  filePlus: 'M6 3h8l4 4v14H6zM14 3v4h4M12 11v6M9 14h6',
  menu: 'M4 6h16M4 12h16M4 18h16',
  logout: 'M10 4H5v16h5M14 8l5 4-5 4M19 12H9',
  yarn: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM4.5 9c4.5 2 10.5 2 15 0M3.5 14c5 2.5 12 2.5 17 0M9 3.5c1.5 6 1.5 11-1 17',
  spool: 'M7 4h10M7 20h10M9 4v16M15 4v16M9 9h6M9 14h6',
  weave: 'M4 4h16v16H4zM4 9h16M4 14h16M9 4v16M14 4v16',
  drop: 'M12 3c4 5 6 8 6 11a6 6 0 0 1-12 0c0-3 2-6 6-11z',
  dot: 'M12 12h.01',
};
// Which icon belongs to which menu page (menu itself stays defined in lib/modules.js).
export const PAGE_ICON = {
  '/': 'home', '/orders': 'clipboard', '/purchase-requests': 'cart', '/parties': 'users', '/stock': 'box', '/supplier-history': 'list', '/compatibility': 'yarn',
  '/machines': 'cog', '/spinning': 'spool', '/loom': 'weave', '/dyeing': 'drop', '/finishing': 'check',
  '/rolls': 'shield', '/finished': 'cube', '/dispatches': 'truck', '/invoices': 'receipt', '/pending-payments': 'wallet', '/attendance': 'calendar', '/payroll': 'wallet',
  '/costs': 'chart', '/income-expenses': 'chart', '/users': 'users', '/audit': 'list',
};

export default function Icon({ name, className = '' }) {
  return (
    <svg className={`icon ${className}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={PATHS[name] || PATHS.dot} />
    </svg>
  );
}
