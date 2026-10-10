// OWNER: M1. Add and list buyers and yarn suppliers.
import { useLive } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import DataTable from '../components/DataTable.jsx';
import EntryForm from '../components/EntryForm.jsx';

export default function Parties() {
  const { can } = useAuth();
  const buyers = useLive('/buyers'); const suppliers = useLive('/suppliers');
  return (
    <>
      {can(['sales']) && <EntryForm title="Add a buyer" endpoint="/buyers" submitLabel="Add buyer" onDone={buyers.reload}
        fields={[{ name: 'name', label: 'Company name' }, { name: 'phone', label: 'Phone (10 digits)', type: 'tel' }, { name: 'email', label: 'Email (optional)', type: 'email' }]} />}
      <h2 className="sub">Buyers</h2>
      <DataTable columns={[['name', 'Name'], ['phone', 'Phone'], ['email', 'Email']]} rows={buyers.data} empty="No buyers yet." />
      {can(['store']) && <div className="gap"><EntryForm title="Add a yarn supplier" endpoint="/suppliers" submitLabel="Add supplier" onDone={suppliers.reload}
        fields={[{ name: 'name', label: 'Supplier name' }, { name: 'phone', label: 'Phone (10 digits)', type: 'tel' }]} /></div>}
      <h2 className="sub">Yarn suppliers</h2>
      <DataTable columns={[['name', 'Name'], ['phone', 'Phone']]} rows={suppliers.data} empty="No suppliers yet." />
    </>
  );
}
