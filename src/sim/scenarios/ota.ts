/** OTA scenario (ADR 0015): check for updates, install, and wait for READY on the new firmware. */

import { TICK_S, type Sim, type SimSnapshot } from '../index';

/** Step until `done` holds or `maxS` of sim time pass. Returns whether it held. */
function stepUntil(sim: Sim, done: (s: Readonly<SimSnapshot>) => boolean, maxS: number): boolean {
  const maxTicks = Math.round(maxS / TICK_S);
  for (let i = 0; i < maxTicks && !done(sim.snapshot()); i++) sim.step(1);
  return done(sim.snapshot());
}

/**
 * From a READY, parked car: check for updates, wait for the download, install,
 * and wait for the car to be READY again with the update confirmed. Returns
 * whether the update is installed (true also when already up to date).
 */
export function runOtaUpdate(sim: Sim, maxS = 60): boolean {
  sim.setInputs({ otaCommand: 'check' });
  sim.step(1);
  if (sim.snapshot().ota.refusal !== null) return false;
  const found = stepUntil(sim, (s) => s.ota.state === 'readyToInstall' || s.ota.state === 'upToDate', maxS);
  if (!found) return false;
  if (sim.snapshot().ota.state === 'upToDate') return true;
  sim.setInputs({ otaCommand: 'install' });
  sim.step(1);
  if (sim.snapshot().ota.refusal !== null) return false;
  const settled = stepUntil(sim, (s) => s.ota.state === 'failed' || (s.ota.state === 'installed' && s.powerState === 'READY'), maxS);
  return settled && sim.snapshot().ota.state === 'installed';
}
