/**
 * MCU (requirements R4): the inverter controller. In this ticket it boots,
 * calibrates its current sensors, and reports the DC-link voltage and motor speed
 * it measures. Torque control arrives with driving (T-004). Timings: ADR 0005.
 */

import type { Bus } from '../bus';
import type { VehicleParams } from '../vehicle';
import { msToKmh, radsToRpm } from '../units';
import { INITIAL_SW_VERSION, TIME_EPS_S, createBootTracker } from './ecu';

/** Boot and power-on self test on the 12 V switched supply. */
const BOOT_S = 0.2;
/** Current-sensor offset calibration after boot, with the bridge off. */
const CALIBRATION_S = 0.3;

export interface McuSensors {
  /** DC-link voltage at the inverter input, V. */
  dcLinkV: number;
  /** Rotor speed, rad/s. */
  motorSpeedRadS: number;
}

export interface Mcu {
  step(t: number, powered: boolean, sensors: McuSensors): void;
}

export function createMcu(bus: Bus, p: Readonly<VehicleParams>): Mcu {
  const boot = createBootTracker(BOOT_S);
  const bootFrame = bus.writer('MCU', 'MCU_Boot');
  const status = bus.writer('MCU', 'MCU_Status');
  const vehicle = bus.writer('MCU', 'MCU_Vehicle');
  bus.setSenderActive('MCU', false);

  return {
    step(t, powered, { dcLinkV, motorSpeedRadS }) {
      const edge = boot.update(powered, t);
      if (edge === 'lost') bus.setSenderActive('MCU', false);
      if (!boot.running) return;
      if (edge === 'booted') {
        bus.setSenderActive('MCU', true);
        bootFrame.set('selfCheck', 'pass').set('swVersion', INITIAL_SW_VERSION).raise();
      }

      const calibrated = t - boot.bootedAtS >= CALIBRATION_S - TIME_EPS_S;
      const wheelSpeedMs = (motorSpeedRadS / p.reductionRatio) * p.wheelRadiusM;
      status
        .set('motorSpeedRpm', radsToRpm(motorSpeedRadS))
        .set('torqueActual', 0)
        .set('dcLinkVoltage', dcLinkV)
        .set('inverterState', calibrated ? 'standby' : 'off');
      vehicle.set('vehicleSpeedKmh', msToKmh(wheelSpeedMs));
    },
  };
}
