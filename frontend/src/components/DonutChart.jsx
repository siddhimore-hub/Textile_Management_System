// Dependency-free SVG donut. segments = [{ label, value, cls }]; cls picks the colour in dashboard.css.
export default function DonutChart({ segments, centre, caption }) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  let offset = 0;
  return (
    <div className="donut">
      <svg viewBox="0 0 42 42" role="img" aria-label={`${caption}: ${total}`}>
        <circle cx="21" cy="21" r="16" pathLength="100" className="donut-track" />
        {total > 0 && segments.filter((s) => s.value > 0).map((s) => {
          const len = (s.value / total) * 100; const el = (
            <circle key={s.label} cx="21" cy="21" r="16" pathLength="100" className={`donut-seg ${s.cls}`} strokeDasharray={`${Math.max(0, len - 0.8)} ${100 - Math.max(0, len - 0.8)}`} strokeDashoffset={-offset}><title>{`${s.label}: ${s.value}`}</title></circle>);
          offset += len; return el;
        })}
      </svg>
      <div className="donut-centre"><b>{centre}</b><span>{caption}</span></div>
    </div>
  );
}
