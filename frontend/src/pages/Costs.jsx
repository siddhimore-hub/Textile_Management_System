// OWNER: M4. Cost entries and cost per metre.
import { useLive, opts } from '../lib/api.js';
import DataTable from '../components/DataTable.jsx';
import EntryForm from '../components/EntryForm.jsx';

export default function Costs() {
  const costs = useLive('/finance/order-costs'); const orders = useLive('/orders');
  return (<>
    <EntryForm title="Add cost" endpoint="/costs" submitLabel="Add cost" onDone={costs.reload} fields={[
      { name: 'order_id', label: 'Order', options: opts(orders.data, (o) => `#${o.id} ${o.buyer}`) },
      { name: 'kind', label: 'Type', options: ['material', 'labour', 'overhead', 'supplier_bill'].map((k) => ({ value: k, label: k.replace('_', ' ') })) },
      { name: 'amount', label: 'Amount', type: 'number' }, { name: 'note', label: 'Note' }]} />
    <p className="owner-note">Cost per metre = all costs on the order divided by metres that passed quality check.</p>
    <DataTable columns={[['order_id', 'Order'], ['buyer', 'Buyer'], ['good_metres', 'Good metres'], ['cost', 'Cost'], ['cost_per_metre', 'Cost per metre']]} rows={(costs.data || []).map((c) => ({ ...c, id: c.order_id }))} />
  </>);
}
