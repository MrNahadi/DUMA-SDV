import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import type { TelemetrySample } from '../sim/telemetry';
import { CYCLE_CHART_AXES, CYCLE_CHART_SCALES, CycleChart, cycleChartSeries, samplesKey } from './CycleChart';

const sample = (timeS: number, targetSpeedMs: number | null): TelemetrySample => ({
  timeS, speedMs: 10, targetSpeedMs, accelerator: 0.2, brake: 0, batteryPowerW: 12_500, motorPowerW: 12_000,
  soc: 0.8, packVoltageV: 380, packCurrentA: 30, packTempC: 25, motorTempC: 40, inverterTempC: 35, gear: 'D', driveMode: 'normal',
});

it('builds series from recorder samples in UI units', () => {
  const { data, series } = cycleChartSeries([sample(0, 5), sample(0.1, null)]);
  expect(data[0]).toEqual([0, 0.1]);
  expect(data[1]).toEqual([36, 36]);
  expect(data[2]).toEqual([18, null]);
  expect(data[3]).toEqual([12.5, 12.5]);
  expect(data[4]).toEqual([80, 80]);
  expect(series.map((s) => s.label)).toEqual(['Speed (km/h)', 'Target speed (km/h)', 'Battery power (kW)', 'SOC (%)']);
  expect(series.map((s) => s.token)).toEqual(['--data-speed', '--data-target', '--data-power', '--data-soc']);
});

it('names the series in words with an accessible summary', () => {
  render(<CycleChart samples={[sample(0, 5), sample(60, 5)]} />);
  expect(screen.getByRole('img', { name: /Cycle chart/i })).toBeTruthy();
  expect(screen.getByText(/battery power and SOC over sim time/i)).toBeTruthy();
});

it('waits for telemetry when there are no samples', () => {
  render(<CycleChart samples={[]} />);
  expect(screen.getByRole('img', { name: /waiting for cycle telemetry/i })).toBeTruthy();
});

it('gives SOC its own labelled axis with a fixed 0-100 % range', () => {
  expect(CYCLE_CHART_AXES.find((a) => a.scale === 'pct')?.label).toBe('SOC (%)');
  expect(CYCLE_CHART_SCALES.pct.range).toEqual([0, 100]);
});

it('shows no series data with no samples', () => {
  const { data } = cycleChartSeries([]);
  expect(data.every((d) => d.length === 0)).toBe(true);
});

it('keys redraws on sample count so unchanged data is not rebuilt', () => {
  const a = [sample(0, 5), sample(0.1, 5)];
  expect(samplesKey([...a])).toBe(samplesKey(a));
  expect(samplesKey([...a, sample(0.2, 5)])).not.toBe(samplesKey(a));
  expect(samplesKey([])).not.toBe(samplesKey(a));
});
