// Notifications: any module calls notify(...) after an event worth telling someone about.
// roles = comma list of roles who should see it (owner always sees everything).
import { db } from './db.js';
import { publish } from './events.js';

export function notify(kind, message, link = null, roles = 'owner') {
  // Do not repeat an unread alert that says the same thing.
  if (db.prepare('SELECT 1 FROM notifications WHERE kind=? AND message=? AND read_at IS NULL').get(kind, message)) return;
  db.prepare('INSERT INTO notifications (kind,message,link,roles) VALUES (?,?,?,?)').run(kind, message, link, roles);
  publish('notifications');
}
export function checkLowStock(materialId) {
  const m = db.prepare('SELECT * FROM materials WHERE id=?').get(materialId);
  if (!m) return;
  const onHand = db.prepare('SELECT COALESCE(SUM(qty),0) q FROM stock_movements WHERE material_id=?').get(m.id).q;
  const required = db.prepare('SELECT COALESCE(SUM(qty_required),0) q FROM order_requirements WHERE material_id=?').get(m.id).q;
  const issued = -db.prepare("SELECT COALESCE(SUM(qty),0) q FROM stock_movements WHERE material_id=? AND kind='issue'").get(m.id).q;
  const available = onHand - Math.max(0, required - issued);
  if (available < m.reorder_level) notify('low_stock', `${m.name} is low: ${available} ${m.unit} available, reorder at ${m.reorder_level}`, '/purchase-requests', 'store,accounts');
}
