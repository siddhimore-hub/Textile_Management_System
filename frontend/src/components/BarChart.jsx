// Small dependency-free SVG bar chart. data = [{ label, value }]. Colours come from CSS variables.
export default function BarChart({ data, unit = '', height = 160 }) {
  const w = 600; const pad = { l: 36, r: 8, t: 10, b: 24 };
  const max = Math.max(1, ...data.map((d) => d.value));
  const bw = (w - pad.l - pad.r) / Math.max(1, data.length);
  const y = (v) => pad.t + (1 - v / max) * (height - pad.t - pad.b);
  const step = Math.ceil(data.length / 7);
  return (
    <svg className="chart" viewBox={`0 0 ${w} ${height}`} role="img" aria-label="Bar chart">
      {[0, 0.5, 1].map((f) => (
        <g key={f}><line x1={pad.l} x2={w - pad.r} y1={y(max * f)} y2={y(max * f)} className="chart-grid" />
          <text x={pad.l - 4} y={y(max * f) + 4} textAnchor="end" className="chart-text">{Math.round(max * f)}</text></g>))}
      {data.map((d, i) => (
        <g key={d.label}>
          <rect x={pad.l + i * bw + 3} y={y(d.value)} width={Math.max(2, bw - 6)} height={height - pad.b - y(d.value)} rx="2" className="chart-bar"><title>{`${d.label}: ${d.value} ${unit}`}</title></rect>
          {i % step === 0 && <text x={pad.l + i * bw + bw / 2} y={height - 6} textAnchor="middle" className="chart-text">{d.label}</text>}
        </g>))}
    </svg>
  );
}
