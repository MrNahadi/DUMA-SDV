/** Scripted input sequences, shared by tests, the guided demo and e2e. */

export { powerOnToReady } from './startup';
export { shiftWithBrake, zeroTo100 } from './drive';
export { runRegenScenario } from './regen';
export { runFaultDriveScenario } from './fault';
export { cruise, type CruiseOptions, type CruiseResult } from './cruise';
export { runDcReference, type DcReferenceResult } from './dc-reference';
export {
  getCycle,
  listCycles,
  targetSpeedMs,
  type Cycle,
  type CycleId,
  type CyclePoint,
} from './cycles';
