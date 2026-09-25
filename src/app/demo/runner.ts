/**
 * Guided demo runner (ADR 0016). Plain TypeScript: it plays scripted scenario
 * steps against a sim through `setInputs`, one tick at a time, so it runs the same
 * headlessly in tests and behind the frame loop in the app.
 */

import { createSim, type Sim, type SimInputs, type SimOptions, type SimSnapshot } from '../../sim';
import type { ViewId } from '../views';

export type TimeScale = 1 | 10 | 30 | 60 | 120;

export interface DemoStep {
  caption: string;
  /** The view that shows this step best. */
  view: ViewId;
  /** Default 1×. */
  timeScale?: TimeScale;
  /** Applied once, when the step starts. */
  inputs?: Partial<SimInputs>;
  /** The step ends once this holds (and `minS` has passed). Without it the step ends after `minS`. */
  until?: (s: Readonly<SimSnapshot>) => boolean;
  /** Minimum sim time on the step, s, so the caption can be read. */
  minS?: number;
  /** Sim time after which an unfinished step fails, s. Default `minS` + 30. */
  timeoutS?: number;
}

export interface DemoScenario {
  id: string;
  title: string;
  options?: SimOptions;
  /** Brings a fresh sim into the scenario's starting state, headlessly. Returns false if it could not. */
  prepare?: (sim: Sim) => boolean;
  steps: readonly DemoStep[];
}

export type DemoState = 'running' | 'failed' | 'finished';

export interface DemoStatus {
  state: DemoState;
  scenarioIndex: number;
  scenarioCount: number;
  title: string;
  stepIndex: number;
  stepCount: number;
  /** The running step's caption; on failure, the caption of the step that failed. */
  caption: string;
  view: ViewId;
  timeScale: TimeScale;
}

export interface DemoRunner {
  /** Begin scenario `index` on a fresh prepared sim, and return that sim. */
  start(index: number): Sim;
  /**
   * Advance `sim` by one tick: apply a starting step's inputs, step, then check the
   * step's end. Returns the next scenario's sim when one begins, else null.
   */
  tick(sim: Sim): Sim | null;
  status(): DemoStatus;
  /** The snapshot the latest `tick` took after stepping, so callers need not take another. */
  lastSnapshot(): Readonly<SimSnapshot> | null;
}

const EPS_S = 1e-9;

export function createDemoRunner(scenarios: readonly DemoScenario[]): DemoRunner {
  if (scenarios.length === 0) throw new RangeError('The demo needs at least one scenario');
  let scenarioIndex = 0;
  let stepIndex = 0;
  let state: DemoState = 'running';
  let entered = false;
  let stepStartS = 0;
  let last: Readonly<SimSnapshot> | null = null;

  const scenario = () => scenarios[scenarioIndex]!;
  const step = () => scenario().steps[Math.min(stepIndex, scenario().steps.length - 1)]!;

  function start(index: number): Sim {
    if (!(Number.isInteger(index) && index >= 0 && index < scenarios.length)) throw new RangeError(`No demo scenario ${index}`);
    scenarioIndex = index;
    stepIndex = 0;
    entered = false;
    const sim = createSim(scenario().options);
    const prepared = scenario().prepare?.(sim) ?? true;
    // Prepare may leave pedals held; each step states the inputs it needs.
    state = prepared ? 'running' : 'failed';
    return sim;
  }

  return {
    start,
    tick(sim) {
      if (state !== 'running') {
        sim.step(1);
        last = null;
        return null;
      }
      const current = step();
      if (!entered) {
        entered = true;
        stepStartS = sim.snapshot().timeS;
        if (current.inputs) sim.setInputs(current.inputs);
      }
      sim.step(1);
      const s = sim.snapshot();
      last = s;
      const elapsed = s.timeS - stepStartS;
      const dwelt = elapsed >= (current.minS ?? 0) - EPS_S;
      if (dwelt && (current.until?.(s) ?? true)) {
        entered = false;
        if (stepIndex + 1 < scenario().steps.length) stepIndex++;
        else if (scenarioIndex + 1 < scenarios.length) return start(scenarioIndex + 1);
        else state = 'finished';
      } else if (elapsed > (current.timeoutS ?? (current.minS ?? 0) + 30)) {
        state = 'failed';
      }
      return null;
    },
    lastSnapshot() {
      return last;
    },
    status() {
      const current = step();
      return {
        state,
        scenarioIndex,
        scenarioCount: scenarios.length,
        title: scenario().title,
        stepIndex,
        stepCount: scenario().steps.length,
        caption: current.caption,
        view: current.view,
        timeScale: state === 'running' ? current.timeScale ?? 1 : 1,
      };
    },
  };
}
