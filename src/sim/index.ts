/**
 * Public API of the sim core. Framework-free and deterministic: the same
 * sequence of calls always yields the same snapshots (tech-stack.md, Simulation).
 */

import { createHvCircuit, createPack, type ContactorStates } from './battery';
import { GEARS, busCatalogue, createBus, type Frame } from './bus';
import { isFresh } from './ecus/ecu';
import { createFaultRecords, type DiagnosticsSnapshot, type FaultCommand } from './faults';
import { createDiagnosticBus } from './faults/bus';
import { createObc } from './ecus/obc';
import {
  STARTUP_STEPS,
  createBms,
  createIc,
  createMcu,
  createVcu,
  type DashboardModel,
  type ChargeDisplayModel,
  type ThermalDisplayModel,
  type DriverInputs,
  type Gear,
  type GearRefusal,
  type PowerState,
  type StartupFailReason,
  type StartupStepId,
  type StartupStepStatus,
} from './ecus';
import { radsToRpm } from './units';
import { createThermal, thermalParams, type ThermalState } from './thermal';
import { BRAKE_MAX_DECEL_G, GRAVITY_MS2, createLongitudinalDynamics, motorLossW, vehicleParams, type VehicleParams } from './vehicle';

export type { Frame } from './bus';
export type { ChargeDisplayModel, DashboardModel, ThermalDisplayModel, Gear, GearRefusal, PowerState, StartupFailReason, StartupStepId, StartupStepStatus } from './ecus';
export { faultCatalogue } from './faults';
export type { CoolantLoopState, ThermalState } from './thermal';
export type { DiagnosticsSnapshot, FaultCommand, FaultKey, FaultRecord } from './faults';

/** Fixed simulation step: 10 ms (100 Hz). */
export const TICK_S = 0.01;
const TICK_MS = 10;
/** Estimated EVSE input taper by pack SOC, ADR 0010. */
const DC_TAPER: readonly (readonly [number, number])[] = [
  [0.1, 150_000], [0.3, 145_000], [0.5, 120_000],
  [0.7, 80_000], [0.8, 55_000], [1, 0],
];
const DC_CONNECTION_EFFICIENCY = 0.99; // ADR 0010

function dcTaperPowerW(soc: number): number {
  for (let i = 1; i < DC_TAPER.length; i++) {
    const [endSoc, endW] = DC_TAPER[i]!;
    if (soc <= endSoc) {
      const [startSoc, startW] = DC_TAPER[i - 1]!;
      return startW + (endW - startW) * (soc - startSoc) / (endSoc - startSoc);
    }
  }
  return 0;
}

export interface SimOptions {
  /** Vehicle parameters. Defaults to the Duma SDV's (`vehicleParams`). */
  params?: Readonly<VehicleParams>;
  /** Traction pack state of charge at creation, 0..1. Default 0.8. */
  initialSoc?: number;
}

export interface SimInputs {
  /** One-shot diagnostic command, consumed on the next tick. */
  faultCommand: FaultCommand;
  /** A press of the power button. It is consumed by the next tick. */
  powerButton: boolean;
  /** Accelerator pedal, 0..1. Held until changed. */
  accelerator: number;
  /** Brake pedal, 0..1. Held until changed. */
  brake: number;
  /** A gear selector request. It is consumed by the next tick. */
  gearRequest: Gear;
  /** Source selected for the next plug-in request. */
  chargeSource: 'AC' | 'DC';
  /** One-shot charge-port or session command. */
  chargeCommand: 'plugIn' | 'unplug' | 'start' | 'stop';
  /** Desired SOC, 0..1. Start requires it to exceed current SOC. */
  chargeTargetSoc: number;
}

export type ChargeRefusal = 'notPlugged' | 'alreadyPlugged' | 'notParked' | 'moving' | 'targetNotAboveSoc' | 'sessionActive' | 'notCharging' | 'noSource' | 'faultActive';
export interface ChargeSnapshot {
  source: 'AC' | 'DC' | null;
  connected: boolean;
  session: 'idle' | 'plugged' | 'charging' | 'stopped' | 'complete';
  /** True only while fresh VCU and BMS frames permit external current. */
  authorized: boolean;
  targetSoc: number;
  powerW: number;
  /** AC wallbox input and OBC conversion, W; zero outside AC charging. */
  inputPowerW: number;
  obcOutputPowerW: number;
  lossPowerW: number;
  refusal: ChargeRefusal | null;
}

/** Signed branch powers at the HV node, W, and converter losses, W (R1–R3). */
export interface PowerFlowSnapshot {
  /** Pack power into the HV node through the main contactors, positive for discharge. */
  packW: number;
  /** Inverter DC-side input, positive when motoring, negative in regen. */
  inverterDcW: number;
  /** Motor shaft power, positive when motoring, negative in regen. */
  motorShaftW: number;
  /** Charger (OBC or EVSE) output into the HV node. */
  chargerOutputW: number;
  /** DC-DC input from the HV node. */
  dcdcInputW: number;
  /** DC-DC output to the 12 V system. */
  dcdcOutputW: number;
  losses: {
    /** Motor plus inverter loss (ADR 0004). */
    drivetrainW: number;
    /** OBC loss or DC connection loss. */
    chargerW: number;
    /** DC-DC conversion loss (the auxiliary load is modelled at the HV node). */
    dcdcW: number;
  };
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
  /** ECU-owned diagnostic records and latest management result. */
  diagnostics: DiagnosticsSnapshot;
  /** Ticks elapsed since creation. */
  tick: number;
  /** Simulated time in seconds (tick * TICK_S). */
  timeS: number;
  powerState: PowerState;
  charge: ChargeSnapshot;
  /** Power flow during the latest tick. */
  power: PowerFlowSnapshot;
  /** Pack, motor and inverter temperatures, coolant loop state and heat accounting (R5–R8). */
  thermal: ThermalState;
  /** Charge view model built by the IC from received bus frames. */
  chargeDisplay: ChargeDisplayModel;
  /** Pack, motor and inverter temperatures the IC received over the bus, °C; null when stale. */
  thermalDisplay: ThermalDisplayModel;
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

export interface TopologyEdge {
  readonly message: string;
  readonly id: number;
  readonly sender: string;
  /** Subscribing ECUs, sorted by name. */
  readonly subscribers: readonly string[];
}

export interface BusTopology {
  /** ECUs that send or subscribe to catalogue messages, sorted by name. */
  readonly nodes: readonly string[];
  /** One edge per catalogue message, in catalogue order. */
  readonly edges: readonly TopologyEdge[];
}

/** Sim-internal bus observers: not ECUs, so not part of the topology. */
const INTERNAL_SUBSCRIBERS = new Set(['ChargePath', 'Diagnostics']);

export interface Sim {
  /** Advance the simulation by a whole number of ticks. */
  step(ticks?: number): void;
  /** Apply driver inputs from the next tick on. */
  setInputs(inputs: Partial<SimInputs>): void;
  /** Read-only view of the current state. */
  snapshot(): Readonly<SimSnapshot>;
  /** Bus frames recorded so far, oldest first (last 5,000). */
  trace(): Frame[];
  /** ECU nodes and message edges (sender → subscribers), built from the catalogue and subscriptions. */
  topology(): BusTopology;
  /** ECUs whose bus transceiver is off (they send nothing). */
  inactiveSenders(): string[];
  /** Drop every frame of a bus message from the next tick on (a lost message), or restore it. */
  setMessageDropped(message: string, dropped: boolean): void;
}

function nullIfNaN(value: number): number | null {
  return Number.isNaN(value) ? null : value;
}

function checkPedal(name: string, value: number): void {
  if (!(value >= 0 && value <= 1)) throw new RangeError(`${name} must be within 0..1, got ${value}`);
}

/** Ambient temperature, °C (ADR 0003 conditions). */
const AMBIENT_C = 23;
/** Share of the modelled drivetrain loss dissipated in the inverter; the rest heats the motor. */
const INVERTER_LOSS_FRACTION = 0.35; // estimate, ADR 0012

export function createSim(options: SimOptions = {}): Sim {
  const p = options.params ?? vehicleParams;
  const soc = options.initialSoc ?? 0.8;
  if (!(soc >= 0 && soc <= 1)) throw new RangeError(`initialSoc must be within 0..1, got ${soc}`);

  // The world: pack, HV circuit, 12 V battery and the car's motion.
  const pack = createPack(p, TICK_S, soc);
  const hv = createHvCircuit(p, TICK_S, pack.ocvV);
  const dynamics = createLongitudinalDynamics(p, TICK_S);
  const bmsSensors = { hv, packTempC: AMBIENT_C };
  const mcuSensors = { dcLinkV: 0, motorSpeedRadS: 0, motorTempC: AMBIENT_C, inverterTempC: AMBIENT_C };
  const thermal = createThermal(thermalParams, AMBIENT_C);

  // The ECUs, talking over the bus.
  const bus = createBus(busCatalogue, { tickMs: TICK_MS });
  const chargePath = bus.subscribe('ChargePath', ['VCU_Charge', 'BMS_Charge']);
  const faultRecords = createFaultRecords();
  const vcu = createVcu(bus, p, TICK_S, faultRecords.statusOf);
  const bms = createBms(bus, p, { tickS: TICK_S, initialSoc: soc, faultStatus: faultRecords.statusOf });
  const mcu = createMcu(bus, p, faultRecords.statusOf);
  const ic = createIc(bus, p.usableEnergyJ);
  const obc = createObc(bus, p);
  const diagnosticBus = createDiagnosticBus(bus, faultRecords.statusOf);

  let tick = 0;
  let powerButton = false;
  const power: PowerFlowSnapshot = {
    packW: 0, inverterDcW: 0, motorShaftW: 0, chargerOutputW: 0, dcdcInputW: 0, dcdcOutputW: 0,
    losses: { drivetrainW: 0, chargerW: 0, dcdcW: 0 },
  };
  let tripEnergyJ = 0;
  const driver: DriverInputs = {
    accelerator: 0, brake: 0, gearRequest: null, cableConnected: false,
    chargeRequested: false, chargeSource: null, chargeTargetSoc: 1, chargeSession: 'idle',
  };
  let selectedSource: 'AC' | 'DC' | null = null;
  let chargeCommand: SimInputs['chargeCommand'] | null = null;
  let faultCommand: FaultCommand | null = null;
  const charge: ChargeSnapshot = { source: null, connected: false, session: 'idle', authorized: false, targetSoc: 1, powerW: 0, inputPowerW: 0, obcOutputPowerW: 0, lossPowerW: 0, refusal: null };
  const chargeBlockingFault = (t: number) => isFresh(chargePath, 'VCU_Charge', t - 0.1) && chargePath.read('VCU_Charge', 'faultBlock') === 'yes' ||
    isFresh(chargePath, 'BMS_Charge', t - 0.1) && chargePath.read('BMS_Charge', 'faultBlock') === 'yes';

  function applyChargeCommand() {
    const command = chargeCommand;
    chargeCommand = null;
    if (command === null) return;
    charge.refusal = null;
    const parked = vcu.gear === 'P';
    const stopped = Math.abs(dynamics.speedMs) < 1 / 3.6;
    if (command === 'plugIn') {
      if (charge.connected) charge.refusal = 'alreadyPlugged';
      else if (!parked) charge.refusal = 'notParked';
      else if (!stopped) charge.refusal = 'moving';
      else if (selectedSource === null) charge.refusal = 'noSource';
      else {
        charge.source = selectedSource;
        charge.connected = true;
        charge.session = 'plugged';
      }
    } else if (command === 'start') {
      if (!charge.connected) charge.refusal = 'notPlugged';
      else if (charge.session === 'charging') charge.refusal = 'sessionActive';
      else if (!parked) charge.refusal = 'notParked';
      else if (!stopped) charge.refusal = 'moving';
      else if (charge.targetSoc <= pack.soc) charge.refusal = 'targetNotAboveSoc';
      else if (chargeBlockingFault(tick * TICK_S)) charge.refusal = 'faultActive';
      else charge.session = 'charging';
    } else if (command === 'stop') {
      if (charge.session !== 'charging') charge.refusal = 'notCharging';
      else { charge.session = 'stopped'; charge.authorized = false; }
    } else if (command === 'unplug') {
      if (!charge.connected) charge.refusal = 'notPlugged';
      else if (charge.session === 'charging') charge.refusal = 'sessionActive';
      else {
        charge.source = null;
        charge.connected = false;
        charge.session = 'idle';
      }
    }
    driver.cableConnected = charge.connected;
  }

  function updateChargePath(t: number) {
    // A zero-at-full taper approaches 100% asymptotically; treat the final
    // 0.001 percentage point as full without adding fictional cell energy.
    const completionMargin = charge.targetSoc === 1 ? 1e-5 : 1e-12;
    if (charge.session === 'charging' && pack.soc >= Math.min(charge.targetSoc, 1) - completionMargin) {
      charge.session = 'complete';
    }
    const since = t - 0.1;
    charge.authorized = charge.session === 'charging' && charge.connected &&
      vcu.powerState === 'CHARGING' && vcu.gear === 'P' && Math.abs(dynamics.speedMs) < 1 / 3.6 &&
      isFresh(chargePath, 'VCU_Charge', since) &&
      chargePath.read('VCU_Charge', 'authorized') === 'yes' &&
      chargePath.read('VCU_Charge', 'source') === charge.source &&
      isFresh(chargePath, 'BMS_Charge', since) &&
      chargePath.read('BMS_Charge', 'accepted') === 'yes' &&
      (chargePath.read('BMS_Charge', 'maxExternalChargeKw') as number) > 0;
    if (charge.session === 'charging' && chargeBlockingFault(t)) {
      charge.session = 'stopped';
      charge.authorized = false;
    }
  }

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

    if (faultCommand !== null) {
      faultRecords.apply(faultCommand, t);
      faultCommand = null;
    }

    applyChargeCommand();

    if (powerButton && charge.session === 'charging') {
      charge.session = 'stopped';
      charge.authorized = false;
    }

    driver.chargeRequested = charge.session === 'charging';
    driver.chargeSource = charge.source;
    driver.chargeTargetSoc = charge.targetSoc;
    driver.chargeSession = charge.session;

    vcu.step(t, powerButton, driver);
    powerButton = false;
    driver.gearRequest = null;
    // Each ECU reads only its own temperature sensors; the plant's last-tick state.
    const temps = thermal.state();
    bmsSensors.packTempC = temps.packC;
    mcuSensors.motorTempC = temps.motorC;
    mcuSensors.inverterTempC = temps.inverterC;
    bms.step(t, vcu.kl15, bmsSensors);
    mcuSensors.dcLinkV = hv.dcLinkV;
    mcuSensors.motorSpeedRadS = dynamics.motorSpeedRadS;
    mcu.step(t, vcu.kl15, mcuSensors);
    diagnosticBus.publish();
    ic.step(t, vcu.kl15);
    updateChargePath(t);

    // ADR 0009: friction fills the pedal demand left by actual MCU generator torque.
    // Use the actual torque so stale commands or a disabled inverter cannot reduce braking.
    const omegaBefore = dynamics.motorSpeedRadS;
    const speed = dynamics.speedMs;
    const fullBrakeN = Math.min(BRAKE_MAX_DECEL_G, p.tyreRoadFriction) * p.testMassKg * GRAVITY_MS2;
    const liftFade = Math.min(Math.max((Math.abs(speed) - 0.5) / 4.5, 0), 1);
    const liftN = 0.15 * p.testMassKg * GRAVITY_MS2 * liftFade;
    const demandN = driver.brake > 0 ? Math.max(liftN, driver.brake * fullBrakeN) : 0;
    const electricN = mcu.torqueNm * speed < 0
      ? Math.abs(mcu.torqueNm) * p.reductionRatio / (p.gearEfficiency * p.wheelRadiusM)
      : 0;
    const pedalForceScaleN = BRAKE_MAX_DECEL_G * p.testMassKg * GRAVITY_MS2;
    const frictionPedal = pedalForceScaleN > 0 ? Math.min(Math.max((demandN - electricN) / pedalForceScaleN, 0), 1) : 0;
    dynamics.step(mcu.torqueNm, frictionPedal);
    const remainingSoc = Math.max(0, Math.min(charge.targetSoc, 1) - pack.soc);
    const targetCurrentA = remainingSoc * (p.usableEnergyJ / p.packNominalVoltageV) / TICK_S;
    const voltageCurrentA = Math.max(0, (620 - pack.ocvV) / p.packInternalResistanceOhm);
    const acceptedCurrentA = Math.min(pack.maxChargeCurrentA, targetCurrentA, 300, voltageCurrentA);
    const loadW = hvLoadW(mcu.torqueNm, (omegaBefore + dynamics.motorSpeedRadS) / 2);
    const maxOutputW = loadW + (pack.ocvV + acceptedCurrentA * p.packInternalResistanceOhm) * acceptedCurrentA;
    obc.step(t, charge.authorized && charge.source === 'AC' && hv.closed.mainNeg && hv.closed.mainPos, maxOutputW);
    // The EVSE is a plant, not an ECU. It reads received authorization frames and
    // delivers DC to the pack-side HV path without energizing the OBC (ADR 0010).
    const dcAllowed = charge.authorized && charge.source === 'DC' &&
      hv.closed.mainNeg && hv.closed.mainPos;
    const dcAllowanceW = dcAllowed
      ? (chargePath.read('BMS_Charge', 'maxExternalChargeKw') as number) * 1000
      : 0;
    const dcInputW = dcAllowed ? Math.max(0, Math.min(
      p.dcPeakPowerW,
      dcTaperPowerW(pack.soc),
      dcAllowanceW,
      maxOutputW / DC_CONNECTION_EFFICIENCY,
    )) : 0;
    const dcOutputW = dcInputW * DC_CONNECTION_EFFICIENCY;
    const externalW = obc.outputPowerW + dcOutputW;
    hv.step(pack.ocvV, loadW - externalW, externalW > 0 ? acceptedCurrentA : pack.maxChargeCurrentA);
    pack.step(hv.packCurrentA);
    charge.inputPowerW = obc.inputPowerW + dcInputW;
    charge.obcOutputPowerW = obc.outputPowerW;
    charge.lossPowerW = obc.lossPowerW + dcInputW - dcOutputW;
    charge.powerW = externalW > 0 ? Math.max(0, -hv.packTerminalV * hv.packCurrentA) : 0;
    // Read-only tap of the powers used above; it must not feed back into integration.
    const omegaMean = (omegaBefore + dynamics.motorSpeedRadS) / 2;
    const mainClosed = hv.closed.mainNeg && hv.closed.mainPos;
    // Pre-charge current flows through the resistor, not into the HV node.
    power.packW = mainClosed ? hv.packTerminalV * hv.packCurrentA : 0;
    power.motorShaftW = mcu.running ? mcu.torqueNm * omegaMean : 0;
    power.losses.drivetrainW = mcu.running ? motorLossW(p, mcu.torqueNm, omegaMean) : 0;
    power.inverterDcW = power.motorShaftW + power.losses.drivetrainW;
    power.chargerOutputW = externalW;
    power.losses.chargerW = charge.lossPowerW;
    power.dcdcInputW = mainClosed ? p.auxLoadW : 0;
    power.dcdcOutputW = power.dcdcInputW;
    power.losses.dcdcW = 0;
    thermal.step({
      packW: hv.packCurrentA * hv.packCurrentA * p.packInternalResistanceOhm,
      motorW: power.losses.drivetrainW * (1 - INVERTER_LOSS_FRACTION),
      inverterW: power.losses.drivetrainW * INVERTER_LOSS_FRACTION,
    }, TICK_S, mainClosed);
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
      if (inputs.faultCommand !== undefined && (typeof inputs.faultCommand !== 'object' || inputs.faultCommand === null)) {
        throw new RangeError('invalid faultCommand');
      }
      if (inputs.accelerator !== undefined) checkPedal('accelerator', inputs.accelerator);
      if (inputs.brake !== undefined) checkPedal('brake', inputs.brake);
      if (inputs.gearRequest !== undefined && !GEARS.includes(inputs.gearRequest)) {
        throw new RangeError(`gearRequest must be one of ${GEARS.join(', ')}, got ${String(inputs.gearRequest)}`);
      }
      if (inputs.chargeSource !== undefined && inputs.chargeSource !== 'AC' && inputs.chargeSource !== 'DC') {
        throw new RangeError('chargeSource must be AC or DC');
      }
      if (inputs.chargeCommand !== undefined && !['plugIn', 'unplug', 'start', 'stop'].includes(inputs.chargeCommand)) {
        throw new RangeError('invalid chargeCommand');
      }
      if (inputs.chargeTargetSoc !== undefined && !(inputs.chargeTargetSoc > 0 && inputs.chargeTargetSoc <= 1)) {
        throw new RangeError('chargeTargetSoc must be within (0, 1]');
      }
      if (inputs.powerButton) powerButton = true;
      if (inputs.accelerator !== undefined) driver.accelerator = inputs.accelerator;
      if (inputs.brake !== undefined) driver.brake = inputs.brake;
      if (inputs.gearRequest !== undefined) driver.gearRequest = inputs.gearRequest;
      if (inputs.chargeSource !== undefined) selectedSource = inputs.chargeSource;
      if (inputs.chargeTargetSoc !== undefined) charge.targetSoc = inputs.chargeTargetSoc;
      if (inputs.chargeCommand !== undefined) chargeCommand = inputs.chargeCommand;
      if (inputs.faultCommand !== undefined) faultCommand = inputs.faultCommand;
    },
    snapshot() {
      return {
        tick,
        timeS: tick * TICK_S,
        diagnostics: { ...faultRecords.snapshot(), busStatus: diagnosticBus.snapshot(tick * TICK_S) },
        powerState: vcu.powerState,
        charge: { ...charge },
        power: { ...power, losses: { ...power.losses } },
        thermal: thermal.state(),
        chargeDisplay: { ...ic.chargeDisplay },
        thermalDisplay: { ...ic.thermalDisplay },
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
    inactiveSenders() {
      return bus.inactiveSenders();
    },
    topology() {
      const subs = bus.subscriptions().filter((s) => !INTERNAL_SUBSCRIBERS.has(s.subscriber));
      const edges = bus.catalogue.map((m) => ({
        message: m.name,
        id: m.id,
        sender: m.sender,
        subscribers: [...new Set(subs.filter((s) => s.messages.includes(m.name)).map((s) => s.subscriber))].sort(),
      }));
      const nodes = [...new Set(edges.flatMap((e) => [e.sender, ...e.subscribers]))].sort();
      return { nodes, edges };
    },
    setMessageDropped(message, dropped) {
      bus.setMessageDropped(message, dropped);
    },
  };
}
