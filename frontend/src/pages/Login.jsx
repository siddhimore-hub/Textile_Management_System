import { useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { Logo } from '../components/Brand.jsx';
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
      <section className="login-brand" aria-label="Everest Textile Mills">
        <div className="login-brand-inner">
          <Logo />
          <h1>Everest Textile Mills</h1>
          <p className="login-sub">Manufacturing Management System</p>
          <hr />
          <p className="login-tagline">Weaving Progress,<br />Stitching a Better Tomorrow</p>
        </div>
        <ul className="login-values">
          <li><Icon name="leaf" /><span>Quality<br />Production</span></li>
          <li><Icon name="cog" /><span>Efficient<br />Management</span></li>
          <li><Icon name="growth" /><span>Sustainable<br />Growth</span></li>
        </ul>
      </section>
      <div className="login-side">
        <form className="login-card form" onSubmit={submit}>
          <h2>Welcome Back</h2>
          <p className="login-lead">Sign in to access your account</p>
          <div className="fields one">
            <label><span className="sr-only">Email</span>
              <span className="field-wrap"><Icon name="user" /><input type="email" placeholder="Email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></span>
            </label>
            <label><span className="sr-only">Password</span>
              <span className="pw-field field-wrap"><Icon name="lock" />
                <input type={show ? 'text' : 'password'} placeholder="Password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
                <button type="button" className="pw-toggle" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} title={show ? 'Hide password' : 'Show password'}>
                  <Icon name={show ? 'eyeOff' : 'eye'} />
                </button>
              </span>
            </label>
          </div>
          <div className="form-foot"><button className="btn" type="submit" disabled={busy}><Icon name="login" />{busy ? 'Logging in' : 'Log in'}</button><Msg msg={msg} /></div>
          <div className="login-foot"><b>Everest Textile Mills</b><span>People <i>|</i> Process <i>|</i> Performance</span></div>
        </form>
      </div>
    </div>
  );
}
