import { useState } from 'react';
import { Button } from '../ui/Button';
import { Kbd } from '../ui/Kbd';
import { Modal } from '../ui/Modal';
import { Toast } from '../ui/Toast';
import type { Gear, GearRefusal, SimSnapshot } from '../sim';
import { useSimStore } from './simStore';
import { setPedalHeld } from './useDriveInput';
import styles from './DrivePanel.module.css';

const stepNames: Record<SimSnapshot['startup']['steps'][number]['id'], string> = {
  wake: 'Wake',
  selfCheck: 'Self-check',
  precharge: 'Pre-charge',
  contactors: 'Contactors',
  ready: 'READY',
};
const refusalHints: Record<GearRefusal, string> = {
  brakeRequired: 'Press the brake to shift out of P',
  speedTooHigh: 'Slow down before shifting',
  notReady: 'Power on the car before shifting',
};

export function DrivePanel() {
  const snapshot = useSimStore((s) => s.snapshot);
  const powerOff = useSimStore((s) => s.powerOff);
  const requestGear = useSimStore((s) => s.requestGear);
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState(false);
  const ready = snapshot.powerState === 'READY';
  const steps = snapshot.startup.steps;
  const completed = steps.every((step) => step.status === 'done');
  const duration = completed ? (steps.at(-1)!.doneS! - steps[0]!.startedS!).toFixed(1) : null;
  const turnOff = () => {
    powerOff();
    setConfirming(false);
    setToast(true);
    window.setTimeout(() => setToast(false), 4000);
  };
  const pedal = (name: 'accelerator' | 'brake', label: string, hint: string) => (
    <button
      type="button"
      className={styles.pedal}
      disabled={!ready}
      aria-label={`${label} (${hint})`}
      title={ready ? undefined : 'Power on the car to drive'}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture?.(event.pointerId);
        setPedalHeld(name, true);
      }}
      onPointerUp={() => setPedalHeld(name, false)}
      onPointerCancel={() => setPedalHeld(name, false)}
      onLostPointerCapture={() => setPedalHeld(name, false)}
    >
      {label} <Kbd>{hint}</Kbd>
    </button>
  );

  return (
    <div className={styles.content}>
      {snapshot.powerState !== 'OFF' && (
        <>
          <section aria-label="Startup checklist" className={styles.section}>
            <button
              type="button"
              className={styles.checklistToggle}
              onClick={() => setExpanded(!expanded)}
              aria-expanded={expanded}
            >
              {completed ? `Startup complete in ${duration} s` : 'Startup checklist'}
            </button>
            {(!completed || expanded) && (
              <ol className={styles.steps}>
                {steps.map((step) => (
                  <li key={step.id}>
                    <span aria-hidden="true">
                      {step.status === 'done'
                        ? '✓'
                        : step.status === 'failed'
                          ? '!'
                          : step.status === 'active'
                            ? '◌'
                            : '○'}
                    </span>
                    <span>{stepNames[step.id]}</span>
                    <small>
                      {step.status}
                      {step.doneS === null ? '' : ` · ${step.doneS.toFixed(1)} s`}
                    </small>
                  </li>
                ))}
              </ol>
            )}
          </section>
          <section aria-label="Gear selector" className={styles.section}>
            <h2>Gear</h2>
            <div className={styles.gears}>
              {(['P', 'R', 'N', 'D'] as Gear[]).map((gear) => (
                <button
                  key={gear}
                  type="button"
                  aria-pressed={snapshot.gear === gear}
                  onClick={() => requestGear(gear)}
                >
                  {gear}
                </button>
              ))}
            </div>
            {snapshot.gearRefusal && (
              <small role="status" className={styles.hint}>
                {refusalHints[snapshot.gearRefusal]}
              </small>
            )}
          </section>
          <section aria-label="Pedals" className={styles.section}>
            <h2>Pedals</h2>
            <div className={styles.pedals}>
              {pedal('accelerator', 'Accelerator', 'W / ↑')}
              {pedal('brake', 'Brake', 'S / ↓')}
            </div>
            {!ready && <small>Power on the car to drive</small>}
          </section>
          <Button
            variant="secondary"
            onClick={() => (snapshot.speedMs * 3.6 > 5 ? setConfirming(true) : turnOff())}
          >
            Power off
          </Button>
          {confirming && (
            <Modal title="Power off while driving?">
              <p>The car will stop delivering power while it is moving.</p>
              <div className={styles.modalActions}>
                <Button variant="primary" className={styles.faultButton} onClick={turnOff}>
                  Power off while driving
                </Button>
                <Button variant="quiet" onClick={() => setConfirming(false)}>
                  Cancel
                </Button>
              </div>
            </Modal>
          )}
        </>
      )}
      {toast && <Toast>Car powered off</Toast>}
    </div>
  );
}
