// Make a product: the one place production starts. Pick a catalogue product and metres; the page shows the
// yarn needed against stock, then one click starts it. Each finished stage hands over to the next by itself.
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api, useLive, useAction } from '../lib/api.js';
import Msg from '../components/Msg.jsx';
import { useAuth } from '../lib/auth.jsx';

const STAGE_LABEL = { spinning: 'Spinning', weaving: 'Loom', dyeing: 'Dyeing', finishing: 'Finishing' };
const n = (v) => Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

function Plan({ plan, canEdit, reloadAll }) {
  const suppliers = useLive('/suppliers');
  const [run, msg] = useAction(reloadAll);
  if (!plan) return null;
  const short = plan.yarn.filter((y) => y.short > 0);
  return (
    <div className="run-plan">
      <h3 className="sub" style={{ marginTop: '.25rem' }}>Yarn needed for {n(plan.qty_metres)} m of {plan.product.name}</h3>
      {plan.yarn.length === 0
        ? <div className="empty err">This product has no yarn recipe. Add it on the <Link to="/products">Products</Link> page.</div>
        : (
          <div className="table-wrap"><table>
            <thead><tr><th>Yarn</th><th>Per metre</th><th>Needed</th><th>In stock</th><th>Free after other orders</th><th /></tr></thead>
            <tbody>{plan.yarn.map((y) => (
              <tr key={y.material_id}>
                <td>{y.material}</td><td>{y.qty_per_metre} {y.unit}</td><td><b>{n(y.required)} {y.unit}</b></td>
                <td>{n(y.on_hand)} {y.unit}</td><td>{n(y.available)} {y.unit}</td>
                <td>{y.short > 0 ? <span className="pill bad">short {n(y.short)} {y.unit}</span> : <span className="pill ok">enough</span>}</td>
              </tr>))}</tbody></table></div>)}
      <p className="muted" style={{ margin: '.6rem 0' }}>
        Path: {Object.entries(plan.machines).map(([s, m]) => `${STAGE_LABEL[s]} (${m.idle}/${m.total} free)`).join(' → ')} → Rolls → Quality check → Finished products
      </p>
      {short.length > 0 && canEdit && (
        <div className="fields row">
          <span className="err">Not enough yarn.</span>
          {short.map((y) => (
            <button key={y.material_id} type="button" className="btn ghost tiny"
              onClick={() => run('/purchase-requests', { method: 'POST', body: { material_id: y.material_id, qty: Math.ceil(y.short), supplier_id: suppliers.data?.[0]?.id, note: `For ${plan.product.name} ${plan.qty_metres} m` } })}>
              Request {Math.ceil(y.short)} {y.unit} of {y.material}
            </button>))}
          <Msg msg={msg} />
        </div>)}
    </div>
  );
}

function StartForm({ reloadAll }) {
  const [params] = useSearchParams();
  const products = useLive('/products?active=1', ['products']);
  const [product, setProduct] = useState(params.get('product') || '');
  const [metres, setMetres] = useState(params.get('qty') || '');
  const [plan, setPlan] = useState(null);
  const [tick, setTick] = useState(0);
  const [run, msg] = useAction(() => { reloadAll(); setTick((t) => t + 1); }); const fe = msg?.fields || {};
  useEffect(() => {
    if (!product) { setPlan(null); return undefined; }
    let live = true;
    api(`/runs/plan?product_id=${product}&qty_metres=${Number(metres) > 0 ? Number(metres) : 1}`).then((p) => live && setPlan(p), () => live && setPlan(null));
    return () => { live = false; };
  }, [product, metres, tick]);
  const showPlan = plan && Number(metres) > 0;
  async function start(e) {
    e.preventDefault();
    const d = await run('/runs', { method: 'POST', body: { product_id: product, qty_metres: metres } });
    if (d) setMetres('');
  }
  return (
    <form className="card form" onSubmit={start} noValidate>
      <h2>Make a product</h2>
      <p className="muted">Choose what to make and how many metres. The yarn is worked out from the product recipe and taken from stock when you start. After that, each stage you complete moves the product on to the next stage by itself.</p>
      <div className="fields">
        <label className={fe.product_id ? 'has-error' : ''}><span>Product</span>
          <select value={product} onChange={(e) => setProduct(e.target.value)}>
            <option value="">Choose a product</option>
            {(products.data || []).map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
          </select>{fe.product_id && <small className="err">{fe.product_id}</small>}</label>
        <label className={fe.qty_metres ? 'has-error' : ''}><span>Metres to make</span>
          <input type="number" min="1" value={metres} onChange={(e) => setMetres(e.target.value)} />{fe.qty_metres && <small className="err">{fe.qty_metres}</small>}</label>
      </div>
      {showPlan && <Plan plan={plan} canEdit reloadAll={() => setTick((t) => t + 1)} />}
      {showPlan && plan.problems.filter((p) => !p.includes('short')).map((p) => <p key={p} className="err">{p}</p>)}
      <div className="form-foot">
        <button className="btn" type="submit" disabled={!showPlan || !plan.can_start}>Start production</button>
        <Msg msg={msg} />
      </div>
    </form>
  );
}

function Steps({ run }) {
  const items = [...run.stages.map((s) => ({ key: s.stage, label: s.label, status: s.status, sub: s })), { key: 'rolls', label: 'Rolls', status: run.status === 'completed' ? 'done' : 'pending' }];
  return (
    <ol className="run-steps">
      {items.map((s) => (
        <li key={s.key} className={`run-step ${s.status}`}>
          <b>{s.label}</b>
          <span>{s.status === 'done' ? 'done' : s.status === 'running' ? 'running' : s.status === 'waiting' ? 'waiting for machine' : 'next'}</span>
          {s.sub && s.sub.machine && <small>{s.sub.machine}</small>}
          {s.sub && s.status === 'done' && <small>{n(s.sub.produced_metres)} m</small>}
        </li>))}
    </ol>
  );
}

function RunCard({ run, canEdit, reloadAll }) {
  const cur = run.stages.find((s) => s.status === 'running');
  const waiting = run.stages.find((s) => s.status === 'waiting');
  const [metres, setMetres] = useState(''); const [waste, setWaste] = useState('');
  const [act, msg] = useAction(() => { setMetres(''); setWaste(''); reloadAll(); }); const fe = msg?.fields || {};
  const next = cur ? run.stages[run.stages.findIndex((s) => s.stage === cur.stage) + 1] : null;
  return (
    <div className="card run-card">
      <div className="mhead">
        <h3>{run.code} · {run.product.name}</h3>
        <span className={`pill ${run.status === 'running' ? 'info' : run.status === 'completed' ? 'ok' : 'muted'}`}>{run.status === 'running' ? 'in production' : run.status}</span>
      </div>
      <p className="muted">{run.product.code} · {n(run.qty_metres)} m ordered into production{run.started_by ? ` by ${run.started_by}` : ''}</p>
      <Steps run={run} />
      {run.status === 'running' && cur && (
        <div className="run-now">
          <p><b>{STAGE_LABEL[cur.stage]}</b> is running on {cur.machine}. It started with <b>{n(cur.input_metres)} m</b>.
            {next ? <> When you complete it, <b>{STAGE_LABEL[next.stage] || next.label}</b> starts by itself.</> : <> When you complete it, the rolls are made automatically and sent to quality check.</>}</p>
          {canEdit && (
            <div className="fields row">
              <input type="number" placeholder={`Metres made (default ${n(cur.input_metres)})`} value={metres} onChange={(e) => setMetres(e.target.value)} aria-label="Metres made" />
              <input type="number" placeholder="Waste m (optional)" value={waste} onChange={(e) => setWaste(e.target.value)} aria-label="Waste metres" />
              <button className="btn" onClick={() => act(`/runs/${run.id}/complete-stage`, { method: 'POST', body: { ...(metres ? { metres } : {}), ...(waste ? { waste_metres: waste } : {}) } })}>
                Complete {STAGE_LABEL[cur.stage]}{next ? ` → start ${STAGE_LABEL[next.stage]}` : ' → make rolls'}
              </button>
              {run.can_cancel && <button className="btn ghost" onClick={() => act(`/runs/${run.id}/cancel`, { method: 'POST' })}>Cancel run, return yarn</button>}
              {fe.metres ? <small className="err">{fe.metres}</small> : <Msg msg={msg} />}
            </div>)}
        </div>)}
      {run.status === 'running' && !cur && waiting && (
        <p className="run-now warn">Waiting for a free {STAGE_LABEL[waiting.stage]} machine to take {n(waiting.input_metres)} m. It will start the moment one is free.
          {canEdit && run.can_cancel && <> <button className="btn ghost tiny" onClick={() => act(`/runs/${run.id}/cancel`, { method: 'POST' })}>Cancel run, return yarn</button></>}
          <Msg msg={msg} /></p>)}
      {run.status === 'completed' && (
        <p className="run-now ok">Finished: {n(run.finished_metres)} m in {run.rolls_count} roll{run.rolls_count === 1 ? '' : 's'} ({run.rolls.map((r) => r.code).join(', ')}).
          {' '}{n(run.qc_passed_metres)} m passed quality check{run.qc_pending_metres > 0 ? `, ${n(run.qc_pending_metres)} m waiting for it` : ''}. <Link to="/rolls">Quality check</Link> · <Link to="/finished">Finished products</Link></p>)}
      {run.yarn.length > 0 && <small className="muted">Yarn used: {run.yarn.map((y) => `${n(y.qty_issued)} ${y.unit} ${y.material}`).join(', ')}</small>}
    </div>
  );
}

export function StockByProduct({ rows }) {
  if (!rows) return null;
  return (
    <div className="table-wrap"><table>
      <thead><tr><th>Code</th><th>Product</th><th>Being made (m)</th><th>In quality check (m)</th><th>Ready (m)</th><th>Promised to orders (m)</th><th>Free (m)</th><th>Sent out (m)</th></tr></thead>
      <tbody>{rows.map((p) => (
        <tr key={p.product_id}><td style={{ whiteSpace: 'nowrap' }}>{p.code}</td><td>{p.name}{!p.active && <> <span className="pill muted">off</span></>}</td>
          <td>{p.in_production ? <span className="pill info">{n(p.in_production)}</span> : 0}</td><td>{n(p.in_qc)}</td>
          <td><b>{n(p.ready)}</b></td><td>{n(p.reserved)}</td><td>{p.free > 0 ? <span className="pill ok">{n(p.free)}</span> : 0}</td><td>{n(p.dispatched)}</td></tr>))}</tbody></table></div>
  );
}

export default function Runs() {
  const { can } = useAuth(); const canEdit = can(['supervisor']);
  const runs = useLive('/runs', ['runs', 'machines', 'rolls', 'orders']);
  const stock = useLive('/product-stock', ['runs', 'rolls', 'orders', 'products']);
  const reloadAll = () => { runs.reload(); stock.reload(); };
  const list = runs.data || [];
  const active = list.filter((r) => r.status === 'running');
  const past = list.filter((r) => r.status !== 'running');
  return (
    <>
      <p className="owner-note">Production starts here, from a product in the catalogue. Spinning, Loom, Dyeing and Finishing then follow on their own; the Spinning, Loom, Dyeing and Finishing pages show the same jobs.</p>
      {canEdit && <StartForm reloadAll={reloadAll} />}
      <h2 className="sub">In production now</h2>
      {active.length ? active.map((r) => <RunCard key={r.id} run={r} canEdit={canEdit} reloadAll={reloadAll} />)
        : <div className="empty">Nothing is being made. {canEdit ? 'Start a product above.' : ''}</div>}
      <h2 className="sub">Stock by product</h2>
      <StockByProduct rows={stock.data} />
      {past.length > 0 && (<>
        <h2 className="sub">Finished runs</h2>
        {past.slice(0, 20).map((r) => <RunCard key={r.id} run={r} canEdit={canEdit} reloadAll={reloadAll} />)}
      </>)}
    </>
  );
}
