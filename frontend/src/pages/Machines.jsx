// OWNER: M2. Live machine board with job actions, add-machine, and produce for stock.
import { useState } from 'react';
import { api, useLive, useAction, opts } from '../lib/api.js';
import { Pill } from '../components/DataTable.jsx';
import Msg from '../components/Msg.jsx';
import { useAuth } from '../lib/auth.jsx';

const STAGES = ['spinning', 'weaving', 'dyeing', 'finishing'];

function Card({ m, orders, reload }) {
  const { can } = useAuth(); const edit = can(['supervisor']);
  const [run, msg] = useAction(reload);
  const [order, setOrder] = useState(''); const [shift, setShift] = useState('morning'); const [metres, setMetres] = useState('');
  return (
    <div className="card machine">
      <div className="mhead"><h3>{m.name}</h3><Pill v={m.status} /></div>
      <p className="muted">{m.stage}{m.job_id ? `, job ${m.job_id}` : ''}{m.order_id ? `, order ${m.order_id}${m.is_internal ? ' (stock)' : ''}` : ''}. Today: {m.today_metres} m</p>
      {edit && m.stage === 'spinning' && m.status === 'idle' && (<div className="fields row">
        <select value={order} onChange={(e) => setOrder(e.target.value)}><option value="">Order</option>{opts(orders, (o) => `#${o.id} ${o.fabric_type}`).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        <select value={shift} onChange={(e) => setShift(e.target.value)}>{['morning', 'evening', 'night'].map((s) => <option key={s}>{s}</option>)}</select>
        <button className="btn" onClick={() => run('/jobs', { method: 'POST', body: { order_id: order, machine_id: m.id, shift } })}>Assign job</button></div>)}
      {edit && m.status === 'running' && m.job_id && (<div className="fields row">
        <input type="number" placeholder="Metres made" value={metres} onChange={(e) => setMetres(e.target.value)} />
        <button className="btn" onClick={async () => { await run(`/jobs/${m.job_id}/output`, { method: 'POST', body: { metres } }); setMetres(''); }}>Log output</button>
        <button className="btn ghost" onClick={() => run(`/jobs/${m.job_id}/finish`, { method: 'POST' })}>Finish job</button></div>)}
      {edit && m.stage !== 'spinning' && m.status === 'idle' && (
        <p className="muted">Assign from the {m.stage === 'weaving' ? 'Loom' : m.stage} page, after the previous stage is completed.</p>)}
      {edit && <div className="form-foot">
        <select value="" onChange={(e) => e.target.value && run(`/machines/${m.id}/status`, { method: 'PATCH', body: { status: e.target.value } })}>
          <option value="">Change status</option>{['idle', 'running', 'breakdown', 'maintenance'].map((s) => <option key={s}>{s}</option>)}</select>
        <Msg msg={msg} /></div>}
    </div>);
}

function AddMachine({ reload }) {
  const [run, msg] = useAction(reload); const fe = msg?.fields || {};
  const [f, setF] = useState({ name: '', stage: 'spinning', status: 'idle' });
  return (
    <form className="card form" onSubmit={(e) => { e.preventDefault(); run('/machines', { method: 'POST', body: f }).then((d) => d && setF({ name: '', stage: 'spinning', status: 'idle' })); }} noValidate>
      <h2>Add a machine</h2>
      <div className="fields">
        <label className={fe.name ? 'has-error' : ''}><span>Name / number</span>
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />{fe.name && <small className="err">{fe.name}</small>}</label>
        <label><span>Stage</span><select value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select></label>
      </div>
      <div className="form-foot"><button className="btn" type="submit">Add machine</button><Msg msg={msg} /></div>
    </form>);
}

function StockForm({ reload }) {
  const fabrics = useLive('/compatibility/fabrics'); const mats = useLive('/materials');
  const machines = useLive('/machines', ['machines']);
  const [run, msg] = useAction(reload); const fe = msg?.fields || {};
  const [f, setF] = useState({ fabric_type: '', colour: '', qty_metres: '', shift: 'morning', machine_id: '' });
  const [reqs, setReqs] = useState([{ material_id: '', qty_required: '', blend_ratio: '' }]);
  const [allowed, setAllowed] = useState(null);
  const idle = (machines.data || []).filter((m) => m.stage === 'spinning' && m.status === 'idle');
  const materialOptions = (allowed?.length ? allowed : mats.data || []).filter((m) => !allowed?.length || allowed.some((x) => x.id === m.id));
  async function pickFabric(fabric_type) {
    setF({ ...f, fabric_type });
    try { const list = await api(`/compatibility/materials?fabric_type=${encodeURIComponent(fabric_type)}`); setAllowed(Array.isArray(list) ? list : null); }
    catch { setAllowed(null); }
  }
  async function save(e) {
    e.preventDefault();
    const body = { ...f, requirements: reqs.filter((r) => r.material_id && r.qty_required) };
    const d = await run('/stock-production', { method: 'POST', body });
    if (d) { setF({ fabric_type: '', colour: '', qty_metres: '', shift: 'morning', machine_id: '' }); setReqs([{ material_id: '', qty_required: '', blend_ratio: '' }]); }
  }
  return (
    <form className="card form" onSubmit={save} noValidate><h2>Produce for stock</h2>
      <p className="muted">Make extra fabric with no customer order. It becomes an internal stock order and moves through the same QC and stock pipeline.</p>
      <div className="fields">
        <label className={fe.fabric_type ? 'has-error' : ''}><span>Fabric</span>
          <select value={f.fabric_type} onChange={(e) => pickFabric(e.target.value)}><option value="">Choose fabric</option>
            {opts(fabrics.data, (x) => x.fabric_type).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          {fe.fabric_type && <small className="err">{fe.fabric_type}</small>}</label>
        <label className={fe.colour ? 'has-error' : ''}><span>Colour</span><input value={f.colour} onChange={(e) => setF({ ...f, colour: e.target.value })} />{fe.colour && <small className="err">{fe.colour}</small>}</label>
        <label className={fe.qty_metres ? 'has-error' : ''}><span>Metres</span><input type="number" value={f.qty_metres} onChange={(e) => setF({ ...f, qty_metres: e.target.value })} />{fe.qty_metres && <small className="err">{fe.qty_metres}</small>}</label>
        <label><span>Shift</span><select value={f.shift} onChange={(e) => setF({ ...f, shift: e.target.value })}>{['morning', 'evening', 'night'].map((s) => <option key={s}>{s}</option>)}</select></label>
        {idle.length ? <label className={fe.machine_id ? 'has-error' : ''}><span>Machine</span>
          <select value={f.machine_id} onChange={(e) => setF({ ...f, machine_id: e.target.value })}><option value="">Choose a free spinning machine</option>
            {idle.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}</select>{fe.machine_id && <small className="err">{fe.machine_id}</small>}</label>
          : <span className="err">No free spinning machine. Finish a spinning job first.</span>}
      </div>
      <h3 className="sub">Yarn needed</h3>
      {reqs.map((r, i) => (
        <div className="fields row" key={i}>
          <select value={r.material_id} onChange={(e) => setReqs(reqs.map((x, j) => (j === i ? { ...x, material_id: e.target.value } : x)))}>
            <option value="">Material</option>{opts(materialOptions).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          <input type="number" placeholder="kg" value={r.qty_required} onChange={(e) => setReqs(reqs.map((x, j) => (j === i ? { ...x, qty_required: e.target.value } : x)))} />
          <input type="number" placeholder="Blend %" value={r.blend_ratio} onChange={(e) => setReqs(reqs.map((x, j) => (j === i ? { ...x, blend_ratio: e.target.value } : x)))} />
        </div>))}
      <button type="button" className="btn ghost" onClick={() => setReqs([...reqs, { material_id: '', qty_required: '', blend_ratio: '' }])}>Add yarn line</button>
      <div className="form-foot"><button className="btn" type="submit" disabled={!idle.length}>Start production</button><Msg msg={msg} /></div>
    </form>);
}

export default function Machines() {
  const { can } = useAuth(); const edit = can(['supervisor']);
  const ms = useLive('/machines', ['machines']); const orders = useLive('/orders/assignable', ['orders']);
  if (!ms.data) return <div className="empty">Loading</div>;
  return (
    <>{edit && <div className="grid two">{<AddMachine reload={ms.reload} />}{<StockForm reload={ms.reload} />}</div>}
      <div className="grid">{ms.data.map((m) => <Card key={m.id} m={m} orders={orders.data || []} reload={ms.reload} />)}</div></>);
}