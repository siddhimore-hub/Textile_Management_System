import { useLive } from '../lib/api.js';

const tiles = [
  ['open_orders', 'Open orders'], ['today_metres', 'Metres made today'], ['machines_running', 'Machines running'], ['machines_idle', 'Machines idle'],
  ['machines_down', 'Machines down'], ['rolls_awaiting_qc', 'Rolls awaiting QC'], ['rolls_ready', 'Rolls ready to ship'], ['low_stock_items', 'Low stock items'],
];
export default function Dashboard() {
  const { data, error } = useLive('/dashboard', ['orders', 'machines', 'rolls', 'stock', 'dispatch']);
  const fin = useLive('/finance/summary', ['dispatch']);
  if (error) return <div className="empty err">{error.message}. Is the backend running on port 4000?</div>;
  return (
    <>
      <div className="tiles">{tiles.map(([k, l]) => <div className="tile" key={k}><b>{data ? data[k] : '-'}</b><span>{l}</span></div>)}</div>
      <section className="card"><h2>This month</h2>
        {fin.data ? <div className="money">{[['Billed', 'billed'], ['Received', 'received'], ['Costs', 'costs'], ['Wages', 'wages'], ['Profit', 'profit']].map(([l, k]) =>
          <div key={k}><span>{l}</span><b>{Number(fin.data[k]).toLocaleString('en-IN')}</b></div>)}</div> : <div className="empty">Loading</div>}
      </section>
    </>
  );
}
