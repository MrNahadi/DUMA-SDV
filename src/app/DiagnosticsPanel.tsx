import { useState } from 'react';
import { faultCatalogue, type FaultKey } from '../sim';
import { Button } from '../ui/Button';
import { useSimStore } from './simStore';
import styles from './DiagnosticsPanel.module.css';

const faultNames: Record<FaultKey, string> = {
  cellOverTemperature: 'Cell over-temperature',
  insulationFault: 'Insulation fault',
  motorOverTemperature: 'Motor over-temperature',
  low12V: '12 V low',
};

export function DiagnosticsPanel() {
  const [selected, setSelected] = useState<FaultKey>(faultCatalogue[0].key);
  const diagnostics = useSimStore((s) => s.snapshot.diagnostics);
  const commandFault = useSimStore((s) => s.commandFault);
  const available = Object.values(diagnostics.busStatus).every((owner) => owner.available);
  const selectedActive = diagnostics.records.some((record) => record.key === selected && record.status === 'active');

  return (
    <div className={styles.content}>
      <section aria-labelledby="inject-title" className={styles.section}>
        <h2 id="inject-title">Fault injection</h2>
        <label htmlFor="fault-type">Fault type</label>
        <select id="fault-type" value={selected} onChange={(event) => setSelected(event.target.value as FaultKey)}>
          {faultCatalogue.map((fault) => <option key={fault.key} value={fault.key}>{faultNames[fault.key]}</option>)}
        </select>
        <Button variant="primary" large disabled={selectedActive} onClick={() => commandFault({ key: selected, action: 'inject' })}>Inject fault</Button>
        {selectedActive && <p className={styles.hint}>This condition is already active.</p>}
      </section>
      <section aria-labelledby="records-title" className={styles.section}>
        <h2 id="records-title">Diagnostic records</h2>
        {!available && <p role="status">Diagnostic data unavailable. Wait for ECU messages.</p>}
        {available && diagnostics.records.length === 0 && <p>No faults. Inject fault to see how the car responds.</p>}
        {available && diagnostics.records.length > 0 && (
          <ul className={styles.records}>
            {diagnostics.records.map((record) => (
              <li key={record.key} className={styles.record}>
                <strong>{record.code}</strong>
                <span>{faultNames[record.key]}</span>
                <span>{record.status === 'active' ? 'Active' : 'Stored'} · {record.owner} · {record.module}</span>
                {record.status === 'active' && <Button variant="quiet" onClick={() => commandFault({ key: record.key, action: 'restore' })}>Restore {faultNames[record.key]}</Button>}
                <Button variant="secondary" disabled={record.status === 'active'} onClick={() => commandFault({ key: record.key, action: 'clear' })}>Clear fault</Button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
