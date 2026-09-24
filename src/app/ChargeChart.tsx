import { useEffect, useRef, useState } from 'react';
import type { SimSnapshot } from '../sim';
import { wToKw } from '../sim/units';
import 'uplot/dist/uPlot.min.css';
import styles from './ChargeChart.module.css';

export interface ChargeSample {
  timeS: number;
  soc: number | null;
  powerKw: number | null;
  source: 'AC' | 'DC' | null;
}

const MAX_SAMPLES = 240;
const SAMPLE_PERIOD_S = 1;

export function appendChargeSample(history: readonly ChargeSample[], snapshot: SimSnapshot): ChargeSample[] {
  const last = history.at(-1);
  if (last && snapshot.timeS - last.timeS < SAMPLE_PERIOD_S) return [...history];
  const display = snapshot.chargeDisplay;
  const available = display.soc !== null && display.powerW !== null && display.session !== null;
  const sample: ChargeSample = {
    timeS: snapshot.timeS,
    soc: available ? display.soc! * 100 : null,
    powerKw: available ? wToKw(display.powerW!) : null,
    source: available ? display.source : null,
  };
  return [...history, sample].slice(-MAX_SAMPLES);
}

export function ChargeChart({ snapshot }: { snapshot: SimSnapshot }) {
  const [samples, setSamples] = useState<ChargeSample[]>([]);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setSamples((previous) => appendChargeSample(previous, snapshot)));
    return () => cancelAnimationFrame(frame);
  }, [snapshot]);

  useEffect(() => {
    if (!host.current || samples.length < 2 || typeof window.matchMedia !== 'function') return;
    let cancelled = false;
    let plot: { destroy: () => void } | undefined;
    void import('uplot').then(({ default: uPlot }) => {
      if (cancelled || !host.current) return;
      const style = getComputedStyle(host.current);
      const data: uPlot.AlignedData = [
        samples.map((point) => point.timeS / 60),
        samples.map((point) => point.source === 'AC' ? point.soc : null),
        samples.map((point) => point.source === 'DC' ? point.soc : null),
      ];
      plot = new uPlot({
        width: Math.max(240, host.current.clientWidth), height: 120,
        legend: { show: false }, cursor: { show: false },
        axes: [{ label: 'Sim time (min)' }, { label: 'SOC (%)' }],
        series: [
          {},
          { label: 'AC', stroke: style.getPropertyValue('--data-ac').trim(), spanGaps: false },
          { label: 'DC', stroke: style.getPropertyValue('--data-dc').trim(), spanGaps: false },
        ],
      }, data, host.current);
    });
    return () => { cancelled = true; plot?.destroy(); };
  }, [samples]);

  const valid = samples.filter((point) => point.soc !== null);
  const latest = valid.at(-1);
  const first = valid[0];
  const summary = latest && first
    ? `Charge curve: ${latest.source ?? 'Unknown source'} from ${first.soc!.toFixed(1)}% to ${latest.soc!.toFixed(1)}% SOC over ${((latest.timeS - first.timeS) / 60).toFixed(1)} sim min. ${samples.some((point) => point.soc === null) ? 'Unavailable telemetry appears as a gap.' : ''}`
    : 'Charge curve: waiting for charging telemetry.';
  return <section className={styles.chart} aria-label="Charge curve">
    <h2>Charging progress</h2>
    <p className={styles.legend}>AC and DC charging · SOC over sim time</p>
    <div role="img" aria-label={summary} className={styles.plot} ref={host} />
    <p className={styles.summary}>{summary}</p>
  </section>;
}
