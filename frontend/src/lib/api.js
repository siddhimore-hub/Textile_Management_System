// All server calls go through here. Never use fetch() directly in pages.
// Adds the login token, and keeps floor entries safe when the network drops (offline queue, see bottom).
import { useEffect, useState, useCallback } from 'react';

const TOKEN_KEY = 'mill_token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => (t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY));

const uuid = () => (globalThis.crypto?.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

// One real request. Throws Error with .status, .code, .fields; .network = true when the server could not be reached.
async function send(path, method, body, key) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (key) headers['Idempotency-Key'] = key;
  let res;
  try { res = await fetch(`/api${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined }); }
  catch { const e = new Error('No connection to the server'); e.network = true; throw e; }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && path !== '/auth/login') { setToken(null); window.dispatchEvent(new Event('mill-auth-expired')); }
    const e = new Error(json.error?.message || 'Request failed');
    e.status = res.status; e.code = json.error?.code; e.fields = json.error?.fields; throw e;
  }
  return json.data;
}

export async function api(path, { method = 'GET', body } = {}) {
  const write = method !== 'GET';
  const key = write ? uuid() : undefined;
  try { return await send(path, method, body, key); }
  catch (e) {
    if (e.network && write && QUEUEABLE.some(([m, re]) => m === method && re.test(path))) {
      enqueue({ path, method, body, key });
      return { queued: true };
    }
    throw e;
  }
}

// Live data: fetches, then refetches whenever the server publishes one of `topics` (Server-Sent Events).
let source;
const listeners = new Set();
function ensureSource() {
  if (source || typeof EventSource === 'undefined' || !getToken()) return;
  source = new EventSource(`/api/events?token=${encodeURIComponent(getToken())}`);
  source.onmessage = (e) => listeners.forEach((l) => l(JSON.parse(e.data).topic));
}
export function resetLive() { source?.close(); source = null; ensureSource(); } // call after login / logout
export function useLive(path, topics = []) {
  const [state, set] = useState({ data: null, error: null, loading: true });
  const load = useCallback(() => api(path).then((data) => set({ data, error: null, loading: false }), (error) => set({ data: null, error, loading: false })), [path]);
  useEffect(() => {
    load(); ensureSource();
    const l = (t) => topics.includes(t) && load();
    listeners.add(l);
    const online = () => load();
    window.addEventListener('online', online);
    return () => { listeners.delete(l); window.removeEventListener('online', online); };
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload: load };
}

// Run a write action and keep its result message. Usage: const [run, msg] = useAction(reload); run('/jobs', {method:'POST', body})
export function useAction(after) {
  const [msg, setMsg] = useState(null);
  const run = async (path, opts) => {
    try {
      const d = await api(path, opts);
      setMsg({ ok: true, text: d?.queued ? 'Saved on this phone. It will be sent when you are back online.' : 'Saved' });
      after?.(); return d;
    } catch (e) { setMsg({ ok: false, text: e.message, fields: e.fields }); return null; }
  };
  return [run, msg];
}
export const opts = (rows, label = 'name') => (rows || []).map((r) => ({ value: r.id, label: typeof label === 'function' ? label(r) : r[label] }));

// ---------- Offline queue ----------
// Floor entries (output, new roll, inspection, attendance, machine status) are saved on the device when the network is
// down and sent in order when it returns. Each carries an Idempotency-Key, so a retry never writes twice.
const QUEUEABLE = [
  ['POST', /^\/jobs\/\d+\/output$/], ['POST', /^\/rolls$/], ['POST', /^\/rolls\/\d+\/inspect$/],
  ['POST', /^\/attendance$/], ['PATCH', /^\/machines\/\d+\/status$/],
];
const QKEY = 'mill_queue'; const FKEY = 'mill_queue_failed';
const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch { return []; } };
const write = (k, v) => { localStorage.setItem(k, JSON.stringify(v)); window.dispatchEvent(new Event('mill-queue')); };
export const queueState = () => ({ pending: read(QKEY), failed: read(FKEY) });
export const dismissFailed = () => write(FKEY, []);
function enqueue(item) { write(QKEY, [...read(QKEY), { ...item, at: Date.now() }]); }

let flushing = false;
export async function flushQueue() {
  if (flushing || !getToken()) return;
  flushing = true;
  try {
    for (;;) {
      const [item] = read(QKEY);
      if (!item) break;
      try { await send(item.path, item.method, item.body, item.key); write(QKEY, read(QKEY).slice(1)); }
      catch (e) {
        if (e.network || e.status === 401) break; // still offline, or must log in again: keep everything
        write(QKEY, read(QKEY).slice(1)); // the server refused it (rule broken): do not retry forever
        write(FKEY, [...read(FKEY), { ...item, error: e.message }]);
      }
    }
  } finally { flushing = false; }
}
export function useQueue() {
  const [s, set] = useState(queueState());
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const upd = () => set(queueState());
    const on = () => { setOnline(true); flushQueue(); }; const off = () => setOnline(false);
    window.addEventListener('mill-queue', upd); window.addEventListener('online', on); window.addEventListener('offline', off);
    const t = setInterval(flushQueue, 20000); flushQueue();
    return () => { window.removeEventListener('mill-queue', upd); window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(t); };
  }, []);
  return { ...s, online };
}
