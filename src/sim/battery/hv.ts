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
  /** Advance by one tick with the pack at open-circuit voltage `ocvV`. */
  step(ocvV: number): void;
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
    step(ocv: number) {
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
        // Load current arrives with the drivetrain (T-005); with no load the link sits at OCV.
        hv.packCurrentA = 0;
        hv.packTerminalV = ocv;
        hv.dcLinkV = ocv;
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
