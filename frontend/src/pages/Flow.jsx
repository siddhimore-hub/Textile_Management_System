import { Link } from 'react-router-dom';
const steps = [
  ['Yarn arrives', 'Store keeper records the receipt. Stock goes up.', '/stock', 'M1'],
  ['Order comes in', 'Sales enters the order. The system checks if yarn is enough.', '/orders', 'M1'],
  ['Job on a machine', 'Supervisor assigns the order to a free machine and logs output.', '/machines', 'M2'],
  ['Roll made and checked', 'Each roll gets a code. QC marks it pass, rework or reject.', '/rolls', 'M2'],
  ['Buyer checks status', 'Buyer opens a tracking link. No phone call needed.', '/track/demo', 'M3'],
  ['Dispatch and invoice', 'Only passed rolls go on the truck. The invoice is made from the same list.', '/finished', 'M3'],
  ['Wages and costs', 'Attendance becomes wages. Costs and payments roll up to profit.', '/costs', 'M4'],
];
export default function Flow() {
  return (
    <ol className="flow">
      {steps.map(([t, d, to, o], i) => (
        <li key={t}><span className="dot">{i + 1}</span><div><h3>{t}</h3><p>{d}</p>
          {to === '/track/demo' ? <small>Public page: /track/&lt;order token&gt;</small> : <Link to={to}>Open page ({o})</Link>}</div></li>
      ))}
    </ol>
  );
}
