/** Startup scenario: press Power on and wait for READY. */

import type { Sim } from '../index';

/**
 * Press the power button and step until the power state is READY or `maxTicks`
 * pass. Returns whether READY was reached.
 */
export function powerOnToReady(sim: Sim, maxTicks = 500): boolean {
  sim.setInputs({ powerButton: true });
  for (let i = 0; i < maxTicks && sim.snapshot().powerState !== 'READY'; i++) sim.step(1);
  return sim.snapshot().powerState === 'READY';
}
