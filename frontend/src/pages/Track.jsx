// PUBLIC buyer page (no sidebar, no login). Owner: M3.
import { useParams } from 'react-router-dom';
import { useLive } from '../lib/api.js';
import Brand from '../components/Brand.jsx';
const STEPS = [['confirmed', 'Confirmed'], ['in_production', 'Being made'], ['in_qc', 'Quality check'], ['ready_to_ship', 'Ready to ship'], ['dispatched', 'Dispatched']];
// Which step a derived status lights up. Partial states sit on the nearest solid step.
const RANK = { confirmed: 0, in_production: 1, partially_fulfilled: 1, in_qc: 2, ready_to_ship: 3, partially_dispatched: 3, dispatched: 4 };

export default function Track() {
  const { token } = useParams();
  const { data, error } = useLive(`/track/${token}`, ['orders', 'rolls', 'machines']);
  const step = data ? (RANK[data.status] ?? 0) : -1;
  const made = data ? (data.progress_metres ?? data.produced_metres) : 0;
  return (
    <div className="track">
      <Brand dark />
      {error ? <div className="empty err">We could not find this order. Check your link.</div> : !data ? <div className="empty">Loading</div> : (
        <div className="card">
          <h2>Order {data.id} for {data.buyer}</h2>
          <p>{data.fabric_type}, {data.colour}, {data.qty_metres} metres. Due {data.deadline}.</p>
          <ol className="stepper">{STEPS.map(([k, l], i) => <li key={k} className={i <= step ? 'on' : ''}>{l}</li>)}</ol>
          <div className="bar"><i style={{ width: `${data.percent}%` }} /></div>
          <small>{made} of {data.target_metres} metres made ({data.percent}%)</small>
        </div>)}
    </div>
  );
}
