// OWNER: M3 (shared with sales/accounts). The buyer side of Supplier history: every order a buyer
// placed, how far it got, and every sale invoice with its payment status.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLive } from '../lib/api.js';
import { Pill } from '../components/DataTable.jsx';
import { inr, shortDate } from '../lib/format.js';

export default function BuyerHistory() {
  const hist = useLive('/buyers/history', ['orders', 'dispatch']);
  const [id, setId] = useState('');
  if (!hist.data) return <div className="empty">Loading</div>;
  const data = id ? hist.data.find((b) => b.id === Number(id)) : null;
  return (
    <>
      <div className="card form"><div className="fields">
        <label><span>Buyer</span>
          <select value={id} onChange={(e) => setId(e.target.value)}><option value="">Choose a buyer</option>
            {hist.data.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></label></div></div>
      {!id && <div className="empty">Choose a buyer to see their orders, dispatches and payments.</div>}
      {data && <>
        <div className="grid three">
          <div className="card"><h3>Orders</h3><p className="big">{data.orders_count}</p></div>
          <div className="card"><h3>Order value</h3><p className="big">₹{inr(data.total_order_value)}</p></div>
          <div className="card"><h3>Outstanding</h3><p className={data.total_outstanding > 0 ? 'big err' : 'big'}>₹{inr(data.total_outstanding)}</p></div>
        </div>
        <div className="card">
          <h3 className="sub">Orders</h3>
          {data.orders.length === 0 ? <div className="empty">No orders yet.</div> : (
            <div className="table-wrap"><table><thead><tr>
              <th>Order</th><th>Date</th><th>Fabric</th><th>Qty (m)</th><th>Dispatched</th><th>Status</th><th>Amount</th><th>Paid</th><th>Outstanding</th><th>Payment</th></tr></thead>
              <tbody>{data.orders.map((o) => (
                <tr key={o.order_id}><td>#{o.order_id}</td><td>{shortDate(o.created_at)}</td>
                  <td>{o.fabric_type} · {o.colour}</td><td>{o.qty_metres}</td><td>{o.dispatched_metres}</td>
                  <td><Pill v={o.status} /></td><td>{inr(o.order_amount)}</td><td>{inr(o.paid)}</td>
                  <td>{o.outstanding > 0 ? <span className="err">{inr(o.outstanding)}</span> : inr(o.outstanding)}</td>
                  <td><Pill v={o.payment_status} /></td></tr>))}
              </tbody></table></div>)}
        </div>
        <div className="card">
          <h3 className="sub">Invoices</h3>
          {data.invoices.length === 0 ? <div className="empty">No invoices yet.</div> : (
            <div className="table-wrap"><table><thead><tr>
              <th>Number</th><th>Date</th><th>Order</th><th>Total</th><th>Paid</th><th>Outstanding</th><th>Payment</th><th /></tr></thead>
              <tbody>{data.invoices.map((i) => (
                <tr key={i.id}><td>{i.invoice_no || `#${i.id}`}</td><td>{shortDate(i.created_at)}</td>
                  <td>{i.order_id ? `#${i.order_id}` : '-'}</td><td>{inr(i.total)}</td><td>{inr(i.paid)}</td>
                  <td>{i.outstanding > 0 ? <span className="err">{inr(i.outstanding)}</span> : inr(i.outstanding)}</td>
                  <td><Pill v={i.payment_status} /></td>
                  <td><Link className="btn ghost tiny" to={`/invoice/${i.id}`}>View</Link></td></tr>))}
              </tbody></table></div>)}
        </div>
      </>}
    </>
  );
}
