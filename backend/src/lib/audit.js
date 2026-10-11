// Audit trail: every successful change (POST/PATCH/PUT/DELETE) is written to audit_logs with who did it.
import { db } from './db.js';

export function writeAudit(actor, action, entity = null, entityId = null) {
  db.prepare('INSERT INTO audit_logs (actor,action,entity,entity_id) VALUES (?,?,?,?)').run(actor, action, entity, entityId);
}
export function audit(req, res, next) {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method) || /^\/auth\/login$/.test(req.path)) return next();
  let sent;
  const json = res.json.bind(res);
  res.json = (body) => { sent = body; return json(body); };
  res.on('finish', () => {
    if (res.statusCode >= 400 || !req.user) return;
    const seg = req.path.split('/').filter(Boolean);
    const newId = sent?.data?.id ?? sent?.data?.dispatch_id;
    const fromBody = Number.isInteger(newId) ? newId : null;
    const fromPath = seg.find((s) => /^\d+$/.test(s));
    try {
      writeAudit(`${req.user.name} (${req.user.role})`, `${req.method} ${req.path}`, seg[0] || null, fromBody ?? (fromPath ? Number(fromPath) : null));
    } catch (e) { console.error('audit failed', e.message); }
  });
  next();
}
