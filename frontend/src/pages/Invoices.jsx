// OWNER: M3. One list for both documents: sale invoices (a dispatch to a buyer) and supplier bills
// (a goods receipt). Each row opens a printable view with print / save-as-PDF.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLive } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Pill } from '../components/DataTable.jsx';
import { inr, shortDate } from '../lib/format.js';

export default function Invoices() {
  const { can } = useAuth();
  const inv = useLive('/invoices', ['dispatch', 'stock']);
  const [kind, setKind] = useState('');
  if (!inv.data) return <div className="empty">Loading</div>;
  const rows = inv.data.filter((i) => !kind || i.kind === kind);
  return (
    <>
      <div className="card form"><div className="fields">
        <label><span>Document type</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)}>
            <option value="">All invoices and bills</option>
            <option value="sale">Sale invoices (buyers)</option>
            <option value="purchase">Supplier bills (receipts)</option>
          </select></label>
      </div></div>
      {rows.length === 0 ? <div className="empty">Nothing here yet. A sale invoice is raised for every dispatch, and a supplier bill for every goods receipt.</div> : (
        <div className="table-wrap"><table>
          <thead><tr><th>Number</th><th>Type</th><th>Date</th><th>Party</th><th>Order</th><th>Total</th><th>Received</th><th>Outstanding</th><th>Payment</th><th /></tr></thead>
          <tbody>{rows.map((i) => (
            <tr key={i.id}>
              <td>{i.invoice_no || `#${i.id}`}</td>
              <td><span className={`pill ${i.kind === 'sale' ? 'info' : 'muted'}`}>{i.kind === 'sale' ? 'Sale' : 'Purchase'}</span></td>
              <td>{shortDate(i.created_at)}</td>
              <td>{i.party}{i.kind === 'sale' && i.vehicle_no ? <small className="muted"> · {i.vehicle_no}</small> : ''}</td>
              <td>{i.order_id ? `#${i.order_id}` : (i.kind === 'purchase' ? i.material : '-')}</td>
              <td>{inr(i.total)}</td>
              <td>{inr(i.paid)}</td>
              <td>{i.outstanding > 0 ? <span className="err">{inr(i.outstanding)}</span> : inr(i.outstanding)}</td>
              <td><Pill v={i.payment_status} /></td>
              <td>{can(['sales', 'accounts', 'store']) && <Link className="btn ghost tiny" to={`/invoice/${i.id}`}>View / Print</Link>}</td>
            </tr>))}</tbody>
        </table></div>)}
    </>
  );
}
