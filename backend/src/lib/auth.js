// Login sessions + role permissions. No extra packages: scrypt from node:crypto, tokens stored in `sessions`.
import crypto from 'node:crypto';
import { db } from './db.js';
import { ApiError } from './http.js';

export const ROLES = ['owner', 'store', 'supervisor', 'qc', 'sales', 'accounts'];
// Permissions an administrator can grant (each base role name is itself a permission, plus products/admin).
export const PERMISSIONS = ['sales', 'store', 'supervisor', 'qc', 'accounts', 'products', 'admin'];
const DEFAULT_PASSWORD = process.env.DEFAULT_PASSWORD || 'everest123';
export const SESSION_HOURS = Number(process.env.SESSION_HOURS || 12);

export const hashPassword = (pw) => {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(pw, salt, 32).toString('hex')}`;
};
export const verifyPassword = (pw, stored) => {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  const a = Buffer.from(hash, 'hex'); const b = crypto.scryptSync(pw, salt, 32);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
// Seeded users start with a known password so the owner can log in the first time. Change it after login.
for (const u of db.prepare('SELECT id FROM users WHERE password_hash IS NULL').all())
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(DEFAULT_PASSWORD), u.id);
db.prepare("DELETE FROM sessions WHERE expires_at < datetime('now')").run();

export function createSession(userId) {
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare("INSERT INTO sessions (token,user_id,expires_at) VALUES (?,?,datetime('now', ?))").run(token, userId, `+${SESSION_HOURS} hours`);
  return token;
}
export const endSession = (token) => db.prepare('DELETE FROM sessions WHERE token=?').run(token);

const PUBLIC = [['GET', /^\/health$/], ['POST', /^\/auth\/login$/], ['GET', /^\/track\/[\w-]+$/]];

// First match wins. Owner passes every rule. A path with no write rule is owner-only.
const READ_RULES = [
  [/^\/(users|audit-logs)(\/|$)/, ['owner', 'admin']],
  [/^\/suppliers\/material-history$/, ['store', 'accounts']],
  [/^\/buyers\/history$/, ['sales', 'accounts']],
  [/^\/(finance|payroll|payments|ledger)(\/|$)/, ['accounts']],
  [/^\/invoices(\/|$)/, ['accounts', 'sales', 'store']],
  [/^\/pending-payments(\/|$)/, ['accounts', 'sales']],
];
const EVERYONE = ['store', 'supervisor', 'qc', 'sales', 'accounts'];
const WRITE_RULES = [
  [/^\/(auth|notifications)(\/|$)/, EVERYONE],
  [/^\/stock\/issue$/, ['store', 'sales']],
  [/^\/(materials|suppliers|receipts|purchase-requests|compatibility)(\/|$)/, ['store']],
  [/^\/(buyers|orders|dispatches)(\/|$)/, ['sales']],
  [/^\/(jobs|machines|stock-production|runs|runs-advance)(\/|$)/, ['supervisor']],
  [/^\/rolls\/\d+\/inspect$/, ['qc']],
  [/^\/rolls(\/|$)/, ['supervisor']],
  [/^\/(attendance|workers)(\/|$)/, ['supervisor', 'accounts']],
  [/^\/(payments|costs|payroll|expenses)(\/|$)/, ['accounts']],
  [/^\/products(\/|$)/, ['store', 'products']],
];
export const allowedRoles = (method, path) => {
  const rules = method === 'GET' || method === 'HEAD' ? READ_RULES : WRITE_RULES;
  const hit = rules.find(([re]) => re.test(path));
  if (!hit) return method === 'GET' || method === 'HEAD' ? EVERYONE : [];
  return hit[1];
};

// The permissions a user actually holds: owner = everything; otherwise the explicit grants if any,
// falling back to the base role so accounts created before permissions existed keep working.
export function permissionsOf(user) {
  if (!user) return [];
  if (user.role === 'owner') return [...PERMISSIONS, 'owner'];
  const granted = db.prepare('SELECT permission FROM user_permissions WHERE user_id=? ORDER BY permission').all(user.id).map((x) => x.permission);
  return Array.from(new Set([user.role, ...granted]));
}

export function userFromToken(token) {
  if (!token) return null;
  return db.prepare(`SELECT u.id, u.name, u.email, u.role FROM sessions s JOIN users u ON u.id=s.user_id
    WHERE s.token=? AND s.expires_at > datetime('now') AND u.active=1`).get(token) || null;
}

// Mounted once on /api: authenticates, then checks the role against the rule table.
export function guard(req, _res, next) {
  if (PUBLIC.some(([m, re]) => m === req.method && re.test(req.path))) return next();
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : (req.path === '/events' ? String(req.query.token || '') : '');
  const user = userFromToken(token);
  if (!user) return next(new ApiError(401, 'UNAUTHENTICATED', 'Please log in'));
  const permissions = permissionsOf(user);
  req.user = { ...user, permissions }; req.token = token;
  if (user.role !== 'owner' && !allowedRoles(req.method, req.path).some((p) => permissions.includes(p)))
    return next(new ApiError(403, 'FORBIDDEN', `Your access (${permissions.join(', ') || 'none'}) cannot do this`));
  next();
}
