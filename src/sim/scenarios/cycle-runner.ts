/**
 * Headless drive-cycle runner (ADR 0013): powers the car on, selects D and
 * follows a cycle with a speed-tracking driver that only uses `setInputs`.
 * Feed-forward from road load and target acceleration, plus PI on speed error.
 * Pure and deterministic: no Date, no randomness.
 */

import { TICK_S, type Sim, type SimSnapshot } from '../index';
import { createRecorder, type TelemetrySample } from '../telemetry';
import { GRAVITY_MS2, roadLoadN, vehicleParams, type VehicleParams } from '../vehicle';
import { getCycle, targetSpeedMs, type CycleId } from './cycles';
import { shiftWithBrake } from './drive';
import { powerOnToReady } from './startup';

/** The driver adjusts the pedals every 0.1 s. */
const DRIVER_TICKS = 10;
/** Look-ahead on the cycle trace for the feed-forward, s (driver anticipation plus actuator lag). */
const LOOKAHEAD_S = 0.5;
/** Force per m/s of speed error, N. */
const KP_N_PER_MS = 4000;
/** Force per m of accumulated speed error, N. */
const KI_N_PER_M = 800;
/** Integral clamp, N. */
const INTEGRAL_MAX_N = 3000;
/** Pedal forces lift-off regeneration gives with both pedals released (vcu REGEN_DECEL_G). */
const LIFT_OFF_G = 0.15;
/** Time for the car to come to rest after stopping, s. */
const STOP_REST_MAX_S = 60;

export type CycleRunState = 'running' | 'completed' | 'stopped' | 'failed';

export interface CycleRunStatus {
  state: CycleRunState;
  cycleId: CycleId;
  /** Cycle time elapsed, s. */
  elapsedS: number;
  durationS: number;
}

export interface CycleRunner {
  /** Advance the run by up to `seconds` of sim time; no-op unless running. */
  step(seconds: number): void;
  /** Release the pedals and bring the car to rest. */
  stop(): void;
  status(): CycleRunStatus;
  /** Telemetry recorded during the run, with target speed. */
  telemetry(): TelemetrySample[];
}

export interface CycleRunnerOptions {
  /** Must match the params the sim was created with. Default `vehicleParams`. */
  params?: Readonly<VehicleParams>;
}

/** Create a runner and prepare the car (READY, D). The run then starts at cycle t = 0. */
export function createCycleRunner(sim: Sim, cycleId: CycleId, options: CycleRunnerOptions = {}): CycleRunner {
  const p = options.params ?? vehicleParams;
  const cycle = getCycle(cycleId);
  const recorder = createRecorder();
  const massEffKg = p.testMassKg * p.rotationalMassFactor;
  const peakForceN = (p.motorPeakTorqueNm * p.reductionRatio * p.gearEfficiency) / p.wheelRadiusM;
  const fullBrakeN = Math.min(1, p.tyreRoadFriction) * p.testMassKg * GRAVITY_MS2;
  const liftN = LIFT_OFF_G * p.testMassKg * GRAVITY_MS2;

  let state: CycleRunState = 'running';
  let elapsedS = 0;
  let integral = 0;

  if (sim.snapshot().powerState !== 'READY' && !powerOnToReady(sim)) state = 'failed';
  if (state === 'running' && sim.snapshot().gear !== 'D' && !shiftWithBrake(sim, 'D')) state = 'failed';
  const t0 = sim.snapshot().timeS;
  sim.setInputs({ brake: 0, accelerator: 0 });
  if (state === 'running') recorder.record(sim.snapshot(), targetSpeedMs(cycleId, 0));

  function drive(s: Readonly<SimSnapshot>) {
    const target = targetSpeedMs(cycleId, elapsedS);
    const ahead = targetSpeedMs(cycleId, elapsedS + LOOKAHEAD_S);
    const next = targetSpeedMs(cycleId, elapsedS + LOOKAHEAD_S + 1);
    const error = target - s.speedMs;
    integral = Math.min(Math.max(integral + KI_N_PER_M * error * DRIVER_TICKS * TICK_S, -INTEGRAL_MAX_N), INTEGRAL_MAX_N);
    const moving = ahead > 0.05 || s.speedMs > 0.05;
    const forceN = massEffKg * (next - ahead) + (moving ? roadLoadN(p, s.speedMs) : 0) + KP_N_PER_MS * error + integral;

    if (ahead <= 0 && target <= 0) {
      // Standstill: hold the car on the brake.
      integral = 0;
      sim.setInputs({ accelerator: 0, brake: 0.3 });
    } else if (forceN >= -liftN / 2) {
      const availableN = Math.min(peakForceN, p.motorPeakPowerW / Math.max(s.speedMs, 1));
      sim.setInputs({ accelerator: Math.min(Math.max(forceN / availableN, 0.001), 1), brake: 0 });
    } else if (forceN >= -liftN) {
      sim.setInputs({ accelerator: 0, brake: 0 });
    } else {
      sim.setInputs({ accelerator: 0, brake: Math.min(-forceN / fullBrakeN, 1) });
    }
  }

  return {
    step(seconds) {
      const endS = Math.min(elapsedS + seconds, cycle.durationS);
      while (state === 'running' && elapsedS < endS - 1e-9) {
        drive(sim.snapshot());
        sim.step(DRIVER_TICKS);
        const s = sim.snapshot();
        elapsedS = s.timeS - t0;
        recorder.record(s, targetSpeedMs(cycleId, elapsedS));
        if (elapsedS >= cycle.durationS - 1e-9) {
          state = 'completed';
          sim.setInputs({ accelerator: 0, brake: 0.3 });
        }
      }
    },
    stop() {
      if (state !== 'running') return;
      state = 'stopped';
      // Both pedals released: lift-off regeneration and road load bring the car to rest.
      sim.setInputs({ accelerator: 0, brake: 0 });
      const maxTicks = Math.round(STOP_REST_MAX_S / TICK_S);
      for (let i = 0; i < maxTicks && Math.abs(sim.snapshot().speedMs) > 0.01; i += DRIVER_TICKS) sim.step(DRIVER_TICKS);
    },
    status() {
      return { state, cycleId, elapsedS, durationS: cycle.durationS };
    },
    telemetry() {
      return recorder.samples();
    },
  };
}
