/**
 * The vehicle's message catalogue (requirements R3). Every CAN message is declared
 * here once; the trace, the architecture view and the paper all read this list.
 * Signal units are the units on the wire (km/h, kW, %, rpm); ECUs convert to SI
 * with `src/sim/units.ts`.
 */

import type { Catalogue, MessageDef } from './bus';

/** ECUs on the bus in this feature. Later features add OBC, DC-DC, TMS and the gateway. */
export type EcuId = 'VCU' | 'BMS' | 'MCU' | 'IC';

export const POWER_STATES = ['OFF', 'ACCESSORY', 'STARTING', 'READY', 'CHARGING', 'FAULT'] as const;
export const GEARS = ['P', 'R', 'N', 'D'] as const;

/** Encode a firmware version for the `swVersion` signal: major·10000 + minor·100 + patch. */
export function swVersionCode(major: number, minor: number, patch: number): number {
  return major * 10000 + minor * 100 + patch;
}

/** Format a `swVersion` signal value as `major.minor.patch`. */
export function formatSwVersion(code: number): string {
  return `${Math.floor(code / 10000)}.${Math.floor(code / 100) % 100}.${code % 100}`;
}

function bootMessage(id: number, sender: EcuId): MessageDef {
  return {
    id,
    name: `${sender}_Boot`,
    sender,
    periodMs: 'event',
    signals: [
      { name: 'selfCheck', values: ['fail', 'pass'] },
      { name: 'swVersion', unit: 'major.minor.patch (encoded)' },
    ],
  };
}

export const busCatalogue: Catalogue = Object.freeze([
  bootMessage(0x0f1, 'VCU'),
  bootMessage(0x0f2, 'BMS'),
  bootMessage(0x0f3, 'MCU'),
  bootMessage(0x0f4, 'IC'),
  {
    id: 0x100,
    name: 'VCU_Command',
    sender: 'VCU',
    periodMs: 10,
    signals: [
      { name: 'torqueRequest', unit: 'N·m', scale: 0.1 },
      { name: 'contactorRequest', values: ['open', 'precharge', 'close'] },
      { name: 'powerState', values: POWER_STATES },
    ],
  },
  {
    id: 0x101,
    name: 'VCU_Status',
    sender: 'VCU',
    periodMs: 100,
    signals: [
      { name: 'powerState', values: POWER_STATES },
      { name: 'gear', values: GEARS },
      { name: 'ready', values: ['no', 'yes'] },
      { name: 'speedLimitKmh', unit: 'km/h', scale: 1 },
    ],
  },
  {
    id: 0x102,
    name: 'VCU_Range',
    sender: 'VCU',
    periodMs: 1000,
    signals: [
      { name: 'rangeKm', unit: 'km', scale: 1 },
      { name: 'avgConsumptionWhKm', unit: 'Wh/km', scale: 0.1 },
    ],
  },
  {
    id: 0x200,
    name: 'BMS_Status',
    sender: 'BMS',
    periodMs: 100,
    signals: [
      { name: 'packVoltage', unit: 'V', scale: 0.1 },
      { name: 'packCurrent', unit: 'A', scale: 0.1 },
      { name: 'soc', unit: '%', scale: 0.1 },
      { name: 'contactorState', values: ['open', 'precharge', 'closed'] },
      { name: 'prechargeState', values: ['idle', 'active', 'done', 'failed'] },
    ],
  },
  {
    id: 0x201,
    name: 'BMS_Limits',
    sender: 'BMS',
    periodMs: 100,
    signals: [
      { name: 'maxDischargeKw', unit: 'kW', scale: 0.1 },
      { name: 'maxChargeKw', unit: 'kW', scale: 0.1 },
    ],
  },
  {
    id: 0x300,
    name: 'MCU_Status',
    sender: 'MCU',
    periodMs: 10,
    signals: [
      { name: 'motorSpeedRpm', unit: 'rpm', scale: 1 },
      { name: 'torqueActual', unit: 'N·m', scale: 0.1 },
      { name: 'dcLinkVoltage', unit: 'V', scale: 0.1 },
      { name: 'inverterState', values: ['off', 'standby', 'run', 'fault'] },
    ],
  },
  {
    id: 0x301,
    name: 'MCU_Vehicle',
    sender: 'MCU',
    periodMs: 20,
    signals: [{ name: 'vehicleSpeedKmh', unit: 'km/h', scale: 0.01 }],
  },
]);
