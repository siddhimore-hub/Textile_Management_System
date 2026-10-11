// OWNER: M2. Live machine board with job actions, add-machine, and produce for stock.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, useLive, useAction, opts } from '../lib/api.js';
import { Pill } from '../components/DataTable.jsx';
import Msg from '../components/Msg.jsx';
import { useAuth } from '../lib/auth.jsx';

const STAGES = ['spinning', 'weaving', 'dyeing', 'finishing'];

function machineBadge(status) {
  if (status === 'idle') return <span className="pill ok">Available</span>;
  if (status === 'running') return <span className="pill info">Running</span>;
  if (status === 'maintenance') return <span className="pill warn">Maintenance</span>;
  if (status === 'breakdown') return <span className="pill bad">Breakdown</span>;
  return <Pill v={status} />;
}

function Card({ m, orders, reload }) {
  const { can } = useAuth(); const edit = can(['supervisor']);
  const [run, msg] = useAction(reload);
  const [order, setOrder] = useState(''); const [shift, setShift] = useState('morning'); const [metres, setMetres] = useState('');
  return (
    <div className={`card machine status-${m.status}`} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', minHeight: '230px' }}>
      <div>
        <div className="mhead" style={{ marginBottom: '.5rem' }}>
          <h3 style={{ margin: 0, fontSize: '1.1rem' }}>{m.name} <small className="muted" style={{ fontWeight: 400 }}>({m.stage.toUpperCase()})</small></h3>
          {machineBadge(m.status)}
        </div>
        <p className="muted" style={{ fontSize: '.88rem', margin: '.25rem 0 .75rem' }}>
          {m.job_id ? `Active Job #${m.job_id}` : 'No active job'}
          {m.order_id ? ` · Order #${m.order_id}${m.is_internal ? ' (Stock)' : ''}` : ''}
          <br />Output Today: <b>{m.today_metres} m</b>
        </p>

        {['breakdown', 'maintenance'].includes(m.status) && (
          <div className="banner bad" style={{ marginTop: '.35rem', marginBottom: '.5rem', padding: '.45rem .65rem', fontSize: '.8rem' }}>
            Machine is in <b>{m.status.toUpperCase()}</b>. Job assignment is restricted until restored to Available.
          </div>
        )}

        {edit && m.stage === 'spinning' && m.status === 'idle' && (
          <div className="fields row" style={{ gap: '.4rem' }}>
            <select value={order} onChange={(e) => setOrder(e.target.value)} style={{ flex: 1 }}>
              <option value="">Choose Order</option>
              {opts(orders, (o) => `#${o.id} ${o.fabric_type}`).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <select value={shift} onChange={(e) => setShift(e.target.value)}>
              {['morning', 'evening', 'night'].map((s) => <option key={s}>{s}</option>)}
            </select>
            <button className="btn tiny" disabled={!order} onClick={() => run('/jobs', { method: 'POST', body: { order_id: order, machine_id: m.id, shift } })}>Assign</button>
          </div>
        )}

        {edit && m.status === 'running' && m.job_id && (
          <div className="fields row" style={{ gap: '.4rem' }}>
            <input type="number" min="0.1" step="any" placeholder="Metres" value={metres} onChange={(e) => setMetres(e.target.value)} style={{ width: '6rem' }} />
            <button className="btn tiny" disabled={!(Number(metres) > 0)} onClick={async () => { await run(`/jobs/${m.job_id}/output`, { method: 'POST', body: { metres } }); setMetres(''); }}>Log</button>
            <button className="btn ghost tiny" onClick={() => run(`/jobs/${m.job_id}/finish`, { method: 'POST' })}>Finish</button>
          </div>
        )}

        {edit && m.stage !== 'spinning' && m.status === 'idle' && (
          <p className="muted" style={{ fontSize: '.82rem' }}>
            Assign from the {m.stage === 'weaving' ? 'Loom' : m.stage.toUpperCase()} page when previous batch completes.
          </p>
        )}
      </div>

      {edit && (
        <div className="form-foot" style={{ marginTop: '.75rem', paddingTop: '.5rem', borderTop: '1px solid var(--line)', justifyContent: 'space-between' }}>
          <select value="" onChange={(e) => e.target.value && run(`/machines/${m.id}/status`, { method: 'PATCH', body: { status: e.target.value } })}>
            <option value="">Set Operational Status...</option>
            <option value="idle">Available (Idle)</option>
            <option value="running">Running</option>
            <option value="maintenance">Maintenance</option>
            <option value="breakdown">Breakdown</option>
          </select>
          <Msg msg={msg} />
        </div>
      )}
    </div>
  );
}

function AddMachine({ reload, machinesData = [] }) {
  const [run, msg] = useAction(reload); const fe = msg?.fields || {};
  const [f, setF] = useState({ name: '', stage: 'spinning', status: 'idle' });

  const total = machinesData.length;
  const running = machinesData.filter((m) => m.status === 'running').length;
  const idle = machinesData.filter((m) => m.status === 'idle').length;
  const down = machinesData.filter((m) => ['breakdown', 'maintenance'].includes(m.status)).length;

  const stageCounts = STAGES.map((s) => {
    const list = machinesData.filter((m) => m.stage === s);
    return {
      stage: s,
      total: list.length,
      idle: list.filter((m) => m.status === 'idle').length,
      running: list.filter((m) => m.status === 'running').length,
      down: list.filter((m) => ['breakdown', 'maintenance'].includes(m.status)).length,
    };
  });

  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <form className="form" onSubmit={(e) => { e.preventDefault(); run('/machines', { method: 'POST', body: f }).then((d) => d && setF({ name: '', stage: 'spinning', status: 'idle' })); }} noValidate>
        <h2>Add a machine</h2>
        <p className="muted">Register a new machine to the mill floor with its target stage.</p>
        <div className="fields">
          <label className={fe.name ? 'has-error' : ''}><span>Name / number</span>
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Spin-03 or Loom-05" />
            {fe.name && <small className="err">{fe.name}</small>}
          </label>
          <label><span>Stage</span>
            <select value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })}>
              {STAGES.map((s) => <option key={s} value={s}>{s.toUpperCase()}</option>)}
            </select>
          </label>
        </div>
        <div className="form-foot">
          <button className="btn" type="submit">Add machine</button>
          <Msg msg={msg} />
        </div>
      </form>

      <div style={{ marginTop: '1.25rem', paddingTop: '1rem', borderTop: '1px solid var(--line)' }}>
        <h3 style={{ fontSize: '0.95rem', marginBottom: '.6rem', color: 'var(--indigo-900)' }}>Floor Capacity Overview</h3>
        
        <div className="tiles" style={{ gridTemplateColumns: 'repeat(3, 1fr)', gap: '.5rem', marginBottom: '1rem' }}>
          <div className="tile" style={{ padding: '.65rem .8rem', borderTopColor: 'var(--indigo-700)' }}>
            <span style={{ fontSize: '.78rem' }}>Total Floor</span>
            <b style={{ fontSize: '1.4rem' }}>{total}</b>
          </div>
          <div className="tile" style={{ padding: '.65rem .8rem', borderTopColor: 'var(--ok)' }}>
            <span style={{ fontSize: '.78rem' }}>Available</span>
            <b style={{ fontSize: '1.4rem', color: 'var(--ok)' }}>{idle}</b>
          </div>
          <div className="tile" style={{ padding: '.65rem .8rem', borderTopColor: down ? 'var(--bad)' : 'var(--muted)' }}>
            <span style={{ fontSize: '.78rem' }}>Maintenance</span>
            <b style={{ fontSize: '1.4rem', color: down ? 'var(--bad)' : 'var(--muted)' }}>{down}</b>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '.5rem' }}>
          {stageCounts.map((sc) => (
            <div key={sc.stage} style={{ background: 'var(--bg)', padding: '.65rem .8rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--line)' }}>
              <div style={{ fontWeight: 600, fontSize: '.82rem', textTransform: 'capitalize', color: 'var(--indigo-900)' }}>
                {sc.stage === 'weaving' ? 'Loom (Weaving)' : sc.stage}
              </div>
              <small className="muted" style={{ fontSize: '.75rem' }}>
                {sc.total} total · <span style={{ color: 'var(--ok)' }}>{sc.idle} idle</span> · {sc.running} active
              </small>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function MakeProductNote() {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
      <h2>Make a product</h2>
      <p className="muted">Production now starts from a catalogue product, not from free-typed fabric names. Choose the product and metres; the yarn is calculated from its recipe and the stages follow on their own.</p>
      <div className="form-foot"><Link className="btn" to="/runs">Open Make a product</Link></div>
    </div>
  );
}

export default function Machines() {
  const { can } = useAuth(); const edit = can(['supervisor']);
  const ms = useLive('/machines', ['machines']); const orders = useLive('/orders/assignable', ['orders']);
  if (!ms.data) return <div className="empty">Loading</div>;
  return (
    <>{edit && <div className="grid two" style={{ alignItems: 'stretch' }}>{<AddMachine reload={ms.reload} machinesData={ms.data || []} />}{<MakeProductNote />}</div>}
      <div className="grid">{ms.data.map((m) => <Card key={m.id} m={m} orders={orders.data || []} reload={ms.reload} />)}</div></>);
}