/** Vehicle plant: parameters and pure physics functions. No decisions, no bus. */

export { AIR_DENSITY_KGM3, GRAVITY_MS2, vehicleParams, type VehicleParams } from './params';
export { aeroDragN, roadLoadN, rollingResistanceN } from './roadLoad';
export { motorBaseSpeedRadS, motorLossW, motorMaxTorqueNm } from './motor';
export { capTractionForceN, rearAxleLoadN, tractionLimitN } from './traction';
export { BRAKE_MAX_DECEL_G, createLongitudinalDynamics, type LongitudinalDynamics } from './dynamics';
