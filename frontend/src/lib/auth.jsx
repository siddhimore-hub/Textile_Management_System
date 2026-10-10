// Who is logged in, and what they may see. Role rules are enforced by the server; this only hides what they cannot use.
import { createContext, useContext, useEffect, useState } from 'react';
import { api, getToken, setToken, resetLive, flushQueue } from './api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);
const cached = () => { try { return JSON.parse(localStorage.getItem('mill_user')); } catch { return null; } };

export function AuthProvider({ children }) {
  const [user, setUser] = useState(getToken() ? cached() : null);
  // With a saved login, show the app straight away (works offline too) and re-check the session in the background.
  const [ready, setReady] = useState(!getToken() || !!cached());
  useEffect(() => {
    if (getToken()) api('/auth/me').then((u) => { setUser(u); localStorage.setItem('mill_user', JSON.stringify(u)); })
      .catch((e) => { if (!e.network) setUser(null); }) // offline: keep the saved user so the floor can keep working
      .finally(() => setReady(true));
    const out = () => setUser(null);
    window.addEventListener('mill-auth-expired', out);
    return () => window.removeEventListener('mill-auth-expired', out);
  }, []);
  async function login(email, password) {
    const d = await api('/auth/login', { method: 'POST', body: { email, password } });
    setToken(d.token); localStorage.setItem('mill_user', JSON.stringify(d.user)); setUser(d.user); resetLive(); flushQueue();
  }
  async function logout() {
    try { await api('/auth/logout', { method: 'POST' }); } catch { /* offline logout still clears this device */ }
    setToken(null); localStorage.removeItem('mill_user'); setUser(null); resetLive();
    if (globalThis.caches) caches.delete('mill-api'); // do not leave one user's data cached for the next
  }
  // can(['store','sales']) is true for those roles, and always for the owner. can() with no list = any logged-in user.
  const can = (roles) => !!user && (!roles || user.role === 'owner' || roles.includes(user.role));
  return <Ctx.Provider value={{ user, ready, login, logout, can }}>{children}</Ctx.Provider>;
}
