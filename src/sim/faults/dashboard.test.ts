import { expect, it } from 'vitest';
import { createSim } from '../index';
import { powerOnToReady } from '../scenarios';

it('shows a bus-derived cell warning, then clears it after fresh recovery while retaining the record', () => {
  const sim = createSim();
  expect(powerOnToReady(sim)).toBe(true);
  expect(sim.snapshot().dashboard.diagnostics).toEqual({ availability: 'available', warning: null, driveStatus: 'normal' });
  sim.setInputs({ faultCommand: { key: 'cellOverTemperature', action: 'inject' } });
  sim.step(30);
  expect(sim.snapshot().dashboard.diagnostics).toEqual({
    availability: 'available', warning: { severity: 'amber', text: 'Battery too hot' }, driveStatus: 'reducedPower',
  });
  sim.setInputs({ faultCommand: { key: 'cellOverTemperature', action: 'restore' } });
  sim.step(30);
  expect(sim.snapshot().dashboard.diagnostics).toEqual({ availability: 'available', warning: null, driveStatus: 'normal' });
  expect(sim.snapshot().diagnostics.records[0]?.status).toBe('stored');
});

it('distinguishes limp, isolation and stale diagnostic status', () => {
  const sim = createSim();
  expect(powerOnToReady(sim)).toBe(true);
  sim.setInputs({ faultCommand: { key: 'motorOverTemperature', action: 'inject' } });
  sim.step(30);
  expect(sim.snapshot().dashboard.diagnostics).toEqual({
    availability: 'available', warning: { severity: 'amber', text: 'Drive motor too hot' }, driveStatus: 'limp',
  });
  sim.setMessageDropped('BMS_DTC', true);
  sim.step(30);
  expect(sim.snapshot().dashboard.diagnostics.availability).toBe('unavailable');
  expect(sim.snapshot().dashboard.diagnostics.warning).toBeNull();
  sim.setMessageDropped('BMS_DTC', false);
  sim.step(30);
  expect(sim.snapshot().dashboard.diagnostics.driveStatus).toBe('limp');
  sim.setInputs({ faultCommand: { key: 'insulationFault', action: 'inject' } });
  sim.step(30);
  expect(sim.snapshot().dashboard.diagnostics).toEqual({
    availability: 'available', warning: { severity: 'red', text: 'High-voltage system fault' }, driveStatus: 'unavailable',
  });
});
