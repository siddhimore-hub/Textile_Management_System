import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import Brand from '../components/Brand.jsx';
import Icon from '../components/Icon.jsx';
import Msg from '../components/Msg.jsx';

export default function Login() {
  const { user, login } = useAuth();
  const [params] = useSearchParams();
  const next = params.get('next');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState(''); const [show, setShow] = useState(false); const [msg, setMsg] = useState(null); const [busy, setBusy] = useState(false);
  if (user) return <Navigate to={next && next.startsWith('/') ? next : '/'} replace />;
  async function submit(e) {
    e.preventDefault(); setBusy(true); setMsg(null);
    try { await login(email, password); } catch (err) { setMsg({ ok: false, text: err.message }); } finally { setBusy(false); }
  }
  return (
    <div className="login-page">
      <form className="login-card form" onSubmit={submit}>
        <Brand dark />
        <h2>Log in</h2>
        <div className="fields one">
          <label><span>Email</span><input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></label>
          <label><span>Password</span>
            <span className="pw-field">
              <input type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button type="button" className="pw-toggle" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} title={show ? 'Hide password' : 'Show password'}>
                <Icon name={show ? 'eyeOff' : 'eye'} />
              </button>
            </span>
          </label>
        </div>
        <div className="form-foot"><button className="btn" type="submit" disabled={busy}>{busy ? 'Logging in' : 'Log in'}</button><Msg msg={msg} /></div>
      </form>
    </div>
  );
}
