// OWNER: M3. Pick passed rolls, dispatch, get invoice.
import { useState } from 'react';
import { useLive, useAction } from '../lib/api.js';
import Msg from '../components/Msg.jsx';
import { useAuth } from '../lib/auth.jsx';

export default function Finished() {
  const { can } = useAuth(); const canDispatch = can(['sales']);
  const stock = useLive('/finished-stock', ['rolls']);
  const [sel, setSel] = useState([]); const [vehicle, setVehicle] = useState(''); const [done, setDone] = useState(null);
  const [run, msg] = useAction(() => { stock.reload(); setSel([]); }); const fe = msg?.fields || {};
  const rows = stock.data || [];
  const orderId = sel.length ? rows.find((r) => r.id === sel[0])?.order_id : null;
  const toggle = (r) => setSel(sel.includes(r.id) ? sel.filter((x) => x !== r.id) : (orderId && r.order_id !== orderId ? sel : [...sel, r.id]));
  async function dispatch() {
    const d = await run('/dispatches', { method: 'POST', body: { order_id: orderId, roll_ids: sel, vehicle_no: vehicle } });
    if (d) { setDone(d); setVehicle(''); }
  }
  return (
    <>
      <p className="owner-note">Tick rolls of one order, enter the vehicle number, then dispatch. The invoice is made from the same rolls.</p>
      {rows.length === 0 ? <div className="empty">No passed rolls waiting. Rolls appear here after they pass quality check.</div> : (
        <div className="table-wrap"><table><thead><tr><th /><th>Roll</th><th>Order</th><th>Fabric</th><th>Metres</th></tr></thead>
          <tbody>{rows.map((r) => (<tr key={r.id}><td>{canDispatch && <input type="checkbox" checked={sel.includes(r.id)} onChange={() => toggle(r)} aria-label={`Select ${r.code}`} />}</td>
            <td>{r.code}</td><td>{r.order_id}</td><td>{r.fabric_type}, {r.colour}</td><td>{r.metres}</td></tr>))}</tbody></table></div>)}
      {canDispatch && <div className="card form" style={{ marginTop: '1rem' }}><div className="fields">
        <label className={fe.vehicle_no ? 'has-error' : ''}><span>Vehicle number</span><input placeholder="TN09AB1234" value={vehicle} onChange={(e) => setVehicle(e.target.value)} />{fe.vehicle_no && <small className="err">{fe.vehicle_no}</small>}</label></div>
        <div className="form-foot"><button className="btn" disabled={!sel.length} onClick={dispatch}>Dispatch {sel.length || ''} roll{sel.length === 1 ? '' : 's'}</button><Msg msg={msg} />
          {done && <span className="msg-ok">Invoice {done.invoice_id} created, total {done.total.toLocaleString('en-IN')}</span>}</div></div>}
    </>
  );
}
