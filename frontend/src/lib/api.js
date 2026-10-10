// All server calls go through here. Never use fetch() directly in pages.
import { useEffect, useState, useCallback } from 'react';

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) { const e = new Error(json.error?.message || 'Request failed'); e.fields = json.error?.fields; throw e; }
  return json.data;
}

// Live data: fetches, then refetches whenever the server publishes one of `topics` (Server-Sent Events).
let source;
const listeners = new Set();
function ensureSource() {
  if (source || typeof EventSource === 'undefined') return;
  source = new EventSource('/api/events');
  source.onmessage = (e) => listeners.forEach((l) => l(JSON.parse(e.data).topic));
}
export function useLive(path, topics = []) {
  const [state, set] = useState({ data: null, error: null, loading: true });
  const load = useCallback(() => api(path).then((data) => set({ data, error: null, loading: false }), (error) => set({ data: null, error, loading: false })), [path]);
  useEffect(() => {
    load(); ensureSource();
    const l = (t) => topics.includes(t) && load();
    listeners.add(l);
    return () => listeners.delete(l);
  }, [load]); // eslint-disable-line react-hooks/exhaustive-deps
  return { ...state, reload: load };
}

// Run a write action and keep its result message. Usage: const [run, msg] = useAction(reload); run('/jobs', {method:'POST', body})
export function useAction(after) {
  const [msg, setMsg] = useState(null);
  const run = async (path, opts) => {
    try { const d = await api(path, opts); setMsg({ ok: true, text: 'Saved' }); after?.(); return d; }
    catch (e) { setMsg({ ok: false, text: e.message, fields: e.fields }); return null; }
  };
  return [run, msg];
}
export const opts = (rows, label = 'name') => (rows || []).map((r) => ({ value: r.id, label: typeof label === 'function' ? label(r) : r[label] }));
