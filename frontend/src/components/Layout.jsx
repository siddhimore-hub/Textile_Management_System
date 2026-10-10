import { useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { NAV, ALL_ITEMS } from '../lib/modules.js';
import { useAuth } from '../lib/auth.jsx';
import { initials } from '../lib/format.js';
import Bell from './Bell.jsx';
import Brand, { FabricArt } from './Brand.jsx';
import Icon, { PAGE_ICON } from './Icon.jsx';
import OfflineBanner from './OfflineBanner.jsx';
import Search from './Search.jsx';

export default function Layout() {
  const [open, setOpen] = useState(false); const [menu, setMenu] = useState(false);
  const { pathname } = useLocation();
  const { user, can, logout } = useAuth();
  const current = ALL_ITEMS.find((i) => i.path === pathname)?.label;
  return (
    <div className="shell">
      <aside className={`sidebar ${open ? 'open' : ''}`} aria-label="Main menu">
        <Brand />
        <nav>
          {NAV.map((g) => {
            const items = g.items.filter((i) => !i.roles || can(i.roles));
            return items.length > 0 && (
              <div className="nav-group" key={g.group}>
                <p className="nav-title">{g.group}</p>
                {items.map((i) => (
                  <NavLink key={i.path} to={i.path} end={i.path === '/'} onClick={() => setOpen(false)} className="nav-link">
                    <Icon name={PAGE_ICON[i.path]} /><span>{i.label}</span>
                  </NavLink>))}
              </div>);
          })}
        </nav>
        <FabricArt />
      </aside>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <div className="main">
        <header className="navbar">
          <button className="menu-btn" onClick={() => setOpen(true)} aria-label="Open menu"><Icon name="menu" /></button>
          <Search />
          <div className="nav-right">
            <Bell />
            <div className="user-wrap">
              <button className="user-chip" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-label="Account menu">
                <span className="avatar">{initials(user?.name)}</span>
                <span><b>{user?.name}</b><small>{user?.role}</small></span><Icon name="down" />
              </button>
              {menu && <div className="user-menu"><button className="search-item" onClick={logout}><Icon name="logout" />Log out</button></div>}
            </div>
          </div>
        </header>
        <OfflineBanner />
        <main className="content">
          {pathname !== '/' && current && <h1 className="page-title">{current}</h1>}
          <Outlet />
        </main>
      </div>
    </div>
  );
}
