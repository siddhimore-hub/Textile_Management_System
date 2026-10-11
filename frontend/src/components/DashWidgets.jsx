// Dashboard building blocks. Each takes plain data, so a slow or failed API call only affects its own card.
import { Link } from 'react-router-dom';
import DataTable, { Pill } from './DataTable.jsx';
import DonutChart from './DonutChart.jsx';
import Icon from './Icon.jsx';
import { daysUntil, shortDate, timeAgo } from '../lib/format.js';

const Loading = () => <div className="empty">Loading</div>;
const Fail = ({ e }) => <div className="empty err">{e.message}. Try again in a moment.</div>;
const Head = ({ title, to, sub }) => (
  <div className="w-head"><div><h2>{title}</h2>{sub && <p className="w-sub">{sub}</p>}</div>{to && <Link to={to} className="w-link">View all</Link>}</div>);

export function Kpi({ tone, icon, label, value, sub, to }) {
  const body = (<><span className="kpi-icon"><Icon name={icon} /></span><span className="kpi-text"><small>{label}</small><b>{value}</b><em>{sub}</em></span>{to && <Icon name="arrow" className="kpi-go" />}</>);
  return to ? <Link to={to} className={`kpi ${tone}`}>{body}</Link> : <div className={`kpi ${tone}`}>{body}</div>;
}

// A late order counts as "Delayed" instead of its production stage, so the slices always add up to the total.
export const ORDER_SEGMENTS = [
  ['in_production', 'In production', 'seg-prod'], ['partially_dispatched', 'Partly dispatched', 'seg-prod'],
  ['in_qc', 'Quality check', 'seg-qc'], ['ready_to_ship', 'Ready for dispatch', 'seg-ready'],
  ['partially_fulfilled', 'Partly reserved', 'seg-ready'],
  ['confirmed', 'Not started', 'seg-new'], ['delayed', 'Delayed', 'seg-late'], ['dispatched', 'Dispatched', 'seg-done'],
];
const SEG_KEYS = new Set(ORDER_SEGMENTS.map(([k]) => k));
export function countOrders(orders) {
  const c = Object.fromEntries(ORDER_SEGMENTS.map(([k]) => [k, 0]));
  for (const o of orders) {
    const key = o.status !== 'dispatched' && daysUntil(o.deadline) < 0 ? 'delayed' : (SEG_KEYS.has(o.status) ? o.status : 'in_production');
    c[key] += 1;
  }
  return c;
}
export function OrderStatus({ orders, error }) {
  if (error) return <Fail e={error} />; if (!orders) return <Loading />;
  const c = countOrders(orders);
  return (
    <div className="status-body">
      <DonutChart centre={orders.length} caption="Total orders" segments={ORDER_SEGMENTS.map(([k, label, cls]) => ({ label, cls, value: c[k] }))} />
      <ul className="legend">{ORDER_SEGMENTS.map(([k, label, cls]) => <li key={k}><i className={cls} /><span>{label}</span><b>{c[k]}</b></li>)}</ul>
    </div>);
}

export function Upcoming({ orders, error }) {
  const rows = (orders || []).filter((o) => o.status !== 'dispatched').sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 5)
    .map((o) => ({ id: o.id, order: `#${o.id}`, fabric: `${o.fabric_type} (${o.colour})`, qty_metres: o.qty_metres, due: shortDate(o.deadline), status: o.status }));
  return (<><Head title="Upcoming orders" to="/orders" />{error ? <Fail e={error} /> : !orders ? <Loading />
    : <DataTable empty="No open orders. New orders appear here." rows={rows} columns={[['order', 'Order'], ['fabric', 'Fabric'], ['qty_metres', 'Qty (m)'], ['due', 'Due'], ['status', 'Status']]} />}</>);
}

export function Dispatches({ rows, error, linked }) {
  const list = (rows || []).slice(0, 5).map((d) => ({ id: d.id, date: shortDate(d.created_at), buyer: d.buyer, rolls: d.rolls, vehicle_no: d.vehicle_no }));
  return (<><Head title="Recent dispatches" to={linked ? '/dispatches' : null} />{error ? <Fail e={error} /> : !rows ? <Loading />
    : <DataTable empty="Nothing dispatched yet." rows={list} columns={[['date', 'Date'], ['buyer', 'Buyer'], ['rolls', 'Rolls'], ['vehicle_no', 'Vehicle']]} />}</>);
}

const KIND = { breakdown: ['cog', 'bad'], low_stock: ['alert', 'bad'], purchase_request: ['cart', 'info'], qc_fail: ['shield', 'warn'], ready_to_ship: ['check', 'ok'], invoice: ['receipt', 'purple'] };
export function Updates({ data, error }) {
  const items = (data?.items || []).slice(0, 5);
  return (<><div className="w-head"><h2>Recent updates</h2>{data?.unread > 0 && <span className="pill bad">{data.unread} new</span>}</div>
    {error ? <Fail e={error} /> : !data ? <Loading /> : items.length === 0 ? <div className="empty">No updates yet. Alerts appear here as things happen.</div> : (
      <ul className="updates">{items.map((n) => {
        const [icon, tone] = KIND[n.kind] || ['bell', 'info'];
        const inner = (<><span className={`up-icon ${tone}`}><Icon name={icon} /></span><span className="up-text">{n.message}</span><small>{timeAgo(n.created_at)}</small></>);
        return <li key={n.id} className={n.read_at ? '' : 'unread'}>{n.link ? <Link to={n.link}>{inner}</Link> : <div>{inner}</div>}</li>;
      })}</ul>)}</>);
}

export function QuickActions({ actions }) {
  return (<><h2>Quick actions</h2>{actions.length === 0 ? <div className="empty">No actions for your role.</div> : (
    <div className="qa">{actions.map((a) => <Link key={a.to} to={a.to} className={`qa-item ${a.tone}`}><span className="qa-icon"><Icon name={a.icon} /></span><span>{a.label}</span><Icon name="right" /></Link>)}</div>)}</>);
}

export function ProcessStrip({ steps }) {
  return (
    <section className="card strip">
      <div className="strip-intro"><span className="up-icon ok"><Icon name="yarn" /></span><div><b>From yarn to fabric, every step counts.</b><p>Efficient. Transparent. Together.</p></div></div>
      <ol className="strip-steps">{steps.map((s, i) => {
        const inner = (<><span className="strip-icon"><Icon name={s.icon} /></span><b>{s.label}</b><small>{s.note}</small></>);
        return <li key={s.label}>{s.to ? <Link to={s.to}>{inner}</Link> : <div>{inner}</div>}{i < steps.length - 1 && <Icon name="arrow" className="strip-arrow" />}</li>;
      })}</ol>
    </section>);
}
export { Head, Loading, Fail, Pill };
