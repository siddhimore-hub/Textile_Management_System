// OWNER: M3. A clean, printable single document (sale invoice or supplier bill). It renders without
// the sidebar/header so the printed sheet is just the invoice; print / save-as-PDF uses the browser.
import { Link, useParams } from 'react-router-dom';
import { useLive } from '../lib/api.js';
import Brand from '../components/Brand.jsx';
import { Pill } from '../components/DataTable.jsx';
import { inr, shortDate } from '../lib/format.js';

export default function InvoiceView() {
  const { id } = useParams();
  const { data, error } = useLive(`/invoices/${id}`, ['dispatch', 'stock']);
  if (error) return <div className="label-page"><div className="empty err">{error.message}</div></div>;
  if (!data) return <div className="label-page"><div className="empty">Loading</div></div>;
  const sale = data.kind === 'sale';
  return (
    <div className="label-page invoice-page">
      <div className="label-bar no-print">
        <Link className="btn ghost" to="/invoices">Back to invoices</Link>
        <button className="btn" onClick={() => window.print()}>Print / Save as PDF</button>
      </div>
      <div className="card">
        <Brand />
        <h2>{sale ? 'Tax Invoice' : 'Supplier Bill'}</h2>
        <div className="mhead" style={{ alignItems: 'flex-start' }}>
          <div>
            <p><b>Number:</b> {data.invoice_no || `#${data.id}`}</p>
            <p><b>Date:</b> {shortDate(data.created_at)}</p>
            <p><b>{sale ? 'Buyer' : 'Supplier'}:</b> {data.party || '-'}</p>
            {sale && data.vehicle_no && <p><b>Vehicle:</b> {data.vehicle_no}</p>}
            {sale && data.order_id && <p><b>Order:</b> #{data.order_id}</p>}
            {!sale && data.material && <p><b>Material:</b> {data.material}</p>}
          </div>
          <div style={{ textAlign: 'right' }}>
            <p><b>Payment status:</b> <Pill v={data.payment_status} /></p>
            <p><b>Total:</b> ₹{inr(data.total)}</p>
            {sale && <p><b>Received:</b> ₹{inr(data.paid)}</p>}
            {sale && <p><b>Outstanding:</b> ₹{inr(data.outstanding)}</p>}
          </div>
        </div>
        <div className="table-wrap"><table>
          <thead><tr><th>Description</th><th>Quantity</th><th>Unit</th><th>Unit price</th><th>Amount</th></tr></thead>
          <tbody>{data.items.map((it) => (
            <tr key={it.id}>
              <td>{it.description}{it.colour ? ` · ${it.colour}` : ''}{it.fabric_type ? ` · ${it.fabric_type}` : ''}</td>
              <td>{it.qty}</td><td>{it.unit}</td><td>₹{inr(it.unit_price)}</td><td>₹{inr(it.amount)}</td>
            </tr>))}
            <tr><td colSpan={4} style={{ textAlign: 'right' }}><b>Subtotal</b></td><td>₹{inr(data.subtotal)}</td></tr>
            {data.tax > 0 && <tr><td colSpan={4} style={{ textAlign: 'right' }}>Tax</td><td>₹{inr(data.tax)}</td></tr>}
            {data.discount > 0 && <tr><td colSpan={4} style={{ textAlign: 'right' }}>Discount</td><td>-₹{inr(data.discount)}</td></tr>}
            <tr><td colSpan={4} style={{ textAlign: 'right' }}><b>Total</b></td><td><b>₹{inr(data.total)}</b></td></tr>
          </tbody>
        </table></div>
        {data.notes && <p className="muted">{data.notes}</p>}
      </div>
      {sale && data.payments?.length > 0 && (
        <div className="card no-print"><h3 className="sub">Payment history</h3>
          <ul>{data.payments.map((p) => <li key={p.id}>{shortDate(p.created_at)} — ₹{inr(p.amount)}</li>)}</ul>
        </div>)}
      <p className="muted">Everest Textile Mills · We weave quality · Delivering trust</p>
    </div>
  );
}
