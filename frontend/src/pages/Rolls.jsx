// OWNER: M2. Create rolls, inspect, defect report.
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth.jsx';
import { useLive, useAction, opts } from '../lib/api.js';
import DataTable, { Pill } from '../components/DataTable.jsx';
import Msg from '../components/Msg.jsx';

export function Inspect({ roll, reload }) {
  const [result, setResult] = useState('pass'); const [defect, setDefect] = useState(''); const [by, setBy] = useState('');
  const [run, msg] = useAction(reload); const fe = msg?.fields || {};
  return (<div className="fields row">
    <select value={result} onChange={(e) => setResult(e.target.value)}>{['pass', 'rework', 'reject'].map((s) => <option key={s}>{s}</option>)}</select>
    {result !== 'pass' && <select value={defect} onChange={(e) => setDefect(e.target.value)}><option value="">Defect</option>{['hole', 'colour_mismatch', 'uneven_weave', 'other'].map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}</select>}
    <input placeholder="Inspector name" value={by} onChange={(e) => setBy(e.target.value)} />
    <button className="btn" onClick={() => run(`/rolls/${roll.id}/inspect`, { method: 'POST', body: { result, defect_type: defect || undefined, inspector: by || undefined } })}>Save</button>
    {fe.defect_type && <small className="err">{fe.defect_type}</small>}{!fe.defect_type && <Msg msg={msg} />}</div>);
}

export default function Rolls() {
  const { can } = useAuth(); const go = useNavigate(); const [find, setFind] = useState('');
  const [tab, setTab] = useState('');
  const rolls = useLive(`/rolls${tab ? `?qc_status=${tab}` : ''}`, ['rolls']);
  const batches = useLive('/jobs/available?stage=finishing', ['machines', 'rolls']); const defects = useLive('/qc/defects', ['rolls']);
  const [job, setJob] = useState(''); const [metres, setMetres] = useState('');
  const [run, msg] = useAction(rolls.reload); const fe = msg?.fields || {};
  return (
    <>
      <form className="card form" onSubmit={(e) => { e.preventDefault(); if (find.trim()) go(`/scan/${encodeURIComponent(find.trim().toUpperCase())}`); }}>
        <div className="fields row"><input placeholder="Scan or type a roll code, e.g. R-2026-00001" value={find} onChange={(e) => setFind(e.target.value)} aria-label="Roll code" />
          <button className="btn" type="submit">Find roll</button><Link className="btn ghost" to="/labels">Print labels for rolls awaiting QC</Link></div></form>
      {can(['supervisor']) && <div className="card form"><h2>Create roll</h2><div className="fields">
        <label><span>Finished batch</span><select value={job} onChange={(e) => setJob(e.target.value)}><option value="">Choose</option>
          {opts(batches.data || [], (b) => `Order ${b.order_id}: ${b.fabric_type}, ${b.colour} — ${b.available_metres} m available`).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
        <label className={fe.metres ? 'has-error' : ''}><span>Metres</span><input type="number" value={metres} onChange={(e) => setMetres(e.target.value)} />{fe.metres && <small className="err">{fe.metres}</small>}</label></div>
        <div className="form-foot"><button className="btn" onClick={async () => { if (await run('/rolls', { method: 'POST', body: { job_card_id: job, metres } })) setMetres(''); }}>Create roll</button><Msg msg={msg} /></div></div>}

      <div className="tabs">{['', 'pending', 'rework', 'pass', 'reject'].map((t) => <button key={t} className={`tab ${tab === t ? 'on' : ''}`} onClick={() => setTab(t)}>{t || 'all'}</button>)}</div>
      {rolls.data && (rolls.data.length ? <div className="table-wrap"><table><thead><tr><th>Roll</th><th>Order</th><th>Machine</th><th>Metres</th><th>Quality</th><th>Label</th><th>Inspect</th></tr></thead>
        <tbody>{rolls.data.map((r) => (<tr key={r.id}><td>{r.code}</td><td>{r.order_id}</td><td>{r.machine}</td><td>{r.metres}</td><td><Pill v={r.qc_status} /></td><td><Link to={`/labels?ids=${r.id}`}>QR label</Link> <Link to={`/scan/${r.code}`}>History</Link></td>
          <td>{can(['qc']) && ['pending', 'rework'].includes(r.qc_status) ? <Inspect roll={r} reload={rolls.reload} /> : ''}</td></tr>))}</tbody></table></div> : <div className="empty">No rolls here yet. Create one from a completed finishing batch.</div>)}
      <h2 className="sub">Defects by machine</h2>
      <DataTable columns={[['machine', 'Machine'], ['defect_type', 'Defect'], ['count', 'Rolls']]} rows={(defects.data || []).map((d, i) => ({ ...d, id: i }))} empty="No defects recorded." />
    </>
  );
}
