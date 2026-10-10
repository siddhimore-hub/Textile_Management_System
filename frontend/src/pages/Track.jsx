// PUBLIC buyer page (no sidebar, no login). Owner: M3.
import { useParams } from 'react-router-dom';
import { useLive } from '../lib/api.js';
import { Pill } from '../components/DataTable.jsx';

export default function Track() {
  const { token } = useParams();
  const { data, error } = useLive(`/track/${token}`, ['orders', 'rolls', 'machines']);
  return (
    <div className="track">
      <div className="brand dark">Everest<span>Textile Mills</span></div>
      {error ? <div className="empty err">We could not find this order. Check your link.</div> : !data ? <div className="empty">Loading</div> : (
        <div className="card">
          <h2>Order {data.id} for {data.buyer}</h2>
          <p>{data.fabric_type}, {data.colour}, {data.qty_metres} metres. Due {data.deadline}.</p>
          <p>Status: <Pill v={data.status} /></p>
          <div className="bar"><i style={{ width: `${data.percent}%` }} /></div>
          <small>{data.produced_metres} of {data.target_metres} metres made ({data.percent}%)</small>
        </div>)}
    </div>
  );
}
