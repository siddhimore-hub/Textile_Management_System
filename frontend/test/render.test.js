// Every route renders without crashing, logged-out users are sent to login, and roles only see their menu.
import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'vite';

const store = new Map();
globalThis.localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k), clear: () => store.clear() };
globalThis.window = Object.assign(new EventTarget(), { location: { origin: 'http://localhost' } });
globalThis.location = window.location;
let vite; let render;
before(async () => { vite = await createServer({ server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' }); ({ render } = await vite.ssrLoadModule('/test/render-entry.jsx')); });
after(() => vite.close());

const ROUTES = ['/', '/orders', '/stock', '/purchase-requests', '/parties', '/supplier-history', '/products', '/runs', '/machines', '/spinning', '/loom', '/dyeing', '/finishing', '/rolls', '/finished', '/dispatches', '/invoices', '/buyer-history', '/invoice/1', '/pending-payments',
  '/attendance', '/payroll', '/costs', '/income-expenses', '/users', '/audit', '/scan/R-2026-00001', '/labels?ids=1,2', '/nope'];

test('every route renders for the owner', () => {
  for (const r of ROUTES) assert.doesNotThrow(() => render(r, 'owner'), r);
});
test('every route renders for every other role (page or "no access", never a crash)', () => {
  for (const role of ['store', 'supervisor', 'qc', 'sales', 'accounts']) for (const r of ROUTES) assert.doesNotThrow(() => render(r, role), `${role} ${r}`);
});
test('logged-out visitors are sent to login; the buyer tracking page stays public', () => {
  assert.equal(render('/orders', null), ''); // redirect to /login: nothing from the app is drawn
  assert.match(render('/login', null), /Log in/);
  assert.doesNotMatch(render('/track/abc', null), /Log in/);
});
test('menus are filtered by role', () => {
  const owner = render('/', 'owner'); const qc = render('/', 'qc'); const store = render('/', 'store');
  assert.match(owner, /Audit log/); assert.match(owner, /Users and roles/);
  assert.doesNotMatch(qc, /Audit log/); assert.doesNotMatch(qc, /Wages/); assert.match(qc, /Rolls and quality/);
  assert.match(store, /Purchase requests/); assert.doesNotMatch(store, /Machines</);
});
test('a page the role cannot use says so', () => {
  assert.match(render('/audit', 'sales'), /does not have access/);
  assert.match(render('/payroll', 'qc'), /does not have access/);
});
