/**
 * HV circuit plant (requirements R2): main−, pre-charge and main+ contactors
 * between the pack and the inverter's DC-link capacitor. The BMS drives the coils;
 * the contacts follow after the actuation time. Physics only, no decisions.
 */

import type { VehicleParams } from '../vehicle';

export type ContactorId = 'mainNeg' | 'precharge' | 'mainPos';
export type ContactorStates = Record<ContactorId, boolean>;

const CONTACTORS: readonly ContactorId[] = ['mainNeg', 'precharge', 'mainPos'];

/** main+ closing with the DC-link below this fraction of pack voltage is a welding event (R2). */
export const WELDING_THRESHOLD = 0.9;

export interface HvCircuit {
  /** Coil drive, written by the BMS. `true` energises the coil (closes the contactor). */
  readonly coil: ContactorStates;
  /** Actual contact positions. */
  readonly closed: ContactorStates;
  /** DC-link capacitor voltage, V. */
  readonly dcLinkV: number;
  /** Pack current, A, positive for discharge. */
  readonly packCurrentA: number;
  /** Pack terminal voltage, V (OCV − I·R). */
  readonly packTerminalV: number;
  /** Times main+ closed onto an under-charged DC-link. */
  readonly weldingEvents: number;
  /**
   * Advance by one tick with the pack at open-circuit voltage `ocvV`. `loadW` is the
   * power the loads on the HV bus (inverter, DC-DC) draw at the terminals, positive
   * for discharge; it flows only while the main path is closed.
   */
  step(ocvV: number, loadW?: number, maxChargeCurrentA?: number): void;
}

/**
 * Pack current, A, that delivers `powerW` at the terminals: P = (OCV − I·R)·I,
 * the smaller root. Above the maximum power point (OCV²/4R) it gives that point.
 */
export function packCurrentForPowerA(ocvV: number, resistanceOhm: number, powerW: number): number {
  if (resistanceOhm === 0) return powerW / ocvV;
  const discriminant = Math.max(0, ocvV * ocvV - 4 * resistanceOhm * powerW);
  return (ocvV - Math.sqrt(discriminant)) / (2 * resistanceOhm);
}

export function createHvCircuit(p: Readonly<VehicleParams>, tickS: number, ocvV: number): HvCircuit {
  const prechargeOhm = p.prechargeResistanceOhm + p.packInternalResistanceOhm;
  const prechargeDecay = Math.exp(-tickS / (prechargeOhm * p.dcLinkCapacitanceF));
  const dischargeDecay = Math.exp(-tickS / p.dcLinkDischargeTauS);
  const coil: ContactorStates = { mainNeg: false, precharge: false, mainPos: false };
  const closed: ContactorStates = { mainNeg: false, precharge: false, mainPos: false };
  const timer: Record<ContactorId, number> = { mainNeg: 0, precharge: 0, mainPos: 0 };

  const hv = {
    coil,
    closed,
    dcLinkV: 0,
    packCurrentA: 0,
    packTerminalV: ocvV,
    weldingEvents: 0,
    step(ocv: number, loadW = 0, maxChargeCurrentA = Infinity) {
      for (const id of CONTACTORS) {
        if (coil[id] === closed[id]) {
          timer[id] = 0;
          continue;
        }
        timer[id] += tickS;
        if (timer[id] < p.contactorActuationS - 1e-9) continue;
        timer[id] = 0;
        closed[id] = coil[id];
        // Closing the main path onto an uncharged capacitor draws an inrush that welds the contacts.
        const completesMainPath = closed[id] && closed.mainNeg && closed.mainPos && (id === 'mainPos' || id === 'mainNeg');
        if (completesMainPath && hv.dcLinkV < WELDING_THRESHOLD * ocv) hv.weldingEvents++;
      }

      if (closed.mainNeg && closed.mainPos) {
        // The link sits at the terminal voltage; contactor and cable resistance are neglected.
        hv.packCurrentA = maxChargeCurrentA === 0 && loadW < 0
          ? 0
          : Math.max(-maxChargeCurrentA, packCurrentForPowerA(ocv, p.packInternalResistanceOhm, loadW));
        hv.packTerminalV = ocv - hv.packCurrentA * p.packInternalResistanceOhm;
        hv.dcLinkV = hv.packTerminalV;
      } else if (closed.mainNeg && closed.precharge) {
        // RC charge through the pre-charge resistor and the pack's internal resistance.
        const next = ocv + (hv.dcLinkV - ocv) * prechargeDecay;
        hv.packCurrentA = (ocv - (hv.dcLinkV + next) / 2) / prechargeOhm;
        hv.packTerminalV = ocv - hv.packCurrentA * p.packInternalResistanceOhm;
        hv.dcLinkV = next;
      } else {
        hv.packCurrentA = 0;
        hv.packTerminalV = ocv;
        hv.dcLinkV *= dischargeDecay;
      }
    },
  };
  return hv;
}
