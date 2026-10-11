// Test helper: each test file runs in its own process with its own temporary database.
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mill-test-'));
process.env.DB_FILE = path.join(dir, 'mill.db');

const { app } = await import('../src/app.js');
const { db } = await import('../src/lib/db.js');
export { db };

export const server = await new Promise((res) => { const s = app.listen(0, () => res(s)); });
export const base = `http://127.0.0.1:${server.address().port}/api`;
export const stop = () => { server.close(); server.closeAllConnections?.(); };

const EMAILS = { owner: 'owner@everest.test', store: 'store@everest.test', supervisor: 'sup@everest.test', qc: 'qc@everest.test', sales: 'sales@everest.test', accounts: 'acc@everest.test' };
const tokens = {};

// call('/orders', { role: 'sales', method: 'POST', body, headers }) -> { status, body, headers }
export async function call(p, { role = 'owner', token, method = 'GET', body, headers = {} } = {}) {
  if (role && !token && !tokens[role]) {
    const r = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: EMAILS[role], password: 'everest123' }) });
    tokens[role] = (await r.json()).data.token;
  }
  const t = token ?? (role ? tokens[role] : null);
  const res = await fetch(`${base}${p}`, { method, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}), ...headers }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, body: json, data: json.data, error: json.error, headers: res.headers };
}
export const anon = (p, o = {}) => call(p, { ...o, role: null });
export const resetTokens = () => { for (const k of Object.keys(tokens)) delete tokens[k]; };
export const inDays = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

// Creates stock + an order with a yarn requirement; returns ids.
export async function makeOrder({ metres = 1000, deadline = inDays(14), yarn = 300, receive = 500 } = {}) {
  if (receive) await call('/receipts', { role: 'store', method: 'POST', body: { material_id: 1, supplier_id: 1, qty: receive, lot_no: `LOT-${Math.random().toString(16).slice(2, 6)}` } });
  const o = await call('/orders', { role: 'sales', method: 'POST', body: { buyer_id: 1, fabric_type: 'poplin', colour: 'white', qty_metres: metres, price_per_metre: 100, deadline, requirements: yarn ? [{ material_id: 1, qty_required: yarn }] : [] } });
  return o.data;
}

// Runs an order through every stage (spinning -> weaving -> dyeing -> finishing). Machines used
// here become idle again because each job is completed. Returns the job ids for each stage.
// Pass `spinning` to continue from a spinning job that is already running on machine 1.
export async function pipeline(orderId, { metres = 100, log = true, spinning } = {}) {
  const finishingMachine = db.prepare("SELECT id FROM machines WHERE stage='finishing' LIMIT 1").get().id;
  const make = async (body) => call('/jobs', { role: 'supervisor', method: 'POST', body });
  const output = async (id) => { if (log) await call(`/jobs/${id}/output`, { role: 'supervisor', method: 'POST', body: { metres } }); };
  const finish = (id) => call(`/jobs/${id}/finish`, { role: 'supervisor', method: 'POST' });
  const spin = spinning ? { data: { id: spinning } } : await make({ order_id: orderId, machine_id: 1, shift: 'morning' });
  if (spin.error) return { error: spin.error };
  await output(spin.data.id); await finish(spin.data.id);
  const weave = await make({ source_job_id: spin.data.id, machine_id: 2, shift: 'morning' });
  await output(weave.data.id); await finish(weave.data.id);
  const dye = await make({ source_job_id: weave.data.id, machine_id: 4, shift: 'morning' });
  await output(dye.data.id); await finish(dye.data.id);
  const fin = await make({ source_job_id: dye.data.id, machine_id: finishingMachine, shift: 'morning' });
  await output(fin.data.id); await finish(fin.data.id);
  return { spinning: spin.data.id, weaving: weave.data.id, dyeing: dye.data.id, finishing: fin.data.id, metres };
}
