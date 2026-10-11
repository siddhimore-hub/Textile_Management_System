// OWNER: M1. Add, edit and list buyers and yarn suppliers.
import { useState } from 'react';
import { useLive, useAction } from '../lib/api.js';
import { useAuth } from '../lib/auth.jsx';
import DataTable from '../components/DataTable.jsx';
import EntryForm from '../components/EntryForm.jsx';
import Msg from '../components/Msg.jsx';

function EditBuyerModal({ buyer, onDone, onClose }) {
  const [f, setF] = useState({ name: buyer.name || '', phone: buyer.phone || '', email: buyer.email || '' });
  const [run, msg] = useAction(onDone);
  const fe = msg?.fields || {};

  async function save(e) {
    e.preventDefault();
    const res = await run(`/buyers/${buyer.id}`, { method: 'PATCH', body: f });
    if (res) onClose();
  }

  return (
    <form className="card form" onSubmit={save} noValidate style={{ background: 'var(--indigo-100)', marginBottom: '1.25rem' }}>
      <h2>Edit Buyer #{buyer.id}</h2>
      <div className="fields">
        <label className={fe.name ? 'has-error' : ''}><span>Company name</span>
          <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
          {fe.name && <small className="err">{fe.name}</small>}
        </label>
        <label className={fe.phone ? 'has-error' : ''}><span>Phone (10 digits)</span>
          <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} />
          {fe.phone && <small className="err">{fe.phone}</small>}
        </label>
        <label className={fe.email ? 'has-error' : ''}><span>Email</span>
          <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          {fe.email && <small className="err">{fe.email}</small>}
        </label>
      </div>
      <div className="form-foot">
        <button className="btn" type="submit">Update Buyer</button>
        <button className="btn ghost" type="button" onClick={onClose}>Cancel</button>
        <Msg msg={msg} />
      </div>
    </form>
  );
}

export default function Parties() {
  const { can } = useAuth();
  const buyers = useLive('/buyers'); const suppliers = useLive('/suppliers');
  const [editBuyer, setEditBuyer] = useState(null);

  const buyerRows = (buyers.data || []).map((b) => ({
    ...b,
    actions: can(['sales']) ? (
      <button className="btn ghost tiny" onClick={() => setEditBuyer(b)}>Edit</button>
    ) : null
  }));

  return (
    <>
      {can(['sales']) && <EntryForm title="Add a buyer" endpoint="/buyers" submitLabel="Add buyer" onDone={buyers.reload}
        fields={[{ name: 'name', label: 'Company name' }, { name: 'phone', label: 'Phone (10 digits)', type: 'tel' }, { name: 'email', label: 'Email (optional)', type: 'email' }]} />}
      
      {editBuyer && (
        <EditBuyerModal
          buyer={editBuyer}
          onDone={buyers.reload}
          onClose={() => setEditBuyer(null)}
        />
      )}

      <h2 className="sub">Buyers</h2>
      <DataTable
        columns={[
          ['name', 'Name'],
          ['phone', 'Phone'],
          ['email', 'Email'],
          ['actions', 'Actions']
        ]}
        rows={buyerRows}
        empty="No buyers yet."
      />

      {can(['store']) && <div className="gap"><EntryForm title="Add a yarn supplier" endpoint="/suppliers" submitLabel="Add supplier" onDone={suppliers.reload}
        fields={[{ name: 'name', label: 'Supplier name' }, { name: 'phone', label: 'Phone (10 digits)', type: 'tel' }]} /></div>}
      <h2 className="sub">Yarn suppliers</h2>
      <DataTable columns={[['name', 'Name'], ['phone', 'Phone']]} rows={suppliers.data} empty="No suppliers yet." />
    </>
  );
}
