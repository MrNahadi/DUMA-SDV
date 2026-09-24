import { create } from 'zustand';
import { createSim, TICK_S, type DriveMode, type FaultCommand, type Gear, type Sim, type SimSnapshot } from '../sim';
import { createCycleRunner, type CycleId, type CycleRunner, type CycleRunStatus } from '../sim/scenarios';
import type { CycleResult } from '../sim/scenarios/cycle-runner';

export interface CycleRun {
  runner: CycleRunner;
  status: CycleRunStatus;
  result: CycleResult | null;
}

interface SimState {
  sim: Sim;
  snapshot: SimSnapshot;
  powerOn: () => void;
  powerOff: () => void;
  requestGear: (gear: Gear) => void;
  setDriveMode: (mode: DriveMode) => void;
  selectChargeSource: (source: 'AC' | 'DC') => void;
  setChargeTarget: (soc: number) => void;
  commandCharge: (command: 'plugIn' | 'unplug' | 'start' | 'stop') => void;
  setPedal: (pedal: 'accelerator' | 'brake', value: number) => void;
  commandFault: (command: FaultCommand) => void;
  reset: () => void;
  cycleRun: CycleRun | null;
  runCycle: (cycleId: CycleId) => void;
  stopCycle: () => void;
  advance: (ticks: number) => void;
}

const initialSim = createSim();

export const useSimStore = create<SimState>((set, get) => ({
  sim: initialSim,
  snapshot: initialSim.snapshot(),
  cycleRun: null,
  powerOn: () => {
    const { sim, snapshot } = get();
    if (snapshot.powerState === 'OFF') sim.setInputs({ powerButton: true });
    set({ snapshot: sim.snapshot() });
  },
  powerOff: () => {
    const { sim } = get();
    sim.setInputs({ accelerator: 0, brake: 0, powerButton: true });
  },
  requestGear: (gear) => get().sim.setInputs({ gearRequest: gear }),
  setDriveMode: (mode) => get().sim.setInputs({ driveMode: mode }),
  selectChargeSource: (source) => get().sim.setInputs({ chargeSource: source }),
  setChargeTarget: (soc) => get().sim.setInputs({ chargeTargetSoc: soc }),
  commandCharge: (command) => get().sim.setInputs({ chargeCommand: command }),
  setPedal: (pedal, value) => get().sim.setInputs({ [pedal]: value }),
  commandFault: (command) => {
    const { sim } = get();
    sim.setInputs({ faultCommand: command });
    sim.step(1);
    set({ snapshot: sim.snapshot() });
  },
  reset: () => {
    const sim = createSim();
    set({ sim, snapshot: sim.snapshot(), cycleRun: null });
  },
  runCycle: (cycleId) => {
    const { sim, cycleRun } = get();
    if (cycleRun?.status.state === 'running') return;
    const runner = createCycleRunner(sim, cycleId);
    set({ snapshot: sim.snapshot(), cycleRun: { runner, status: runner.status(), result: null } });
  },
  stopCycle: () => {
    const { sim, cycleRun } = get();
    if (!cycleRun) return;
    cycleRun.runner.stop();
    set({ snapshot: sim.snapshot(), cycleRun: { runner: cycleRun.runner, status: cycleRun.runner.status(), result: null } });
  },
  advance: (ticks) => {
    if (ticks <= 0) return;
    const { sim, snapshot, cycleRun } = get();
    if (cycleRun?.status.state === 'running') {
      // A cycle run drives the sim itself, so the time scale still sets the pace.
      const { runner } = cycleRun;
      runner.step(ticks * TICK_S);
      set({ snapshot: sim.snapshot(), cycleRun: { runner, status: runner.status(), result: runner.result() } });
      return;
    }
    sim.step(ticks);
    const next = sim.snapshot();
    if (next.timeS !== snapshot.timeS) set({ snapshot: next });
  },
}));
