import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { createSim } from '../sim';
import { ChargeChart, appendChargeSample } from './ChargeChart';

it('samples public charge telemetry in time order, retains gaps and bounds history', () => {
  const sim = createSim({ initialSoc: 0.4 });
  sim.setInputs({ chargeSource: 'DC', chargeTargetSoc: 0.8, chargeCommand: 'plugIn' });
  sim.step(1);
  sim.setInputs({ chargeCommand: 'start' });
  sim.step(300);
  const charging = sim.snapshot();
  const first = appendChargeSample([], charging);
  expect(first.at(0)?.source).toBe('DC');
  expect(first.at(0)?.soc).not.toBeNull();
  sim.setMessageDropped('BMS_Status', true);
  sim.step(120);
  const gap = appendChargeSample(first, sim.snapshot());
  expect(gap.at(-1)?.soc).toBeNull();
  expect(appendChargeSample(gap, charging)).toEqual(gap);
  let samples = gap;
  for (let i = 0; i < 300; i += 1) samples = appendChargeSample(samples, { ...charging, timeS: 10 + i });
  expect(samples.length).toBeLessThanOrEqual(240);
});

it('identifies AC and DC in words with an accessible summary', () => {
  const sim = createSim();
  const snapshot = sim.snapshot();
  render(<ChargeChart snapshot={snapshot} />);
  expect(screen.getByRole('img', { name: /Charge curve/i })).toBeTruthy();
  expect(screen.getByText(/AC and DC/i)).toBeTruthy();
});
