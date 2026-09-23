/**
 * BMS (requirements R4): executes the VCU's contactor requests with the pre-charge
 * sequence, and reports what it measures on the pack. It learns the DC-link
 * voltage only from MCU_Status. Timings are in ADR 0005.
 */

import type { HvCircuit } from '../battery';
import type { Bus } from '../bus';
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
  soc: number;
}

export interface Bms {
  step(t: number, powered: boolean, sensors: BmsSensors): void;
}

export function createBms(bus: Bus, p: Readonly<VehicleParams>): Bms {
  const boot = createBootTracker(BOOT_S);
  const bootFrame = bus.writer('BMS', 'BMS_Boot');
  const status = bus.writer('BMS', 'BMS_Status');
  const limits = bus.writer('BMS', 'BMS_Limits');
  const inbox = bus.subscribe('BMS', ['VCU_Command', 'MCU_Status']);
  bus.setSenderActive('BMS', false);

  // Peak electrical demand of the drive: peak power plus the losses at peak torque and base speed.
  const baseSpeed = motorBaseSpeedRadS(p);
  const maxDischargeKw = (p.motorPeakPowerW + motorLossW(p, p.motorPeakTorqueNm, baseSpeed)) / 1000;

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

  return {
    step(t, powered, { hv, soc }) {
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

      run(t, hv);

      status
        .set('packVoltage', hv.packTerminalV)
        .set('packCurrent', hv.packCurrentA)
        .set('soc', soc * 100)
        .set('contactorState', contactorState(hv))
        .set('prechargeState', prechargeState);
      limits.set('maxDischargeKw', maxDischargeKw).set('maxChargeKw', 0);
    },
  };
}
