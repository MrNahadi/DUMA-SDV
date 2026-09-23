/**
 * VCU (requirements R4): the supervisor. It senses the power button directly, owns
 * the switched 12 V supply (KL15) of the other ECUs, and runs the power state
 * machine and the startup sequence. It learns everything about the other ECUs from
 * the bus. Timings are in ADR 0005.
 */

import { POWER_STATES, type Bus } from '../bus';
import type { VehicleParams } from '../vehicle';
import { msToKmh } from '../units';
import { INITIAL_SW_VERSION, TIME_EPS_S, createBootTracker, isFresh } from './ecu';

export type PowerState = (typeof POWER_STATES)[number];

export const STARTUP_STEPS = ['wake', 'selfCheck', 'precharge', 'contactors', 'ready'] as const;
export type StartupStepId = (typeof STARTUP_STEPS)[number];
export type StartupStepStatus = 'pending' | 'active' | 'done' | 'failed';
export type StartupFailReason =
  | 'wakeTimeout'
  | 'selfCheckFailed'
  | 'selfCheckTimeout'
  | 'prechargeFailed'
  | 'prechargeTimeout'
  | 'contactorTimeout'
  | 'readyTimeout';

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

export interface Vcu {
  readonly powerState: PowerState;
  /** True while the VCU holds the other ECUs' switched 12 V supply on. */
  readonly kl15: boolean;
  readonly stepStatus: readonly StartupStepStatus[];
  /** Sim time each step started / finished, NaN if it has not. */
  readonly stepStartedS: readonly number[];
  readonly stepDoneS: readonly number[];
  readonly failReason: StartupFailReason | null;
  step(t: number, powerButtonPressed: boolean): void;
}

export function createVcu(bus: Bus, p: Readonly<VehicleParams>): Vcu {
  const boot = createBootTracker(VCU_WAKE_S);
  const bootFrame = bus.writer('VCU', 'VCU_Boot');
  const command = bus.writer('VCU', 'VCU_Command');
  const status = bus.writer('VCU', 'VCU_Status');
  const inbox = bus.subscribe('VCU', [...REMOTE_BOOTS, 'BMS_Status', 'BMS_Limits', 'MCU_Status']);
  bus.setSenderActive('VCU', false);

  const packVMin = p.seriesCells * 2.5;
  const packVMax = p.seriesCells * 3.65;
  const speedLimitKmh = msToKmh(p.topSpeedMs);

  const stepStatus: StartupStepStatus[] = STARTUP_STEPS.map(() => 'pending');
  const stepStartedS: number[] = STARTUP_STEPS.map(() => Number.NaN);
  const stepDoneS: number[] = STARTUP_STEPS.map(() => Number.NaN);

  let awake = false;
  let pendingPress = false;
  let wakeAtS = 0;
  let current = -1;
  let shuttingDown = false;
  let shutdownAtS = 0;
  let hvRequested = false;
  let contactorRequest: 'open' | 'precharge' | 'close' = 'open';
  let lastBmsFrameS = Number.NaN;
  let bmsValidFrames = 0;

  const vcu = {
    powerState: 'OFF' as PowerState,
    kl15: false,
    stepStatus,
    stepStartedS,
    stepDoneS,
    failReason: null as StartupFailReason | null,
    step(t: number, buttonPressed: boolean) {
      const pressed = buttonPressed || pendingPress;
      pendingPress = false;
      if (!awake) {
        if (!pressed) return;
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
      if (!boot.running) return;

      if (shuttingDown) {
        const bmsOpen = isFresh(inbox, 'BMS_Status', shutdownAtS) && inbox.read('BMS_Status', 'contactorState') === 'open';
        if (!hvRequested || bmsOpen || t - shutdownAtS >= SHUTDOWN_TIMEOUT_S - TIME_EPS_S) {
          sleep(t);
          return;
        }
      } else if (current >= 0) {
        runStartup(t);
      }
      publish();
    },
  };

  function wake(t: number) {
    awake = true;
    wakeAtS = t;
    vcu.kl15 = true;
    vcu.powerState = 'ACCESSORY';
    vcu.failReason = null;
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
    vcu.powerState = 'OFF';
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
        qualifyBms();
        if (bmsValidFrames >= BMS_QUALIFY_FRAMES && isFresh(inbox, 'BMS_Limits', wakeAtS) && mcuStandby(t)) {
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

  function publish() {
    command.set('torqueRequest', 0).set('contactorRequest', contactorRequest).set('powerState', vcu.powerState);
    status
      .set('powerState', vcu.powerState)
      .set('gear', 'P')
      .set('ready', vcu.powerState === 'READY' ? 'yes' : 'no')
      .set('speedLimitKmh', speedLimitKmh);
  }

  return vcu;
}
