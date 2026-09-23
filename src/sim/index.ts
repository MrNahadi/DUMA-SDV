/**
 * Public API of the sim core. Framework-free and deterministic: the same
 * sequence of calls always yields the same snapshots (tech-stack.md, Simulation).
 */

import { createHvCircuit, createPack, type ContactorStates } from './battery';
import { GEARS, busCatalogue, createBus, type Frame } from './bus';
import {
  STARTUP_STEPS,
  createBms,
  createIc,
  createMcu,
  createVcu,
  type DashboardModel,
  type DriverInputs,
  type Gear,
  type GearRefusal,
  type PowerState,
  type StartupFailReason,
  type StartupStepId,
  type StartupStepStatus,
} from './ecus';
import { radsToRpm } from './units';
import { createLongitudinalDynamics, motorLossW, vehicleParams, type VehicleParams } from './vehicle';

export type { Frame } from './bus';
export type { DashboardModel, Gear, GearRefusal, PowerState, StartupFailReason, StartupStepId, StartupStepStatus } from './ecus';

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
  /** Accelerator pedal, 0..1. Held until changed. */
  accelerator: number;
  /** Brake pedal, 0..1. Held until changed. */
  brake: number;
  /** A gear selector request. It is consumed by the next tick. */
  gearRequest: Gear;
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
  gear: Gear;
  /** Why the latest gear request was refused, or null if it was accepted. */
  gearRefusal: GearRefusal | null;
  /** Driver pedal positions, 0..1. */
  pedals: { accelerator: number; brake: number };
  /** Vehicle speed, m/s, forward positive. */
  speedMs: number;
  /** Vehicle acceleration, m/s². */
  accelMs2: number;
  motor: {
    /** Shaft speed, rpm, forward positive. */
    speedRpm: number;
    /** Shaft torque, N·m, forward positive. */
    torqueNm: number;
  };
  /** Distance travelled since creation, m. */
  odometerM: number;
  /** Net energy delivered at the pack terminals since creation, J (discharge positive). */
  tripEnergyJ: number;
  pack: {
    /** Terminal voltage, V. */
    voltageV: number;
    /** Current, A, positive for discharge. */
    currentA: number;
    /** True state of charge, 0..1 of the usable charge (the plant, not the BMS estimate). */
    soc: number;
  };
  /** The instrument cluster's dashboard model, built only from bus frames (R4). */
  dashboard: DashboardModel;
  dcLinkVoltageV: number;
  contactors: ContactorStates;
  /** Times main+ closed onto an under-charged DC-link (R2). Always 0 in a normal startup. */
  weldingEvents: number;
  /** 12 V battery voltage, V. */
  lvVoltageV: number;
  /** What the 3D car shows. */
  render: {
    /** Road-wheel rotation angle, rad, in [0, 2π). */
    wheelAngleRad: number;
    /** Brake-light intensity, 0..1 (follows the brake pedal). */
    brakeLights: number;
    headlights: boolean;
  };
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
  /** Drop every frame of a bus message from the next tick on (a lost message), or restore it. */
  setMessageDropped(message: string, dropped: boolean): void;
}

function nullIfNaN(value: number): number | null {
  return Number.isNaN(value) ? null : value;
}

function checkPedal(name: string, value: number): void {
  if (!(value >= 0 && value <= 1)) throw new RangeError(`${name} must be within 0..1, got ${value}`);
}

export function createSim(options: SimOptions = {}): Sim {
  const p = options.params ?? vehicleParams;
  const soc = options.initialSoc ?? 0.8;
  if (!(soc >= 0 && soc <= 1)) throw new RangeError(`initialSoc must be within 0..1, got ${soc}`);

  // The world: pack, HV circuit, 12 V battery and the car's motion.
  const pack = createPack(p, TICK_S, soc);
  const hv = createHvCircuit(p, TICK_S, pack.ocvV);
  const dynamics = createLongitudinalDynamics(p, TICK_S);
  const bmsSensors = { hv };
  const mcuSensors = { dcLinkV: 0, motorSpeedRadS: 0 };

  // The ECUs, talking over the bus.
  const bus = createBus(busCatalogue, { tickMs: TICK_MS });
  const vcu = createVcu(bus, p, TICK_S);
  const bms = createBms(bus, p, { tickS: TICK_S, initialSoc: soc });
  const mcu = createMcu(bus, p);
  const ic = createIc(bus);

  let tick = 0;
  let powerButton = false;
  let tripEnergyJ = 0;
  const driver: DriverInputs = { accelerator: 0, brake: 0, gearRequest: null };

  /**
   * Power the HV loads draw at the pack terminals, W (R2): the inverter's DC power
   * (shaft power plus motor + inverter losses, ADR 0004) while it switches, plus
   * the auxiliary load through the DC-DC. `omega` is the mean shaft speed over the
   * tick, so the shaft work matches the dynamics' kinetic-energy change exactly.
   */
  function hvLoadW(torqueNm: number, omega: number): number {
    const inverterW = mcu.running ? torqueNm * omega + motorLossW(p, torqueNm, omega) : 0;
    return inverterW + p.auxLoadW;
  }

  function runTick() {
    // Integer ms first, so t is exact for whole ticks (matches the bus trace).
    const t = (tick * TICK_MS) / 1000;
    bus.deliver();

    vcu.step(t, powerButton, driver);
    powerButton = false;
    driver.gearRequest = null;
    bms.step(t, vcu.kl15, bmsSensors);
    mcuSensors.dcLinkV = hv.dcLinkV;
    mcuSensors.motorSpeedRadS = dynamics.motorSpeedRadS;
    mcu.step(t, vcu.kl15, mcuSensors);
    ic.step(t, vcu.kl15);

    // Friction brakes are hydraulic: the pedal acts on the plant directly.
    const omegaBefore = dynamics.motorSpeedRadS;
    dynamics.step(mcu.torqueNm, driver.brake);
    hv.step(pack.ocvV, hvLoadW(mcu.torqueNm, (omegaBefore + dynamics.motorSpeedRadS) / 2));
    pack.step(hv.packCurrentA);
    tripEnergyJ += hv.packTerminalV * hv.packCurrentA * TICK_S;
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
      if (inputs.accelerator !== undefined) checkPedal('accelerator', inputs.accelerator);
      if (inputs.brake !== undefined) checkPedal('brake', inputs.brake);
      if (inputs.gearRequest !== undefined && !GEARS.includes(inputs.gearRequest)) {
        throw new RangeError(`gearRequest must be one of ${GEARS.join(', ')}, got ${String(inputs.gearRequest)}`);
      }
      if (inputs.powerButton) powerButton = true;
      if (inputs.accelerator !== undefined) driver.accelerator = inputs.accelerator;
      if (inputs.brake !== undefined) driver.brake = inputs.brake;
      if (inputs.gearRequest !== undefined) driver.gearRequest = inputs.gearRequest;
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
        gear: vcu.gear,
        gearRefusal: vcu.gearRefusal,
        pedals: { accelerator: driver.accelerator, brake: driver.brake },
        speedMs: dynamics.speedMs,
        accelMs2: dynamics.accelMs2,
        motor: { speedRpm: radsToRpm(dynamics.motorSpeedRadS), torqueNm: mcu.torqueNm },
        odometerM: dynamics.odometerM,
        tripEnergyJ,
        pack: { voltageV: hv.packTerminalV, currentA: hv.packCurrentA, soc: pack.soc },
        dashboard: { ...ic.dashboard },
        dcLinkVoltageV: hv.dcLinkV,
        contactors: { ...hv.closed },
        weldingEvents: hv.weldingEvents,
        lvVoltageV: p.lvBatteryNominalV,
        render: {
          wheelAngleRad: dynamics.wheelAngleRad,
          brakeLights: driver.brake,
          headlights: vcu.powerState === 'READY',
        },
      };
    },
    trace() {
      return bus.trace();
    },
    setMessageDropped(message, dropped) {
      bus.setMessageDropped(message, dropped);
    },
  };
}
