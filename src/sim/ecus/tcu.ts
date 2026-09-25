/**
 * TCU (ADR 0015): the telematics unit. It is the car's link to the update server
 * and runs the OTA client: check, download, verify, then, when the driver asks and
 * the car is parked, install into the VCU's inactive bank and ask the VCU to
 * reboot into it. It learns the car's state only from the bus, and keeps its OTA
 * state in non-volatile memory across power cycles.
 */

import { OTA_STATES, type Bus } from '../bus';
import { OTA_MIN_SOC, OTA_TIMING, UPDATE_PACKAGE } from '../ota';
import { INITIAL_SW_VERSION, TIME_EPS_S, createBootTracker, isFresh } from './ecu';

export type OtaState = (typeof OTA_STATES)[number];
export type OtaCommand = 'check' | 'install';
/** Why an OTA command was refused (ADR 0015). */
export type OtaRefusal = 'offline' | 'busy' | 'notDownloaded' | 'notReady' | 'notParked' | 'charging' | 'lowSoc';

/** Boot and self test on the switched 12 V supply. */
const BOOT_S = 0.2;
/** A 100 ms frame older than this counts as lost. */
const SLOW_LIVE_S = 0.25;
/** A 10 or 20 ms frame older than this counts as lost. */
const FAST_LIVE_S = 0.1;
/** Parked means below this speed, as for the gear interlocks. */
const STANDSTILL_KMH = 1;
/** With no VCU boot frame this long after asking for the reboot, the update has failed. */
const REBOOT_TIMEOUT_S = 10;

export interface Tcu {
  readonly state: OtaState;
  /** Progress of the current step, 0..1. */
  readonly progress: number;
  /** The package found by the last check, or null. */
  readonly packageVersion: number | null;
  /** Why the latest command was refused, or null if it was accepted. */
  readonly refusal: OtaRefusal | null;
  step(t: number, powered: boolean, command: OtaCommand | null): void;
}

export function createTcu(bus: Bus, tickS: number): Tcu {
  const boot = createBootTracker(BOOT_S);
  const bootFrame = bus.writer('TCU', 'TCU_Boot');
  const ota = bus.writer('TCU', 'TCU_Ota');
  const inbox = bus.subscribe('TCU', ['VCU_Boot', 'VCU_Status', 'VCU_Charge', 'MCU_Vehicle', 'BMS_Status']);
  bus.setSenderActive('TCU', false);

  const downloadS = UPDATE_PACKAGE.sizeBytes / OTA_TIMING.downloadRateBytesPerS;
  /** Sim time the reboot was asked for. */
  let rebootAtS = Number.NaN;

  const tcu = {
    state: 'idle' as OtaState,
    progress: 0,
    packageVersion: null as number | null,
    refusal: null as OtaRefusal | null,
    step(t: number, powered: boolean, command: OtaCommand | null) {
      const edge = boot.update(powered, t);
      if (edge === 'lost') {
        bus.setSenderActive('TCU', false);
        powerLost();
      }
      if (!boot.running) {
        if (command !== null) tcu.refusal = 'offline';
        return;
      }
      if (edge === 'booted') {
        bus.setSenderActive('TCU', true);
        bootFrame.set('selfCheck', 'pass').set('swVersion', INITIAL_SW_VERSION).raise();
      }
      if (command !== null) accept(t, command);
      advance(t);
      ota
        .set('state', tcu.state)
        .set('progress', tcu.progress * 100)
        .set('version', tcu.packageVersion ?? 0)
        .set('target', tcu.packageVersion === null ? 'none' : UPDATE_PACKAGE.target);
    },
  };

  function enter(state: OtaState) {
    tcu.state = state;
    tcu.progress = 0;
  }

  /** The VCU's running version from its latest boot frame, or null before one arrives. */
  function vcuVersion(): number | null {
    return inbox.frameTimeS('VCU_Boot') === undefined ? null : (inbox.read('VCU_Boot', 'swVersion') as number);
  }

  function accept(t: number, command: OtaCommand) {
    tcu.refusal = null;
    const busy = tcu.state === 'checking' || tcu.state === 'installing' || tcu.state === 'rebooting';
    if (command === 'check') {
      if (busy || tcu.state === 'downloading' || tcu.state === 'verifying' || tcu.state === 'readyToInstall') tcu.refusal = 'busy';
      else enter('checking');
      return;
    }
    if (busy) tcu.refusal = 'busy';
    else if (tcu.state !== 'readyToInstall') tcu.refusal = 'notDownloaded';
    else {
      tcu.refusal = installBlocker(t);
      if (tcu.refusal === null) enter('installing');
    }
  }

  /** The first install precondition that fails, read from received frames (ADR 0015), or null. */
  function installBlocker(t: number): OtaRefusal | null {
    // A charging car is not READY, so name the session first.
    if (isFresh(inbox, 'VCU_Charge', t - FAST_LIVE_S) && inbox.read('VCU_Charge', 'session') === 'charging') return 'charging';
    if (!isFresh(inbox, 'VCU_Status', t - SLOW_LIVE_S) || inbox.read('VCU_Status', 'powerState') !== 'READY') return 'notReady';
    if (inbox.read('VCU_Status', 'gear') !== 'P') return 'notParked';
    if (!isFresh(inbox, 'MCU_Vehicle', t - FAST_LIVE_S) || Math.abs(inbox.read('MCU_Vehicle', 'vehicleSpeedKmh') as number) >= STANDSTILL_KMH) return 'notParked';
    if (!isFresh(inbox, 'BMS_Status', t - SLOW_LIVE_S) || (inbox.read('BMS_Status', 'soc') as number) < OTA_MIN_SOC * 100) return 'lowSoc';
    return null;
  }

  /** Move the current step on by one tick. */
  function advance(t: number) {
    switch (tcu.state) {
      case 'checking':
        if (tick(OTA_TIMING.checkS)) {
          const running = vcuVersion();
          if (running !== null && running >= UPDATE_PACKAGE.version) enter('upToDate');
          else {
            tcu.packageVersion = UPDATE_PACKAGE.version;
            enter('downloading');
          }
        }
        break;
      case 'downloading':
        if (tick(downloadS)) enter('verifying');
        break;
      case 'verifying':
        if (tick(OTA_TIMING.verifyS)) {
          enter('readyToInstall');
          tcu.progress = 1;
        }
        break;
      case 'installing':
        // The car must stay parked and uncharged while the inactive bank is written.
        if (installBlocker(t) !== null) {
          enter('readyToInstall');
          tcu.progress = 1;
        } else if (tick(OTA_TIMING.installS)) {
          enter('rebooting');
          rebootAtS = t;
        }
        break;
      case 'rebooting':
        // A boot frame sent after the reboot request says what the VCU now runs.
        if ((inbox.frameTimeS('VCU_Boot') ?? -Infinity) > rebootAtS + TIME_EPS_S) {
          const installed = vcuVersion() === tcu.packageVersion;
          enter(installed ? 'installed' : 'failed');
          if (installed) tcu.progress = 1;
        } else if (t - rebootAtS > REBOOT_TIMEOUT_S) enter('failed');
        break;
      default:
        break;
    }
  }

  /** Advance the step's progress by one tick of `durationS`; true when it completes. */
  function tick(durationS: number): boolean {
    tcu.progress = Math.min(1, tcu.progress + tickS / durationS);
    return tcu.progress >= 1 - TIME_EPS_S;
  }

  /** ADR 0015: what survives a power loss in each step. */
  function powerLost() {
    if (tcu.state === 'checking') enter('idle');
    else if (tcu.state === 'verifying') tcu.progress = 0;
    else if (tcu.state === 'installing') {
      enter('readyToInstall');
      tcu.progress = 1;
    }
  }

  return tcu;
}
