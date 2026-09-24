import { useState } from 'react';
import { PlugZap } from 'lucide-react';
import { Button } from '../ui/Button';
import { wToKw } from '../sim/units';
import { useSimStore } from './simStore';
import { ChargeChart } from './ChargeChart';
import styles from './ChargePanel.module.css';

const refusalText = {
  notPlugged: 'Plug in before starting.',
  alreadyPlugged: 'Unplug before changing source.',
  notParked: 'Select P before charging.',
  moving: 'Stop the car before charging.',
  targetNotAboveSoc: 'Choose a target above the current SOC.',
  sessionActive: 'Stop charging before unplugging.',
  notCharging: 'There is no active session.',
  noSource: 'Choose AC or DC.',
};

export function ChargePanel() {
  const snapshot = useSimStore((s) => s.snapshot);
  const selectChargeSource = useSimStore((s) => s.selectChargeSource);
  const setChargeTarget = useSimStore((s) => s.setChargeTarget);
  const commandCharge = useSimStore((s) => s.commandCharge);
  const [source, setSource] = useState<'AC' | 'DC'>('AC');
  const [target, setTarget] = useState(90);
  const { charge, chargeDisplay: display } = snapshot;
  const active = charge.session === 'charging';
  const parked = snapshot.gear === 'P' && Math.abs(snapshot.speedMs) < 1 / 3.6;
  const targetValid = target / 100 > snapshot.pack.soc;
  const session = display.session ?? charge.session;
  const sessionText = session === 'idle' ? 'Ready to plug in'
    : session === 'plugged' ? 'Plugged in'
      : session === 'charging' ? `${display.source ?? charge.source} charging`
        : session === 'complete' ? 'Charge complete' : 'Charging stopped';
  const status = display.session === null ? `${sessionText} · Charge data unavailable` : sessionText;
  const minutes = display.timeToTargetS === null ? null : Math.ceil(display.timeToTargetS / 60);

  return (
    <div className={styles.content}>
      <section className={styles.soc} aria-label="State of charge">
        <span className={styles.label}>BATTERY</span>
        <strong className={styles.hero}>{display.soc === null ? '—' : `${Math.round(display.soc * 100)}%`}</strong>
        <span role="status" className={styles.status}><PlugZap aria-hidden="true" />{status}</span>
      </section>
      <section className={styles.details} aria-label="Charge status">
        <div><span>Source</span><strong>{display.source ?? (display.session === null ? 'Unavailable' : 'None')}</strong></div>
        <div><span>Charge rate</span><strong>{display.powerW === null ? 'Unavailable' : `${wToKw(display.powerW).toFixed(1)} kW`}</strong></div>
        <div><span>Target</span><strong>{Math.round((display.targetSoc ?? charge.targetSoc) * 100)}% target</strong></div>
        <div><span>Estimated time to target</span><strong>{minutes === null ? 'Unavailable' : `${minutes} min`}</strong></div>
      </section>
      <ChargeChart snapshot={snapshot} />
      <section className={styles.controls} aria-label="Charging controls">
        <label htmlFor="charge-source">Charge source</label>
        <select id="charge-source" value={source} disabled={charge.connected} onChange={(event) => setSource(event.target.value as 'AC' | 'DC')}>
          <option value="AC">AC</option><option value="DC">DC</option>
        </select>
        <label htmlFor="charge-target">Target SOC</label>
        <select id="charge-target" value={target} onChange={(event) => setTarget(Number(event.target.value))}>
          {[50, 60, 70, 80, 90, 100].map((value) => <option key={value} value={value}>{value}%</option>)}
        </select>
        {!targetValid && <p className={styles.hint}>Choose a target above the current SOC.</p>}
        <div className={styles.actions}>
          <Button disabled={charge.connected || !parked} onClick={() => { selectChargeSource(source); commandCharge('plugIn'); }}>Plug in</Button>
          <Button disabled={!charge.connected || active} onClick={() => commandCharge('unplug')}>Unplug</Button>
          <Button variant="primary" large disabled={!charge.connected || active || !parked || !targetValid} onClick={() => { setChargeTarget(target / 100); commandCharge('start'); }}>Start charging</Button>
          <Button disabled={!active} onClick={() => commandCharge('stop')}>Stop charging</Button>
        </div>
        {charge.refusal && <p role="alert" className={styles.hint}>{refusalText[charge.refusal]}</p>}
      </section>
    </div>
  );
}
