import { useEffect, useState } from 'react';

// TEMPORARY field-debug readout for the return-from-background endless
// spinner. Ring buffer of timestamped lifecycle events, rendered under the
// search spinner so a phone tester can quote it back. DELETE once diagnosed.
const trace: string[] = [];
const subs = new Set<() => void>();

export function dbg(ev: string) {
  const t = new Date();
  const ts = `${String(t.getMinutes()).padStart(2, '0')}:${String(t.getSeconds()).padStart(2, '0')}`;
  trace.push(`${ts} ${ev}`);
  if (trace.length > 10) trace.splice(0, trace.length - 10);
  subs.forEach((cb) => { try { cb(); } catch { /* never break the app */ } });
  try { console.debug('[vdbg]', ev); } catch { /* noop */ }
}

export function DbgView() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const cb = () => setTick((t) => t + 1);
    subs.add(cb);
    return () => { subs.delete(cb); };
  }, []);
  return (
    <div style={{ fontSize: 10, fontFamily: 'monospace', color: '#888', marginTop: 8, textAlign: 'left' }}>
      {trace.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  );
}
