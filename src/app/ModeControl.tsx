import type { DriveMode } from '../sim';
import { useSimStore } from './simStore';
import styles from './DrivePanel.module.css';

const modeNames: Record<DriveMode, string> = { eco: 'Eco', normal: 'Normal', sport: 'Sport' };

/** Eco / Normal / Sport segmented control; shared by the Drive and Cycles views (R15). */
export function ModeControl() {
  const driveMode = useSimStore((s) => s.chosenDriveMode ?? s.snapshot.driveMode);
  const locked = useSimStore((s) => s.cycleRun?.status.state === 'running');
  const driveModes = useSimStore((s) => s.snapshot.driveModes);
  const setDriveMode = useSimStore((s) => s.setDriveMode);
  // ADR 0015: VCU 1.0.0 does not offer Sport; the OTA update unlocks it.
  const sportLocked = driveModes.some((m) => m.id === 'sport' && !m.available);
  return (
    <>
      <div role="group" aria-label="Drive mode" className={styles.modes}>
        {driveModes.map(({ id, available }) => (
          <button
            key={id}
            type="button"
            aria-pressed={driveMode === id}
            disabled={locked || !available}
            onClick={() => setDriveMode(id)}
          >
            {modeNames[id]}
          </button>
        ))}
      </div>
      {sportLocked && <small className={styles.modeHint}>Sport arrives with a software update. Check for updates in Software.</small>}
    </>
  );
}
