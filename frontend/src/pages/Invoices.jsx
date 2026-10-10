// OWNER: M3 (print) with M4 (payments).
import { useState } from 'react';
import { useLive, useAction } from '../lib/api.js';
import Msg from '../components/Msg.jsx';
import { useAuth } from '../lib/auth.jsx';

export default function Invoices() {
  const { can } = useAuth(); const pay = can(['accounts']);
  const inv = useLive('/invoices', ['dispatch']);
  const [amt, setAmt] = useState({}); const [run, msg] = useAction(inv.reload);
  if (!inv.data) return <div className="empty">Loading</div>;
  if (!inv.data.length) return <div className="empty">No invoices yet. They are created when rolls are dispatched.</div>;
  return (<><div className="table-wrap"><table><thead><tr><th>Invoice</th><th>Buyer</th><th>Order</th><th>Total</th><th>Paid</th>{pay && <th>Record payment</th>}<th /></tr></thead>
    <tbody>{inv.data.map((i) => (<tr key={i.id}><td>{i.id}</td><td>{i.buyer}</td><td>{i.order_id}</td><td>{i.total.toLocaleString('en-IN')}</td><td>{i.paid.toLocaleString('en-IN')}</td>
      {pay && <td><div className="fields row"><input type="number" placeholder="Amount" value={amt[i.id] ?? ''} onChange={(e) => setAmt({ ...amt, [i.id]: e.target.value })} />
        <button className="btn" onClick={async () => { if (await run('/payments', { method: 'POST', body: { invoice_id: i.id, amount: amt[i.id] } })) setAmt({ ...amt, [i.id]: '' }); }}>Add</button></div></td>}
      <td><button className="btn ghost" onClick={() => window.print()}>Print</button></td></tr>))}</tbody></table></div><Msg msg={msg} /></>);
}
