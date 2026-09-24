import { expect, it } from 'vitest';
import { runFaultDriveScenario } from '../scenarios';

it('repeats the complete fault drive with identical snapshots and bus trace', () => {
  const first = runFaultDriveScenario();
  const second = runFaultDriveScenario();
  expect(first).toEqual(second);
  expect(first.healthy.powerKw).toBeGreaterThan(first.faulted.powerKw / 0.75);
  expect(first.faulted.snapshot.diagnostics.records[0]).toMatchObject({ code: 'P0A7E', status: 'active' });
  expect(first.faulted.snapshot.dashboard.diagnostics).toMatchObject({ driveStatus: 'reducedPower' });
  expect(first.trace.some((frame) => frame.name === 'BMS_DTC' && frame.signals.activeBits === 1)).toBe(true);
  const healthyLimit = first.healthy.snapshot.dashboard.maxDischargeKw;
  expect(healthyLimit).not.toBeNull();
  expect(first.trace.some((frame) => frame.name === 'BMS_Limits' && (frame.signals.maxDischargeKw as number) < healthyLimit!)).toBe(true);
  expect(first.recovered.snapshot.diagnostics.records[0]?.status).toBe('stored');
  expect(first.cleared.snapshot.diagnostics.records).toHaveLength(0);
});
