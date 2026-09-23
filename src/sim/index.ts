/**
 * Public API of the sim core. Framework-free and deterministic: the same
 * sequence of calls always yields the same snapshots (tech-stack.md, Simulation).
 */

import { createHvCircuit, packOcvV, type ContactorStates } from './battery';
import { busCatalogue, createBus, type Frame } from './bus';
import {
  STARTUP_STEPS,
  createBms,
  createIc,
  createMcu,
  createVcu,
  type PowerState,
  type StartupFailReason,
  type StartupStepId,
  type StartupStepStatus,
} from './ecus';
import { vehicleParams, type VehicleParams } from './vehicle';

export type { Frame } from './bus';
export type { PowerState, StartupFailReason, StartupStepId, StartupStepStatus } from './ecus';

/** Fixed simulation step: 10 ms (100 Hz). */
export const TICK_S = 0.01;
const TICK_MS = 10;

export interface SimOptions {
  /** Vehicle parameters. Defaults to the Duma SDV's (`vehicleParams`). */
  params?: Readonly<VehicleParams>;
  /** Traction pack state of charge at creation, 0..1. Default 0.8. */
  initialSoc?: number;
}

export interface SimInputs {
  /** A press of the power button. It is consumed by the next tick. */
  powerButton: boolean;
}

export interface StartupStepSnapshot {
  id: StartupStepId;
  status: StartupStepStatus;
  /** Sim time the step started, s, or null. */
  startedS: number | null;
  /** Sim time the step finished (done or failed), s, or null. */
  doneS: number | null;
}

export interface SimSnapshot {
  /** Ticks elapsed since creation. */
  tick: number;
  /** Simulated time in seconds (tick * TICK_S). */
  timeS: number;
  powerState: PowerState;
  startup: {
    steps: StartupStepSnapshot[];
    /** Why the last startup attempt failed, or null. */
    failReason: StartupFailReason | null;
  };
  pack: {
    /** Terminal voltage, V. */
    voltageV: number;
    /** Current, A, positive for discharge. */
    currentA: number;
    /** State of charge, 0..1. */
    soc: number;
  };
  dcLinkVoltageV: number;
  contactors: ContactorStates;
  /** Times main+ closed onto an under-charged DC-link (R2). Always 0 in a normal startup. */
  weldingEvents: number;
  /** 12 V battery voltage, V. */
  lvVoltageV: number;
}

export interface Sim {
  /** Advance the simulation by a whole number of ticks. */
  step(ticks?: number): void;
  /** Apply driver inputs from the next tick on. */
  setInputs(inputs: Partial<SimInputs>): void;
  /** Read-only view of the current state. */
  snapshot(): Readonly<SimSnapshot>;
  /** Bus frames recorded so far, oldest first (last 5,000). */
  trace(): Frame[];
}

function nullIfNaN(value: number): number | null {
  return Number.isNaN(value) ? null : value;
}

export function createSim(options: SimOptions = {}): Sim {
  const p = options.params ?? vehicleParams;
  const soc = options.initialSoc ?? 0.8;
  if (!(soc >= 0 && soc <= 1)) throw new RangeError(`initialSoc must be within 0..1, got ${soc}`);

  // The world: pack, HV circuit and 12 V battery.
  const ocvV = packOcvV(p, soc);
  const hv = createHvCircuit(p, TICK_S, ocvV);
  const bmsSensors = { hv, soc };
  const mcuSensors = { dcLinkV: 0, motorSpeedRadS: 0 };

  // The ECUs, talking over the bus.
  const bus = createBus(busCatalogue, { tickMs: TICK_MS });
  const vcu = createVcu(bus, p);
  const bms = createBms(bus, p);
  const mcu = createMcu(bus, p);
  const ic = createIc(bus);

  let tick = 0;
  let powerButton = false;

  function runTick() {
    // Integer ms first, so t is exact for whole ticks (matches the bus trace).
    const t = (tick * TICK_MS) / 1000;
    bus.deliver();

    vcu.step(t, powerButton);
    powerButton = false;
    bms.step(t, vcu.kl15, bmsSensors);
    mcuSensors.dcLinkV = hv.dcLinkV;
    mcu.step(t, vcu.kl15, mcuSensors);
    ic.step(t, vcu.kl15);

    hv.step(ocvV);
    bus.transmit(tick);
    tick++;
  }

  return {
    step(ticks = 1) {
      if (!Number.isInteger(ticks) || ticks < 0) {
        throw new RangeError(`step() needs a non-negative integer tick count, got ${ticks}`);
      }
      for (let i = 0; i < ticks; i++) runTick();
    },
    setInputs(inputs) {
      if (inputs.powerButton) powerButton = true;
    },
    snapshot() {
      return {
        tick,
        timeS: tick * TICK_S,
        powerState: vcu.powerState,
        startup: {
          steps: STARTUP_STEPS.map((id, i) => ({
            id,
            status: vcu.stepStatus[i]!,
            startedS: nullIfNaN(vcu.stepStartedS[i]!),
            doneS: nullIfNaN(vcu.stepDoneS[i]!),
          })),
          failReason: vcu.failReason,
        },
        pack: { voltageV: hv.packTerminalV, currentA: hv.packCurrentA, soc },
        dcLinkVoltageV: hv.dcLinkV,
        contactors: { ...hv.closed },
        weldingEvents: hv.weldingEvents,
        lvVoltageV: p.lvBatteryNominalV,
      };
    },
    trace() {
      return bus.trace();
    },
  };
}
