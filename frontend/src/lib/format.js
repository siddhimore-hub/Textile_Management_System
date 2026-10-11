// Small display helpers shared by pages. Dates from the API are YYYY-MM-DD (deadlines) or SQLite UTC timestamps (created_at).
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const inr = (n) => Number(n || 0).toLocaleString('en-IN');
export const shortDate = (s) => { if (!s) return '-'; const [, m, d] = String(s).slice(0, 10).split('-'); return `${Number(d)} ${MONTHS[Number(m) - 1] ?? ''}`; };
export const longDate = (d = new Date()) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
export const todayIso = () => new Date().toISOString().slice(0, 10); // UTC, same clock the server uses for deadlines
export const daysUntil = (iso) => Math.round((Date.parse(iso) - Date.parse(todayIso())) / 86400000);

// SQLite CURRENT_TIMESTAMP is UTC without a zone marker.
export function timeAgo(ts, now = Date.now()) {
  const t = Date.parse(`${String(ts).replace(' ', 'T')}Z`);
  if (Number.isNaN(t)) return '';
  const s = Math.max(0, Math.round((now - t) / 1000));
  if (s < 60) return 'just now'; if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`; return `${Math.floor(s / 86400)} d ago`;
}
// Shift windows follow the mill's day: 6 to 14, 14 to 22, 22 to 6.
export function shiftOf(d = new Date()) {
  const h = d.getHours();
  return h >= 6 && h < 14 ? ['Shift 1', '6:00 AM - 2:00 PM'] : h >= 14 && h < 22 ? ['Shift 2', '2:00 PM - 10:00 PM'] : ['Shift 3', '10:00 PM - 6:00 AM'];
}
export const greeting = (d = new Date()) => (d.getHours() < 12 ? 'Good morning' : d.getHours() < 17 ? 'Good afternoon' : 'Good evening');
export const initials = (name = '') => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
