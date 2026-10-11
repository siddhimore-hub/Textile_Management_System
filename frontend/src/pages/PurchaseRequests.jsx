// OWNER: M1. Ask for yarn, then follow the request: requested -> ordered -> received (receiving books the stock).
import { useState } from 'react';
import { useLive, useAction, opts } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import DataTable, { Pill } from '../components/DataTable.jsx';
import EntryForm from '../components/EntryForm.jsx';
import Msg from '../components/Msg.jsx';

const tone = { requested: 'warn', ordered: 'ok', received: 'muted', cancelled: 'muted' };

function Row({ p, suppliers, reload }) {
  const { can } = useAuth();
  const [supplier, setSupplier] = useState(p.supplier_id || ''); const [lot, setLot] = useState('');
  const [run, msg] = useAction(reload);
  const move = (status) => run(`/purchase-requests/${p.id}/status`, { method: 'PATCH', body: { status, supplier_id: supplier || undefined, lot_no: lot || undefined } });
  const edit = can(['store', 'accounts']);
  return (
    <tr>
      <td>{p.id}</td><td>{p.material}</td><td>{p.qty} {p.unit}</td><td>{p.supplier || '-'}</td><td><span className={`pill ${tone[p.status]}`}>{p.status}</span></td><td>{p.requested_by || '-'}</td>
      <td>{edit && p.status === 'requested' && <div className="fields row">
        <select value={supplier} onChange={(e) => setSupplier(e.target.value)}><option value="">Supplier</option>{opts(suppliers).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        <button className="btn" onClick={() => move('ordered')}>Mark ordered</button><button className="btn ghost" onClick={() => move('cancelled')}>Cancel</button></div>}
        {edit && p.status === 'ordered' && <div className="fields row"><input placeholder="Lot number" value={lot} onChange={(e) => setLot(e.target.value)} />
          <button className="btn" onClick={() => move('received')}>Receive into stock</button><button className="btn ghost" onClick={() => move('cancelled')}>Cancel</button></div>}
        <Msg msg={msg} /></td>
    </tr>
  );
}

export default function PurchaseRequests() {
  const { can } = useAuth();
  const list = useLive('/purchase-requests', ['purchasing']); const sug = useLive('/purchase-requests/suggestions', ['stock', 'purchasing']);
  const mats = useLive('/materials'); const suppliers = useLive('/suppliers');
  const [run, msg] = useAction(() => { list.reload(); sug.reload(); });
  return (
    <>
      {sug.data?.length > 0 && (
        <section className="card"><h2>Running low: suggested requests</h2>
          <DataTable columns={[['material', 'Material'], ['available', 'Available'], ['reorder_level', 'Reorder at'], ['suggested_qty', 'Suggested qty']]} rows={sug.data.map((s) => ({ ...s, id: s.material_id }))} />
          {can(['store']) && <div className="form-foot">{sug.data.map((s) => (
            <button key={s.material_id} className="btn ghost" onClick={() => run('/purchase-requests', { method: 'POST', body: { material_id: s.material_id, qty: s.suggested_qty, note: 'Low stock' } })}>Request {s.suggested_qty} of {s.material}</button>))}
            <Msg msg={msg} /></div>}
        </section>)}
      {can(['store']) && <EntryForm title="New purchase request" endpoint="/purchase-requests" submitLabel="Send request" onDone={() => { list.reload(); sug.reload(); }} fields={[
        { name: 'material_id', label: 'Material', options: opts(mats.data) }, { name: 'qty', label: 'Quantity', type: 'number' },
        { name: 'supplier_id', label: 'Supplier (optional)', options: opts(suppliers.data) }, { name: 'note', label: 'Note (optional)' }]} />}
      {list.data && (list.data.length ? <div className="table-wrap"><table><thead><tr><th>No.</th><th>Material</th><th>Quantity</th><th>Supplier</th><th>Status</th><th>Asked by</th><th /></tr></thead>
        <tbody>{list.data.map((p) => <Row key={p.id} p={p} suppliers={suppliers.data} reload={() => { list.reload(); sug.reload(); }} />)}</tbody></table></div> : <div className="empty">No purchase requests yet.</div>)}
    </>
  );
}
