// OWNER: M1. Fixed product catalogue: product records, fibre composition, bill of materials, and the
// fabric-yarn compatibility rules (moved here from the old standalone sidebar page).
import { useState } from 'react';
import { useLive, useAction, opts } from '../lib/api.js';
import DataTable, { Pill } from '../components/DataTable.jsx';
import Msg from '../components/Msg.jsx';
import { useAuth } from '../lib/auth.jsx';

const FIBRES = ['cotton', 'linen', 'polyester', 'wool', 'silk', 'viscose', 'nylon', 'acrylic'];
const blankProduct = { code: '', name: '', fabric_type: '', colour: '', unit: 'metres', price_per_metre: '', cost_per_metre: '', notes: '' };
const blankLine = () => ({ fibre_type: 'cotton', percentage: '' });
const blankBom = () => ({ material_id: '', qty_per_metre: '' });

function ProductForm({ materials, editing, onCancel, onSaved }) {
  const [run, msg] = useAction(onSaved); const fe = msg?.fields || {};
  const [f, setF] = useState(editing ? { ...editing, code: editing.code } : blankProduct);
  const [comp, setComp] = useState(editing ? (editing.composition || []).map((c) => ({ ...c, percentage: String(c.percentage) })) : [blankLine()]);
  const [bom, setBom] = useState(editing ? (editing.bom || []).map((b) => ({ material_id: b.material_id, qty_per_metre: String(b.qty_per_metre) })) : [blankBom()]);
  const total = comp.reduce((s, c) => s + (Number(c.percentage) || 0), 0);
  const compOk = Math.abs(total - 100) < 0.01;
  const setC = (i, k, v) => setComp(comp.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const setB = (i, k, v) => setBom(bom.map((x, j) => (j === i ? { ...x, [k]: v } : x)));

  async function save(e) {
    e.preventDefault();
    const body = { ...f, composition: comp.filter((c) => c.fibre_type && Number(c.percentage) > 0).map((c) => ({ fibre_type: c.fibre_type, percentage: Number(c.percentage) })),
      bom: bom.filter((b) => b.material_id && Number(b.qty_per_metre) > 0).map((b) => ({ material_id: Number(b.material_id), qty_per_metre: Number(b.qty_per_metre) })) };
    const d = editing ? await run(`/products/${editing.id}`, { method: 'PATCH', body }) : await run('/products', { method: 'POST', body });
    if (d) onCancel();
  }
  return (
    <form className="card form" onSubmit={save} noValidate>
      <h2>{editing ? `Edit ${editing.code}` : 'Add a product'}</h2>
      <div className="fields">
        <label><span>Code / SKU (blank = auto)</span><input value={f.code} disabled={!!editing} onChange={(e) => setF({ ...f, code: e.target.value })} /></label>
        <label className={fe.name ? 'has-error' : ''}><span>Display name</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />{fe.name && <small className="err">{fe.name}</small>}</label>
        <label className={fe.fabric_type ? 'has-error' : ''}><span>Fabric type</span><input placeholder="e.g. cotton, cotton_polyester" value={f.fabric_type} disabled={!!editing} onChange={(e) => setF({ ...f, fabric_type: e.target.value })} />{fe.fabric_type && <small className="err">{fe.fabric_type}</small>}</label>
        <label><span>Colour</span><input value={f.colour} onChange={(e) => setF({ ...f, colour: e.target.value })} /></label>
        <label><span>Unit</span><select value={f.unit} onChange={(e) => setF({ ...f, unit: e.target.value })}><option value="metres">metres</option><option value="kg">kg</option></select></label>
        <label className={fe.price_per_metre ? 'has-error' : ''}><span>Selling price / unit</span><input type="number" value={f.price_per_metre} onChange={(e) => setF({ ...f, price_per_metre: e.target.value })} />{fe.price_per_metre && <small className="err">{fe.price_per_metre}</small>}</label>
        <label><span>Estimated material cost / unit</span><input type="number" value={f.cost_per_metre} onChange={(e) => setF({ ...f, cost_per_metre: e.target.value })} /></label>
      </div>

      <h3 className="sub">Fibre composition (must total 100%)</h3>
      {comp.map((c, i) => (
        <div className="fields row" key={i}>
          <select value={c.fibre_type} onChange={(e) => setC(i, 'fibre_type', e.target.value)}>{FIBRES.map((x) => <option key={x}>{x}</option>)}</select>
          <input type="number" placeholder="%" value={c.percentage} onChange={(e) => setC(i, 'percentage', e.target.value)} />
          <button type="button" className="btn ghost tiny" onClick={() => setComp(comp.filter((_, j) => j !== i))} disabled={comp.length === 1}>Remove</button>
        </div>))}
      <button type="button" className="btn ghost" onClick={() => setComp([...comp, blankLine()])}>Add fibre</button>
      <p className={compOk ? 'msg-ok' : 'err'}>{compOk ? `Total ${total}%` : `Total ${total}% — must be 100%`}{fe.composition && ` (${fe.composition})`}</p>

      <h3 className="sub">Bill of materials (yarn per unit of fabric)</h3>
      {bom.map((b, i) => (
        <div className="fields row" key={i}>
          <select value={b.material_id} onChange={(e) => setB(i, 'material_id', e.target.value)}><option value="">Material</option>
            {opts(materials).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
          <input type="number" placeholder="Qty per metre" value={b.qty_per_metre} onChange={(e) => setB(i, 'qty_per_metre', e.target.value)} />
          <button type="button" className="btn ghost tiny" onClick={() => setBom(bom.filter((_, j) => j !== i))} disabled={bom.length === 1}>Remove</button>
        </div>))}
      <button type="button" className="btn ghost" onClick={() => setBom([...bom, blankBom()])}>Add yarn</button>

      <div className="form-foot"><button className="btn" type="submit" disabled={!compOk && comp.some((c) => Number(c.percentage) > 0)}>{editing ? 'Save product' : 'Add product'}</button>
        {editing && <button type="button" className="btn ghost" onClick={onCancel}>Cancel</button>}<Msg msg={msg} /></div>
    </form>);
}

export default function Products() {
  const { can } = useAuth(); const edit = can(['store', 'products']);
  const products = useLive('/products', ['products', 'orders']);
  const materials = useLive('/materials');
  const [editing, setEditing] = useState(null); const [adding, setAdding] = useState(false);
  const [run, msg] = useAction(products.reload);
  const rows = products.data || [];
  return (
    <>
      {!products.data ? <div className="empty">Loading</div> : (
        <div className="table-wrap"><table><thead><tr><th>Code</th><th>Product</th><th>Fabric</th><th>Composition</th><th>Price</th><th>Cost</th><th>Stock / free</th><th>Status</th>{edit && <th />}</tr></thead>
          <tbody>{rows.map((p) => (
            <tr key={p.id}><td>{p.code}</td><td>{p.name}</td><td>{p.fabric_type}, {p.colour}</td>
              <td>{(p.composition || []).map((c) => `${c.fibre_type} ${c.percentage}%`).join(' + ') || '-'}</td>
              <td>{p.price_per_metre}</td><td>{p.cost_per_metre}</td>
              <td>{p.availability.on_hand} / {p.availability.free}</td>
              <td><span className={`pill ${p.active ? 'ok' : 'muted'}`}>{p.active ? 'active' : 'inactive'}</span></td>
              {edit && <td><button className="btn ghost tiny" onClick={() => { setAdding(false); setEditing(p); }}>Edit</button>
                <button className="btn ghost tiny" onClick={() => run(`/products/${p.id}`, { method: 'PATCH', body: { active: !p.active } })}>{p.active ? 'Deactivate' : 'Activate'}</button></td>}</tr>))}</tbody></table></div>)}

      {edit && <div className="form-foot" style={{ margin: '.5rem 0' }}>
        <button className="btn" onClick={() => { setEditing(null); setAdding(!adding); }}>{adding ? 'Close' : 'Add a product'}</button><Msg msg={msg} /></div>}
      {edit && (adding || editing) && <ProductForm materials={materials.data || []} editing={editing} onCancel={() => { setEditing(null); setAdding(false); }} onSaved={products.reload} />}
    </>
  );
}
