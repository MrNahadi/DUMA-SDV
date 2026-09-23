/**
 * Vehicle parameters, SI units. Official and measured figures come from
 * ADR 0001 (rows 1-22, 26-27); estimates this model adds are recorded in ADR 0004.
 * The loss terms (Crr, frontal area, motor losses) are the calibration knobs of
 * ADR 0003: tune those before any official row, and record changes in a new ADR.
 */

import { kmhToMs, kwhToJ, rpmToRads } from '../units';

/** Standard gravity, m/s². */
export const GRAVITY_MS2 = 9.81;
/** Air density for road load, kg/m³ (ADR 0001 road-load note; requirements R2). */
export const AIR_DENSITY_KGM3 = 1.2;

export interface VehicleParams {
  driveLayout: 'rwd-single-motor';
  motorType: 'pmsm';
  motorPeakPowerW: number;
  motorPeakTorqueNm: number;
  motorContinuousPowerW: number;
  motorMaxSpeedRadS: number;
  reductionRatio: number;
  gearEfficiency: number;
  /** Motor + inverter loss: constant term, W. */
  motorLossConstW: number;
  /** Motor + inverter loss: copper term, W per (N·m)². */
  motorLossCopperWPerNm2: number;
  /** Motor + inverter loss: iron/hysteresis term, W per rad/s. */
  motorLossIronWPerRadS: number;
  /** Motor + inverter loss: eddy/windage/friction term, W per (rad/s)². */
  motorLossWindageWPerRadS2: number;

  cellChemistry: 'lfp';
  seriesCells: number;
  packNominalVoltageV: number;
  cellCapacityAh: number;
  grossEnergyJ: number;
  usableEnergyJ: number;
  packInternalResistanceOhm: number;
  dcLinkCapacitanceF: number;
  prechargeResistanceOhm: number;
  /** Time constant of the inverter's DC-link active discharge while the contactors are open, s. */
  dcLinkDischargeTauS: number;
  /** Time from coil command to the contacts changing state, s. */
  contactorActuationS: number;
  lvBatteryNominalV: number;
  auxLoadW: number;

  kerbMassKg: number;
  driverMassKg: number;
  testMassKg: number;
  grossVehicleMassKg: number;
  rotationalMassFactor: number;
  rearAxleStaticFraction: number;
  cgHeightM: number;

  dragCoefficient: number;
  frontalAreaM2: number;
  rollingResistanceCoeff: number;
  tyreRoadFriction: number;
  tyreSize: string;
  wheelRadiusM: number;

  wheelbaseM: number;
  lengthM: number;
  widthM: number;
  heightM: number;
  topSpeedMs: number;

  obcMaxPowerW: number;
  dcPeakPowerW: number;
}

const KERB_MASS_KG = 2055; // ADR 0001 row 14
const DRIVER_MASS_KG = 75; // ADR 0001 row 14 (EU unladen adds a 75 kg driver)

export const vehicleParams: Readonly<VehicleParams> = Object.freeze({
  driveLayout: 'rwd-single-motor', // ADR 0001 row 1
  motorType: 'pmsm', // ADR 0001 row 2
  motorPeakPowerW: 230_000, // ADR 0001 row 3
  motorPeakTorqueNm: 360, // ADR 0001 row 4
  motorContinuousPowerW: 70_000, // ADR 0001 row 5
  motorMaxSpeedRadS: rpmToRads(16_000), // ADR 0001 row 6
  reductionRatio: 10.81, // ADR 0001 row 7
  gearEfficiency: 0.97, // estimate: single-stage helical reduction, ADR 0004
  motorLossConstW: 300, // estimate: inverter control, gate drive and bias losses, ADR 0004
  motorLossCopperWPerNm2: 0.18, // estimate: I²R in windings and switches, ~90% at 360 N·m base speed, ADR 0004
  motorLossIronWPerRadS: 1.2, // estimate: hysteresis and switching losses, ADR 0004
  motorLossWindageWPerRadS2: 0.0016, // estimate: eddy, bearing and windage losses, ADR 0004

  cellChemistry: 'lfp', // ADR 0001 row 8
  seriesCells: 172, // ADR 0001 row 9
  packNominalVoltageV: 550, // ADR 0001 row 10
  cellCapacityAh: 150, // ADR 0001 row 11
  grossEnergyJ: kwhToJ(82.56), // ADR 0001 row 12
  usableEnergyJ: kwhToJ(82.5), // ADR 0001 row 13
  packInternalResistanceOhm: 0.08, // estimate: 172 × ~0.4 mΩ LFP prismatic cell DCIR plus busbars, ADR 0004
  dcLinkCapacitanceF: 1.0e-3, // estimate: typical 150-250 kW traction inverter DC-link film capacitor, ADR 0004
  prechargeResistanceOhm: 200, // estimate: gives τ = RC = 0.2 s, ADR 0004
  dcLinkDischargeTauS: 0.4, // estimate: active discharge, 550 V to below 60 V in about 0.9 s, ADR 0005
  contactorActuationS: 0.03, // estimate: typical HV contactor operate/release time, ADR 0005
  lvBatteryNominalV: 12.7, // estimate: rested 12 V battery, 12.6-12.8 V (requirements R2), ADR 0004
  auxLoadW: 400, // estimate: 12 V auxiliary load, HVAC off (ADR 0003 test conditions), ADR 0004

  kerbMassKg: KERB_MASS_KG, // ADR 0001 row 14
  driverMassKg: DRIVER_MASS_KG, // ADR 0001 row 14
  testMassKg: KERB_MASS_KG + DRIVER_MASS_KG, // ADR 0001 row 14 (2,130 kg)
  grossVehicleMassKg: 2501, // ADR 0001 row 15
  rotationalMassFactor: 1.04, // estimate: wheels, tyres, reduction gear and rotor inertia, ADR 0004
  rearAxleStaticFraction: 0.5, // estimate: near 50:50 RWD sedan with a floor pack, ADR 0004
  cgHeightM: 0.5, // estimate: low floor-pack sedan, ADR 0004

  dragCoefficient: 0.219, // ADR 0001 row 16
  frontalAreaM2: 2.35, // ADR 0001 row 17, calibrated default per ADR 0003
  rollingResistanceCoeff: 0.011, // ADR 0001 row 20, calibrated default per ADR 0003
  tyreRoadFriction: 0.95, // estimate: dry asphalt, summer-grade EV tyre, ADR 0004
  tyreSize: '235/45 R19', // ADR 0001 row 18
  wheelRadiusM: 0.335, // ADR 0001 row 19

  wheelbaseM: 2.92, // ADR 0001 row 21
  lengthM: 4.8, // ADR 0001 row 21
  widthM: 1.875, // ADR 0001 row 21
  heightM: 1.46, // ADR 0001 row 21
  topSpeedMs: kmhToMs(180), // ADR 0001 row 22 (limited)

  obcMaxPowerW: 11_000, // ADR 0001 row 26
  dcPeakPowerW: 150_000, // ADR 0001 row 27
});
