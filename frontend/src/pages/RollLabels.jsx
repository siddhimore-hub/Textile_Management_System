// OWNER: M2. Printable QR roll labels, no menu around them. /labels?ids=1,2,3 (no ids = rolls waiting for QC).
import { useSearchParams } from 'react-router-dom';
import { useLive } from '../lib/api.js';
import Qr from '../components/Qr.jsx';

export default function RollLabels() {
  const [params] = useSearchParams();
  const ids = params.get('ids');
  const { data, error } = useLive(`/rolls/labels${ids ? `?ids=${encodeURIComponent(ids)}` : ''}`);
  return (
    <div className="label-page">
      <div className="label-bar no-print">
        <b>Roll labels</b><span>{data ? `${data.length} label${data.length === 1 ? '' : 's'}` : ''}</span>
        <button className="btn" onClick={() => window.print()}>Print</button><button className="btn ghost" onClick={() => history.back()}>Back</button>
      </div>
      {error ? <div className="empty err">{error.message}</div> : !data ? <div className="empty">Loading</div> : data.length === 0 ? <div className="empty">No rolls to label.</div> : (
        <div className="label-sheet">
          {data.map((r) => (
            <div className="roll-label" key={r.id}>
              <Qr text={`${location.origin}/scan/${r.code}`} size={96} />
              <div className="roll-label-text">
                <b>{r.code}</b>
                <span>{r.metres} m</span>
                <span>{r.fabric_type}, {r.colour}</span>
                <span>Order {r.order_id}: {r.buyer}</span>
                <small>{r.machine} - {String(r.created_at).slice(0, 10)}</small>
              </div>
            </div>))}
        </div>)}
    </div>
  );
}
