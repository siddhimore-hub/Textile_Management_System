// Generic live list page driven by lib/modules.js. Owners replace or extend it per page.
import { useLive } from '../lib/api.js';
import DataTable from '../components/DataTable.jsx';
import EntryForm from '../components/EntryForm.jsx';

function ReceiptForm({ onDone }) {
  const m = useLive('/materials'); const s = useLive('/suppliers');
  const opts = (rows) => (rows || []).map((r) => ({ value: r.id, label: r.name }));
  return <EntryForm title="Receive yarn" endpoint="/receipts" submitLabel="Add to stock" onDone={onDone} fields={[
    { name: 'material_id', label: 'Material', options: opts(m.data) }, { name: 'supplier_id', label: 'Supplier', options: opts(s.data) },
    { name: 'qty', label: 'Quantity (kg)', type: 'number' }, { name: 'lot_no', label: 'Lot number' }]} />;
}

export default function ModulePage({ item }) {
  const { data, error, loading, reload } = useLive(item.endpoint, item.live || []);
  return (
    <>
      <p className="owner-note">Built by {item.owner}. {item.hint}</p>
      {item.form === 'receipt' && <ReceiptForm onDone={reload} />}
      {error ? <div className="empty err">{error.message}</div> : loading ? <div className="empty">Loading</div>
        : <DataTable columns={item.columns} rows={data} />}
    </>
  );
}
