// Server-renders the real <App> at a URL for a given role (first paint only; data loads happen in the browser).
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import App from '../src/App.jsx';
import { AuthProvider } from '../src/lib/auth.jsx';

export const render = (url, role) => {
  if (role) { localStorage.setItem('mill_token', 't'); localStorage.setItem('mill_user', JSON.stringify({ id: 1, name: 'Test', email: 't@e', role })); }
  else { localStorage.clear(); }
  return renderToString(<StaticRouter location={url}><AuthProvider><App /></AuthProvider></StaticRouter>);
};
