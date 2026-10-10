const LABELS = { in_qc: 'quality check', ready_to_ship: 'ready to ship', confirmed: 'not started' };
const label = (v) => (typeof v === 'string' ? (LABELS[v] ?? v.replaceAll('_', ' ')) : v);
const tone = { pass: 'ok', running: 'ok', dispatched: 'ok', ready_to_ship: 'ok', reject: 'bad', breakdown: 'bad', maintenance: 'warn', rework: 'warn', pending: 'warn', in_qc: 'warn', idle: 'muted', confirmed: 'muted', in_production: 'info' };

export function Pill({ v }) { return <span className={`pill ${tone[v] || 'muted'}`}>{label(v)}</span>; }

export default function DataTable({ columns, rows, empty = 'Nothing here yet.' }) {
  if (!rows?.length) return <div className="empty">{empty}</div>;
  const statusKeys = ['status', 'qc_status'];
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{columns.map(([k, h]) => <th key={k}>{h}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => (
          <tr key={r.id ?? r.worker_id ?? i}>{columns.map(([k]) => (
            <td key={k}>{statusKeys.includes(k) && r[k] ? <Pill v={r[k]} /> : k === 'low' ? (r[k] ? <Pill v="reject" /> : '') : (r[k] ?? '-')}</td>
          ))}</tr>
        ))}</tbody>
      </table>
    </div>
  );
}
