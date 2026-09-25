/**
 * VCU (requirements R4): the supervisor. It senses the power button and the
 * driver's pedals and gear selector directly, owns the switched 12 V supply (KL15)
 * of the other ECUs, and runs the power state machine, the startup sequence, the
 * gear interlocks, the pedal map and the range estimate. It learns everything
 * about the other ECUs from the bus. Timings are in ADR 0005, gear rules in
 * ADR 0006, the pedal map and speed limiter in ADR 0007, and the range estimate
 * in ADR 0008.
 */

import { DRIVE_MODES, GEARS, POWER_STATES, STARTUP_STEPS, type Bus } from '../bus';
import type { VehicleParams } from '../vehicle';
import { GRAVITY_MS2, motorLossW, motorMaxTorqueNm } from '../vehicle';
import { jPerMToWhPerKm, kmhToMs, msToKmh, rpmToRads } from '../units';
import type { FaultKey } from '../faults';
import { INITIAL_SW_VERSION, TIME_EPS_S, createBootTracker, isFresh } from './ecu';

export type PowerState = (typeof POWER_STATES)[number];
export type Gear = (typeof GEARS)[number];
export type DriveMode = (typeof DRIVE_MODES)[number];
/** Why a gear request was refused (ADR 0006). */
export type GearRefusal = 'brakeRequired' | 'speedTooHigh' | 'notReady' | 'cableConnected';

/** What the VCU senses from the driver each tick. */
export interface DriverInputs {
  /** Accelerator pedal, 0..1. */
  accelerator: number;
  /** Brake pedal, 0..1. */
  brake: number;
  /** A gear selector request this tick, or null. */
  gearRequest: Gear | null;
  /** Selected drive mode (ADR 0013). */
  driveMode: DriveMode;
  /** Physical charge-port cable sense. */
  cableConnected: boolean;
  /** Driver charge request and source, sensed through the charge-port controls. */
  chargeRequested: boolean;
  chargeSource: 'AC' | 'DC' | null;
  chargeTargetSoc: number;
  chargeSession: 'idle' | 'plugged' | 'charging' | 'stopped' | 'complete';
}

export { STARTUP_STEPS };
export type StartupStepId = (typeof STARTUP_STEPS)[number];
export type StartupStepStatus = 'pending' | 'active' | 'done' | 'failed';
export type StartupFailReason =
  | 'wakeTimeout'
  | 'selfCheckFailed'
  | 'selfCheckTimeout'
  | 'prechargeFailed'
  | 'prechargeTimeout'
  | 'contactorTimeout'
  | 'readyTimeout'
  | 'faultActive';

const WAKE = 0;
const SELF_CHECK = 1;
const PRECHARGE = 2;
const CONTACTORS = 3;
const READY = 4;

/** The VCU leaves low-power mode and starts its application. */
const VCU_WAKE_S = 0.1;
/** Each step fails if it has not finished this long after it started. */
const STEP_TIMEOUT_S: readonly number[] = [0.5, 0.5, 2.0, 0.5, 0.5];
const TIMEOUT_REASON: readonly StartupFailReason[] = [
  'wakeTimeout',
  'selfCheckTimeout',
  'prechargeTimeout',
  'contactorTimeout',
  'readyTimeout',
];
/** Consecutive valid BMS_Status frames needed before the VCU trusts the pack. */
const BMS_QUALIFY_FRAMES = 3;
/** A 10 ms message older than this counts as lost. */
const LIVE_S = 0.1;
/** READY needs the DC-link within this fraction of pack voltage. */
const READY_DC_LINK_RATIO = 0.9;
/** Power-down waits this long for the BMS to report open contactors. */
const SHUTDOWN_TIMEOUT_S = 1;
const REMOTE_BOOTS = ['BMS_Boot', 'MCU_Boot', 'IC_Boot'] as const;
/** Leaving P or changing direction needs the car below this speed (R4). */
const STANDSTILL_KMH = 1;
/** ... and the brake pedal above this (R4). */
const SHIFT_BRAKE_MIN = 0.1;
/** Speed limit in R (R4). */
const REVERSE_SPEED_LIMIT_KMH = 20;
/** The limiter fades torque out over this band below the limit (ADR 0007). */
const LIMITER_BAND_KMH = 2;
/** BMS_Status (100 ms) older than this counts as lost for the trip energy. */
const BMS_LIVE_S = 0.2;
/** The range estimate uses WLTP consumption until the trip passes this distance (R4)... */
const TRIP_BLEND_START_M = 5_000;
/** ... then blends linearly to the trip average over this distance (ADR 0008). */
const TRIP_BLEND_SPAN_M = 20_000;
/** Floor on the consumption behind the estimate, as a fraction of WLTP: guards the division. */
const MIN_CONSUMPTION_RATIO = 0.5;
/** ADR 0009: Normal lift-off reaches 0.15 g above 5 m/s and vanishes below 0.5 m/s. */
const REGEN_DECEL_G = 0.15;
const REGEN_START_MS = 0.5;
const REGEN_FULL_MS = 5;
/** ADR 0009: brake pedal may request up to 0.30 g electric share. */
const BRAKE_REGEN_DECEL_G = 0.30;
const BRAKE_REGEN_FULL_MS = 2;

/**
 * ADR 0013: per-mode pedal progression (torque share = pedal^exponent), shaft power
 * cap and lift-off deceleration. Normal is the ADR 0007/0009 behaviour unchanged.
 */
/** ADR 0013: Eco battery discharge cap: the 140 kW shaft cap plus inverter and motor losses. */
export const ECO_DISCHARGE_CAP_W = 155_000; // estimate
export interface ModeMap { pedalExponent: number; powerCapW: number; liftOffG: number; batteryCapW: number }
export const MODE_MAPS: Readonly<Record<DriveMode, ModeMap>> = {
  eco: { pedalExponent: 1.6, powerCapW: 140_000, liftOffG: 0.2, batteryCapW: ECO_DISCHARGE_CAP_W }, // estimate
  normal: { pedalExponent: 1, powerCapW: Infinity, liftOffG: REGEN_DECEL_G, batteryCapW: Infinity },
  sport: { pedalExponent: 0.8, powerCapW: Infinity, liftOffG: REGEN_DECEL_G, batteryCapW: Infinity }, // estimate
};
/** ADR 0013: a mode change blends the old map into the new one over this time. */
/** Speed extrapolation for the Eco battery cap: one frame of staleness plus half a tick. */
const CAP_LOOKAHEAD_TICKS = 4;
/** VCU_Command torqueRequest resolution; the capped torque is floored to it so encoding cannot round it up. */
const TORQUE_REQUEST_STEP_NM = 0.1;
export const MODE_RAMP_S = 0.5; // estimate

export interface Vcu {
  readonly powerState: PowerState;
  /** True while the VCU holds the other ECUs' switched 12 V supply on. */
  readonly kl15: boolean;
  readonly stepStatus: readonly StartupStepStatus[];
  /** Sim time each step started / finished, NaN if it has not. */
  readonly stepStartedS: readonly number[];
  readonly stepDoneS: readonly number[];
  readonly failReason: StartupFailReason | null;
  readonly gear: Gear;
  /** Why the latest gear request was refused, or null if it was accepted. */
  readonly gearRefusal: GearRefusal | null;
  readonly chargeAuthorized: boolean;
  step(t: number, powerButtonPressed: boolean, driver: Readonly<DriverInputs>): void;
}

export function createVcu(bus: Bus, p: Readonly<VehicleParams>, tickS: number, faultStatus: (key: FaultKey) => 'active' | 'stored' | null): Vcu {
  const boot = createBootTracker(VCU_WAKE_S);
  const bootFrame = bus.writer('VCU', 'VCU_Boot');
  const command = bus.writer('VCU', 'VCU_Command');
  const status = bus.writer('VCU', 'VCU_Status');
  const rangeFrame = bus.writer('VCU', 'VCU_Range');
  const recoveryFrame = bus.writer('VCU', 'VCU_Recovery');
  const chargeFrame = bus.writer('VCU', 'VCU_Charge');
  const decisionFrame = bus.writer('VCU', 'VCU_DriveDecision');
  const modeFrame = bus.writer('VCU', 'VCU_Mode');
  const inbox = bus.subscribe('VCU', [...REMOTE_BOOTS, 'BMS_Status', 'BMS_Limits', 'BMS_Charge', 'MCU_Status', 'MCU_Vehicle', 'BMS_DTC', 'MCU_DTC']);
  bus.setSenderActive('VCU', false);

  const packVMin = p.seriesCells * 2.5;
  const packVMax = p.seriesCells * 3.65;
  const speedLimitKmh = msToKmh(p.topSpeedMs);
  const kmhPerRadS = msToKmh(p.wheelRadiusM / p.reductionRatio);

  const stepStatus: StartupStepStatus[] = STARTUP_STEPS.map(() => 'pending');
  const stepStartedS: number[] = STARTUP_STEPS.map(() => Number.NaN);
  const stepDoneS: number[] = STARTUP_STEPS.map(() => Number.NaN);

  let awake = false;
  const modeWeight: Record<DriveMode, number> = { eco: 0, normal: 1, sport: 0 };
  let pendingPress = false;
  let wakeAtS = 0;
  let current = -1;
  let shuttingDown = false;
  let shutdownAtS = 0;
  let hvRequested = false;
  let contactorRequest: 'open' | 'precharge' | 'close' = 'open';
  let lastBmsFrameS = Number.NaN;
  let bmsValidFrames = 0;
  /** The last of P, D or R selected. N keeps it, so shifting through N can't skip an interlock. */
  let lastEngaged: Gear = 'P';
  // Trip totals, from BMS_Status and MCU_Vehicle. The VCU is always powered, so they survive power cycles.
  let tripEnergyJ = 0;
  let recoveredJ = 0;
  let tripDistanceM = 0;

  const vcu = {
    powerState: 'OFF' as PowerState,
    kl15: false,
    stepStatus,
    stepStartedS,
    stepDoneS,
    failReason: null as StartupFailReason | null,
    gear: 'P' as Gear,
    gearRefusal: null as GearRefusal | null,
    chargeAuthorized: false,
    step(t: number, buttonPressed: boolean, driver: Readonly<DriverInputs>) {
      const running = updatePower(t, buttonPressed, driver.chargeRequested && driver.cableConnected);
      if (driver.gearRequest !== null) requestGear(t, driver.gearRequest, driver.brake, driver.cableConnected);
      if (running) {
        updateCharge(t, driver);
        publish(t, driver.cableConnected ? 0 : driver.accelerator, driver.brake, driver.cableConnected, driver.driveMode);
      } else vcu.chargeAuthorized = false;
    },
  };

  function driveDecision(t: number) {
    const low12V = faultStatus('low12V') === 'active';
    const bmsFresh = isFresh(inbox, 'BMS_DTC', Math.max(wakeAtS, t - 0.25));
    const mcuFresh = isFresh(inbox, 'MCU_DTC', Math.max(wakeAtS, t - 0.25));
    const bmsBits = bmsFresh ? inbox.read('BMS_DTC', 'activeBits') as number : 0;
    const mcuBits = mcuFresh ? inbox.read('MCU_DTC', 'activeBits') as number : 0;
    const insulation = (bmsBits & 2) !== 0;
    const motorHot = (mcuBits & 1) !== 0;
    const cellHot = (bmsBits & 1) !== 0;
    const unavailable = !bmsFresh || !mcuFresh;
    const reason = insulation ? 'insulationFault' : unavailable ? 'unavailable' : motorHot ? 'motorOverTemperature' : low12V ? 'low12V' : cellHot ? 'cellOverTemperature' : 'normal';
    const powerCapKw = insulation || unavailable ? 0 : Math.min(motorHot ? 30 : Infinity, low12V ? 20 : Infinity);
    const speedCapKmh = Math.min(motorHot ? 50 : Infinity, low12V ? 40 : Infinity, speedLimitKmh);
    return { reason, powerCapKw: Number.isFinite(powerCapKw) ? powerCapKw : 1000, speedCapKmh, regenDisabled: insulation || motorHot || unavailable };
  }

  /** Run the power state machine. Returns true if the VCU is running and publishing this tick. */
  function updatePower(t: number, buttonPressed: boolean, chargeWake: boolean): boolean {
    const pressed = buttonPressed || pendingPress;
    pendingPress = false;
    if (!awake) {
      if (!pressed && !chargeWake) return false;
      wake(t);
    } else if (pressed) {
      // While booting or powering down the press waits: it powers off once booted,
      // or powers on again once asleep.
      if (boot.running && !shuttingDown) powerOff(t);
      else pendingPress = true;
    }

    if (boot.update(awake, t) === 'booted') {
      bus.setSenderActive('VCU', true);
      bootFrame.set('selfCheck', 'pass').set('swVersion', INITIAL_SW_VERSION).raise();
    }
    if (!boot.running) return false;

    if (shuttingDown) {
      const bmsOpen = isFresh(inbox, 'BMS_Status', shutdownAtS) && inbox.read('BMS_Status', 'contactorState') === 'open';
      if (!hvRequested || bmsOpen || t - shutdownAtS >= SHUTDOWN_TIMEOUT_S - TIME_EPS_S) {
        sleep(t);
        return false;
      }
    } else if (current >= 0) {
      runStartup(t);
    }
    return true;
  }

  function wake(t: number) {
    awake = true;
    wakeAtS = t;
    vcu.kl15 = true;
    vcu.powerState = 'ACCESSORY';
    vcu.failReason = null;
    vcu.gearRefusal = null;
    hvRequested = false;
    contactorRequest = 'open';
    lastBmsFrameS = Number.NaN;
    bmsValidFrames = 0;
    resetSteps();
    startStep(WAKE, t);
  }

  function resetSteps() {
    for (let i = 0; i < STARTUP_STEPS.length; i++) {
      stepStatus[i] = 'pending';
      stepStartedS[i] = Number.NaN;
      stepDoneS[i] = Number.NaN;
    }
    current = -1;
  }

  function startStep(i: number, t: number) {
    current = i;
    stepStatus[i] = 'active';
    stepStartedS[i] = t;
  }

  function finishStep(i: number, t: number) {
    stepStatus[i] = 'done';
    stepDoneS[i] = t;
    current = -1;
    if (i < READY) startStep(i + 1, t);
  }

  function fail(i: number, reason: StartupFailReason, t: number) {
    stepStatus[i] = 'failed';
    stepDoneS[i] = t;
    vcu.failReason = reason;
    current = -1;
    beginShutdown(t);
  }

  /** Power off pressed by the driver: not a failure, so the checklist resets. */
  function powerOff(t: number) {
    resetSteps();
    beginShutdown(t);
  }

  function beginShutdown(t: number) {
    // P only once the car has stopped; while it is still rolling, N (ADR 0006).
    // With no speed reading since waking, the gear stays as it is.
    const speedKmh = vehicleSpeedKmh(wakeAtS);
    if (!Number.isNaN(speedKmh)) selectGear(Math.abs(speedKmh) < STANDSTILL_KMH ? 'P' : 'N');
    vcu.powerState = 'OFF';
    vcu.gearRefusal = null;
    shuttingDown = true;
    shutdownAtS = t;
    contactorRequest = 'open';
  }

  function sleep(t: number) {
    awake = false;
    shuttingDown = false;
    vcu.kl15 = false;
    contactorRequest = 'open';
    boot.update(false, t);
    bus.setSenderActive('VCU', false);
  }

  function runStartup(t: number) {
    const i = current;
    switch (i) {
      case WAKE:
        if (allBooted()) finishStep(WAKE, t);
        break;
      case SELF_CHECK:
        if (anySelfCheckFailed()) return fail(SELF_CHECK, 'selfCheckFailed', t);
        if (faultStatus('low12V') === 'active' || (isFresh(inbox, 'BMS_DTC', wakeAtS) && ((inbox.read('BMS_DTC', 'activeBits') as number) & 2) !== 0)) return fail(SELF_CHECK, 'faultActive', t);
        qualifyBms();
        if (bmsValidFrames >= BMS_QUALIFY_FRAMES && isFresh(inbox, 'BMS_Limits', wakeAtS) && isFresh(inbox, 'BMS_DTC', wakeAtS) && isFresh(inbox, 'MCU_DTC', wakeAtS) && mcuStandby(t)) {
          finishStep(SELF_CHECK, t);
          vcu.powerState = 'STARTING';
          contactorRequest = 'precharge';
          hvRequested = true;
        }
        break;
      case PRECHARGE:
        if (isFresh(inbox, 'BMS_Status', stepStartedS[PRECHARGE]!)) {
          const state = inbox.read('BMS_Status', 'prechargeState');
          if (state === 'failed') return fail(PRECHARGE, 'prechargeFailed', t);
          if (state === 'done') {
            finishStep(PRECHARGE, t);
            contactorRequest = 'close';
          }
        }
        break;
      case CONTACTORS:
        if (isFresh(inbox, 'BMS_Status', stepStartedS[CONTACTORS]!) && inbox.read('BMS_Status', 'contactorState') === 'closed') {
          finishStep(CONTACTORS, t);
        }
        break;
      case READY: {
        const packV = inbox.read('BMS_Status', 'packVoltage') as number;
        const dcLinkV = inbox.read('MCU_Status', 'dcLinkVoltage') as number;
        if (mcuStandby(t) && dcLinkV >= READY_DC_LINK_RATIO * packV) {
          finishStep(READY, t);
          vcu.powerState = 'READY';
        }
        break;
      }
    }
    if (current === i && t - stepStartedS[i]! >= STEP_TIMEOUT_S[i]! - TIME_EPS_S) fail(i, TIMEOUT_REASON[i]!, t);
  }

  function allBooted(): boolean {
    for (const m of REMOTE_BOOTS) if (!isFresh(inbox, m, wakeAtS)) return false;
    return true;
  }

  function anySelfCheckFailed(): boolean {
    for (const m of REMOTE_BOOTS) if (inbox.read(m, 'selfCheck') === 'fail') return true;
    return false;
  }

  /** Count consecutive new BMS_Status frames that show a plausible, disconnected pack. */
  function qualifyBms() {
    const frameS = inbox.frameTimeS('BMS_Status');
    if (frameS === undefined || frameS < wakeAtS - TIME_EPS_S || frameS === lastBmsFrameS) return;
    lastBmsFrameS = frameS;
    const packV = inbox.read('BMS_Status', 'packVoltage') as number;
    const valid =
      inbox.read('BMS_Status', 'contactorState') === 'open' &&
      inbox.read('BMS_Status', 'prechargeState') !== 'failed' &&
      packV >= packVMin &&
      packV <= packVMax;
    bmsValidFrames = valid ? bmsValidFrames + 1 : 0;
  }

  function mcuStandby(t: number): boolean {
    return (
      isFresh(inbox, 'MCU_Status', Math.max(wakeAtS, t - LIVE_S)) && inbox.read('MCU_Status', 'inverterState') === 'standby'
    );
  }

  /** Latest vehicle speed from MCU_Vehicle sent since `sinceS`, km/h (forward positive), or NaN. */
  function vehicleSpeedKmh(sinceS: number): number {
    return isFresh(inbox, 'MCU_Vehicle', sinceS) ? (inbox.read('MCU_Vehicle', 'vehicleSpeedKmh') as number) : Number.NaN;
  }

  /** Apply the gear interlocks (R4, ADR 0006) to a request. Re-selecting the engaged gear is a no-op. */
  function requestGear(t: number, target: Gear, brake: number, cableConnected: boolean) {
    if (cableConnected && target !== 'P') {
      vcu.gearRefusal = 'cableConnected';
      return;
    }
    if (target === vcu.gear) {
      vcu.gearRefusal = null;
      return;
    }
    vcu.gearRefusal = gearRefusal(t, target, brake);
    if (vcu.gearRefusal === null) selectGear(target);
  }

  function selectGear(gear: Gear) {
    vcu.gear = gear;
    if (gear !== 'N') lastEngaged = gear;
  }

  function gearRefusal(t: number, target: Gear, brake: number): GearRefusal | null {
    if (!boot.running || vcu.powerState === 'OFF') return 'notReady';
    if (target === 'N') return null;
    if (vcu.powerState !== 'READY') return 'notReady';

    const speedKmh = vehicleSpeedKmh(Math.max(wakeAtS, t - LIVE_S));
    const stopped = Math.abs(speedKmh) < STANDSTILL_KMH;
    if (target === 'P') return stopped ? null : 'speedTooHigh';

    const direction = target === 'D' ? 1 : -1;
    const opposite: Gear = target === 'D' ? 'R' : 'D';
    const changesDirection = lastEngaged === opposite || speedKmh * direction <= -STANDSTILL_KMH;
    if (lastEngaged !== 'P' && !changesDirection) return null;
    if (!stopped) return 'speedTooHigh';
    return brake > SHIFT_BRAKE_MIN ? null : 'brakeRequired';
  }

  /**
   * Pedal map, Normal mode (R4): pedal × the torque available at the current motor
   * speed, clamped by the BMS discharge limit, faded out by the speed limiter.
   * Positive drives forward. Zero unless READY in D or R.
   */
  function torqueRequestNm(t: number, accelerator: number, brake: number): number {
    let torqueNm = 0;
    for (const mode of DRIVE_MODES) {
      if (modeWeight[mode] > 0) torqueNm += modeWeight[mode] === 1 ? modeTorqueNm(t, accelerator, brake, MODE_MAPS[mode]) : modeWeight[mode] * modeTorqueNm(t, accelerator, brake, MODE_MAPS[mode]);
    }
    return torqueNm;
  }

  /** ADR 0013: move the map weights toward the selected mode by one tick of the ramp. */
  function updateModeWeights(driveMode: DriveMode) {
    const delta = tickS / MODE_RAMP_S;
    let others = 0;
    for (const mode of DRIVE_MODES) {
      if (mode === driveMode) continue;
      modeWeight[mode] = Math.max(0, modeWeight[mode] - delta);
      others += modeWeight[mode];
    }
    modeWeight[driveMode] = others === 0 ? 1 : 1 - others;
  }

  function modeTorqueNm(t: number, accelerator: number, brake: number, map: ModeMap): number {
    if (vcu.powerState !== 'READY' || (vcu.gear !== 'D' && vcu.gear !== 'R')) return 0;
    const decision = driveDecision(t);
    if (decision.powerCapKw === 0) return 0;
    if (brake > 0) return liftOffTorqueNm(t, map.liftOffG, brake);
    if (accelerator <= 0) return liftOffTorqueNm(t, map.liftOffG);
    const maxDischargeKw = inbox.read('BMS_Limits', 'maxDischargeKw');
    if (!isFresh(inbox, 'MCU_Status', t - LIVE_S) || maxDischargeKw === undefined) return 0;

    const motorRadS = rpmToRads(inbox.read('MCU_Status', 'motorSpeedRpm') as number);
    const w = Math.abs(motorRadS);
    let availableNm = motorMaxTorqueNm(p, motorRadS);
    if (w > 0) availableNm = Math.min(availableNm, Math.min(maxDischargeKw as number * 1000, decision.powerCapKw * 1000, map.powerCapW) / w);
    // The reported speed is a frame old and the plant loads the pack at the tick's mean
    // speed, so the cap is solved at the speed expected over the coming tick.
    const wAhead = w + CAP_LOOKAHEAD_TICKS * Math.max(0, w - lastCapW);
    lastCapW = w;
    if (Number.isFinite(map.batteryCapW)) availableNm = Math.min(availableNm, Math.floor(batteryCappedTorqueNm(map.batteryCapW, wAhead) / TORQUE_REQUEST_STEP_NM) * TORQUE_REQUEST_STEP_NM);

    const direction = vcu.gear === 'D' ? 1 : -1;
    const limitKmh = vcu.gear === 'D' ? decision.speedCapKmh : Math.min(REVERSE_SPEED_LIMIT_KMH, decision.speedCapKmh);
    const speedKmh = motorRadS * kmhPerRadS * direction;
    const limiter = Math.min(Math.max((limitKmh - speedKmh) / LIMITER_BAND_KMH, 0), 1);
    if (limiter === 0) return 0;
    const pedal = map.pedalExponent === 1 ? accelerator : accelerator ** map.pedalExponent;
    return direction * pedal * availableNm * limiter;
  }

  /**
   * ADR 0013: largest torque whose shaft power plus motor/inverter loss and aux load
   * keeps battery discharge within the cap, solving c·T² + ω·T + rest = cap for T.
   */
  let lastCapW = 0;
  function batteryCappedTorqueNm(capW: number, w: number): number {
    const c = p.motorLossCopperWPerNm2;
    const rest = motorLossW(p, 0, w) + p.auxLoadW - capW;
    if (rest >= 0) return 0;
    return c > 0 ? (-w + Math.sqrt(w * w - 4 * c * rest)) / (2 * c) : -rest / w;
  }

  /** ADR 0009: generator torque opposes travel only with fresh charge and inverter status. */
  function liftOffTorqueNm(t: number, liftOffG: number, brake = 0): number {
    if (driveDecision(t).regenDisabled) return 0;
    const freshSince = Math.max(wakeAtS, t - LIVE_S);
    if (!isFresh(inbox, 'MCU_Status', freshSince) || !isFresh(inbox, 'MCU_Vehicle', freshSince)) return 0;
    if (!isFresh(inbox, 'BMS_Limits', Math.max(wakeAtS, t - BMS_LIVE_S))) return 0;
    if (!isFresh(inbox, 'BMS_Status', Math.max(wakeAtS, t - BMS_LIVE_S))) return 0;
    if (inbox.read('MCU_Status', 'inverterState') !== 'run' || inbox.read('BMS_Status', 'contactorState') !== 'closed') return 0;
    const chargeW = (inbox.read('BMS_Limits', 'maxChargeKw') as number) * 1000;
    if (chargeW <= 0) return 0;
    const direction = vcu.gear === 'D' ? 1 : -1;
    const speedMs = kmhToMs(inbox.read('MCU_Vehicle', 'vehicleSpeedKmh') as number) * direction;
    if (speedMs <= REGEN_START_MS) return 0;
    const omega = rpmToRads(inbox.read('MCU_Status', 'motorSpeedRpm') as number);
    if (omega * direction <= 0) return 0;
    const liftFade = Math.min((speedMs - REGEN_START_MS) / (REGEN_FULL_MS - REGEN_START_MS), 1);
    const brakeFade = Math.min((speedMs - REGEN_START_MS) / (BRAKE_REGEN_FULL_MS - REGEN_START_MS), 1);
    const liftForceN = liftOffG * GRAVITY_MS2 * p.testMassKg * liftFade;
    const pedalForceN = brake * Math.min(1, p.tyreRoadFriction) * GRAVITY_MS2 * p.testMassKg;
    const forceN = brake > 0
      ? Math.min(Math.max(liftForceN, pedalForceN), BRAKE_REGEN_DECEL_G * GRAVITY_MS2 * p.testMassKg * brakeFade)
      : liftForceN;
    const forceBoundN = Math.min(forceN, p.tyreRoadFriction * p.testMassKg * GRAVITY_MS2);
    const torqueNm = Math.min(
      forceBoundN * p.wheelRadiusM * p.gearEfficiency / p.reductionRatio,
      motorMaxTorqueNm(p, omega),
      chargeW / Math.abs(omega),
    );
    return -direction * torqueNm;
  }

  /** ADR 0010: VCU permission is based only on bus reports, plus local controls. */
  function updateCharge(t: number, driver: Readonly<DriverInputs>) {
    const requested = driver.chargeRequested && driver.cableConnected && driver.chargeSource !== null;
    const freshSince = Math.max(wakeAtS, t - LIVE_S);
    const speedKmh = vehicleSpeedKmh(freshSince);
    const eligible = requested && vcu.gear === 'P' && Math.abs(speedKmh) < STANDSTILL_KMH &&
      driver.chargeTargetSoc > 0 && driver.chargeTargetSoc <= 1 &&
      isFresh(inbox, 'BMS_Status', freshSince) &&
      inbox.read('BMS_Status', 'contactorState') === 'closed';
    const accepted = isFresh(inbox, 'BMS_Charge', freshSince) &&
      inbox.read('BMS_Charge', 'accepted') === 'yes' &&
      (inbox.read('BMS_Charge', 'maxExternalChargeKw') as number) > 0;
    vcu.chargeAuthorized = eligible && accepted && !shuttingDown && faultStatus('low12V') !== 'active' && driveDecision(t).reason !== 'insulationFault' && (vcu.powerState === 'READY' || vcu.powerState === 'CHARGING' || vcu.powerState === 'ACCESSORY');
    if (vcu.chargeAuthorized) vcu.powerState = 'CHARGING';
    else if (vcu.powerState === 'CHARGING' && !requested) vcu.powerState = 'ACCESSORY';
    chargeFrame
      .set('requested', requested ? 'yes' : 'no')
      .set('authorized', vcu.chargeAuthorized ? 'yes' : 'no')
      .set('faultBlock', faultStatus('low12V') === 'active' || driveDecision(t).reason === 'insulationFault' ? 'yes' : 'no')
      .set('source', driver.chargeSource ?? 'none')
      .set('targetSoc', driver.chargeTargetSoc * 100)
      .set('connected', driver.cableConnected ? 'yes' : 'no')
      .set('session', driver.chargeSession);
  }

  /** Add this tick's pack energy (V × I from BMS_Status) and distance (MCU_Vehicle) to the trip. */
  function accumulateTrip(t: number, cableConnected: boolean) {
    if (!cableConnected && isFresh(inbox, 'BMS_Status', Math.max(wakeAtS, t - BMS_LIVE_S))) {
      const powerW = (inbox.read('BMS_Status', 'packVoltage') as number) * (inbox.read('BMS_Status', 'packCurrent') as number);
      tripEnergyJ += powerW * tickS;
      if (powerW < 0 && vcu.gear !== 'P') recoveredJ -= powerW * tickS;
    }
    const speedKmh = vehicleSpeedKmh(Math.max(wakeAtS, t - LIVE_S));
    if (!Number.isNaN(speedKmh)) tripDistanceM += kmhToMs(Math.abs(speedKmh)) * tickS;
  }

  /**
   * Consumption behind the range estimate, J/m (R4, ADR 0008): WLTP for the first
   * 5 km of the trip, then a linear blend to the trip average over the next 20 km.
   */
  function consumptionJPerM(): number {
    const wltp = p.wltpConsumptionJPerM;
    const weight = Math.min(Math.max((tripDistanceM - TRIP_BLEND_START_M) / TRIP_BLEND_SPAN_M, 0), 1);
    const blended = weight === 0 ? wltp : wltp + weight * (tripEnergyJ / tripDistanceM - wltp);
    return Math.max(blended, MIN_CONSUMPTION_RATIO * wltp);
  }

  function publish(t: number, accelerator: number, brake: number, cableConnected: boolean, driveMode: DriveMode) {
    accumulateTrip(t, cableConnected);
    updateModeWeights(driveMode);
    command
      .set('torqueRequest', torqueRequestNm(t, accelerator, brake))
      .set('contactorRequest', contactorRequest)
      .set('powerState', vcu.powerState);
    status
      .set('powerState', vcu.powerState)
      .set('gear', vcu.gear)
      .set('ready', vcu.powerState === 'READY' ? 'yes' : 'no')
      .set('speedLimitKmh', vcu.gear === 'R' ? Math.min(REVERSE_SPEED_LIMIT_KMH, driveDecision(t).speedCapKmh) : driveDecision(t).speedCapKmh)
      .set('startupStep', current >= 0 ? STARTUP_STEPS[current]! : 'none');
    const decision = driveDecision(t);
    decisionFrame.set('reason', decision.reason).set('powerCapKw', decision.powerCapKw).set('speedCapKmh', decision.speedCapKmh);
    modeFrame.set('driveMode', driveMode);

    // Remaining usable energy from the SOC the BMS reports, over the consumption.
    // Until a BMS_Status has arrived since waking there is no SOC, so the range is flagged invalid.
    const socValid = isFresh(inbox, 'BMS_Status', wakeAtS);
    const socPct = socValid ? (inbox.read('BMS_Status', 'soc') as number) : 0;
    const consumption = consumptionJPerM();
    rangeFrame
      .set('rangeKm', (Math.max(socPct, 0) / 100) * p.usableEnergyJ / consumption / 1000)
      .set('avgConsumptionWhKm', jPerMToWhPerKm(consumption))
      .set('rangeValid', socValid ? 'yes' : 'no');
    recoveryFrame.set('recoveredJ', recoveredJ);
  }

  return vcu;
}
