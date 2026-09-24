import { useEffect, useRef, useState } from 'react';
import { faultCatalogue, type FaultKey } from '../sim';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Toast } from '../ui/Toast';
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
  const [confirmClear, setConfirmClear] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const clearButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const diagnostics = useSimStore((s) => s.snapshot.diagnostics);
  const commandFault = useSimStore((s) => s.commandFault);
  const available = Object.values(diagnostics.busStatus).every((owner) => owner.available);
  const selectedActive = diagnostics.records.some((record) => record.key === selected && record.status === 'active');

  useEffect(() => {
    if (confirmClear) cancelButton.current?.focus();
    else if (showToast) clearButton.current?.focus();
  }, [confirmClear, showToast]);

  useEffect(() => {
    if (!showToast) return;
    const timer = window.setTimeout(() => setShowToast(false), 4000);
    return () => window.clearTimeout(timer);
  }, [showToast]);

  function cancelClear() {
    setConfirmClear(false);
    clearButton.current?.focus();
  }

  function clearAll() {
    commandFault({ action: 'clearAll' });
    setConfirmClear(false);
    setShowToast(true);
  }

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
        {diagnostics.records.length > 0 && <Button ref={clearButton} variant="secondary" onClick={() => { setShowToast(false); setConfirmClear(true); }}>Clear all faults</Button>}
      </section>
      {confirmClear && (
        <Modal title="Clear all faults">
          <p>Clear stored fault records? Active faults and their records will remain until their conditions are restored.</p>
          <div className={styles.modalActions}>
            <Button ref={cancelButton} variant="secondary" onClick={cancelClear}>Cancel</Button>
            <Button variant="primary" onClick={clearAll}>Clear all faults</Button>
          </div>
        </Modal>
      )}
      {showToast && <Toast>Fault log cleared</Toast>}
    </div>
  );
}
