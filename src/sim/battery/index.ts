/** Battery plant: pack OCV and the HV contactor circuit. No decisions, no bus. */

export { LFP_CELL_OCV, cellOcvV, packOcvV } from './pack';
export { WELDING_THRESHOLD, createHvCircuit, type ContactorId, type ContactorStates, type HvCircuit } from './hv';
