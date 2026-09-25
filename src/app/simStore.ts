import { create } from 'zustand';
import { createSim, TICK_S, type DriveMode, type FaultCommand, type Gear, type OtaCommand, type Sim, type SimSnapshot } from '../sim';
import { createCycleRunner, type CycleId, type CycleRunner, type CycleRunStatus } from '../sim/scenarios';
import type { CycleResult } from '../sim/scenarios/cycle-runner';
import { createRecorder, type TelemetrySample } from '../sim/telemetry';
import { createDemoRunner, type DemoRunner, type DemoStatus } from './demo/runner';
import { DEMO_SCENARIOS } from './demo/scenarios';
import { latchOnboarding, NO_ONBOARDING, type OnboardingProgress } from './onboardingSteps';
import { useAppStore } from './store';

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
  /** The mode the driver last chose; null until they choose one (the bus mode is shown instead). */
  chosenDriveMode: DriveMode | null;
  setDriveMode: (mode: DriveMode) => void;
  selectChargeSource: (source: 'AC' | 'DC') => void;
  setChargeTarget: (soc: number) => void;
  commandCharge: (command: 'plugIn' | 'unplug' | 'start' | 'stop') => void;
  setPedal: (pedal: 'accelerator' | 'brake', value: number) => void;
  commandFault: (command: FaultCommand) => void;
  /** Send an OTA command to the TCU (ADR 0015). */
  commandOta: (command: OtaCommand) => void;
  reset: () => void;
  cycleRun: CycleRun | null;
  runCycle: (cycleId: CycleId) => void;
  stopCycle: () => void;
  advance: (ticks: number) => void;
  /** Free-drive telemetry (R12): sampled every 0.1 s while no cycle runs. */
  driveLog: () => TelemetrySample[];
  clearDriveLog: () => void;
  /** Guided demo (ADR 0016); null when no demo is playing. */
  demo: DemoRunner | null;
  demoStatus: DemoStatus | null;
  /** Play the demo from scenario `index` (default the first). */
  startDemo: (index?: number) => void;
  nextDemoScenario: () => void;
  /** Play the current scenario again, or the whole demo once it has finished. */
  replayDemo: () => void;
  exitDemo: () => void;
  /** The judge's own progress through the Start here steps. */
  onboarding: OnboardingProgress;
}

const initialSim = createSim();
const driveRecorder = createRecorder();
/** The time scale the user had before the demo took over. */
let timeScaleBeforeDemo: ReturnType<typeof useAppStore.getState>['timeScale'] = 1;

/** Show a demo step: switch to its view and time scale when the step changes. */
function showDemoStep(previous: DemoStatus | null, next: DemoStatus) {
  const app = useAppStore.getState();
  const changed = previous === null || previous.scenarioIndex !== next.scenarioIndex || previous.stepIndex !== next.stepIndex || previous.state !== next.state;
  if (!changed) return;
  if (next.state === 'running' && app.view !== next.view) app.setView(next.view);
  if (app.timeScale !== next.timeScale) app.setTimeScale(next.timeScale);
}

export const useSimStore = create<SimState>((set, get) => ({
  sim: initialSim,
  snapshot: initialSim.snapshot(),
  cycleRun: null,
  chosenDriveMode: null,
  demo: null,
  demoStatus: null,
  onboarding: NO_ONBOARDING,
  driveLog: () => driveRecorder.samples(),
  clearDriveLog: () => driveRecorder.clear(),
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
  setDriveMode: (mode) => {
    const { sim, cycleRun } = get();
    // The mode is locked while a cycle runs so the result belongs to one mode.
    if (cycleRun?.status.state === 'running') return;
    sim.setInputs({ driveMode: mode });
    set({ chosenDriveMode: mode });
  },
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
  commandOta: (command) => {
    const { sim } = get();
    sim.setInputs({ otaCommand: command });
    sim.step(1);
    set({ snapshot: sim.snapshot() });
  },
  reset: () => {
    const sim = createSim();
    driveRecorder.clear();
    set({ sim, snapshot: sim.snapshot(), cycleRun: null, chosenDriveMode: null, demo: null, demoStatus: null, onboarding: NO_ONBOARDING });
  },
  startDemo: (index = 0) => {
    const { demo: existing, demoStatus } = get();
    if (existing === null) timeScaleBeforeDemo = useAppStore.getState().timeScale;
    const demo = existing ?? createDemoRunner(DEMO_SCENARIOS);
    const sim = demo.start(index);
    driveRecorder.clear();
    const status = demo.status();
    showDemoStep(demoStatus === null ? null : { ...demoStatus, stepIndex: -1 }, status);
    set({ sim, snapshot: sim.snapshot(), cycleRun: null, chosenDriveMode: null, demo, demoStatus: status });
  },
  nextDemoScenario: () => {
    const { demoStatus, startDemo } = get();
    if (demoStatus === null) return;
    startDemo((demoStatus.scenarioIndex + 1) % demoStatus.scenarioCount);
  },
  replayDemo: () => {
    const { demoStatus, startDemo } = get();
    if (demoStatus === null) return;
    startDemo(demoStatus.state === 'finished' ? 0 : demoStatus.scenarioIndex);
  },
  exitDemo: () => {
    const { sim, demo } = get();
    if (demo === null) return;
    sim.setInputs({ accelerator: 0, brake: 0 });
    useAppStore.getState().setTimeScale(timeScaleBeforeDemo);
    set({ demo: null, demoStatus: null });
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
    const { demo, demoStatus } = get();
    if (demo !== null) {
      // The demo drives the sim tick by tick; a new scenario brings its own sim.
      let current = sim;
      for (let i = 0; i < ticks; i++) {
        const next = demo.tick(current);
        if (next !== null) {
          current = next;
          driveRecorder.clear();
          break;
        }
        driveRecorder.record(demo.lastSnapshot() ?? current.snapshot());
      }
      const status = demo.status();
      showDemoStep(demoStatus, status);
      set({ sim: current, snapshot: current.snapshot(), demoStatus: status, ...(current === sim ? {} : { chosenDriveMode: null }) });
      return;
    }
    // Step tick by tick so the recorder sees every 0.1 s of sim time at any time scale.
    for (let i = 0; i < ticks; i++) {
      sim.step(1);
      driveRecorder.record(sim.snapshot());
    }
    const next = sim.snapshot();
    const onboarding = latchOnboarding(get().onboarding, next);
    if (next.timeS !== snapshot.timeS) set(onboarding === get().onboarding ? { snapshot: next } : { snapshot: next, onboarding });
  },
}));
