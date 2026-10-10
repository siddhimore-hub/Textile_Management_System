// OWNER: M2. One page for each production stage. Material only appears here after the previous
// stage's job is completed, and a job can only be started from that completed material.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLive, useAction } from '../lib/api.js';
import DataTable, { Pill } from '../components/DataTable.jsx';
import Msg from '../components/Msg.jsx';
import { useAuth } from '../lib/auth.jsx';

const CONF = {
  spinning: { title: 'Spinning', stage: 'spinning', machine: 'spinning', from: null },
  weaving: { title: 'Loom', stage: 'weaving', machine: 'weaving', from: 'spinning' },
  dyeing: { title: 'Dyeing', stage: 'dyeing', machine: 'dyeing', from: 'weaving' },
  finishing: { title: 'Finishing', stage: 'finishing', machine: 'finishing', from: 'dyeing' },
};

function RunningCard({ job, reload }) {
  const { can } = useAuth(); const edit = can(['supervisor']);
  const [metres, setMetres] = useState('');
  const [run, msg] = useAction(reload);
  return (
    <div className="card machine">
      <div className="mhead"><h3>Job {job.id} · {job.machine}</h3><Pill v={job.status} /></div>
      <p className="muted">Order {job.order_id} · {job.fabric_type}, {job.colour} · made {job.produced_metres} m</p>
      {edit && (<>
        <div className="fields row">
          <input type="number" placeholder="Metres made" value={metres} onChange={(e) => setMetres(e.target.value)} />
          <button className="btn" onClick={async () => { await run(`/jobs/${job.id}/output`, { method: 'POST', body: { metres } }); setMetres(''); }}>Log output</button>
          <button className="btn ghost" onClick={() => run(`/jobs/${job.id}/finish`, { method: 'POST' })}>Complete</button>
        </div>
        <Msg msg={msg} />
      </>)}
    </div>
  );
}

export default function Stage({ kind }) {
  const c = CONF[kind];
  const { can } = useAuth(); const edit = can(['supervisor']);
  const jobs = useLive('/jobs', ['machines', 'orders']);
  const machines = useLive('/machines', ['machines']);
  const material = useLive(`/jobs/available?stage=${c.from || c.stage}`, ['machines', 'orders']);
  const [source, setSource] = useState(''); const [machine, setMachine] = useState(''); const [shift, setShift] = useState('morning');
  const [run, msg] = useAction(() => { jobs.reload(); material.reload(); machines.reload(); });

  if (!jobs.data) return <div className="empty">Loading</div>;
  const running = jobs.data.filter((j) => j.stage === c.stage && j.status === 'in_progress');
  const done = jobs.data.filter((j) => j.stage === c.stage && j.status === 'done');
  const freeMachines = (machines.data || []).filter((m) => m.stage === c.machine && m.status === 'idle');
  const stock = material.data || [];

  async function start(e) {
    e.preventDefault();
    const d = await run('/jobs', { method: 'POST', body: { source_job_id: source, machine_id: machine, shift } });
    if (d) { setSource(''); setMachine(''); }
  }

  return (
    <>
      <p className="owner-note">
        {c.from
          ? <>Shows only material from completed {c.from} jobs. Pick a batch, assign a {c.machine} machine and start. The output reaches the next stage only when the job is completed.</>
          : <>Running spinning jobs appear here once a machine is assigned on the <Link to="/machines">Machines</Link> page. Complete a job to free its material for the Loom.</>}
      </p>

      <h2 className="sub">{c.from ? `Completed ${c.from} material ready` : 'Spun material ready for Loom'}</h2>
      <DataTable columns={[['id', 'Batch'], ['order_id', 'Order'], ['fabric_type', 'Fabric'], ['colour', 'Colour'], ['machine', 'From machine'], ['produced_metres', 'Made (m)'], ['available_metres', 'Available (m)']]}
        rows={stock} empty={c.from ? `No completed ${c.from} material yet. Finish a ${c.from} job first.` : 'Nothing spun yet. Assign a spinning job first.'} />

      {edit && c.from && (
        <form className="card form" onSubmit={start}>
          <h2>Start {c.title} job</h2>
          <div className="fields">
            <label><span>Completed {c.from} batch</span>
              <select value={source} onChange={(e) => setSource(e.target.value)}>
                <option value="">Choose</option>
                {stock.map((s) => <option key={s.id} value={s.id}>{`Batch ${s.id} · order ${s.order_id} ${s.fabric_type}, ${s.colour} — ${s.available_metres} m`}</option>)}
              </select></label>
            <label><span>{c.machine} machine</span>
              <select value={machine} onChange={(e) => setMachine(e.target.value)}>
                <option value="">Choose</option>
                {freeMachines.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select></label>
            <label><span>Shift</span>
              <select value={shift} onChange={(e) => setShift(e.target.value)}>{['morning', 'evening', 'night'].map((s) => <option key={s}>{s}</option>)}</select></label>
          </div>
          <div className="form-foot"><button className="btn" type="submit">Start job</button><Msg msg={msg} /></div>
        </form>
      )}

      <h2 className="sub">{c.title} jobs running</h2>
      {running.length ? <div className="grid">{running.map((j) => <RunningCard key={j.id} job={j} reload={jobs.reload} />)}</div>
        : <div className="empty">No {c.title} job is running.</div>}

      <h2 className="sub">Completed {c.title} jobs</h2>
      <DataTable columns={[['id', 'Job'], ['order_id', 'Order'], ['fabric_type', 'Fabric'], ['machine', 'Machine'], ['produced_metres', 'Made (m)'], ['available_metres', 'Available (m)']]}
        rows={done} empty={`No ${c.title} job completed yet.`} />
    </>
  );
}

export const Spinning = () => <Stage kind="spinning" />;
export const Loom = () => <Stage kind="weaving" />;
export const Dyeing = () => <Stage kind="dyeing" />;
export const Finishing = () => <Stage kind="finishing" />;
