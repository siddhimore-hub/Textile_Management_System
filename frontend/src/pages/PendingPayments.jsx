// OWNER: M3 (sales view) + M4 (record payments). Every dispatch shows what is owed, what has been
// paid and what is still outstanding. The invoice for a dispatch is raised automatically the moment
// its last rupee is received (the Invoices list shows only fully paid bills).
import { useState } from 'react';
import { useLive, useAction } from '../lib/api.js';
import { Pill } from '../components/DataTable.jsx';
import Msg from '../components/Msg.jsx';
import { useAuth } from '../lib/auth.jsx';
import { inr, shortDate } from '../lib/format.js';

function Row({ d, pay }) {
  const [amt, setAmt] = useState(''); const [run, msg] = useAction();
  return (
    <tr>
      <td>{d.id}</td><td>{d.buyer}</td><td>{d.order_id}</td><td>{shortDate(d.created_at)}</td>
      <td>{inr(d.total)}</td><td>{inr(d.paid)}</td>
      <td>{d.outstanding > 0 ? <span className="err">{inr(d.outstanding)}</span> : inr(d.outstanding)}</td>
      <td><Pill v={d.status} /></td>
      <td>{d.invoice_id ? `Invoice ${d.invoice_id}` : 'Not yet raised'}</td>
      <td>{pay && d.outstanding > 0 ? <div className="fields row">
        <input type="number" placeholder="Amount" value={amt} onChange={(e) => setAmt(e.target.value)} />
        <button className="btn" onClick={async () => { if (await run('/payments', { method: 'POST', body: { dispatch_id: d.id, amount: amt } })) { setAmt(''); } }}>Receive</button></div>
        : (d.payments.length ? <details><summary>Payments</summary>{d.payments.map((p) => <p key={p.id} className="muted">{shortDate(p.created_at)}, {inr(p.amount)}</p>)}</details> : '-')}</td>
      <td>{d.outstanding > 0 && pay && <Msg msg={msg} />}</td>
    </tr>
  );
}

export default function PendingPayments() {
  const { can } = useAuth(); const pay = can(['accounts']);
  const list = useLive('/pending-payments', ['dispatch']);
  if (!list.data) return <div className="empty">Loading</div>;
  if (!list.data.length) return <div className="empty">No dispatches yet. Pending payments appear after a dispatch.</div>;
  return (
    <div className="table-wrap"><table><thead><tr>
      <th>No.</th><th>Buyer</th><th>Order</th><th>Date</th><th>Due</th><th>Received</th><th>Outstanding</th><th>Status</th><th>Invoice</th><th>Record payment</th><th /></tr></thead>
      <tbody>{list.data.map((d) => <Row key={d.id} d={d} pay={pay} />)}</tbody></table></div>);
}