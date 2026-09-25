/**
 * The vehicle's message catalogue (requirements R3). Every CAN message is declared
 * here once; the trace, the architecture view and the paper all read this list.
 * Signal units are the units on the wire (km/h, kW, %, rpm); ECUs convert to SI
 * with `src/sim/units.ts`.
 */

import type { Catalogue, MessageDef } from './bus';

/** ECUs that send on the bus. The OBC only listens. */
export type EcuId = 'VCU' | 'BMS' | 'MCU' | 'IC' | 'TCU';

export const POWER_STATES = ['OFF', 'ACCESSORY', 'STARTING', 'READY', 'CHARGING', 'FAULT'] as const;
export const GEARS = ['P', 'R', 'N', 'D'] as const;
export const DRIVE_MODES = ['eco', 'normal', 'sport'] as const;
/** The TCU's over-the-air update states (ADR 0015). */
export const OTA_STATES = ['idle', 'checking', 'upToDate', 'downloading', 'verifying', 'readyToInstall', 'installing', 'rebooting', 'installed', 'failed'] as const;
/** The VCU's startup steps, in order (requirements R4). */
export const STARTUP_STEPS = ['wake', 'selfCheck', 'precharge', 'contactors', 'ready'] as const;

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
  bootMessage(0x0f5, 'TCU'),
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
      // The step in progress, for the instrument cluster; `none` outside a startup.
      { name: 'startupStep', values: ['none', ...STARTUP_STEPS] },
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
      // Validity flag: 'no' until the VCU has a fresh SOC from the BMS since waking.
      { name: 'rangeValid', values: ['no', 'yes'] },
    ],
  },
  {
    id: 0x103,
    name: 'VCU_Recovery',
    sender: 'VCU',
    periodMs: 100,
    signals: [{ name: 'recoveredJ', unit: 'J', scale: 1 }],
  },
  {
    id: 0x104,
    name: 'VCU_Charge',
    sender: 'VCU',
    periodMs: 10,
    signals: [
      { name: 'requested', values: ['no', 'yes'] },
      { name: 'authorized', values: ['no', 'yes'] },
      { name: 'faultBlock', values: ['no', 'yes'] },
      { name: 'source', values: ['none', 'AC', 'DC'] },
      { name: 'targetSoc', unit: '%', scale: 0.1 },
      { name: 'connected', values: ['no', 'yes'] },
      { name: 'session', values: ['idle', 'plugged', 'charging', 'stopped', 'complete'] },
    ],
  },
  {
    id: 0x105, name: 'VCU_DTC', sender: 'VCU', periodMs: 100,
    signals: [
      { name: 'activeBits', unit: 'bits', scale: 1 },
      { name: 'storedBits', unit: 'bits', scale: 1 },
    ],
  },
  {
    id: 0x106, name: 'VCU_DriveDecision', sender: 'VCU', periodMs: 100,
    signals: [
      { name: 'reason', values: ['normal', 'cellOverTemperature', 'insulationFault', 'motorOverTemperature', 'low12V', 'unavailable'] },
      { name: 'powerCapKw', unit: 'kW', scale: 1 },
      { name: 'speedCapKmh', unit: 'km/h', scale: 1 },
    ],
  },
  {
    id: 0x107, name: 'VCU_Mode', sender: 'VCU', periodMs: 100,
    signals: [{ name: 'driveMode', values: DRIVE_MODES }],
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
    id: 0x202,
    name: 'BMS_Charge',
    sender: 'BMS',
    periodMs: 10,
    signals: [
      { name: 'accepted', values: ['no', 'yes'] },
      { name: 'faultBlock', values: ['no', 'yes'] },
      { name: 'maxExternalChargeKw', unit: 'kW', scale: 0.1 },
    ],
  },
  {
    id: 0x203, name: 'BMS_DTC', sender: 'BMS', periodMs: 100,
    signals: [
      { name: 'activeBits', unit: 'bits', scale: 1 },
      { name: 'storedBits', unit: 'bits', scale: 1 },
    ],
  },
  {
    // Pack temperature from the BMS's own sensor (07 R11).
    id: 0x204, name: 'BMS_Thermal', sender: 'BMS', periodMs: 100,
    signals: [{ name: 'packTemperature', unit: '°C', scale: 0.1 }],
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
  {
    id: 0x302, name: 'MCU_DTC', sender: 'MCU', periodMs: 100,
    signals: [
      { name: 'activeBits', unit: 'bits', scale: 1 },
      { name: 'storedBits', unit: 'bits', scale: 1 },
    ],
  },
  {
    // Motor winding and inverter temperatures from the MCU's own sensors (07 R11).
    id: 0x303, name: 'MCU_Thermal', sender: 'MCU', periodMs: 100,
    signals: [
      { name: 'motorTemperature', unit: '°C', scale: 0.1 },
      { name: 'inverterTemperature', unit: '°C', scale: 0.1 },
    ],
  },
  {
    // OTA client progress from the TCU (ADR 0015). `version` is the package's, 0 when none.
    id: 0x400, name: 'TCU_Ota', sender: 'TCU', periodMs: 100,
    signals: [
      { name: 'state', values: OTA_STATES },
      { name: 'progress', unit: '%', scale: 0.1 },
      { name: 'version', unit: 'major.minor.patch (encoded)' },
      { name: 'target', values: ['none', 'VCU'] },
    ],
  },
]);
