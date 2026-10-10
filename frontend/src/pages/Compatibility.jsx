// OWNER: M1. Fabric -> yarn family rules. These drive the fabric and yarn dropdowns in the order and
// stock-production forms and are enforced when yarn is issued, so incompatible yarn can never reach an order.
import { useState } from 'react';
import { useLive, useAction } from '../lib/api.js';
import { Pill } from '../components/DataTable.jsx';
import Msg from '../components/Msg.jsx';
import { useAuth } from '../lib/auth.jsx';

const FAMILIES = ['cotton', 'linen', 'polyester', 'wool', 'silk', 'viscose'];

export default function Compatibility() {
  const { can } = useAuth(); const edit = can(['store']);
  const fab = useLive('/compatibility/fabrics');
  const rules = useLive('/compatibility', ['compatibility']);
  const [run, msg] = useAction(rules.reload); const fe = msg?.fields || {};
  const [running, delMsg] = useAction(rules.reload);
  const [f, setF] = useState({ fabric_type: '', yarn_type: '', blend_ratio: '', note: '' });
  const groups = fab.data || [];
  return (
    <>
      <p className="owner-note">A fabric accepts only yarn from its listed families. Leave a fabric out of this list and any yarn can be used for it.</p>
      {edit && <form className="card form" onSubmit={(e) => { e.preventDefault(); if (run('/compatibility', { method: 'POST', body: f })) setF({ fabric_type: '', yarn_type: '', blend_ratio: '', note: '' }); }} noValidate>
        <h2>Add a fabric-yarn rule</h2>
        <div className="fields">
          <label className={fe.fabric_type ? 'has-error' : ''}><span>Fabric</span>
            <input placeholder="e.g. poplin, denim, twill" value={f.fabric_type} onChange={(e) => setF({ ...f, fabric_type: e.target.value })} />{fe.fabric_type && <small className="err">{fe.fabric_type}</small>}</label>
          <label className={fe.yarn_type ? 'has-error' : ''}><span>Yarn family</span>
            <select value={f.yarn_type} onChange={(e) => setF({ ...f, yarn_type: e.target.value })}><option value="">Choose</option>
              {FAMILIES.map((y) => <option key={y}>{y}</option>)}</select>{fe.yarn_type && <small className="err">{fe.yarn_type}</small>}</label>
          <label><span>Blend % (optional)</span><input type="number" placeholder="e.g. 60" value={f.blend_ratio} onChange={(e) => setF({ ...f, blend_ratio: e.target.value })} /></label>
          <label><span>Note</span><input placeholder="e.g. 60/40 cotton-poly" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></label>
        </div>
        <div className="form-foot"><button className="btn" type="submit">Add rule</button><Msg msg={msg} /></div>
      </form>}
      {groups.length === 0 ? <div className="empty">No rules yet. Add a fabric-yarn rule above.</div> :
        groups.map((g) => (
          <div className="card" key={g.fabric_type}><div className="mhead"><h3>{g.fabric_type}</h3>
            {g.is_blend && <Pill v="blend" />}</div>
            <ul className="plain">
              {g.yarns.map((y) => (<li key={`${g.fabric_type}-${y.yarn_type}`} className="fields row">
                <span>{y.yarn_type}{y.blend_ratio ? ` (${y.blend_ratio}%)` : ''}</span>
                {rules.data && rules.data.find((x2) => x2.fabric_type === g.fabric_type && x2.yarn_type === y.yarn_type) && edit && (
                  <button className="btn ghost tiny" onClick={() => delMsg(`/compatibility/${rules.data.find((x2) => x2.fabric_type === g.fabric_type && x2.yarn_type === y.yarn_type).id}`, { method: 'DELETE' })}>Remove</button>)}
              </li>))}
            </ul>
            <Msg msg={delMsg} />
          </div>))}
    </>
  );
}