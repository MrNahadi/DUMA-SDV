/** Reproducible driver sequence for a complete regenerative stop. */
import { TICK_S, type Sim } from '../index';
import { powerOnToReady } from './startup';
import { shiftWithBrake } from './drive';

export function runRegenScenario(sim: Sim) {
  const ready = powerOnToReady(sim);
  const shifted = ready && shiftWithBrake(sim, 'D');
  if (shifted) {
    sim.setInputs({ brake: 0, accelerator: 0.7 });
    sim.step(Math.round(3 / TICK_S));
  }
  const acceleratedSpeedMs = sim.snapshot().speedMs;
  sim.setInputs({ accelerator: 0 });
  sim.step(Math.round(1.5 / TICK_S));
  const liftOffPowerW = sim.snapshot().dashboard.powerW;
  sim.setInputs({ brake: 1 });
  for (let i = 0; i < Math.round(10 / TICK_S) && sim.snapshot().speedMs > 0; i++) sim.step(1);
  // Deliver the final IC and VCU frames after the car has stopped.
  sim.step(20);
  const stopped = sim.snapshot();
  return {
    ready,
    gear: stopped.gear,
    acceleratedSpeedMs,
    liftOffPowerW,
    recoveredEnergyJ: stopped.dashboard.recoveredEnergyJ,
    recoveredDistanceM: stopped.dashboard.recoveredDistanceM,
    stoppedSpeedMs: stopped.speedMs,
  };
}
