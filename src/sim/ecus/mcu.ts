/**
 * MCU (requirements R4): the inverter controller. It boots, calibrates its current
 * sensors, then follows the VCU's torque request within the motor envelope. It
 * makes torque only while the VCU commands READY, the BMS reports the contactors
 * closed and the DC-link it measures is at least 90% of pack voltage. It reports
 * the motor speed, actual torque and DC-link voltage it measures, and the vehicle
 * speed derived from motor speed. Timings: ADR 0005.
 */

import type { Bus } from '../bus';
import type { FaultKey } from '../faults';
import type { VehicleParams } from '../vehicle';
import { motorMaxTorqueNm } from '../vehicle';
import { msToKmh, radsToRpm } from '../units';
import type { DriveMode } from './vcu';
import { INITIAL_SW_VERSION, TIME_EPS_S, createBootTracker, isFresh } from './ecu';

/** Boot and power-on self test on the 12 V switched supply. */
const BOOT_S = 0.2;
/** Current-sensor offset calibration after boot, with the bridge off. */
const CALIBRATION_S = 0.3;
/** Torque needs the DC-link at this fraction of pack voltage (R4). */
const RUN_DC_LINK_RATIO = 0.9;
/** A VCU_Command older than this counts as lost: torque drops to zero. */
const COMMAND_TIMEOUT_S = 0.1;
/** A BMS_Status older than this (two 100 ms periods) counts as lost. */
const BMS_TIMEOUT_S = 0.2;

export interface McuSensors {
  /** DC-link voltage at the inverter input, V. */
  dcLinkV: number;
  /** Rotor speed, rad/s, forward positive. */
  motorSpeedRadS: number;
  /** Motor winding and inverter temperature sensors, °C. */
  motorTempC: number;
  inverterTempC: number;
}

export interface Mcu {
  /** Torque the inverter makes the motor produce, N·m (the plant's input). */
  readonly torqueNm: number;
  /** True while the inverter bridge is switching (`run`): it then draws its losses from the HV bus. */
  readonly running: boolean;
  /** Drive mode last received on VCU_Mode (ADR 0013); Normal until one arrives. */
  readonly driveMode: DriveMode;
  step(t: number, powered: boolean, sensors: McuSensors): void;
}

export function createMcu(bus: Bus, p: Readonly<VehicleParams>, faultStatus: (key: FaultKey) => 'active' | 'stored' | null): Mcu {
  const boot = createBootTracker(BOOT_S);
  const bootFrame = bus.writer('MCU', 'MCU_Boot');
  const status = bus.writer('MCU', 'MCU_Status');
  const vehicle = bus.writer('MCU', 'MCU_Vehicle');
  const thermal = bus.writer('MCU', 'MCU_Thermal');
  const inbox = bus.subscribe('MCU', ['VCU_Command', 'BMS_Status', 'VCU_Mode']);
  bus.setSenderActive('MCU', false);

  /** True if the high-voltage supply and the VCU both allow torque. */
  function enabled(t: number, dcLinkV: number): boolean {
    if (!isFresh(inbox, 'VCU_Command', Math.max(boot.bootedAtS, t - COMMAND_TIMEOUT_S))) return false;
    if (!isFresh(inbox, 'BMS_Status', Math.max(boot.bootedAtS, t - BMS_TIMEOUT_S))) return false;
    if (inbox.read('VCU_Command', 'powerState') !== 'READY') return false;
    if (inbox.read('BMS_Status', 'contactorState') !== 'closed') return false;
    return dcLinkV >= RUN_DC_LINK_RATIO * (inbox.read('BMS_Status', 'packVoltage') as number);
  }

  const mcu = {
    torqueNm: 0,
    running: false,
    driveMode: 'normal' as DriveMode,
    step(t: number, powered: boolean, { dcLinkV, motorSpeedRadS, motorTempC, inverterTempC }: McuSensors) {
      const edge = boot.update(powered, t);
      if (edge === 'lost') bus.setSenderActive('MCU', false);
      if (!boot.running) {
        mcu.torqueNm = 0;
        mcu.running = false;
        return;
      }
      if (edge === 'booted') {
        bus.setSenderActive('MCU', true);
        bootFrame.set('selfCheck', 'pass').set('swVersion', INITIAL_SW_VERSION).raise();
      }
      if (isFresh(inbox, 'VCU_Mode', boot.bootedAtS)) mcu.driveMode = inbox.read('VCU_Mode', 'driveMode') as DriveMode;

      const calibrated = t - boot.bootedAtS >= CALIBRATION_S - TIME_EPS_S;
      const run = calibrated && enabled(t, dcLinkV);
      mcu.running = run;
      if (run) {
        const request = inbox.read('VCU_Command', 'torqueRequest') as number;
        const limit = motorMaxTorqueNm(p, motorSpeedRadS);
        mcu.torqueNm = faultStatus('motorOverTemperature') === 'active' && request * motorSpeedRadS < 0 ? 0 : Math.min(Math.max(request, -limit), limit);
      } else {
        mcu.torqueNm = 0;
      }

      const wheelSpeedMs = (motorSpeedRadS / p.reductionRatio) * p.wheelRadiusM;
      status
        .set('motorSpeedRpm', radsToRpm(motorSpeedRadS))
        .set('torqueActual', mcu.torqueNm)
        .set('dcLinkVoltage', dcLinkV)
        .set('inverterState', run ? 'run' : calibrated ? 'standby' : 'off');
      vehicle.set('vehicleSpeedKmh', msToKmh(wheelSpeedMs));
      thermal.set('motorTemperature', motorTempC).set('inverterTemperature', inverterTempC);
    },
  };
  return mcu;
}
