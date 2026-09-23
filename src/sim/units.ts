/** SI inside the sim; convert only at the UI boundary (tech-stack.md, Simulation). */

export const msToKmh = (ms: number): number => ms * 3.6;
export const kmhToMs = (kmh: number): number => kmh / 3.6;
export const wToKw = (w: number): number => w / 1000;
export const jToKwh = (j: number): number => j / 3.6e6;
export const kwhToJ = (kwh: number): number => kwh * 3.6e6;
/** Consumption: 1 Wh/km = 3,600 J per 1,000 m. */
export const whPerKmToJPerM = (whPerKm: number): number => whPerKm * 3.6;
export const jPerMToWhPerKm = (jPerM: number): number => jPerM / 3.6;
export const radsToRpm = (rads: number): number => (rads * 60) / (2 * Math.PI);
export const rpmToRads = (rpm: number): number => (rpm * 2 * Math.PI) / 60;
