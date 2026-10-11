// OWNER: M4. Who changed what, and when. Read only.
import { useState } from 'react';
import { useLive } from '../lib/api.js';
import DataTable from '../components/DataTable.jsx';

export default function AuditLog() {
  const [actor, setActor] = useState('');
  const { data, error, loading } = useLive(`/audit-logs?limit=300${actor ? `&actor=${encodeURIComponent(actor)}` : ''}`);
  return (
    <>
      <div className="card form"><div className="fields"><label><span>Filter by person</span><input value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Name or role" /></label></div></div>
      {error ? <div className="empty err">{error.message}</div> : loading ? <div className="empty">Loading</div>
        : <DataTable columns={[['created_at', 'When'], ['actor', 'Who'], ['action', 'What'], ['entity', 'Area'], ['entity_id', 'Record']]} rows={data} empty="Nothing logged yet." />}
    </>
  );
}
