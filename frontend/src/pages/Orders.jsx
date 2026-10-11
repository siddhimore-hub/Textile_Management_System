// OWNER: M1. Order creation behaves like a shopping cart: pick products from the catalogue, set
// quantities, see BOM / composition / availability and totals, then submit one order with many lines.
import { useState, Fragment } from 'react';
import { api, useLive, useAction, opts } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import DataTable, { Pill } from '../components/DataTable.jsx';
import Msg from '../components/Msg.jsx';

const blank = { buyer_id: '', deadline: '', extra_cost: '' };
const r2 = (n) => Math.round(n * 100) / 100;

function availability(free, qty) {
  const q = Number(qty) || 0;
  if (q <= 0) return { label: '-', tone: 'muted' };
  if (free >= q) return { label: 'In Stock', tone: 'ok' };
  if (free > 0) return { label: 'Partially Available', tone: 'warn' };
  return { label: 'Out of Stock / Pending Production', tone: 'bad' };
}

function CartPanel({ product, qty }) {
  const comp = product.composition || [];
  const bom = product.bom || [];
  const q = Number(qty) || 0;
  const need = (b) => r2(b.qty_per_metre * q);
  const av = availability(product.availability?.free ?? 0, qty);
  const unitPrice = product.price_per_metre || 0;
  const unitCost = product.cost_per_metre || 0;
  const totalPrice = r2(q * unitPrice);
  const totalCost = r2(q * unitCost);

  return (
    <div className="card">
      <div className="mhead">
        <h3>{product.name} <span className="muted">({product.code})</span></h3>
        <span className={`pill ${av.tone}`}>{av.label}</span>
      </div>
      <p className="muted">{product.fabric_type}, {product.colour}. Selling price: ₹{unitPrice}/m. Estimated material/prod cost: ₹{unitCost}/m.</p>
      
      <div className="tiles gap" style={{ marginBottom: '1rem' }}>
        <div className="tile">
          <span>Selling Unit Price</span>
          <b>₹{unitPrice}</b>
          <small className="muted">Final Pricing for {q || 1} m: ₹{totalPrice.toLocaleString('en-IN')}</small>
        </div>
        <div className="tile">
          <span>Prod / Material Cost</span>
          <b>₹{unitCost}</b>
          <small className="muted">Total Prod Cost for {q || 1} m: ₹{totalCost.toLocaleString('en-IN')}</small>
        </div>
      </div>

      {comp.length > 0 && <><h4 className="sub">Fibre composition</h4>
        <p>{comp.map((c) => `${c.fibre_type} ${c.percentage}%`).join(' + ')}</p></>}

      <h4 className="sub">Bill of materials {qty ? `for ${qty} m` : '(per metre)'}</h4>
      {bom.length === 0 ? <p className="muted">No BOM set for this product.</p> : (
        <DataTable columns={[['material', 'Yarn Material'], ['yarn_type', 'Fibre Type'], ['qty_per_metre', 'Required / Metre'], ['required', 'Total Required Raw Material']]}
          rows={bom.map((b) => ({ id: b.material_id, ...b, required: need(b) }))} />)}

      <p className="muted">Finished products stock: {product.availability?.on_hand ?? 0} m passed, {product.availability?.allocated ?? 0} m already reserved for other orders, {product.availability?.free ?? 0} m free.</p>
    </div>
  );
}

export default function Orders() {
  const { can } = useAuth();
  const orders = useLive('/orders', ['orders', 'rolls', 'products', 'dispatch']);
  const buyers = useLive('/buyers');
  const products = useLive('/products?active=1', ['products']);
  const [f, setF] = useState(blank);
  const [cart, setCart] = useState([]);
  const [pick, setPick] = useState(''); const [qty, setQty] = useState('');
  const [preview, setPreview] = useState(null);
  const [link, setLink] = useState(null); const [check, setCheck] = useState(null); const [openId, setOpenId] = useState(null);
  const [showAddBuyer, setShowAddBuyer] = useState(false);
  const [newBuyer, setNewBuyer] = useState({ name: '', phone: '', email: '' });
  
  const [run, msg] = useAction(orders.reload);
  const [runBuyer, buyerMsg] = useAction(buyers.reload);
  const [runIssue, issueMsg] = useAction();

  const fe = msg?.fields || {};
  const feB = buyerMsg?.fields || {};
  const list = products.data || [];
  const byId = Object.fromEntries(list.map((p) => [p.id, p]));
  
  const field = (k, label, type = 'text') => (
    <label className={fe[k] ? 'has-error' : ''}><span>{label}</span>
      <input type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />{fe[k] && <small className="err">{fe[k]}</small>}</label>);

  const cartTotalMetres = r2(cart.reduce((s, it) => s + (Number(it.qty_metres) || 0), 0));
  const cartTotalCost = r2(cart.reduce((s, it) => s + (Number(it.qty_metres) || 0) * (byId[it.product_id]?.cost_per_metre || 0), 0));
  const cartTotalSelling = r2(cart.reduce((s, it) => s + (Number(it.qty_metres) || 0) * (byId[it.product_id]?.price_per_metre || 0), 0));
  const extraCharges = Number(f.extra_cost) || 0;
  const grandTotalValue = r2(cartTotalSelling + extraCharges);

  function addProduct() {
    const n = Number(qty);
    if (!pick || !(n > 0)) return;
    setCart((prev) => {
      const i = prev.findIndex((x) => String(x.product_id) === String(pick));
      if (i >= 0) return prev.map((x, j) => (j === i ? { ...x, qty_metres: String(Number(x.qty_metres) + n) } : x));
      return [...prev, { product_id: Number(pick), qty_metres: String(n) }];
    });
    setPreview(Number(pick)); setPick(''); setQty('');
  }
  const setQtyAt = (i, v) => setCart(cart.map((x, j) => (j === i ? { ...x, qty_metres: v } : x)));
  const bump = (i, d) => setQtyAt(i, String(Math.max(0, (Number(cart[i].qty_metres) || 0) + d)));
  const removeAt = (i) => setCart(cart.filter((_, j) => j !== i));

  async function handleAddBuyer(e) {
    e.preventDefault();
    const created = await runBuyer('/buyers', { method: 'POST', body: newBuyer });
    if (created && created.id) {
      setF((prev) => ({ ...prev, buyer_id: String(created.id) }));
      setNewBuyer({ name: '', phone: '', email: '' });
      setShowAddBuyer(false);
    }
  }

  async function save(e) {
    e.preventDefault(); setLink(null);
    const valid = cart.filter((it) => it.product_id && Number(it.qty_metres) > 0);
    if (!valid.length) return;
    const body = {
      buyer_id: f.buyer_id,
      deadline: f.deadline,
      extra_cost: Number(f.extra_cost) || 0,
      lines: valid.map((it) => ({ product_id: it.product_id, qty_metres: Number(it.qty_metres) }))
    };
    const d = await run('/orders', { method: 'POST', body });
    if (d) { setLink(`${location.origin}/track/${d.tracking_token}`); setF(blank); setCart([]); setPreview(null); setCheck(null); }
  }
  async function feasibility(o) { setCheck({ order: o, ...(await api(`/orders/${o.id}/feasibility`)) }); }
  async function issueAll() {
    for (const l of check.lines) await runIssue('/stock/issue', { method: 'POST', body: { material_id: l.material_id, order_id: check.order.id, qty: l.qty_required } });
    feasibility(check.order);
  }

  return (
    <>
      {can(['sales']) && <form className="card form" onSubmit={save} noValidate><h2>New order</h2>
        <div className="fields">
          <label className={fe.buyer_id ? 'has-error' : ''}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Buyer</span>
              <button type="button" className="link-btn" style={{ fontSize: '.8rem' }} onClick={() => setShowAddBuyer(!showAddBuyer)}>
                {showAddBuyer ? 'Cancel' : '+ Add Buyer'}
              </button>
            </div>
            <select value={f.buyer_id} onChange={(e) => setF({ ...f, buyer_id: e.target.value })}><option value="">Choose Buyer</option>
              {opts(buyers.data).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            {fe.buyer_id && <small className="err">{fe.buyer_id}</small>}
          </label>
          {field('deadline', 'Deadline', 'date')}
          {field('extra_cost', 'Extra charges / Shipping (₹)', 'number')}
        </div>

        {showAddBuyer && (
          <div className="card" style={{ background: 'var(--indigo-100)', marginTop: '.5rem', marginBottom: '1rem', padding: '1rem' }}>
            <h3 style={{ fontSize: '0.95rem', marginBottom: '.5rem' }}>Create New Buyer</h3>
            <div className="fields">
              <label className={feB.name ? 'has-error' : ''}><span>Name</span>
                <input value={newBuyer.name} onChange={(e) => setNewBuyer({ ...newBuyer, name: e.target.value })} placeholder="Company / Client name" />
                {feB.name && <small className="err">{feB.name}</small>}
              </label>
              <label className={feB.phone ? 'has-error' : ''}><span>Phone (10 digits)</span>
                <input value={newBuyer.phone} onChange={(e) => setNewBuyer({ ...newBuyer, phone: e.target.value })} placeholder="9876543210" />
                {feB.phone && <small className="err">{feB.phone}</small>}
              </label>
              <label className={feB.email ? 'has-error' : ''}><span>Email (optional)</span>
                <input value={newBuyer.email} onChange={(e) => setNewBuyer({ ...newBuyer, email: e.target.value })} placeholder="client@example.com" />
                {feB.email && <small className="err">{feB.email}</small>}
              </label>
            </div>
            <div className="form-foot" style={{ marginTop: '.75rem' }}>
              <button type="button" className="btn" onClick={handleAddBuyer}>Save Buyer</button>
              <Msg msg={buyerMsg} />
            </div>
          </div>
        )}

        <h3 className="sub">Add products from catalogue</h3>
        <div className="fields row">
          <select value={pick} onChange={(e) => { setPick(e.target.value); setPreview(e.target.value ? Number(e.target.value) : null); }}>
            <option value="">Choose a product</option>
            {list.map((p) => <option key={p.id} value={p.id}>{p.code} — {p.name} ({p.colour}) [₹{p.price_per_metre}/m]</option>)}
          </select>
          <input type="number" placeholder="Metres" value={qty} onChange={(e) => setQty(e.target.value)} />
          <button type="button" className="btn ghost" onClick={addProduct} disabled={!pick || !(Number(qty) > 0)}>Add to order</button>
        </div>
        {fe.lines && <small className="err">{fe.lines}</small>}

        {cart.length > 0 && (
          <div className="table-wrap"><table>
            <thead><tr><th>Product</th><th>Quantity</th><th>Unit</th><th>Unit Cost</th><th>Total Prod Cost</th><th>Unit Price</th><th>Final Price</th><th>Availability</th><th /></tr></thead>
            <tbody>{cart.map((it, i) => {
              const p = byId[it.product_id]; const q = Number(it.qty_metres) || 0;
              const av = p ? availability(p.availability?.free ?? 0, q) : { label: '-', tone: 'muted' };
              const uCost = p?.cost_per_metre || 0;
              const uPrice = p?.price_per_metre || 0;
              return (
                <tr key={it.product_id}>
                  <td>{p ? `${p.name} (${p.code})` : it.product_id}</td>
                  <td><button type="button" className="btn ghost tiny" onClick={() => bump(i, -1)}>-</button>
                    <input type="number" style={{ width: '5rem' }} value={it.qty_metres} onChange={(e) => setQtyAt(i, e.target.value)} />
                    <button type="button" className="btn ghost tiny" onClick={() => bump(i, 1)}>+</button></td>
                  <td>{p?.unit || 'metres'}</td>
                  <td>₹{uCost}</td>
                  <td>₹{r2(q * uCost).toLocaleString('en-IN')}</td>
                  <td>₹{uPrice}</td>
                  <td><b>₹{r2(q * uPrice).toLocaleString('en-IN')}</b></td>
                  <td><span className={`pill ${av.tone}`}>{av.label}</span></td>
                  <td><button type="button" className="btn ghost tiny" onClick={() => removeAt(i)}>Remove</button></td>
                </tr>);
            })}</tbody>
          </table></div>
        )}
        {cart.length > 0 && (
          <div className="mhead" style={{ marginTop: '0.75rem', flexWrap: 'wrap', gap: '1rem' }}>
            <span><b>Total Quantity:</b> {cartTotalMetres} m</span>
            <span><b>Products Total:</b> ₹{cartTotalSelling.toLocaleString('en-IN')}</span>
            <span><b>Extra Charges:</b> ₹{extraCharges.toLocaleString('en-IN')}</span>
            <span><b>Grand Total Order Value:</b> <b style={{ fontSize: '1.2rem', color: 'var(--indigo-700)' }}>₹{grandTotalValue.toLocaleString('en-IN')}</b></span>
          </div>
        )}

        <div className="form-foot"><button className="btn" type="submit" disabled={!cart.length}>Create order ({cart.length} item{cart.length === 1 ? '' : 's'})</button>
          <Msg msg={msg} />
          {link && <span>Buyer link: <a href={link}>{link}</a></span>}</div>
      </form>}

      {preview && byId[preview] && <CartPanel product={byId[preview]} qty={(cart.find((x) => x.product_id === preview)?.qty_metres) || 1} />}

      {check && (
        <div className="card"><h2>Yarn check for order #{check.order.id}</h2>
          {check.lines.length === 0 ? <p>No yarn requirement was entered for this order.</p> : (
            <DataTable columns={[['name', 'Material'], ['qty_required', 'Needed'], ['on_hand', 'In stock'], ['shortfall', 'Short by']]} rows={check.lines.map((l) => ({ ...l, id: l.material_id }))} />)}
          <div className="form-foot">
            {!can(['store', 'sales']) ? null : check.can_start ? <button className="btn" onClick={issueAll}>Issue yarn to production</button> : <span className="err">Yarn shortage detected. Receive more yarn stock first.</span>}
            <Msg msg={issueMsg} />
          </div></div>)}

      {orders.data && <div className="table-wrap"><table><thead><tr><th>Order</th><th>Buyer</th><th>Products</th><th>Metres</th><th>Products Amount</th><th>Extra Charges</th><th>Total Order Value</th><th>Deadline</th><th>Status</th><th>Payment</th><th>Progress</th><th /></tr></thead>
        <tbody>{orders.data.map((o) => (<Fragment key={o.id}>
          <tr>
            <td>#{o.id}</td>
            <td>{o.buyer}</td>
            <td>{o.lines.length ? o.lines.map((l) => l.name).join(', ') : `${o.fabric_type}, ${o.colour}`}</td>
            <td>{o.qty_metres} m</td>
            <td>₹{(o.product_total || 0).toLocaleString('en-IN')}</td>
            <td>₹{(o.extra_cost || 0).toLocaleString('en-IN')}</td>
            <td><b>₹{(o.total_amount || 0).toLocaleString('en-IN')}</b></td>
            <td>{o.deadline}</td>
            <td><Pill v={o.status} />{o.line_fulfilment && <span className={`pill ${o.line_fulfilment === 'fulfilled' ? 'ok' : o.line_fulfilment === 'stock_unavailable' ? 'bad' : 'warn'}`} style={{ marginLeft: '.35rem' }}>{o.line_fulfilment.replaceAll('_', ' ')}</span>}</td>
            <td><Pill v={o.payment_status} />{o.outstanding > 0 && <small className="muted" style={{ display: 'block' }}>₹{o.outstanding.toLocaleString('en-IN')} due</small>}</td>
            <td>{o.percent}%</td>
            <td>
              <button className="btn ghost tiny" onClick={() => feasibility(o)}>Check yarn</button>
              <button className="btn ghost tiny" onClick={() => setOpenId(openId === o.id ? null : o.id)}>{openId === o.id ? 'Hide Details' : 'View Details'}</button>
            </td>
          </tr>
          {openId === o.id && (
            <tr>
              <td colSpan={12} style={{ background: 'var(--bg)', padding: '1rem' }}>
                <div className="card" style={{ marginBottom: 0 }}>
                  <div className="mhead" style={{ marginBottom: '1rem' }}>
                    <div>
                      <h3 style={{ margin: 0 }}>Order #{o.id} Details — Buyer: {o.buyer}</h3>
                      <small className="muted">Deadline: {o.deadline} | Metres Produced: {o.produced_metres || 0} / {o.qty_metres} m ({o.percent}%) | Dispatched: {o.dispatched_metres || 0} m</small>
                    </div>
                    <div style={{ display: 'flex', gap: '.5rem', alignItems: 'center' }}>
                      <Pill v={o.status} />
                      <Pill v={o.payment_status} />
                      {o.line_fulfilment && <span className={`pill ${o.line_fulfilment === 'fulfilled' ? 'ok' : o.line_fulfilment === 'stock_unavailable' ? 'bad' : 'warn'}`}>{o.line_fulfilment.replaceAll('_', ' ')}</span>}
                    </div>
                  </div>

                  <div className="tiles gap" style={{ marginBottom: '1.25rem' }}>
                    <div className="tile">
                      <span>Products Subtotal</span>
                      <b>₹{(o.product_total || 0).toLocaleString('en-IN')}</b>
                    </div>
                    <div className="tile">
                      <span>Extra Charges / Shipping</span>
                      <b>₹{(o.extra_cost || 0).toLocaleString('en-IN')}</b>
                    </div>
                    <div className="tile" style={{ borderTopColor: 'var(--indigo-700)' }}>
                      <span>Grand Total Order Amount</span>
                      <b style={{ color: 'var(--indigo-700)' }}>₹{(o.total_amount || 0).toLocaleString('en-IN')}</b>
                    </div>
                  </div>

                  <h4 className="sub">Product Lines & Stock Availability Breakdown</h4>
                  {o.lines && o.lines.length > 0 ? (
                    <DataTable
                      columns={[
                        ['name', 'Product Name'],
                        ['fabric_type', 'Fabric'],
                        ['colour', 'Colour'],
                        ['qty_metres', 'Ordered Qty'],
                        ['unit_price', 'Unit Price'],
                        ['amount', 'Line Amount'],
                        ['allocated_metres', 'Allocated Finished Stock'],
                        ['outstanding_metres', 'Shortage / Outstanding'],
                        ['fulfilment', 'Stock Status']
                      ]}
                      rows={o.lines.map((l) => ({
                        ...l,
                        id: l.id,
                        unit_price: `₹${l.unit_price}`,
                        amount: `₹${(l.amount || 0).toLocaleString('en-IN')}`,
                        allocated_metres: `${l.allocated_metres || 0} m`,
                        outstanding_metres: `${l.outstanding_metres || 0} m`,
                        fulfilment: (
                          <span className={`pill ${l.fulfilment === 'fulfilled' ? 'ok' : l.fulfilment === 'stock_unavailable' ? 'bad' : 'warn'}`}>
                            {l.fulfilment === 'fulfilled' ? 'In Stock' : l.fulfilment === 'stock_unavailable' ? 'Out of Stock' : 'Partially Available'}
                          </span>
                        )
                      }))}
                    />
                  ) : (
                    <p className="muted">Single-product order: {o.fabric_type}, {o.colour} — {o.qty_metres} m @ ₹{o.price_per_metre}/m.</p>
                  )}
                </div>
              </td>
            </tr>
          )}
        </Fragment>))}</tbody></table></div>}
    </>
  );
}
