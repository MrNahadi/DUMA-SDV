import { useState } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { Check, Circle, CircleAlert, LoaderCircle, TriangleAlert } from 'lucide-react';
import { Button } from '../ui/Button';
import { Kbd } from '../ui/Kbd';
import { Modal } from '../ui/Modal';
import { Toast } from '../ui/Toast';
import type { Gear, GearRefusal, SimSnapshot, StartupFailReason, StartupStepStatus } from '../sim';
import { useSimStore } from './simStore';
import { ModeControl } from './ModeControl';
import { setPedalHeld } from './useDriveInput';
import styles from './DrivePanel.module.css';

const stepNames: Record<SimSnapshot['startup']['steps'][number]['id'], string> = {
  wake: 'Wake',
  selfCheck: 'Self-check',
  precharge: 'Pre-charge',
  contactors: 'Contactors',
  ready: 'READY',
};

const statusWords: Record<StartupStepStatus, string> = {
  pending: 'Pending',
  active: 'Active',
  done: 'Done',
  failed: 'Failed',
};

const failReasons: Record<StartupFailReason, string> = {
  wakeTimeout: 'A module did not wake up in time.',
  selfCheckFailed: 'A module failed its self-check.',
  selfCheckTimeout: 'A module did not finish its self-check in time.',
  prechargeFailed: 'Pre-charge failed.',
  prechargeTimeout: 'Pre-charge took too long.',
  contactorTimeout: 'The contactors did not close in time.',
  readyTimeout: 'The car did not reach READY in time.',
  faultActive: 'Startup is unavailable while a fault is active.',
};

function refusalHint(refusal: GearRefusal, gear: Gear): string {
  switch (refusal) {
    case 'brakeRequired':
      return gear === 'P'
        ? 'Press the brake to shift out of P'
        : 'Press the brake to change direction';
    case 'speedTooHigh':
      return 'Slow down before shifting';
    case 'notReady':
      return 'Power on the car before shifting';
    case 'cableConnected':
      return 'Unplug the charge cable before shifting';
  }
}

function StepIcon({ status }: { status: StartupStepStatus }) {
  switch (status) {
    case 'done':
      return <Check className={styles.stepDone} aria-hidden="true" />;
    case 'failed':
      return <CircleAlert className={styles.stepFailed} aria-hidden="true" />;
    case 'active':
      return <LoaderCircle className={styles.stepActive} aria-hidden="true" />;
    case 'pending':
      return <Circle className={styles.stepPending} aria-hidden="true" />;
  }
}

/** Changes only when a startup step changes, so the panel doesn't re-render every frame (R7). */
const stepsKey = (s: SimSnapshot) =>
  s.startup.steps.map((step) => `${step.status}:${step.startedS}:${step.doneS}`).join('|');

export function DrivePanel() {
  const { powerState, gear, gearRefusal, failReason, recoveredEnergyJ, recoveredDistanceM } = useSimStore(
    useShallow((s) => ({
      powerState: s.snapshot.powerState,
      gear: s.snapshot.gear,
      gearRefusal: s.snapshot.gearRefusal,
      failReason: s.snapshot.startup.failReason,
      recoveredEnergyJ: s.snapshot.dashboard.recoveredEnergyJ,
      recoveredDistanceM: s.snapshot.dashboard.recoveredDistanceM,
    })),
  );
  // Subscribe to step changes only; read the steps themselves from the latest snapshot.
  useSimStore((s) => stepsKey(s.snapshot));
  const steps = useSimStore.getState().snapshot.startup.steps;
  const powerOff = useSimStore((s) => s.powerOff);
  const requestGear = useSimStore((s) => s.requestGear);
  const [expanded, setExpanded] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState(false);

  const ready = powerState === 'READY';
  const failed = failReason !== null;
  const completed = steps.every((step) => step.status === 'done');
  const duration = completed ? (steps.at(-1)!.doneS! - steps[0]!.startedS!).toFixed(1) : null;

  const turnOff = () => {
    powerOff();
    setConfirming(false);
    setToast(true);
    window.setTimeout(() => setToast(false), 4000);
  };
  const requestPowerOff = () => {
    // Speed is read at click time; reversing counts as moving too.
    const speedKmh = Math.abs(useSimStore.getState().snapshot.speedMs) * 3.6;
    if (speedKmh > 5) setConfirming(true);
    else turnOff();
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

  const checklist = (
    <section aria-label="Startup checklist" className={styles.section}>
      <button
        type="button"
        className={styles.checklistToggle}
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        {completed ? `Startup complete in ${duration} s` : 'Startup checklist'}
      </button>
      {failed && (
        <p role="alert" className={styles.failure}>
          <TriangleAlert aria-hidden="true" />
          <span>Startup stopped. {failReasons[failReason]} Power on to try again.</span>
        </p>
      )}
      {(!completed || expanded) && (
        <ol className={styles.steps}>
          {steps.map((step) => (
            <li key={step.id} data-status={step.status}>
              <StepIcon status={step.status} />
              <span>{stepNames[step.id]}</span>
              <small>
                {statusWords[step.status]}
                {step.doneS === null ? '' : ` · ${step.doneS.toFixed(1)} s`}
              </small>
            </li>
          ))}
        </ol>
      )}
    </section>
  );

  return (
    <div className={styles.content}>
      {powerState === 'OFF' && failed && checklist}
      {powerState !== 'OFF' && (
        <>
          {checklist}
          <section aria-label="Gear selector" className={styles.section}>
            <h2>Gear</h2>
            <div className={styles.gears}>
              {(['P', 'R', 'N', 'D'] as Gear[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  aria-pressed={gear === g}
                  onClick={() => requestGear(g)}
                >
                  {g}
                </button>
              ))}
            </div>
            {gearRefusal && (
              <small role="status" className={styles.hint}>
                {refusalHint(gearRefusal, gear)}
              </small>
            )}
          </section>
          <section aria-label="Drive mode selector" className={styles.section}>
            <h2>Mode</h2>
            <ModeControl />
          </section>
          <section aria-label="Pedals" className={styles.section}>
            <h2>Pedals</h2>
            <div className={styles.pedals}>
              {pedal('accelerator', 'Accelerator', 'W / ↑')}
              {pedal('brake', 'Brake', 'S / ↓')}
            </div>
            {!ready && <small>Power on the car to drive</small>}
          </section>
          <section aria-label="Energy recovered" className={styles.section}>
            <h2>Energy recovered</h2>
            {recoveredEnergyJ === null || recoveredDistanceM === null ? (
              <p className={styles.recoveryUnavailable}>Unavailable</p>
            ) : (
              <div className={styles.recoveryValues}>
                <span>{(recoveredEnergyJ / 3_600_000).toFixed(2)} kWh</span>
                <small>{(recoveredDistanceM / 1000).toFixed(1)} km added</small>
              </div>
            )}
          </section>
          <Button variant="secondary" onClick={requestPowerOff}>
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
