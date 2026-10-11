// OWNER: M4. Owner-only: add people (base role + extra permissions), change roles/permissions,
// switch accounts off. Everyone: change own password.
import { useState } from 'react';
import { useLive, useAction } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import Msg from '../components/Msg.jsx';

const ROLES = ['owner', 'store', 'supervisor', 'qc', 'sales', 'accounts'];
// Extra grants an administrator can tick. A user gets their base role plus anything ticked here.
const EXTRA = ['sales', 'store', 'supervisor', 'qc', 'accounts', 'products', 'admin'];

function PermChecks({ baseRole, current, onToggle, disabled }) {
  const available = EXTRA.filter((p) => p !== baseRole);
  return <div className="fields row">{available.map((p) => (
    <label key={p} className="check"><input type="checkbox" disabled={disabled} checked={current.includes(p)} onChange={() => onToggle(p)} /> {p}</label>))}</div>;
}

export default function Users() {
  const { user } = useAuth();
  const users = useLive('/users', ['auth']);
  const [run, msg] = useAction(users.reload);
  const fe = msg?.fields || {};
  const [pw, setPw] = useState({ current: '', next: '' }); const [runPw, pwMsg] = useAction();
  const [f, setF] = useState({ name: '', email: '', role: 'store', password: '', permissions: [] });
  const [openId, setOpenId] = useState(null);
  const toggle = (list, p) => (list.includes(p) ? list.filter((x) => x !== p) : [...list, p]);
  async function add(e) { e.preventDefault(); if (await run('/users', { method: 'POST', body: f })) setF({ name: '', email: '', role: 'store', password: '', permissions: [] }); }
  async function setRole(u, role) { await run(`/users/${u.id}`, { method: 'PATCH', body: { role, permissions: [] } }); }
  async function setPerms(u, permissions) { await run(`/users/${u.id}`, { method: 'PATCH', body: { permissions } }); }

  return (
    <>
      <form className="card form" onSubmit={add} noValidate><h2>Add a user</h2>
        <div className="fields">
          <label className={fe.name ? 'has-error' : ''}><span>Name</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />{fe.name && <small className="err">{fe.name}</small>}</label>
          <label className={fe.email ? 'has-error' : ''}><span>Email</span><input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />{fe.email && <small className="err">{fe.email}</small>}</label>
          <label><span>Base role</span><select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value, permissions: f.permissions.filter((p) => p !== e.target.value) })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></label>
          <label className={fe.password ? 'has-error' : ''}><span>First password (8+ characters)</span><input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />{fe.password && <small className="err">{fe.password}</small>}</label>
        </div>
        <p className="muted">Extra permissions (the base role already covers its own job; tick more to combine roles like Sales + QC).</p>
        <PermChecks baseRole={f.role} current={f.permissions} onToggle={(p) => setF({ ...f, permissions: toggle(f.permissions, p) })} />
        <div className="form-foot"><button className="btn" type="submit">Add user</button><Msg msg={msg} /></div>
      </form>

      {users.data && <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Base role</th><th>Permissions</th><th>Status</th><th /></tr></thead>
        <tbody>{users.data.map((u) => (
          <tr key={u.id}><td>{u.name}</td><td>{u.email}</td>
            <td><select value={u.role} disabled={u.id === user.id} onChange={(e) => setRole(u, e.target.value)}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></td>
            <td>{(u.permissions || []).map((p) => <span key={p} className="pill info" style={{ marginRight: '.25rem' }}>{p}</span>)}</td>
            <td><span className={`pill ${u.active ? 'ok' : 'muted'}`}>{u.active ? 'active' : 'switched off'}</span></td>
            <td>{u.role !== 'owner' && <button className="btn ghost tiny" onClick={() => setOpenId(openId === u.id ? null : u.id)}>{openId === u.id ? 'Done' : 'Permissions'}</button>}
              {u.id !== user.id && <button className="btn ghost" onClick={() => run(`/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } })}>{u.active ? 'Switch off' : 'Switch on'}</button>}</td></tr>))}</tbody></table></div>}
      {openId && (() => { const u = users.data?.find((x) => x.id === openId); if (!u) return null; return (
        <div className="card"><h3 className="sub">Extra permissions for {u.name}</h3>
          <p className="muted">Effective access: {u.role} plus {EXTRA.filter((p) => p !== u.role && (u.permissions || []).includes(p)).join(', ') || 'none'}.</p>
          <PermChecks baseRole={u.role} current={u.permissions || []} onToggle={(p) => setPerms(u, toggle(u.permissions || [], p))} />
          <Msg msg={msg} /></div>); })()}

      <form className="card form" onSubmit={(e) => { e.preventDefault(); runPw('/auth/password', { method: 'POST', body: pw }).then((d) => d && setPw({ current: '', next: '' })); }}>
        <h2>Change my password</h2>
        <div className="fields">
          <label><span>Current password</span><input type="password" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} /></label>
          <label><span>New password (8+ characters)</span><input type="password" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} /></label>
        </div>
        <div className="form-foot"><button className="btn" type="submit">Change password</button>{pwMsg && <span className={pwMsg.ok ? 'msg-ok' : 'err'}>{pwMsg.fields?.next || pwMsg.text}</span>}</div>
      </form>
    </>
  );
}
