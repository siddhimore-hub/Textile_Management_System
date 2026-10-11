// Notifications bell in the navbar: unread count, dropdown list, mark as read.
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, useLive } from '../lib/api.js';
import { timeAgo } from '../lib/format.js';
import Icon from './Icon.jsx';

export default function Bell() {
  const { data, reload } = useLive('/notifications', ['notifications']);
  const [open, setOpen] = useState(false); const nav = useNavigate();
  const unread = data?.unread || 0;
  async function readAll() { await api('/notifications/read', { method: 'POST', body: {} }); reload(); }
  async function go(n) { await api('/notifications/read', { method: 'POST', body: { ids: [n.id] } }); reload(); setOpen(false); if (n.link) nav(n.link); }
  return (
    <div className="bell">
      <button className="bell-btn" onClick={() => setOpen(!open)} aria-label={`Notifications, ${unread} unread`} aria-expanded={open}>
        <Icon name="bell" />{unread > 0 && <b className="badge">{unread}</b>}
      </button>
      {open && (
        <div className="bell-menu" role="dialog" aria-label="Notifications">
          <div className="bell-head"><b>Notifications</b>{unread > 0 && <button className="link-btn" onClick={readAll}>Mark all read</button>}</div>
          {data?.items?.length ? data.items.map((n) => (
            <button key={n.id} className={`bell-item ${n.read_at ? '' : 'unread'}`} onClick={() => go(n)}>
              <span>{n.message}</span><small>{timeAgo(n.created_at)}</small>
            </button>)) : <div className="empty">No alerts.</div>}
        </div>)}
    </div>
  );
}
