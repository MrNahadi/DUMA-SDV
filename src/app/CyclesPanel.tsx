import { useMemo, useState } from 'react';
import { Route, Square } from 'lucide-react';
import { Button } from '../ui/Button';
import type { CycleId } from '../sim/scenarios';
import { useSimStore } from './simStore';
import { ModeControl } from './ModeControl';
import { CycleChart } from './CycleChart';
import { ExportCsvButton } from './ExportCsvButton';
import styles from './ChargePanel.module.css';

const cycleNames: Record<CycleId, string> = { urban: 'Urban', highway: 'Highway' };

export function CyclesPanel() {
  const cycleRun = useSimStore((s) => s.cycleRun);
  const runCycle = useSimStore((s) => s.runCycle);
  const stopCycle = useSimStore((s) => s.stopCycle);
  const [cycleId, setCycleId] = useState<CycleId>('urban');
  const samples = useMemo(() => [...(cycleRun?.runner.telemetry() ?? [])], [cycleRun]);
  const running = cycleRun?.status.state === 'running';
  const status = cycleRun?.status;
  const result = cycleRun?.result ?? null;
  const percent = status ? Math.round((status.elapsedS / status.durationS) * 100) : 0;

  return (
    <div className={styles.content}>
      <section className={styles.soc} aria-label="Result">
        {result ? (
          <>
            <span className={styles.label}>Wh/km</span>
            <span className={styles.hero}>{result.whPerKm.toFixed(0)}</span>
            <div className={styles.details}>
              <div><span>Distance</span><strong>{result.distanceKm.toFixed(2)} km</strong></div>
              <div><span>Net energy</span><strong>{result.netEnergyKWh.toFixed(3)} kWh</strong></div>
            </div>
          </>
        ) : (
          <span className={styles.status} role="status">
            {status?.state === 'stopped'
              ? 'Cycle stopped. No result.'
              : status?.state === 'failed'
                ? `Cycle failed: ${status.reason ?? 'unknown reason'}. No result.`
                : status?.state === 'running'
                  ? `${cycleNames[status.cycleId]} cycle running`
                  : 'Run a cycle to see Wh/km.'}
          </span>
        )}
      </section>
      <section className={styles.controls} aria-label="Cycle controls">
        <span className={styles.label}>Mode</span>
        <ModeControl locked={running} />
        <label htmlFor="cycle-picker">Cycle</label>
        <select id="cycle-picker" value={cycleId} disabled={running} onChange={(e) => setCycleId(e.target.value as CycleId)}>
          <option value="urban">Urban</option>
          <option value="highway">Highway</option>
        </select>
        <progress aria-label="Cycle progress" max={100} value={percent} aria-valuenow={percent} />
        {running ? (
          <Button icon={<Square />} onClick={stopCycle}>Stop cycle</Button>
        ) : (
          <Button variant="primary" icon={<Route />} onClick={() => runCycle(cycleId)}>Run cycle</Button>
        )}
      </section>
      <CycleChart samples={samples} />
      <ExportCsvButton label={status?.cycleId ?? 'cycle'} samples={samples} />
    </div>
  );
}
