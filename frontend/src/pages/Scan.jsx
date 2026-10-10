// OWNER: M2. What opens when a roll QR is scanned (or a code is typed): the roll, its stage and full inspection history.
import { Link, useParams } from 'react-router-dom';
import { useLive } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { Pill } from '../components/DataTable.jsx';
import DataTable from '../components/DataTable.jsx';
import { Inspect } from './Rolls.jsx';

export default function Scan() {
  const { code } = useParams(); const { can } = useAuth();
  const { data, error, reload } = useLive(`/rolls/by-code/${encodeURIComponent(code)}`, ['rolls']);
  if (error) return <div className="empty err">{error.message === 'Roll not found' ? `No roll with code ${code}.` : error.message}</div>;
  if (!data) return <div className="empty">Loading</div>;
  const where = data.dispatch_id ? `Dispatched (dispatch ${data.dispatch_id})` : data.qc_status === 'pass' ? 'In finished stock' : data.qc_status === 'reject' ? 'Rejected' : 'Waiting for quality check';
  return (
    <>
      <section className="card">
        <h2>{data.code} <Pill v={data.qc_status} /></h2>
        <p>{data.metres} m of {data.fabric_type}, {data.colour}. Order {data.order_id} for {data.buyer}. Made on {data.machine}. <b>{where}.</b></p>
        <div className="form-foot"><Link className="btn ghost" to={`/labels?ids=${data.id}`}>Print label</Link>
          {can(['qc']) && !data.dispatch_id && ['pending', 'rework'].includes(data.qc_status) && <Inspect roll={data} reload={reload} />}</div>
      </section>
      <h2 className="sub">Inspection history</h2>
      <DataTable columns={[['created_at', 'When'], ['result', 'Result'], ['defect_type', 'Defect'], ['inspector', 'Inspector'], ['notes', 'Notes']]} rows={data.inspections} empty="Not inspected yet." />
    </>
  );
}
