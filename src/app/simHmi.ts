import type { HmiPort } from '../ai/copilot/tools';
import { useSimStore } from './simStore';

/**
 * The co-pilot's HMI port over the sim store (ADR 0019): the same actions the
 * touchscreen calls, plus one tick so the car reports its result.
 */
export function createSimHmi(store = useSimStore): HmiPort {
  return {
    snapshot: () => store.getState().sim.snapshot(),
    busy: () => {
      const s = store.getState();
      if (s.demo !== null) return 'demo';
      return s.cycleRun?.status.state === 'running' ? 'cycle' : null;
    },
    setDriveMode: (mode) => store.getState().setDriveMode(mode),
    setChargeTarget: (soc) => store.getState().setChargeTarget(soc),
    commandCharge: (command) => store.getState().commandCharge(command),
    commandOta: (command) => store.getState().commandOta(command),
    settle: () => {
      const { sim } = store.getState();
      sim.step(1);
      store.setState({ snapshot: sim.snapshot() });
    },
  };
}
