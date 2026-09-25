import { useEffect, useRef } from 'react';
import type uPlot from 'uplot';
import type { TelemetrySample } from '../sim/telemetry';
import 'uplot/dist/uPlot.min.css';
import styles from './ChargeChart.module.css';

export interface CycleSeries {
  label: string;
  token: string;
  scale: 'kmh' | 'kw' | 'pct';
  dash?: number[];
}

const SERIES: CycleSeries[] = [
  { label: 'Speed (km/h)', token: '--data-speed', scale: 'kmh' },
  { label: 'Target speed (km/h)', token: '--data-target', scale: 'kmh', dash: [6, 4] },
  { label: 'Battery power (kW)', token: '--data-power', scale: 'kw' },
  { label: 'SOC (%)', token: '--data-soc', scale: 'pct' },
];

export function cycleChartSeries(samples: readonly TelemetrySample[]): { data: uPlot.AlignedData; series: CycleSeries[] } {
  return {
    data: [
      samples.map((s) => s.timeS),
      samples.map((s) => s.speedMs * 3.6),
      samples.map((s) => s.targetSpeedMs === null ? null : s.targetSpeedMs * 3.6),
      samples.map((s) => s.batteryPowerW / 1000),
      samples.map((s) => s.soc * 100),
    ],
    series: SERIES,
  };
}

export const CYCLE_CHART_SCALES = { x: { time: false }, pct: { range: [0, 100] as [number, number] } };

export const CYCLE_CHART_AXES: uPlot.Axis[] = [
  { label: 'Sim time (s)' },
  { scale: 'kmh', label: 'Speed (km/h)' },
  { scale: 'kw', label: 'Power (kW)', side: 1, grid: { show: false } },
  { scale: 'pct', label: 'SOC (%)', side: 1, grid: { show: false } },
];

const EMPTY_DATA: uPlot.AlignedData = [[], [], [], [], []];

/** Identity of a sample list for redraw purposes: same length and same first sample means no new data. */
export function samplesKey(samples: readonly TelemetrySample[]): string {
  return `${samples.length}:${samples[0]?.timeS ?? ''}`;
}

export function CycleChart({ samples }: { samples: readonly TelemetrySample[] }) {
  const host = useRef<HTMLDivElement>(null);
  const plot = useRef<uPlot | null>(null);
  const drawnKey = useRef('');
  const key = samplesKey(samples);

  useEffect(() => {
    if (key === drawnKey.current) return;
    if (plot.current && samples.length < 2) {
      drawnKey.current = key;
      plot.current.setData(EMPTY_DATA);
      return;
    }
    if (!host.current || samples.length < 2 || typeof window.matchMedia !== 'function') return;
    const { data, series } = cycleChartSeries(samples);
    if (plot.current) {
      drawnKey.current = key;
      plot.current.setData(data);
      return;
    }
    let cancelled = false;
    void import('uplot').then(({ default: UPlot }) => {
      if (cancelled || !host.current || plot.current) return;
      const style = getComputedStyle(host.current);
      plot.current = new UPlot({
        width: Math.max(240, host.current.clientWidth), height: 180,
        legend: { show: false }, cursor: { show: false },
        scales: CYCLE_CHART_SCALES,
        axes: CYCLE_CHART_AXES,
        series: [{}, ...series.map((s) => ({
          label: s.label, scale: s.scale, stroke: style.getPropertyValue(s.token).trim(), dash: s.dash, spanGaps: false,
        }))],
      }, data, host.current);
      drawnKey.current = key;
    });
    return () => { cancelled = true; };
  }, [key, samples]);

  useEffect(() => () => {
    plot.current?.destroy();
    plot.current = null;
  }, []);

  const first = samples[0];
  const latest = samples.at(-1);
  const summary = first && latest
    ? `Cycle chart: ${(latest.timeS - first.timeS).toFixed(0)} sim s, speed ${(latest.speedMs * 3.6).toFixed(0)} km/h, battery power ${(latest.batteryPowerW / 1000).toFixed(1)} kW, SOC ${(latest.soc * 100).toFixed(1)}%.`
    : 'Cycle chart: waiting for cycle telemetry.';
  return <section className={styles.chart} aria-label="Cycle chart">
    <h2>Cycle trace</h2>
    <p className={styles.legend}>Speed, target speed (dashed), battery power and SOC over sim time</p>
    <div role="img" aria-label={summary} className={styles.plot} ref={host} />
    <p className={styles.summary}>{summary}</p>
  </section>;
}
