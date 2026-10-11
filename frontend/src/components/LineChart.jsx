// Dependency-free SVG area/line chart. data = [{ label, value }]. Colours come from CSS classes (dashboard.css).
export default function LineChart({ data, unit = '', height = 250 }) {
  const w = 600; const pad = { l: 40, r: 16, t: 28, b: 26 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const x = (i) => pad.l + (data.length < 2 ? (w - pad.l - pad.r) / 2 : (i / (data.length - 1)) * (w - pad.l - pad.r));
  const y = (v) => pad.t + (1 - v / max) * (height - pad.t - pad.b);
  const line = data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(d.value).toFixed(1)}`).join(' ');
  const area = data.length ? `${line} L${x(data.length - 1).toFixed(1)} ${height - pad.b} L${x(0).toFixed(1)} ${height - pad.b} Z` : '';
  const step = Math.ceil(data.length / 7); const last = data.length - 1;
  const lx = Math.min(Math.max(x(last), pad.l + 36), w - pad.r - 36);
  return (
    <svg className="chart line-chart" viewBox={`0 0 ${w} ${height}`} role="img" aria-label={`Line chart of ${unit} per day`}>
      {[0, 0.5, 1].map((f) => (
        <g key={f}><line x1={pad.l} x2={w - pad.r} y1={y(max * f)} y2={y(max * f)} className="chart-grid" />
          <text x={pad.l - 6} y={y(max * f) + 4} textAnchor="end" className="chart-text">{Math.round(max * f)}</text></g>))}
      {area && <path d={area} className="chart-area" />}
      {line && <path d={line} className="chart-line" />}
      {data.map((d, i) => (
        <g key={d.label + i}>
          <circle cx={x(i)} cy={y(d.value)} r={i === last ? 5 : 3} className="chart-dot"><title>{`${d.label}: ${d.value} ${unit}`}</title></circle>
          {i % step === 0 && <text x={x(i)} y={height - 7} textAnchor="middle" className="chart-text">{d.label}</text>}
        </g>))}
      {data.length > 0 && <g><rect x={lx - 36} y={y(data[last].value) - 28} width="72" height="20" rx="6" className="chart-tip" />
        <text x={lx} y={y(data[last].value) - 14} textAnchor="middle" className="chart-tip-text">{data[last].value} {unit}</text></g>}
    </svg>
  );
}
