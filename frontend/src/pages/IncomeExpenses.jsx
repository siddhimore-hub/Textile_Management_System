// OWNER: M4. Income (payments received) vs expenses (production costs + business costs) and profit.
// Unpaid invoices never count as income; supplier purchases are only counted as an expense when the
// money actually leaves the mill, so nothing here is double-counted.
import { useState } from 'react';
import { useLive, useAction } from '../lib/api.js';
import Msg from '../components/Msg.jsx';
import { inr } from '../lib/format.js';

export default function IncomeExpenses() {
  const summary = useLive('/ledger/summary', ['stock', 'dispatch', 'ledger']);
  const income = useLive('/ledger/income', ['dispatch']);
  const expenses = useLive('/ledger/expenses', ['ledger', 'stock']);
  const [from, setFrom] = useState(''); const [to, setTo] = useState('');
  const [f, setF] = useState({ category: '', description: '', amount: '', expense_date: '' });
  const [run, msg] = useAction(() => { setF({ category: '', description: '', amount: '', expense_date: '' }); });
  const fe = msg?.fields || {};
  const inRange = (date) => (from && date < from ? false : to && date > to ? false : true);
  const money = (rows) => (rows || []).filter((r) => inRange(r.date)).reduce((s, r) => s + r.amount, 0);
  const s = summary.data || {};
  const incomeRows = income.data || []; const expenseRows = expenses.data || [];
  return (
    <>
      <div className="grid three">
        <div className="card"><h3>Income received</h3><p className="big">{inr(s.income)}</p><p className="muted">Payments received this period</p></div>
        <div className="card"><h3>Money spent</h3><p className="big">{inr(s.expenses)}</p><p className="muted">Production and business costs</p></div>
        <div className="card"><h3>Profit</h3><p className={`big ${(s.profit || 0) < 0 ? 'err' : ''}`}>{inr(s.profit)}</p><p className="muted">Income minus expenses</p></div>
      </div>
      <div className="card form"><div className="fields row">
        <label><span>From</span><input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
        <label><span>To</span><input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></label>
        <label><span>New expense</span><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}><option value="">Category</option>
          {['Rent', 'Power', 'Transport', 'Salaries', 'Repairs', 'Marketing', 'Other'].map((c) => <option key={c}>{c}</option>)}</select></label>
        <label><span>Details</span><input placeholder="e.g. power bill, June" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></label>
        <label className={fe.amount ? 'has-error' : ''}><span>Amount</span><input type="number" placeholder="0" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} />{fe.amount && <small className="err">{fe.amount}</small>}</label>
        <label><span>Date</span><input type="date" value={f.expense_date} onChange={(e) => setF({ ...f, expense_date: e.target.value })} /></label>
        <div style={{ alignSelf: 'end' }}><button className="btn" onClick={() => run('/expenses', { method: 'POST', body: f })}>Add expense</button></div>
      </div><Msg msg={msg} /></div>

      <div className="grid two">
        <div className="table-wrap"><table><thead><tr><th>Date</th><th>Income</th><th>Amount (in)</th></tr></thead>
          <tbody>{incomeRows.length === 0 ? <tr><td className="muted" colSpan="3">No payments yet.</td></tr>
            : incomeRows.filter((r) => inRange(r.date)).map((r) => (
              <tr key={`i${r.id}`}><td>{r.date}</td><td>{r.description}</td><td>{inr(r.amount)}</td></tr>))}</tbody>
          <tfoot><tr><th colSpan="2">Total received</th><th>{inr(money(incomeRows))}</th></tr></tfoot></table></div>
        <div className="table-wrap"><table><thead><tr><th>Date</th><th>Expense</th><th>Category</th><th>Amount (out)</th></tr></thead>
          <tbody>{expenseRows.length === 0 ? <tr><td className="muted" colSpan="4">No expenses recorded.</td></tr>
            : expenseRows.filter((r) => inRange(r.date)).map((r) => (
              <tr key={`${r.source}${r.id}`}><td>{r.date}</td><td>{r.description}</td><td>{r.category}</td><td>{inr(r.amount)}</td></tr>))}</tbody>
          <tfoot><tr><th colSpan="3">Total spent</th><th>{inr(money(expenseRows))}</th></tr></tfoot></table></div>
      </div>
    </>
  );
}