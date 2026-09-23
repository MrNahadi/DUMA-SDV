/** Driving scenarios: shifting with the brake held, and the 0-100 km/h run (ADR 0001 row 23). */

import { TICK_S, type Gear, type Sim } from '../index';
import { kmhToMs } from '../units';

/**
 * Hold the brake firmly, request `gear` and step until the VCU reports it or
 * `maxTicks` pass. The brake stays held. Returns whether the shift happened.
 */
export function shiftWithBrake(sim: Sim, gear: Gear, maxTicks = 50): boolean {
  sim.setInputs({ accelerator: 0, brake: 1, gearRequest: gear });
  for (let i = 0; i < maxTicks && sim.snapshot().gear !== gear; i++) sim.step(1);
  return sim.snapshot().gear === gear;
}

/**
 * From READY in D at standstill: release the brake and press the accelerator
 * fully at t = 0. Returns the time to 100 km/h in s (interpolated between
 * ticks), or null if it is not reached within `maxS`.
 */
export function zeroTo100(sim: Sim, maxS = 20): number | null {
  const target = kmhToMs(100);
  const t0 = sim.snapshot().timeS;
  sim.setInputs({ brake: 0, accelerator: 1 });
  let before = sim.snapshot();
  const maxTicks = Math.round(maxS / TICK_S);
  for (let i = 0; i < maxTicks; i++) {
    sim.step(1);
    const s = sim.snapshot();
    if (s.speedMs >= target) {
      const fraction = (target - before.speedMs) / (s.speedMs - before.speedMs);
      return before.timeS + fraction * TICK_S - t0;
    }
    before = s;
  }
  return null;
}
