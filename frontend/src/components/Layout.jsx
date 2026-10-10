import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { NAV, ALL_ITEMS } from '../lib/modules.js';

export default function Layout() {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();
  const current = ALL_ITEMS.find((i) => i.path === pathname)?.label ?? 'Everest Textile Mills';
  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Main menu">
        <div className="brand">Everest<span>Textile Mills</span></div>
        <nav>
          {NAV.map((g) => (
            <div className="nav-group" key={g.group}>
              <p className="nav-title">{g.group}</p>
              {g.items.map((i) => (
                <NavLink key={i.path} to={i.path} end={i.path === '/'} onClick={() => setOpen(false)} className="nav-link">
                  <span>{i.label}</span><em className="owner">{i.owner}</em>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <div className="main">
        <header className="navbar">
          <button className="menu-btn" onClick={() => setOpen(true)} aria-label="Open menu">Menu</button>
          <h1>{current}</h1>
          <div className="nav-right"><span className="pill ok">Live</span><span className="user">Owner</span></div>
        </header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}
