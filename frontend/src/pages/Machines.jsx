// OWNER: M2. Live machine board with job actions.
import { useState } from 'react';
import { useLive, useAction, opts } from '../lib/api.js';
import { Pill } from '../components/DataTable.jsx';
import Msg from '../components/Msg.jsx';

function Card({ m, orders, reload }) {
  const [run, msg] = useAction(reload);
  const [order, setOrder] = useState(''); const [shift, setShift] = useState('morning'); const [metres, setMetres] = useState('');
  return (
    <div className="card machine">
      <div className="mhead"><h3>{m.name}</h3><Pill v={m.status} /></div>
      <p className="muted">{m.stage}{m.order_id ? `, order ${m.order_id}` : ''}. Today: {m.today_metres} m</p>
      {m.status === 'idle' && (<div className="fields row">
        <select value={order} onChange={(e) => setOrder(e.target.value)}><option value="">Order</option>{opts(orders, (o) => `#${o.id} ${o.fabric_type}`).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        <select value={shift} onChange={(e) => setShift(e.target.value)}>{['morning', 'evening', 'night'].map((s) => <option key={s}>{s}</option>)}</select>
        <button className="btn" onClick={() => run('/jobs', { method: 'POST', body: { order_id: order, machine_id: m.id, shift } })}>Assign job</button></div>)}
      {m.status === 'running' && m.job_id && (<div className="fields row">
        <input type="number" placeholder="Metres made" value={metres} onChange={(e) => setMetres(e.target.value)} />
        <button className="btn" onClick={async () => { await run(`/jobs/${m.job_id}/output`, { method: 'POST', body: { metres } }); setMetres(''); }}>Log output</button>
        <button className="btn ghost" onClick={() => run(`/jobs/${m.job_id}/finish`, { method: 'POST' })}>Finish job</button></div>)}
      <div className="form-foot">
        <select value="" onChange={(e) => e.target.value && run(`/machines/${m.id}/status`, { method: 'PATCH', body: { status: e.target.value } })}>
          <option value="">Change status</option>{['idle', 'running', 'breakdown', 'maintenance'].map((s) => <option key={s}>{s}</option>)}</select>
        <Msg msg={msg} /></div>
    </div>);
}
export default function Machines() {
  const ms = useLive('/machines', ['machines']); const orders = useLive('/orders', ['orders']);
  if (!ms.data) return <div className="empty">Loading</div>;
  return <div className="grid">{ms.data.map((m) => <Card key={m.id} m={m} orders={orders.data || []} reload={ms.reload} />)}</div>;
}
