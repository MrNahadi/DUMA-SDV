import { Check } from 'lucide-react';
import { useSimStore } from './simStore';
import styles from './DashboardStrip.module.css';

const shown = (value: number | null, digits = 0) => value === null ? '—' : value.toFixed(digits);

export function DashboardStrip() {
  // IC values are sampled at 10 Hz, while the simulation and stage can render faster.
  useSimStore((s) => Math.floor((s.snapshot.timeS + 0.000001) * 10));
  const { dashboard, powerState } = useSimStore.getState().snapshot;
  const off = powerState === 'OFF';
  const speed = off ? '—' : shown(dashboard.speedMs === null ? null : Math.abs(dashboard.speedMs) * 3.6);
  const power = off ? '—' : shown(dashboard.powerW === null ? null : dashboard.powerW / 1000);
  const soc = off ? '—' : shown(dashboard.soc === null ? null : dashboard.soc * 100);
  const range = off ? '—' : shown(dashboard.rangeM === null ? null : dashboard.rangeM / 1000);
  const gear = off ? '—' : dashboard.gear ?? '—';
  const ready = !off && dashboard.ready === true;
  const powerFraction = dashboard.powerW === null || off ? 0 : Math.min(1, Math.abs(dashboard.powerW) / 230_000);

  return <section className={styles.strip} aria-label="Driver dashboard">
    <div className={styles.speed} data-testid="dashboard-speed">
      <span className={styles.label}>Speed</span>
      <span className={styles.speedValue} data-value={speed}>{speed}</span>
      <span className={styles.unit}>km/h</span>
    </div>
    <div className={styles.metric} data-testid="dashboard-power">
      <span className={styles.label}>Power</span>
      <span className={styles.value} data-value={power}>{power} <small>kW</small></span>
      <div className={styles.powerBar} aria-hidden="true"><span className={styles.powerFill} style={{ width: `${powerFraction * 50}%`, left: dashboard.powerW !== null && dashboard.powerW < 0 ? `${50 - powerFraction * 50}%` : '50%' }} /></div>
    </div>
    <div className={styles.metric} data-testid="dashboard-soc">
      <span className={styles.label}>SOC</span>
      <span className={styles.value} data-value={soc}>{soc} <small>%</small></span>
      <div className={styles.socBar} aria-hidden="true"><span style={{ width: `${off || dashboard.soc === null ? 0 : Math.max(0, Math.min(100, dashboard.soc * 100))}%` }} /></div>
    </div>
    <div className={styles.metric} data-testid="dashboard-range"><span className={styles.label}>Range</span><span className={styles.value} data-value={range}>{range} <small>km</small></span></div>
    <div className={styles.gear} data-testid="dashboard-gear"><span className={styles.label}>Gear</span><span className={styles.value} data-value={gear}>{gear}</span></div>
    <div className={styles.ready} data-testid="dashboard-ready">
      {ready && <><Check aria-hidden="true" size={16} /> READY</>}
      {off && <p className={styles.hint}>Power on to see live values</p>}
    </div>
  </section>;
}
