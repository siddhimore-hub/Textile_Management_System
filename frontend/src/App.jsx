import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Flow from './pages/Flow.jsx';
import Track from './pages/Track.jsx';
import Login from './pages/Login.jsx';
import ModulePage from './pages/ModulePage.jsx';
import { ALL_ITEMS } from './lib/modules.js';
import { useAuth } from './lib/auth.jsx';
import Orders from './pages/Orders.jsx';
import Machines from './pages/Machines.jsx';
import { Spinning, Loom, Dyeing, Finishing as FinishingStage } from './pages/Stage.jsx';
import Rolls from './pages/Rolls.jsx';
import RollLabels from './pages/RollLabels.jsx';
import Scan from './pages/Scan.jsx';
import Finished from './pages/Finished.jsx';
import Invoices from './pages/Invoices.jsx';
import Attendance from './pages/Attendance.jsx';
import Payroll from './pages/Payroll.jsx';
import Costs from './pages/Costs.jsx';
import Parties from './pages/Parties.jsx';
import PurchaseRequests from './pages/PurchaseRequests.jsx';
import Users from './pages/Users.jsx';
import AuditLog from './pages/AuditLog.jsx';

// Custom pages replace the generic list. Remove an entry to fall back to ModulePage.
const custom = {
  '/orders': Orders, '/machines': Machines, '/spinning': Spinning, '/loom': Loom, '/dyeing': Dyeing, '/finishing': FinishingStage,
  '/rolls': Rolls, '/finished': Finished, '/invoices': Invoices, '/attendance': Attendance,
  '/payroll': Payroll, '/costs': Costs, '/parties': Parties, '/purchase-requests': PurchaseRequests, '/users': Users, '/audit': AuditLog,
};

// Everything except the buyer tracking page and login needs a logged-in user.
function RequireAuth({ children }) {
  const { user, ready } = useAuth(); const { pathname, search } = useLocation();
  if (!ready) return <div className="empty">Loading</div>;
  return user ? children : <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />;
}
// Hides a page the role may not use (the server refuses it anyway).
function Gate({ roles, children }) {
  const { can } = useAuth();
  return !roles || can(roles) ? children : <div className="empty err">Your role does not have access to this page.</div>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/track/:token" element={<Track />} />
      <Route path="/login" element={<Login />} />
      <Route path="/labels" element={<RequireAuth><RollLabels /></RequireAuth>} />
      <Route element={<RequireAuth><Layout /></RequireAuth>}>
        <Route index element={<Dashboard />} />
        <Route path="flow" element={<Flow />} />
        <Route path="scan/:code" element={<Scan />} />
        {ALL_ITEMS.filter((i) => i.endpoint).map((i) => {
          const C = custom[i.path];
          return <Route key={i.path} path={i.path.slice(1)} element={<Gate roles={i.roles}>{C ? <C /> : <ModulePage item={i} />}</Gate>} />;
        })}
        <Route path="*" element={<div className="empty">Page not found</div>} />
      </Route>
    </Routes>
  );
}
