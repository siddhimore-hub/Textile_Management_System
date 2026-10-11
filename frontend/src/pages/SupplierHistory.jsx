// OWNER: M1 (store) + M4 (accounts). Per supplier: which yarn lots arrived, how much was used, and
// how much of each lot is still in the store (first-in-first-out against issues).
import { useState } from 'react';
import { api, useLive } from '../lib/api.js';
import { shortDate } from '../lib/format.js';
import DataTable from '../components/DataTable.jsx';

function YarnTable({ receipts, byYarn }) {
  if (!receipts.length) return <div className="empty">Nothing received yet.</div>;
  return (
    <><div className="table-wrap"><table><thead><tr>
      <th>Material</th><th>Lot</th><th>Received</th><th>Qty (kg)</th><th>Used</th><th>Still in stock</th><th>Recovered?</th></tr></thead>
      <tbody>{receipts.map((r) => {
        const used = r.qty_kg - r.remaining_kg;
        return (
          <tr key={r.id}><td>{r.material}{r.yarn_type ? ` (${r.yarn_type})` : ''}</td><td>{r.lot_no}</td><td>{shortDate(r.receipt_date)}</td>
            <td>{r.qty_kg}</td><td>{used}</td><td><b className={r.remaining_kg <= 0 ? 'muted' : ''}>{r.remaining_kg}</b></td>
            <td>{r.remaining_kg <= 0 ? 'Yes' : '-'}</td></tr>);
      })}</tbody></table></div>
      <h3 className="sub">Total by yarn</h3>
      <DataTable columns={[['material', 'Material'], ['qty_kg', 'Delivered (kg)'], ['deliveries', 'Deliveries']]} rows={byYarn} />
      <p className="muted" style={{ marginTop: '.5rem' }}>Remaining kg = received minus what production has issued, first lot first.</p></>);
}

export default function SupplierHistory() {
  const suppliers = useLive('/suppliers');
  const [id, setId] = useState(''); const [data, setData] = useState(null); const [err, setErr] = useState(null);
  async function load(supplier_id) {
    setId(supplier_id);
    if (!supplier_id) { setData(null); return; }
    try { setData((await api(`/suppliers/material-history?supplier_id=${supplier_id}`))[0] || null); setErr(null); }
    catch (e) { setData(null); setErr(e.message); }
  }
  return (
    <>
      <div className="card form"><div className="fields">
        <label><span>Supplier</span>
          <select value={id} onChange={(e) => load(e.target.value)}><option value="">Choose a supplier</option>
            {(suppliers.data || []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label></div></div>
      {err && <div className="empty err">{err}</div>}
      {id && !data && !err && <div className="empty">Loading</div>}
      {data && <>
        <div className="grid three">
          <div className="card"><h3>Deliveries</h3><p className="big">{data.deliveries}</p></div>
          <div className="card"><h3>Total delivered</h3><p className="big">{data.total_kg} kg</p></div>
          <div className="card"><h3>Payment</h3><p className="big muted">Marked in pending payments</p></div>
        </div>
        <YarnTable receipts={data.receipts} byYarn={data.by_yarn} />
      </>}
    </>
  );
}