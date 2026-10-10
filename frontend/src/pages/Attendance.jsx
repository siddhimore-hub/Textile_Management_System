// OWNER: M4. Daily attendance, phone friendly.
import { useState } from 'react';
import { useLive, useAction } from '../lib/api.js';
import { Pill } from '../components/DataTable.jsx';
import Msg from '../components/Msg.jsx';
import { useAuth } from '../lib/auth.jsx';

export default function Attendance() {
  const { can } = useAuth(); const mark = can(['supervisor', 'accounts']);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const list = useLive(`/attendance?date=${date}`); const [run, msg] = useAction(list.reload);
  const tone = { present: 'ok', half: 'warn', absent: 'bad' };
  return (<>
    <div className="card form"><div className="fields"><label><span>Date</span><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label></div><Msg msg={msg} /></div>
    {list.data && <div className="table-wrap"><table><thead><tr><th>Worker</th><th>Status</th><th>Mark</th></tr></thead>
      <tbody>{list.data.map((w) => (<tr key={w.worker_id}><td>{w.name}</td><td>{w.status ? <span className={`pill ${tone[w.status]}`}>{w.status}</span> : <Pill v="idle" />}</td>
        <td>{w.status || !mark ? '' : ['present', 'half', 'absent'].map((s) => <button key={s} className="btn ghost" onClick={() => run('/attendance', { method: 'POST', body: { worker_id: w.worker_id, work_date: date, status: s } })}>{s}</button>)}</td></tr>))}</tbody></table></div>}
  </>);
}
