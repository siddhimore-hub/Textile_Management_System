// Logo (mountain = Everest) and the folded-fabric picture at the foot of the sidebar. Pure SVG, no image files.
export function Logo() {
  return (
    <svg className="logo" viewBox="0 0 48 48" aria-hidden="true">
      <path d="M2 40 18 14l7 11 5-8 16 23z" className="logo-back" />
      <path d="M18 14l-6 10 4-2 3 3 3-3 3 3 3-5z" className="logo-snow" />
      <path d="M2 40h44" className="logo-line" />
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
