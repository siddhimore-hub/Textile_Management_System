// OWNER: M4. Owner-only: add people, change roles, switch accounts off. Everyone: change own password.
import { useState } from 'react';
import { useLive, useAction } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import EntryForm from '../components/EntryForm.jsx';
import Msg from '../components/Msg.jsx';

const ROLES = ['owner', 'store', 'supervisor', 'qc', 'sales', 'accounts'];

export default function Users() {
  const { user } = useAuth();
  const users = useLive('/users');
  const [run, msg] = useAction(users.reload);
  const [pw, setPw] = useState({ current: '', next: '' }); const [runPw, pwMsg] = useAction();
  return (
    <>
      <EntryForm title="Add a user" endpoint="/users" submitLabel="Add user" onDone={users.reload} fields={[
        { name: 'name', label: 'Name' }, { name: 'email', label: 'Email', type: 'email' },
        { name: 'role', label: 'Role', options: ROLES.map((r) => ({ value: r, label: r })) }, { name: 'password', label: 'First password (8+ characters)', type: 'password' }]} />
      <Msg msg={msg} />
      {users.data && <div className="table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th /></tr></thead>
        <tbody>{users.data.map((u) => (
          <tr key={u.id}><td>{u.name}</td><td>{u.email}</td>
            <td><select value={u.role} disabled={u.id === user.id} onChange={(e) => run(`/users/${u.id}`, { method: 'PATCH', body: { role: e.target.value } })}>{ROLES.map((r) => <option key={r}>{r}</option>)}</select></td>
            <td><span className={`pill ${u.active ? 'ok' : 'muted'}`}>{u.active ? 'active' : 'switched off'}</span></td>
            <td>{u.id !== user.id && <button className="btn ghost" onClick={() => run(`/users/${u.id}`, { method: 'PATCH', body: { active: !u.active } })}>{u.active ? 'Switch off' : 'Switch on'}</button>}</td></tr>))}</tbody></table></div>}
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
