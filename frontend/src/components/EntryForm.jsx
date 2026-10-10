// Reusable form: shows server validation errors under the right field. Copy this pattern for every form.
import { useState } from 'react';
import { api } from '../lib/api.js';

export default function EntryForm({ title, fields, endpoint, submitLabel = 'Save', onDone }) {
  const [values, setValues] = useState({});
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState(null);
  const set = (k, v) => setValues((s) => ({ ...s, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setErrors({}); setMessage(null);
    try {
      await api(endpoint, { method: 'POST', body: values });
      setValues({}); setMessage({ ok: true, text: `${submitLabel} done` }); onDone?.();
    } catch (err) {
      setErrors(err.fields || {}); setMessage({ ok: false, text: err.message });
    }
  }
  return (
    <form className="card form" onSubmit={submit} noValidate>
      <h2>{title}</h2>
      <div className="fields">
        {fields.map((f) => (
          <label key={f.name} className={errors[f.name] ? 'has-error' : ''}>
            <span>{f.label}</span>
            {f.options ? (
              <select value={values[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)}>
                <option value="">Choose</option>
                {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            ) : (
              <input type={f.type || 'text'} value={values[f.name] ?? ''} onChange={(e) => set(f.name, e.target.value)} />
            )}
            {errors[f.name] && <small className="err">{errors[f.name]}</small>}
          </label>
        ))}
      </div>
      <div className="form-foot">
        <button className="btn" type="submit">{submitLabel}</button>
        {message && <span className={message.ok ? 'msg-ok' : 'err'}>{message.text}</span>}
      </div>
    </form>
  );
}
