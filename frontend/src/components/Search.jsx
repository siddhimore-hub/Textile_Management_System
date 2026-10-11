// Navbar search: pages, orders, machines and materials. Data loads on first focus, so it costs nothing until used.
import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';
import { NAV } from '../lib/modules.js';
import { useAuth } from '../lib/auth.jsx';
import Icon from './Icon.jsx';

const has = (v, q) => String(v ?? '').toLowerCase().includes(q);

export default function Search() {
  const { can } = useAuth(); const nav = useNavigate();
  const [q, setQ] = useState(''); const [open, setOpen] = useState(false); const [pos, setPos] = useState(0);
  const [data, setData] = useState(null); const box = useRef(null);
  useEffect(() => {
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away); return () => document.removeEventListener('mousedown', away);
  }, []);
  async function load() {
    if (data) return;
    const get = (p) => api(p).catch(() => []); // a role without access to one list still gets the others
    const [orders, machines, stock] = await Promise.all([get('/orders'), get('/machines'), get('/stock')]);
    setData({ orders, machines, stock });
  }
  const term = q.trim().toLowerCase();
  const results = [];
  if (term) {
    for (const g of NAV) for (const i of g.items) if ((!i.roles || can(i.roles)) && has(i.label, term)) results.push({ key: i.path, title: i.label, hint: 'Page', to: i.path });
    for (const o of data?.orders || []) if (can(['sales', 'store', 'supervisor', 'accounts']) && [o.id, o.buyer, o.fabric_type, o.colour].some((v) => has(v, term)))
      results.push({ key: `o${o.id}`, title: `Order #${o.id}, ${o.fabric_type}`, hint: o.buyer, to: '/orders' });
    for (const m of data?.machines || []) if (can(['supervisor']) && has(m.name, term)) results.push({ key: `m${m.id}`, title: m.name, hint: `Machine, ${m.status}`, to: '/machines' });
    for (const m of data?.stock || []) if (can(['store', 'supervisor', 'accounts', 'sales']) && has(m.name, term)) results.push({ key: `s${m.id}`, title: m.name, hint: `${m.on_hand} ${m.unit} in stock`, to: '/stock' });
  }
  const shown = results.slice(0, 8);
  function go(r) { if (!r) return; setOpen(false); setQ(''); nav(r.to); }
  function onKey(e) {
    if (e.key === 'Escape') setOpen(false);
    else if (e.key === 'ArrowDown') { e.preventDefault(); setPos((p) => Math.min(p + 1, shown.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setPos((p) => Math.max(p - 1, 0)); }
    else if (e.key === 'Enter') go(shown[pos]);
  }
  return (
    <div className="search" ref={box} role="search">
      <Icon name="search" />
      <input type="search" placeholder="Search orders, machines, materials" aria-label="Search" value={q} autoComplete="off"
        onFocus={() => { setOpen(true); load(); }} onChange={(e) => { setQ(e.target.value); setPos(0); setOpen(true); }} onKeyDown={onKey} />
      {open && term && (
        <div className="search-menu">
          {shown.length ? shown.map((r, i) => (
            <button key={r.key} className={`search-item ${i === pos ? 'on' : ''}`} onMouseEnter={() => setPos(i)} onClick={() => go(r)}><span>{r.title}</span><small>{r.hint}</small></button>))
            : <div className="search-none">{data ? 'No matches.' : 'Searching'}</div>}
        </div>)}
    </div>
  );
}
