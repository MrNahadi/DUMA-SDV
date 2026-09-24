/** Headless ADR 0001 row 28 run: parked, 10-80% DC, no preconditioning. */
import { createSim, TICK_S, type SimSnapshot } from '../index';

export interface DcReferenceResult {
  elapsedS: number;
  peakInputW: number;
  maxSoc: number;
  final: SimSnapshot;
  busTrace: ReturnType<ReturnType<typeof createSim>['trace']>;
}

export function runDcReference(): DcReferenceResult {
  const sim = createSim({ initialSoc: 0.1 });
  sim.setInputs({ chargeSource: 'DC', chargeTargetSoc: 0.8, chargeCommand: 'plugIn' });
  sim.step();
  sim.setInputs({ chargeCommand: 'start' });
  const startS = sim.snapshot().timeS;
  let peakInputW = 0;
  let maxSoc = 0.1;
  let final = sim.snapshot();
  const maxTicks = Math.ceil(50 * 60 / TICK_S);
  for (let i = 0; i < maxTicks && final.charge.session !== 'complete'; i++) {
    sim.step();
    final = sim.snapshot();
    peakInputW = Math.max(peakInputW, final.charge.inputPowerW);
    maxSoc = Math.max(maxSoc, final.pack.soc);
  }
  return { elapsedS: final.timeS - startS, peakInputW, maxSoc, final, busTrace: sim.trace() };
}
