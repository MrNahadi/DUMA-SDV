import { useEffect, useRef, useState } from 'react';
import { Check, Circle, CircleAlert, CloudDownload, LoaderCircle, TriangleAlert } from 'lucide-react';
import { useShallow } from 'zustand/react/shallow';
import { UPDATE_PACKAGE, type EcuSoftware, type OtaRefusal, type OtaState } from '../sim';
import { Button } from '../ui/Button';
import { Modal } from '../ui/Modal';
import { Toast } from '../ui/Toast';
import { useSimStore } from './simStore';
import styles from './SoftwarePanel.module.css';

type StepStatus = 'pending' | 'active' | 'done' | 'failed';
const STEPS = ['Download', 'Verify', 'Install', 'Reboot'] as const;
/** Index of the step each OTA state is on; steps before it are done. */
const STEP_AT: Partial<Record<OtaState, number>> = { downloading: 0, verifying: 1, readyToInstall: 2, installing: 2, rebooting: 3 };
const statusWords: Record<StepStatus, string> = { pending: 'Waiting', active: 'In progress', done: 'Done', failed: 'Failed' };

const ecuNames: Record<EcuSoftware['ecu'], string> = {
  VCU: 'Vehicle control',
  BMS: 'Battery management',
  MCU: 'Motor control',
  IC: 'Instrument cluster',
  TCU: 'Telematics',
};

const refusalText: Record<OtaRefusal, string> = {
  offline: 'Power on so the car can reach the update server.',
  busy: 'Wait for the current step to finish.',
  notDownloaded: 'Check for updates to download the package first.',
  notReady: 'Wait until the car is READY, then install.',
  notParked: 'Stop the car and select P to install.',
  charging: 'Stop charging to install.',
  lowSoc: 'Charge above 20% to install.',
};

const MB = 1_000_000;

function stepStatus(state: OtaState, i: number): StepStatus {
  if (state === 'installed') return 'done';
  if (state === 'failed') return i === 3 ? 'failed' : 'done';
  const at = STEP_AT[state];
  if (at === undefined) return 'pending';
  if (i < at) return 'done';
  if (i > at) return 'pending';
  return state === 'readyToInstall' ? 'pending' : 'active';
}

function StepIcon({ status }: { status: StepStatus }) {
  switch (status) {
    case 'done':
      return <Check className={styles.done} aria-hidden="true" />;
    case 'failed':
      return <CircleAlert className={styles.failed} aria-hidden="true" />;
    case 'active':
      return <LoaderCircle className={styles.active} aria-hidden="true" />;
    case 'pending':
      return <Circle className={styles.pending} aria-hidden="true" />;
  }
}

export function SoftwarePanel() {
  const { ota, powerState, software } = useSimStore(
    useShallow((s) => ({ ota: s.snapshot.ota, powerState: s.snapshot.powerState, software: s.snapshot.software })),
  );
  const commandOta = useSimStore((s) => s.commandOta);
  const [confirming, setConfirming] = useState(false);
  const [toast, setToast] = useState(false);
  const previousState = useRef(ota.state);
  const installButton = useRef<HTMLButtonElement>(null);
  const cancelButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (ota.state === 'installed' && previousState.current !== 'installed') setToast(true);
    previousState.current = ota.state;
  }, [ota.state]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(false), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (confirming) cancelButton.current?.focus();
  }, [confirming]);

  const offline = powerState === 'OFF' && ota.state !== 'rebooting';
  const vcu = software.find((e) => e.ecu === 'VCU')?.version ?? '';
  const percent = `${Math.floor(ota.progress * 100)}%`;
  const inProgress = ['checking', 'downloading', 'verifying', 'installing', 'rebooting'].includes(ota.state);
  const canInstall = ota.state === 'readyToInstall';

  let status: string;
  if (offline) status = canInstall ? 'Power on to install the update.' : 'Power on to check for updates.';
  else {
    switch (ota.state) {
      case 'idle': status = 'Check for updates to see what is new.'; break;
      case 'checking': status = 'Checking for updates'; break;
      case 'upToDate': status = `The car's software is up to date. VCU runs ${vcu}.`; break;
      case 'downloading': status = `Downloading ${UPDATE_PACKAGE.sizeBytes / MB} MB · ${percent}`; break;
      case 'verifying': status = 'Verifying the package signature'; break;
      case 'readyToInstall': status = 'Ready to install. The car restarts to finish.'; break;
      case 'installing': status = `Installing · ${percent}. Keep the car in P.`; break;
      case 'rebooting': status = 'Restarting the car to finish the update'; break;
      case 'installed': status = `Update installed. VCU runs ${vcu}.${powerState === 'READY' ? '' : ' The car is finishing startup.'}`; break;
      case 'failed': status = `The update could not be confirmed. The car still runs VCU ${vcu}.`; break;
    }
  }

  function install() {
    setConfirming(false);
    commandOta('install');
    installButton.current?.focus();
  }

  function cancel() {
    setConfirming(false);
    installButton.current?.focus();
  }

  return (
    <div className={styles.content}>
      <section aria-labelledby="update-title" className={styles.card}>
        <span className={styles.label}>UPDATE</span>
        <h2 id="update-title">{ota.packageVersion === null ? 'Software update' : `VCU ${ota.packageVersion}`}</h2>
        <p role="status" aria-label="Update status" className={styles.status}>
          {ota.state === 'checking' && !offline && <LoaderCircle className={styles.active} aria-hidden="true" />}
          {ota.state === 'installed' && <Check className={styles.done} aria-hidden="true" />}
          {(ota.state === 'upToDate' || ota.state === 'idle' || offline) && <CloudDownload aria-hidden="true" />}
          <span>{status}</span>
        </p>
        {ota.notes !== null && (
          <p className={styles.notes}>
            <strong>What is new</strong>
            <span>{ota.notes}</span>
          </p>
        )}
        {ota.packageVersion !== null && (
          <ol className={styles.steps} aria-label="Update steps">
            {STEPS.map((name, i) => {
              const s = stepStatus(ota.state, i);
              return (
                <li key={name} data-status={s}>
                  <StepIcon status={s} />
                  <span>{name}</span>
                  <small>{s === 'active' && (i === 0 || i === 2) ? percent : statusWords[s]}</small>
                </li>
              );
            })}
          </ol>
        )}
        {ota.state === 'failed' && (
          <p role="alert" className={styles.failure}>
            <TriangleAlert aria-hidden="true" />
            <span>The new version did not start. Check for updates to try again.</span>
          </p>
        )}
        {ota.refusal !== null && (
          <p role="alert" className={styles.hint}>{refusalText[ota.refusal]}</p>
        )}
        {canInstall ? (
          <Button ref={installButton} variant="primary" large disabled={offline} onClick={() => setConfirming(true)}>
            Install update
          </Button>
        ) : (
          <Button variant="primary" large disabled={offline || inProgress} onClick={() => commandOta('check')}>
            Check for updates
          </Button>
        )}
      </section>
      <section aria-labelledby="versions-title" className={styles.section}>
        <h2 id="versions-title">Installed versions</h2>
        <table className={styles.versions}>
          <thead>
            <tr><th scope="col">ECU</th><th scope="col">Version</th></tr>
          </thead>
          <tbody>
            {software.map(({ ecu, version }) => (
              <tr key={ecu}>
                <th scope="row"><span className={styles.ecu}>{ecu}</span> {ecuNames[ecu]}</th>
                <td>
                  {version !== '1.0.0' && <span className={styles.updated}>Updated</span>}
                  <span className={styles.version}>{version}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {confirming && (
        <Modal title="Install update">
          <p>The car powers off and restarts to finish. It cannot be driven until it is READY again.</p>
          <div className={styles.modalActions}>
            <Button ref={cancelButton} variant="quiet" onClick={cancel}>Cancel</Button>
            <Button variant="primary" onClick={install}>Install update</Button>
          </div>
        </Modal>
      )}
      {toast && <Toast>Update installed. Sport is now available.</Toast>}
    </div>
  );
}
