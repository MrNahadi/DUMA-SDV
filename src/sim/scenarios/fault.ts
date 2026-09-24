/** Repeatable cell over-temperature flow from READY driving through log clear. */

import { createSim, type SimSnapshot } from '../index';
import { powerOnToReady } from './startup';
import { shiftWithBrake } from './drive';

function startDrive() {
  const sim = createSim();
  if (!powerOnToReady(sim) || !shiftWithBrake(sim, 'D')) throw new Error('Could not start fault drive');
  sim.setInputs({ brake: 0, accelerator: 1 });
  sim.step(450);
  return sim;
}

function state(snapshot: Readonly<SimSnapshot>) {
  return { snapshot, powerKw: snapshot.pack.voltageV * snapshot.pack.currentA / 1000 };
}

export function runFaultDriveScenario() {
  const healthySim = startDrive();
  const sim = startDrive();
  sim.setInputs({ faultCommand: { key: 'cellOverTemperature', action: 'inject' } });
  healthySim.step(30);
  sim.step(30);
  const healthy = state(healthySim.snapshot());
  const faulted = state(sim.snapshot());
  sim.setInputs({ faultCommand: { key: 'cellOverTemperature', action: 'restore' } });
  sim.step(30);
  const recovered = state(sim.snapshot());
  sim.setInputs({ faultCommand: { action: 'clearAll' } });
  sim.step(30);
  return { healthy, faulted, recovered, cleared: state(sim.snapshot()), trace: sim.trace() };
}
