// Offline-safe writes: the browser sends an Idempotency-Key with every queued write. If the server already
// processed that key (response lost on a bad connection), it replays the saved answer instead of writing twice.
import { db } from './db.js';

db.prepare("DELETE FROM idempotency_keys WHERE created_at < datetime('now','-2 days')").run();

export function idempotency(req, res, next) {
  const key = req.get('Idempotency-Key');
  if (!key || ['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const id = `${req.user?.id ?? 0}:${key}`;
  const seen = db.prepare('SELECT status, body FROM idempotency_keys WHERE key=?').get(id);
  if (seen) return res.set('Idempotent-Replay', 'true').status(seen.status).type('json').send(seen.body);
  const json = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode < 500) db.prepare('INSERT OR IGNORE INTO idempotency_keys (key,status,body) VALUES (?,?,?)').run(id, res.statusCode, JSON.stringify(body));
    return json(body);
  };
  next();
}
