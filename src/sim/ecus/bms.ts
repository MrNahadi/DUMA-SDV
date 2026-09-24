/**
 * BMS (requirements R4): executes the VCU's contactor requests with the pre-charge
 * sequence, coulomb-counts SOC from the current it measures, and reports what it
 * measures on the pack. It learns the DC-link voltage only from MCU_Status.
 * Timings are in ADR 0005, SOC counting in ADR 0008.
 */

import { usableChargeC, type HvCircuit } from '../battery';
import type { Bus } from '../bus';
import type { FaultKey } from '../faults';
import type { VehicleParams } from '../vehicle';
import { motorBaseSpeedRadS, motorLossW } from '../vehicle';
import { INITIAL_SW_VERSION, TIME_EPS_S, createBootTracker, isFresh } from './ecu';

/** Boot and power-on self test on the 12 V switched supply. */
const BOOT_S = 0.25;
/** Wait after each contactor switch for the auxiliary contacts to confirm it. */
const CONTACTOR_VERIFY_S = 0.1;
/** main+ may close once the DC-link is at this fraction of pack voltage (R4). */
export const PRECHARGE_DONE_RATIO = 0.95;
/** With no VCU_Command for this long, the BMS opens the contactors. */
const COMMAND_TIMEOUT_S = 0.1;

type Phase = 'open' | 'closingNeg' | 'precharging' | 'prechargeDone' | 'closingPos' | 'openingPrecharge' | 'closed' | 'opening';
type PrechargeState = 'idle' | 'active' | 'done' | 'failed';

export interface BmsSensors {
  hv: HvCircuit;
  /** Pack temperature sensor, °C. */
  packTempC: number;
}

export interface BmsOptions {
  /** Sim tick, s: the coulomb counter's integration step. */
  tickS: number;
  /** SOC the counter holds in non-volatile memory at creation, 0..1. */
  initialSoc: number;
  /** Locally sensed diagnostic condition supplied by the BMS fault recorder. */
  faultStatus: (key: FaultKey) => 'active' | 'stored' | null;
}

export interface Bms {
  /** The BMS's SOC estimate, 0..1. It survives power cycles (non-volatile memory). */
  readonly soc: number;
  step(t: number, powered: boolean, sensors: BmsSensors): void;
}

export function createBms(bus: Bus, p: Readonly<VehicleParams>, options: BmsOptions): Bms {
  const boot = createBootTracker(BOOT_S);
  const bootFrame = bus.writer('BMS', 'BMS_Boot');
  const status = bus.writer('BMS', 'BMS_Status');
  const thermal = bus.writer('BMS', 'BMS_Thermal');
  const limits = bus.writer('BMS', 'BMS_Limits');
  const chargeFrame = bus.writer('BMS', 'BMS_Charge');
  const inbox = bus.subscribe('BMS', ['VCU_Command', 'VCU_Charge', 'MCU_Status']);
  bus.setSenderActive('BMS', false);

  // Peak electrical demand of the drive: peak power plus the losses at peak torque and base speed.
  const baseSpeed = motorBaseSpeedRadS(p);
  const maxDischargeKw = (p.motorPeakPowerW + motorLossW(p, p.motorPeakTorqueNm, baseSpeed)) / 1000;
  // ADR 0009: estimated 60 kW regen acceptance below 90% SOC, tapering to full.
  const maxChargeKw = () => phase === 'closed'
    ? 60 * Math.min(1, Math.max(0, (1 - bms.soc) / 0.1))
    : 0;

  const socPerAmpTick = options.tickS / usableChargeC(p);

  let phase: Phase = 'open';
  let phaseStartS = 0;
  let prechargeState: PrechargeState = 'idle';

  function enter(next: Phase, t: number) {
    phase = next;
    phaseStartS = t;
  }

  function settled(t: number): boolean {
    return t - phaseStartS >= CONTACTOR_VERIFY_S - TIME_EPS_S;
  }

  function contactorRequest(t: number): string {
    if (options.faultStatus('insulationFault') === 'active') return 'open';
    const commandT = inbox.frameTimeS('VCU_Command');
    if (commandT === undefined || commandT < boot.bootedAtS - TIME_EPS_S || t - commandT > COMMAND_TIMEOUT_S + TIME_EPS_S) {
      return 'open';
    }
    return inbox.read('VCU_Command', 'contactorRequest') as string;
  }

  function dcLinkReached(hv: HvCircuit, t: number): boolean {
    if (!isFresh(inbox, 'MCU_Status', t - COMMAND_TIMEOUT_S)) return false;
    const dcLink = inbox.read('MCU_Status', 'dcLinkVoltage') as number;
    return dcLink >= PRECHARGE_DONE_RATIO * hv.packTerminalV;
  }

  function run(t: number, hv: HvCircuit) {
    const { coil, closed } = hv;
    const request = contactorRequest(t);

    if (request === 'open' && phase !== 'open' && phase !== 'opening') {
      coil.mainPos = false;
      coil.precharge = false;
      enter('opening', t);
    }

    switch (phase) {
      case 'open':
        if (request === 'precharge') {
          coil.mainNeg = true;
          enter('closingNeg', t);
        }
        break;
      case 'closingNeg':
        if (closed.mainNeg && settled(t)) {
          coil.precharge = true;
          prechargeState = 'active';
          enter('precharging', t);
        }
        break;
      case 'precharging':
        if (closed.precharge && dcLinkReached(hv, t)) {
          prechargeState = 'done';
          enter('prechargeDone', t);
        }
        break;
      case 'prechargeDone':
        if (request === 'close' && dcLinkReached(hv, t)) {
          coil.mainPos = true;
          enter('closingPos', t);
        }
        break;
      case 'closingPos':
        if (closed.mainPos && settled(t)) {
          coil.precharge = false;
          enter('openingPrecharge', t);
        }
        break;
      case 'openingPrecharge':
        if (!closed.precharge && settled(t)) enter('closed', t);
        break;
      case 'closed':
        break;
      case 'opening':
        if (!closed.mainPos && !closed.precharge) coil.mainNeg = false;
        if (!closed.mainNeg && !closed.mainPos && !closed.precharge) {
          prechargeState = 'idle';
          enter('open', t);
        }
        break;
    }
  }

  /**
   * What the aux contacts say, in the sequence's terms: `open` only when every
   * contact is open, `closed` once main+ carries the link (sequence complete or
   * opening), and `precharge` for every state in between.
   */
  function contactorState({ closed }: HvCircuit): 'open' | 'precharge' | 'closed' {
    if (!closed.mainNeg && !closed.precharge && !closed.mainPos) return 'open';
    if (phase === 'closed' || (phase === 'opening' && closed.mainPos)) return 'closed';
    return 'precharge';
  }

  const bms = {
    soc: options.initialSoc,
    step(t: number, powered: boolean, { hv, packTempC }: BmsSensors) {
      const edge = boot.update(powered, t);
      if (edge === 'lost') {
        // Supply lost: the coils drop out and the ECU forgets its sequence.
        hv.coil.mainNeg = false;
        hv.coil.precharge = false;
        hv.coil.mainPos = false;
        phase = 'open';
        prechargeState = 'idle';
        bus.setSenderActive('BMS', false);
      }
      if (!boot.running) return;
      if (edge === 'booted') {
        bus.setSenderActive('BMS', true);
        bootFrame.set('selfCheck', 'pass').set('swVersion', INITIAL_SW_VERSION).raise();
      }

      // The pack only carries current while the BMS is running: it opens the contactors before it sleeps.
      bms.soc -= hv.packCurrentA * socPerAmpTick;
      run(t, hv);

      status
        .set('packVoltage', hv.packTerminalV)
        .set('packCurrent', hv.packCurrentA)
        .set('soc', bms.soc * 100)
        .set('contactorState', contactorState(hv))
        .set('prechargeState', prechargeState);
      thermal.set('packTemperature', packTempC);
      const cellOverTemperature = options.faultStatus('cellOverTemperature') === 'active';
      const insulationFault = options.faultStatus('insulationFault') === 'active';
      limits
        .set('maxDischargeKw', insulationFault ? 0 : cellOverTemperature ? maxDischargeKw * 0.5 : maxDischargeKw)
        .set('maxChargeKw', cellOverTemperature || insulationFault ? 0 : maxChargeKw());
      const chargeRequested = isFresh(inbox, 'VCU_Charge', Math.max(boot.bootedAtS, t - COMMAND_TIMEOUT_S)) &&
        inbox.read('VCU_Charge', 'requested') === 'yes';
      const targetPct = inbox.read('VCU_Charge', 'targetSoc') as number | undefined;
      const accepted = chargeRequested && phase === 'closed' && !cellOverTemperature && !insulationFault &&
        bms.soc < 1 && targetPct !== undefined && bms.soc * 100 < targetPct &&
        hv.packTerminalV > 0 && hv.packTerminalV < 620;
      // ADR 0010: separate external allowance; BMS_Limits.maxChargeKw remains regen-only.
      chargeFrame
        .set('accepted', accepted ? 'yes' : 'no')
        .set('faultBlock', cellOverTemperature || insulationFault ? 'yes' : 'no')
        .set('maxExternalChargeKw', accepted ? Math.min(150, 300 * hv.packTerminalV / 1000) : 0);
    },
  };
  return bms;
}
