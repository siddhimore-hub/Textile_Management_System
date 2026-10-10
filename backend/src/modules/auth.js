// OWNER: M4  |  Login, sessions, users, audit log
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { validate, bad, notFound, ApiError, conflict } from '../lib/http.js';
import { ROLES, hashPassword, verifyPassword, createSession, endSession } from '../lib/auth.js';
import { writeAudit } from '../lib/audit.js';

const r = Router();
const fails = new Map(); // email -> [timestamps]; stops password guessing
const LIMIT = 5, WINDOW = 10 * 60 * 1000;

r.post('/auth/login', validate(z.object({ email: z.string().trim().toLowerCase().min(3), password: z.string().min(1, 'Enter your password') })), (req, res) => {
  const { email, password } = req.body;
  const recent = (fails.get(email) || []).filter((t) => Date.now() - t < WINDOW);
  if (recent.length >= LIMIT) throw new ApiError(429, 'TOO_MANY_ATTEMPTS', 'Too many wrong passwords. Wait 10 minutes and try again.');
  const u = db.prepare('SELECT * FROM users WHERE lower(email)=? AND active=1').get(email);
  if (!u || !verifyPassword(password, u.password_hash)) {
    fails.set(email, [...recent, Date.now()]);
    writeAudit(email, 'LOGIN FAILED', 'users', u?.id ?? null);
    throw new ApiError(401, 'BAD_LOGIN', 'Email or password is wrong');
  }
  fails.delete(email);
  writeAudit(`${u.name} (${u.role})`, 'LOGIN', 'users', u.id);
  res.json({ data: { token: createSession(u.id), user: { id: u.id, name: u.name, email: u.email, role: u.role } } });
});
r.post('/auth/logout', (req, res) => { endSession(req.token); res.json({ data: { ok: true } }); });
r.get('/auth/me', (req, res) => res.json({ data: req.user }));
r.post('/auth/password', validate(z.object({ current: z.string().min(1), next: z.string().min(8, 'Use at least 8 characters') })), (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!verifyPassword(req.body.current, u.password_hash)) throw bad('Current password is wrong', 'BAD_LOGIN');
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(req.body.next), u.id);
  db.prepare('DELETE FROM sessions WHERE user_id=? AND token != ?').run(u.id, req.token); // log out other devices
  res.json({ data: { ok: true } });
});

// Owner only (enforced in lib/auth.js rules)
r.get('/users', (_q, res) => res.json({ data: db.prepare('SELECT id,name,email,role,active,created_at FROM users ORDER BY name').all() }));
r.post('/users', validate(z.object({
  name: z.string().trim().min(2), email: z.string().trim().toLowerCase().email(), role: z.enum(ROLES),
  password: z.string().min(8, 'Use at least 8 characters'),
})), (req, res) => {
  const b = req.body;
  if (db.prepare('SELECT 1 FROM users WHERE lower(email)=?').get(b.email)) throw conflict('That email already has an account');
  const info = db.prepare('INSERT INTO users (name,email,role,password_hash) VALUES (?,?,?,?)').run(b.name, b.email, b.role, hashPassword(b.password));
  res.status(201).json({ data: { id: info.lastInsertRowid } });
});
r.patch('/users/:id', validate(z.object({ role: z.enum(ROLES).optional(), active: z.boolean().optional(), password: z.string().min(8).optional() })), (req, res) => {
  const id = Number(req.params.id); const b = req.body;
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
  if (!u) throw notFound('User');
  if (id === req.user.id && (b.active === false || (b.role && b.role !== 'owner'))) throw bad('You cannot remove your own owner access', 'SELF_LOCKOUT');
  db.transaction(() => {
    if (b.role) db.prepare('UPDATE users SET role=? WHERE id=?').run(b.role, id);
    if (b.active !== undefined) db.prepare('UPDATE users SET active=? WHERE id=?').run(b.active ? 1 : 0, id);
    if (b.password) db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(b.password), id);
    if (b.active === false || b.password || b.role) db.prepare('DELETE FROM sessions WHERE user_id=?').run(id);
  })();
  res.json({ data: { ok: true } });
});

r.get('/audit-logs', (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 200, 1000);
  const q = req.query.actor ? 'WHERE actor LIKE ?' : '';
  res.json({ data: db.prepare(`SELECT * FROM audit_logs ${q} ORDER BY id DESC LIMIT ?`).all(...(req.query.actor ? [`%${req.query.actor}%`] : []), limit) });
});

export default r;
