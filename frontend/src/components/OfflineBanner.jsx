// Shows when the phone is offline, how many entries are waiting to be sent, and any the server refused.
import { useQueue, flushQueue, dismissFailed } from '../lib/api.js';

export default function OfflineBanner() {
  const { pending, failed, online } = useQueue();
  if (online && !pending.length && !failed.length) return null;
  return (
    <div className="banners">
      {!online && <div className="banner warn">You are offline. Floor entries (output, rolls, inspections, attendance, machine status) are saved on this device and sent later.</div>}
      {pending.length > 0 && <div className="banner info">{pending.length} entr{pending.length === 1 ? 'y is' : 'ies are'} waiting to be sent.{' '}
        {online && <button className="link-btn" onClick={flushQueue}>Send now</button>}</div>}
      {failed.length > 0 && (
        <div className="banner bad"><b>{failed.length} saved entr{failed.length === 1 ? 'y was' : 'ies were'} refused by the server:</b>
          <ul>{failed.map((f, i) => <li key={i}>{f.method} {f.path}: {f.error}</li>)}</ul>
          <button className="link-btn" onClick={dismissFailed}>Dismiss</button></div>)}
    </div>
  );
}
