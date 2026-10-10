import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Flow from './pages/Flow.jsx';
import Track from './pages/Track.jsx';
import ModulePage from './pages/ModulePage.jsx';
import { ALL_ITEMS } from './lib/modules.js';
import Orders from './pages/Orders.jsx';
import Machines from './pages/Machines.jsx';
import Rolls from './pages/Rolls.jsx';
import Finished from './pages/Finished.jsx';
import Invoices from './pages/Invoices.jsx';
import Attendance from './pages/Attendance.jsx';
import Payroll from './pages/Payroll.jsx';
import Costs from './pages/Costs.jsx';

// Custom pages replace the generic list. Remove an entry to fall back to ModulePage.
const custom = { '/orders': Orders, '/machines': Machines, '/rolls': Rolls, '/finished': Finished, '/invoices': Invoices, '/attendance': Attendance, '/payroll': Payroll, '/costs': Costs };

export default function App() {
  return (
    <Routes>
      <Route path="/track/:token" element={<Track />} />
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="flow" element={<Flow />} />
        {ALL_ITEMS.filter((i) => i.endpoint).map((i) => <Route key={i.path} path={i.path.slice(1)} element={custom[i.path] ? (() => { const C = custom[i.path]; return <C />; })() : <ModulePage item={i} />} />)}
        <Route path="*" element={<div className="empty">Page not found</div>} />
      </Route>
    </Routes>
  );
}
