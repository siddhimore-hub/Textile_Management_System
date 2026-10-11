// OWNER: M3. Finished Products: dispatch only QC-passed, eligible stock. Cross-order stock is
// allowed when it belongs to a product an order reserved (the backend enforces the reservation).
import { useState } from 'react';
import { useLive, useAction } from '../lib/api.js';
import Msg from '../components/Msg.jsx';
import { useAuth } from '../lib/auth.jsx';
import { StockByProduct } from './Runs.jsx';

export default function Finished() {
  const { can } = useAuth(); const canDispatch = can(['sales']);
  const stock = useLive('/finished-products', ['rolls', 'products', 'orders']);
  const orders = useLive('/orders', ['orders', 'rolls']);
  const byProduct = useLive('/product-stock', ['runs', 'rolls', 'orders', 'products']);
  const [sel, setSel] = useState([]); const [vehicle, setVehicle] = useState(''); const [orderId, setOrderId] = useState(''); const [done, setDone] = useState(null);
  const [run, msg] = useAction(() => { stock.reload(); orders.reload(); setSel([]); }); const fe = msg?.fields || {};
  const rows = stock.data || [];
  const open = (orders.data || []).filter((o) => !o.is_internal && o.status !== 'dispatched');
  const order = open.find((o) => String(o.id) === String(orderId));
  const lines = order?.lines || [];
  const eligible = (r) => !order || r.order_id === order.id || lines.some((l) => l.product_id && l.product_id === r.product_id);
  const toggle = (r) => { if (!eligible(r)) return; setSel(sel.includes(r.id) ? sel.filter((x) => x !== r.id) : [...sel, r.id]); };
  async function dispatch() {
    const d = await run('/dispatches', { method: 'POST', body: { order_id: Number(orderId), roll_ids: sel, vehicle_no: vehicle } });
    if (d) { setDone(d); setVehicle(''); }
  }
  return (
    <>
      <p className="owner-note">Only QC-passed rolls can leave the mill. Pick the customer order, tick eligible rolls, then dispatch. The amount due is stored on the dispatch; the invoice is raised when it is fully paid (see Pending payments).</p>
      <h2 className="sub" style={{ marginTop: 0 }}>Stock by product</h2>
      <StockByProduct rows={byProduct.data} />
      <h2 className="sub">Dispatch</h2>
      {canDispatch && <div className="fields row">
        <label><span>Customer order</span><select value={orderId} onChange={(e) => { setOrderId(e.target.value); setSel([]); }}>
          <option value="">Choose the order to fulfil</option>
          {open.map((o) => <option key={o.id} value={o.id}>#{o.id} {o.buyer} — {o.lines.length ? o.lines.map((l) => l.name).join(', ') : `${o.fabric_type}`}</option>)}</select></label></div>}
      {order && order.lines.length > 0 && (
        <div className="table-wrap"><table><thead><tr><th>Product</th><th>Ordered</th><th>Reserved</th><th>Outstanding</th><th>Availability</th></tr></thead>
          <tbody>{order.lines.map((l) => <tr key={l.id}><td>{l.name}</td><td>{l.qty_metres}</td><td>{l.allocated_metres}</td><td>{l.outstanding_metres}</td>
            <td><span className={`pill ${l.fulfilment === 'available' || l.fulfilment === 'fulfilled' ? 'ok' : l.fulfilment === 'pending' ? 'bad' : 'warn'}`}>{l.fulfilment.replaceAll('_', ' ')}</span></td></tr>)}</tbody></table></div>)}
      {rows.length === 0 ? <div className="empty">No passed rolls waiting. Rolls appear here after they pass quality check.</div> : (
        <div className="table-wrap"><table><thead><tr><th /><th>Roll</th><th>Order</th><th>Product</th><th>Fabric</th><th>Metres</th></tr></thead>
          <tbody>{rows.map((r) => (<tr key={r.id}><td>{canDispatch && <input type="checkbox" disabled={!eligible(r)} checked={sel.includes(r.id)} onChange={() => toggle(r)} aria-label={`Select ${r.code}`} />}</td>
            <td>{r.code}</td><td>{r.order_id}</td><td>{r.product_name || '-'}</td><td>{r.fabric_type}, {r.colour}</td><td>{r.metres}</td></tr>))}</tbody></table></div>)}
      {canDispatch && <div className="card form" style={{ marginTop: '1rem' }}><div className="fields">
        <label className={fe.vehicle_no ? 'has-error' : ''}><span>Vehicle number</span><input placeholder="TN09AB1234" value={vehicle} onChange={(e) => setVehicle(e.target.value)} />{fe.vehicle_no && <small className="err">{fe.vehicle_no}</small>}</label></div>
        <div className="form-foot"><button className="btn" disabled={!orderId || !sel.length} onClick={dispatch}>Dispatch {sel.length || ''} roll{sel.length === 1 ? '' : 's'}</button><Msg msg={msg} />
          {done && <span className="msg-ok">Dispatched {sel.length} roll{sel.length === 1 ? '' : 's'} for {done.total.toLocaleString('en-IN')}. The invoice is raised once it is fully paid.</span>}</div></div>}
    </>
  );
}
