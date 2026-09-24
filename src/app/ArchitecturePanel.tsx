import { useMemo } from 'react';
import { useSimStore } from './simStore';
import { formatCanId, visibleFrames } from './traceModel';
import styles from './ArchitecturePanel.module.css';

export const TRACE_ROW_LIMIT = 100;
/** Trace refreshes per simulated second; keeps rendering cheap while driving. */
const REFRESH_HZ = 4;

export function ArchitecturePanel() {
  const sim = useSimStore((s) => s.sim);
  const bucket = useSimStore((s) => Math.floor(s.snapshot.timeS * REFRESH_HZ));
  // eslint-disable-next-line react-hooks/exhaustive-deps -- bucket throttles re-reads of the mutable trace
  const rows = useMemo(() => visibleFrames(sim.trace(), { limit: TRACE_ROW_LIMIT }), [sim, bucket]);

  return (
    <div className={styles.content}>
      <h2 id="trace-title">CAN trace</h2>
      {rows.length === 0 ? (
        <p className={styles.empty}>No frames yet. Power on to start bus traffic.</p>
      ) : (
        <table className={styles.table} aria-labelledby="trace-title">
          <thead>
            <tr><th scope="col">Time (s)</th><th scope="col">ID</th><th scope="col">Message</th><th scope="col">Sender</th></tr>
          </thead>
          <tbody>
            {rows.map((f, i) => (
              <tr key={`${f.t}-${f.id}-${i}`}>
                <td>{f.t.toFixed(3)}</td><td>{formatCanId(f.id)}</td><td>{f.name}</td><td>{f.sender}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
