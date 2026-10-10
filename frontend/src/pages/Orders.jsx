// OWNER: M1. New order + yarn check + issue yarn.
import { useState } from 'react';
import { useLive, useAction, opts } from '../lib/api.js';
import DataTable from '../components/DataTable.jsx';
import Msg from '../components/Msg.jsx';

const blank = { buyer_id: '', fabric_type: '', colour: '', qty_metres: '', price_per_metre: '', deadline: '' };

export default function Orders() {
  const orders = useLive('/orders', ['orders', 'rolls']);
  const buyers = useLive('/buyers'); const mats = useLive('/materials');
  const [f, setF] = useState(blank); const [reqs, setReqs] = useState([{ material_id: '', qty_required: '' }]);
  const [link, setLink] = useState(null); const [check, setCheck] = useState(null);
  const [run, msg] = useAction(orders.reload); const [runIssue, issueMsg] = useAction();
  const fe = msg?.fields || {};
  const field = (k, label, type = 'text') => (
    <label className={fe[k] ? 'has-error' : ''}><span>{label}</span>
      <input type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />{fe[k] && <small className="err">{fe[k]}</small>}</label>);

  async function save(e) {
    e.preventDefault(); setLink(null);
    const body = { ...f, requirements: reqs.filter((r) => r.material_id && r.qty_required) };
    const d = await run('/orders', { method: 'POST', body });
    if (d) { setLink(`${location.origin}/track/${d.tracking_token}`); setF(blank); setReqs([{ material_id: '', qty_required: '' }]); }
  }
  async function feasibility(o) { setCheck({ order: o, ...(await (await fetch(`/api/orders/${o.id}/feasibility`)).json()).data }); }
  async function issueAll() {
    for (const l of check.lines) await runIssue('/stock/issue', { method: 'POST', body: { material_id: l.material_id, order_id: check.order.id, qty: l.qty_required } });
    feasibility(check.order);
  }
  return (
    <>
      <form className="card form" onSubmit={save} noValidate><h2>New order</h2>
        <div className="fields">
          <label className={fe.buyer_id ? 'has-error' : ''}><span>Buyer</span>
            <select value={f.buyer_id} onChange={(e) => setF({ ...f, buyer_id: e.target.value })}><option value="">Choose</option>
              {opts(buyers.data).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>{fe.buyer_id && <small className="err">{fe.buyer_id}</small>}</label>
          {field('fabric_type', 'Fabric')}{field('colour', 'Colour')}{field('qty_metres', 'Metres', 'number')}
          {field('price_per_metre', 'Price per metre', 'number')}{field('deadline', 'Deadline', 'date')}
        </div>
        <h3 className="sub">Yarn needed</h3>
        {reqs.map((r, i) => (
          <div className="fields row" key={i}>
            <select value={r.material_id} onChange={(e) => setReqs(reqs.map((x, j) => (j === i ? { ...x, material_id: e.target.value } : x)))}>
              <option value="">Material</option>{opts(mats.data).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            <input type="number" placeholder="kg" value={r.qty_required} onChange={(e) => setReqs(reqs.map((x, j) => (j === i ? { ...x, qty_required: e.target.value } : x)))} />
          </div>))}
        <button type="button" className="btn ghost" onClick={() => setReqs([...reqs, { material_id: '', qty_required: '' }])}>Add yarn line</button>
        <div className="form-foot"><button className="btn" type="submit">Create order</button><Msg msg={msg} />
          {link && <span>Buyer link: <a href={link}>{link}</a></span>}</div>
      </form>

      {check && (
        <div className="card"><h2>Yarn check for order {check.order.id}</h2>
          {check.lines.length === 0 ? <p>No yarn requirement was entered for this order.</p> : (
            <DataTable columns={[['name', 'Material'], ['qty_required', 'Needed'], ['on_hand', 'In stock'], ['shortfall', 'Short by']]} rows={check.lines.map((l) => ({ ...l, id: l.material_id }))} />)}
          <div className="form-foot">
            {check.can_start ? <button className="btn" onClick={issueAll}>Issue yarn to production</button> : <span className="err">Not enough yarn. Receive more stock first.</span>}
            <Msg msg={issueMsg} />
          </div></div>)}

      {orders.data && <div className="table-wrap"><table><thead><tr><th>Order</th><th>Buyer</th><th>Fabric</th><th>Metres</th><th>Deadline</th><th>Status</th><th>Done</th><th /></tr></thead>
        <tbody>{orders.data.map((o) => (<tr key={o.id}><td>{o.id}</td><td>{o.buyer}</td><td>{o.fabric_type}, {o.colour}</td><td>{o.qty_metres}</td><td>{o.deadline}</td>
          <td><span className="pill">{o.status.replaceAll('_', ' ')}</span></td><td>{o.percent}%</td>
          <td><button className="btn ghost" onClick={() => feasibility(o)}>Check yarn</button></td></tr>))}</tbody></table></div>}
    </>
  );
}
