// OWNER: M4. Add worker, run monthly payroll.
import { useState } from 'react';
import { useLive, useAction } from '../lib/api.js';
import DataTable from '../components/DataTable.jsx';
import EntryForm from '../components/EntryForm.jsx';
import Msg from '../components/Msg.jsx';

export default function Payroll() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const pay = useLive(`/payroll?month=${month}`); const [run, msg] = useAction(pay.reload);
  const total = (pay.data || []).reduce((s, p) => s + p.amount, 0);
  return (<>
    <EntryForm title="Add worker" endpoint="/workers" submitLabel="Add worker" fields={[{ name: 'name', label: 'Name' }, { name: 'daily_wage', label: 'Daily wage', type: 'number' }]} />
    <div className="card form"><h2>Run payroll</h2><div className="fields"><label><span>Month</span><input type="month" value={month} onChange={(e) => setMonth(e.target.value)} /></label></div>
      <div className="form-foot"><button className="btn" onClick={() => run('/payroll/run', { method: 'POST', body: { month } })}>Run payroll for {month}</button><Msg msg={msg} />
        <span className="muted">Wages = days present x daily wage (half day counts 0.5). Already paid workers are skipped.</span></div></div>
    <DataTable columns={[['name', 'Worker'], ['month', 'Month'], ['amount', 'Amount']]} rows={pay.data} empty="No payroll for this month yet." />
    {pay.data?.length > 0 && <p><b>Total: {total.toLocaleString('en-IN')}</b></p>}
  </>);
}
