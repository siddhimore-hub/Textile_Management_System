// OWNER: M4. Live home screen: key numbers, output chart, order status, upcoming orders, dispatches, alerts, quick actions.
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLive } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import { ALL_ITEMS } from '../lib/modules.js';
import { inr, longDate, shiftOf, greeting, daysUntil } from '../lib/format.js';
import DataTable from '../components/DataTable.jsx';
import LineChart from '../components/LineChart.jsx';
import Icon from '../components/Icon.jsx';
import { Kpi, OrderStatus, Upcoming, Dispatches, Updates, QuickActions, ProcessStrip, Head, Loading, Fail } from '../components/DashWidgets.jsx';

const RISK = { overdue: ['Overdue', 'bad'], due_soon: ['Due within 3 days', 'warn'], behind: ['Behind schedule', 'warn'], yarn_short: ['Yarn short', 'warn'] };
// Who may START each action (same roles the server enforces for the write), so no one sees a button that will be refused.
const ACTIONS = [
  { to: '/orders', label: 'Add new order', icon: 'plus', tone: 'qa-blue', roles: ['sales'] },
  { to: '/stock', label: 'Update inventory', icon: 'box', tone: 'qa-green', roles: ['store'] },
  { to: '/machines', label: 'Log production', icon: 'cog', tone: 'qa-orange', roles: ['supervisor'] },
  { to: '/rolls', label: 'Mark quality check', icon: 'shield', tone: 'qa-purple', roles: ['qc'] },
  { to: '/finished', label: 'Create dispatch', icon: 'truck', tone: 'qa-orange', roles: ['sales'] },
  { to: '/attendance', label: 'Mark attendance', icon: 'calendar', tone: 'qa-green', roles: ['supervisor', 'accounts'] },
];

function Finance() {
  const fin = useLive('/finance/summary', ['dispatch', 'orders', 'ledger']);
  const rec = useLive('/finance/receivables', ['dispatch', 'orders', 'ledger']);
  return (
    <>
      <section className="card"><h2>This month</h2>
        {fin.data ? <div className="money">{[['Billed', 'billed'], ['Received', 'received'], ['Costs', 'costs'], ['Wages', 'wages'], ['Profit', 'profit']].map(([l, k]) =>
          <div key={k}><span>{l}</span><b>{inr(fin.data[k])}</b></div>)}</div> : <div className="empty">Loading</div>}
      </section>
      <section className="card"><h2>Money to collect, by buyer</h2>
        <DataTable columns={[['buyer', 'Buyer'], ['invoices', 'Invoices'], ['billed', 'Billed'], ['paid', 'Paid'], ['outstanding', 'Still to collect']]} rows={rec.data?.map((r) => ({ ...r, id: r.buyer_id }))} empty="No invoices yet." />
      </section>
    </>
  );
}

export default function Dashboard() {
  const { can, user } = useAuth();
  const [days, setDays] = useState(14);
  const sum = useLive('/dashboard', ['orders', 'machines', 'rolls', 'stock', 'dispatch']);
  const orders = useLive('/orders', ['orders', 'rolls', 'dispatch']);
  const stock = useLive('/stock', ['stock', 'orders']);
  const finished = useLive('/finished-stock', ['rolls', 'dispatch']);
  const machines = useLive('/machines', ['machines']);
  const dispatches = useLive('/dispatches', ['dispatch']);
  const notes = useLive('/notifications', ['notifications']);
  const trend = useLive(`/dashboard/trend?days=${days}`, ['machines']);
  const risk = useLive('/dashboard/at-risk', ['orders', 'rolls', 'machines', 'stock']);
  const openable = (path) => can(ALL_ITEMS.find((i) => i.path === path)?.roles);
  const to = (path) => (openable(path) ? path : undefined);
  if (sum.error) return <div className="empty err">{sum.error.message}. Is the backend running on port 4000?</div>;

  const list = orders.data; const mats = stock.data; const ms = machines.data; const d = sum.data;
  const dueWeek = list ? list.filter((o) => o.status !== 'dispatched' && daysUntil(o.deadline) >= 0 && daysUntil(o.deadline) <= 7).length : null;
  const lowCount = mats ? mats.filter((m) => m.low).length : null;
  const stockPct = mats?.length ? Math.round(((mats.length - lowCount) / mats.length) * 100) : null;
  const finMetres = finished.data ? finished.data.reduce((s, r) => s + r.metres, 0) : null;
  const total = ms?.length; const idle = ms?.filter((m) => m.status === 'idle').length; const down = ms?.filter((m) => ['breakdown', 'maintenance'].includes(m.status)).length;
  const stage = (s) => { const x = (ms || []).filter((m) => m.stage === s); return ms ? `${x.filter((m) => m.status === 'running').length} of ${x.length} running` : ''; };
  const [shift, hours] = shiftOf();
  const first = (user?.name || '').split(' ')[0];

  return (
    <>
      <div className="dash-head">
        <div><h1>{greeting()}{first && `, ${first}`}!</h1><p>Here is a quick overview of your textile mill today.</p></div>
        <div className="dash-when"><span><Icon name="calendar" />{longDate()}</span><span className="shift">{shift} <small>({hours})</small></span></div>
      </div>
      <div className="dash">
        <div className="dash-main">
          <div className="kpis">
            <Kpi tone="kpi-blue" icon="clipboard" label="Total orders" value={list ? list.length : '-'} sub={list ? `${dueWeek} due this week` : 'Loading'} to={to('/orders')} />
            <Kpi tone="kpi-green" icon="box" label="Raw material stock" value={stockPct === null ? '-' : `${stockPct}%`} sub={mats ? (lowCount ? `Low: ${lowCount} item${lowCount === 1 ? '' : 's'}` : 'All above reorder level') : 'Loading'} to={to('/stock')} />
            <Kpi tone="kpi-purple" icon="cube" label="Finished goods" value={finMetres === null ? '-' : `${inr(finMetres)} m`} sub={finished.data ? `in stock, ${finished.data.length} roll${finished.data.length === 1 ? '' : 's'}` : 'Loading'} to={to('/finished')} />
            <Kpi tone="kpi-orange" icon="cog" label="Machines running" value={ms ? `${d?.machines_running ?? 0} / ${total}` : '-'} sub={ms ? `${idle} idle${down ? `, ${down} down` : ''}` : 'Loading'} to={to('/machines')} />
          </div>
          <div className="dash-row wide-left">
            <section className="card">
              <div className="w-head"><div><h2>Production progress</h2><p className="w-sub">Fabric produced (metres){d ? `, ${inr(d.today_metres)} m today` : ''}</p></div>
                <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Chart range"><option value={7}>Last 7 days</option><option value={14}>Last 14 days</option><option value={30}>Last 30 days</option></select></div>
              {trend.error ? <Fail e={trend.error} /> : trend.data ? <div className="chart-scroll"><LineChart unit="m" data={trend.data.map((x) => ({ label: x.day.slice(5), value: x.metres }))} /></div> : <Loading />}
            </section>
            <section className="card"><Head title="Order status" /><OrderStatus orders={list} error={orders.error} /></section>
          </div>
          <div className="dash-row">
            <section className="card"><Upcoming orders={list} error={orders.error} /></section>
            <section className="card"><Dispatches rows={dispatches.data} error={dispatches.error} linked={openable('/dispatches')} /></section>
          </div>
        </div>
        <aside className="dash-rail">
          <section className="card"><Updates data={notes.data} error={notes.error} /></section>
          <section className="card"><QuickActions actions={ACTIONS.filter((a) => can(a.roles))} /></section>
        </aside>
      </div>
      <ProcessStrip steps={[
        { label: 'Yarn', icon: 'yarn', to: to('/stock'), note: d ? (d.low_stock_items ? `${d.low_stock_items} low` : 'Stock ok') : '' },
        { label: 'Spinning', icon: 'spool', to: to('/machines'), note: stage('spinning') }, { label: 'Weaving', icon: 'weave', to: to('/machines'), note: stage('weaving') },
        { label: 'Dyeing', icon: 'drop', to: to('/machines'), note: stage('dyeing') },
        { label: 'Quality check', icon: 'shield', to: to('/rolls'), note: d ? `${d.rolls_awaiting_qc} roll${d.rolls_awaiting_qc === 1 ? '' : 's'} waiting` : '' },
        { label: 'Dispatch', icon: 'truck', to: to('/finished'), note: d ? `${d.rolls_ready} ready` : '' },
      ]} />
      <section className="card"><h2>Orders at risk</h2>
        {risk.error ? <Fail e={risk.error} /> : !risk.data ? <Loading /> : risk.data.length === 0 ? <div className="empty">No orders at risk. Everything is on track.</div> : (
          <div className="table-wrap"><table><thead><tr><th>Order</th><th>Buyer</th><th>Fabric</th><th>Deadline</th><th>Days left</th><th>Done</th><th>Why</th></tr></thead>
            <tbody>{risk.data.map((r) => (
              <tr key={r.order_id}><td><Link to="/orders">#{r.order_id}</Link></td><td>{r.buyer}</td><td>{r.fabric_type}</td><td>{r.deadline}</td>
                <td>{r.days_left < 0 ? `${-r.days_left} late` : r.days_left}</td><td>{r.percent}%</td>
                <td><span className={`pill ${RISK[r.risk][1]}`}>{RISK[r.risk][0]}</span>{r.yarn_short && r.risk !== 'yarn_short' && <span className="pill warn"> Yarn short</span>}</td></tr>))}</tbody></table></div>)}
      </section>
      {can(['accounts']) && <Finance />}
    </>
  );
}
