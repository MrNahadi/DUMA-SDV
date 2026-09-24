import { expect, it } from 'vitest';
import { createSim } from './index';
import { runRegenScenario } from './scenarios';

it('runs a deterministic READY to stop recovery sequence through createSim', () => {
  const result = runRegenScenario(createSim());
  expect(result.ready).toBe(true);
  expect(result.gear).toBe('D');
  expect(result.acceleratedSpeedMs).toBeGreaterThan(8);
  expect(result.liftOffPowerW).toBeLessThan(0);
  expect(result.recoveredEnergyJ).toBeGreaterThan(0);
  expect(result.recoveredDistanceM).toBeGreaterThan(0);
  expect(result.stoppedSpeedMs).toBe(0);
});
