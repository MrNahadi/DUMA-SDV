/** Battery plant: pack OCV and SOC, and the HV contactor circuit. No decisions, no bus. */

export { LFP_CELL_OCV, cellOcvV, createPack, packOcvV, usableChargeC, type Pack } from './pack';
export {
  WELDING_THRESHOLD,
  createHvCircuit,
  packCurrentForPowerA, type ContactorId, type ContactorStates, type HvCircuit } from './hv';
