// OWNER: M3  |  Notifications bell: list, unread count, mark read
import { Router } from 'express';
import { z } from 'zod';
import { db } from '../lib/db.js';
import { validate } from '../lib/http.js';

const r = Router();
const mine = (role) => (role === 'owner' ? { sql: '1=1', args: [] } : { sql: "(',' || roles || ',') LIKE ?", args: [`%,${role},%`] });

r.get('/notifications', (req, res) => {
  const { sql, args } = mine(req.user.role);
  const items = db.prepare(`SELECT id,kind,message,link,read_at,created_at FROM notifications WHERE ${sql} ORDER BY id DESC LIMIT 50`).all(...args);
  const unread = db.prepare(`SELECT COUNT(*) c FROM notifications WHERE read_at IS NULL AND ${sql}`).get(...args).c;
  res.json({ data: { unread, items } });
});
// ids omitted = mark everything of mine as read
r.post('/notifications/read', validate(z.object({ ids: z.array(z.coerce.number().int().positive()).optional() })), (req, res) => {
  const { sql, args } = mine(req.user.role);
  const ids = req.body.ids;
  if (ids?.length) db.prepare(`UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE read_at IS NULL AND id IN (${ids.map(() => '?').join(',')}) AND ${sql}`).run(...ids, ...args);
  else db.prepare(`UPDATE notifications SET read_at=CURRENT_TIMESTAMP WHERE read_at IS NULL AND ${sql}`).run(...args);
  res.json({ data: { ok: true } });
});

export default r;
