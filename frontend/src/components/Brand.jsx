// Logo (peak woven from thread lines = Everest + textile) and the folded-fabric picture at the foot of the sidebar. Pure SVG, no image files.
export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 48 48" aria-hidden="true">
      <rect x="2" y="2" width="44" height="44" rx="11" className="logo-back" />
      <path d="M10 33 24 11l14 22z" className="logo-snow" />
      <path d="M15.5 28.5h17M19 23.5h10M22 18.5h4" className="logo-line" />
      <path d="M8 38.5c4-2.6 8 2.6 12 0s8 2.6 12 0 6-1.3 8-.6" className="logo-gold" />
    </svg>
  );
}
export default function Brand({ dark = false }) {
  return <div className={`brand ${dark ? 'dark' : ''}`}><Logo /><div>Everest Textile Mills<small>We weave quality · Delivering trust</small></div></div>;
}
export function FabricArt() {
  return (
    <div className="side-art" aria-hidden="true">
      <p>Better fabrics,<br />brighter future</p>
      <svg viewBox="0 0 220 90">
        <ellipse cx="150" cy="62" rx="64" ry="26" className="roll roll-a" /><ellipse cx="150" cy="62" rx="22" ry="9" className="roll-core" />
        <ellipse cx="84" cy="74" rx="56" ry="20" className="roll roll-b" /><ellipse cx="84" cy="74" rx="17" ry="7" className="roll-core" />
        <ellipse cx="190" cy="82" rx="38" ry="12" className="roll roll-c" />
      </svg>
    </div>
  );
}
