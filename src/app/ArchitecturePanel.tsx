import { useMemo, useState } from 'react';
import { useSimStore } from './simStore';
import { clearMark, formatCanId, formatSignals, pauseSnapshot, visibleFrames } from './traceModel';
import { busCatalogue, type Frame } from '../sim/bus';
import styles from './ArchitecturePanel.module.css';

export const TRACE_ROW_LIMIT = 100;
/** Trace refreshes per simulated second; keeps rendering cheap while driving. */
const REFRESH_HZ = 4;

export function ArchitecturePanel() {
  const sim = useSimStore((s) => s.sim);
  const bucket = useSimStore((s) => Math.floor(s.snapshot.timeS * REFRESH_HZ));
  const [ecu, setEcu] = useState('');
  const [message, setMessage] = useState('');
  const [paused, setPaused] = useState<readonly Frame[] | null>(null);
  const [clearedAt, setClearedAt] = useState<number | undefined>(undefined);
  const [selected, setSelected] = useState<Frame | null>(null);
  const edges = useMemo(() => sim.topology().edges, [sim]);
  const senders = useMemo(() => [...new Set(edges.map((e) => e.sender))].sort(), [edges]);
  const rows = useMemo(
    () =>
      visibleFrames(paused ?? sim.trace(), {
        limit: TRACE_ROW_LIMIT,
        ecu: ecu || undefined,
        message: message || undefined,
        clearedAt,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bucket throttles re-reads of the mutable trace
    [sim, bucket, ecu, message, paused, clearedAt],
  );
  const filtered = ecu !== '' || message !== '';

  return (
    <div className={styles.content}>
      <h2 id="trace-title">CAN trace</h2>
      <div className={styles.filters}>
        <label>
          ECU
          <select value={ecu} onChange={(e) => setEcu(e.target.value)}>
            <option value="">All</option>
            {senders.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label>
          Message
          <select value={message} onChange={(e) => setMessage(e.target.value)}>
            <option value="">All</option>
            {edges.map((m) => <option key={m.message} value={m.message}>{m.message}</option>)}
          </select>
        </label>
        <button type="button" disabled={!filtered} onClick={() => { setEcu(''); setMessage(''); }}>
          Clear filters
        </button>
        <button type="button" onClick={() => setPaused(paused ? null : pauseSnapshot(sim.trace()))}>
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button type="button" onClick={() => setClearedAt(clearMark(paused ?? sim.trace()) ?? clearedAt)}>
          Clear trace
        </button>
      </div>
      {rows.length === 0 ? (
        <p className={styles.empty}>
          {filtered
            ? 'No frames match the filters.'
            : clearedAt !== undefined
              ? 'Trace cleared. Newer frames will appear here.'
              : 'No frames yet. Power on to start bus traffic.'}
        </p>
      ) : (
        <table className={styles.table} aria-labelledby="trace-title">
          <thead>
            <tr><th scope="col">Time (s)</th><th scope="col">ID</th><th scope="col">Message</th><th scope="col">Sender</th></tr>
          </thead>
          <tbody>
            {rows.map((f, i) => (
              <tr
                key={`${f.t}-${f.id}-${i}`}
                tabIndex={0}
                aria-selected={f === selected}
                className={f === selected ? styles.selected : undefined}
                onClick={() => setSelected(f)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setSelected(f);
                  }
                }}
              >
                <td>{f.t.toFixed(3)}</td><td>{formatCanId(f.id)}</td><td>{f.name}</td><td>{f.sender}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {selected && (
        <section className={styles.detail} aria-labelledby="signal-title">
          <h3 id="signal-title">Signals: {selected.name}</h3>
          <table className={styles.table}>
            <thead>
              <tr><th scope="col">Signal</th><th scope="col">Value</th><th scope="col">Unit</th></tr>
            </thead>
            <tbody>
              {formatSignals(selected, busCatalogue).map((s) => (
                <tr key={s.name}><td>{s.name}</td><td>{s.value}</td><td>{s.unit ?? ''}</td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
