import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Flow from './pages/Flow.jsx';
import Track from './pages/Track.jsx';
import ModulePage from './pages/ModulePage.jsx';
import { ALL_ITEMS } from './lib/modules.js';

export default function App() {
  return (
    <Routes>
      <Route path="/track/:token" element={<Track />} />
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="flow" element={<Flow />} />
        {ALL_ITEMS.filter((i) => i.endpoint).map((i) => <Route key={i.path} path={i.path.slice(1)} element={<ModulePage item={i} />} />)}
        <Route path="*" element={<div className="empty">Page not found</div>} />
      </Route>
    </Routes>
  );
}
