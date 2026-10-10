// OWNER: M3 (print). Payments are recorded on the Pending payments page: an invoice is raised only
// when a dispatch is fully paid, so this list only ever contains paid-off bills.
import { useLive } from '../lib/api.js';

export default function Invoices() {
  const inv = useLive('/invoices', ['dispatch']);
  if (!inv.data) return <div className="empty">Loading</div>;
  if (!inv.data.length) return <div className="empty">No invoices yet. They are raised automatically when a dispatch is fully paid.</div>;
  return (<div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Buyer</th><th>Order</th><th>Total</th><th>Received</th><th /></tr></thead>
    <tbody>{inv.data.map((i) => (<tr key={i.id}><td>{i.id}</td><td>{i.buyer}</td><td>{i.order_id}</td><td>{i.total.toLocaleString('en-IN')}</td><td>{i.paid.toLocaleString('en-IN')}</td>
      <td><button className="btn ghost" onClick={() => window.print()}>Print</button></td></tr>))}</tbody></table></div>);
}
