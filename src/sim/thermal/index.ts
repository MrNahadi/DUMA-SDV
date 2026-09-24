/**
 * Lumped thermal plant ("the world", not an ECU): pack, motor and inverter
 * masses heated by their losses, each with a path to ambient. SI units,
 * °C for temperature. Explicit Euler; never reads the wall clock.
 * Every parameter is an estimate recorded in ADR 0012.
 */

export interface ThermalParams {
  /** Heat capacity, J/K. */
  packHeatCapacityJPerK: number;
  motorHeatCapacityJPerK: number;
  inverterHeatCapacityJPerK: number;
  /** Conductance to ambient, W/K. */
  packToAmbientWPerK: number;
  motorToAmbientWPerK: number;
  inverterToAmbientWPerK: number;
}

export const thermalParams: Readonly<ThermalParams> = Object.freeze({
  packHeatCapacityJPerK: 5.0e5, // estimate: ~500 kg of LFP cells and structure at ~1 kJ/(kg·K), ADR 0012
  motorHeatCapacityJPerK: 3.0e4, // estimate: ~65 kg steel and copper at ~0.46 kJ/(kg·K), ADR 0012
  inverterHeatCapacityJPerK: 8.0e3, // estimate: ~9 kg cold plate, modules and housing, ADR 0012
  packToAmbientWPerK: 40, // estimate: path to ambient (coolant loop added in T-003), ADR 0012
  motorToAmbientWPerK: 25, // estimate: path to ambient (coolant loop added in T-003), ADR 0012
  inverterToAmbientWPerK: 20, // estimate: path to ambient (coolant loop added in T-003), ADR 0012
});

/** Heat input to each mass, W. */
export interface ThermalLosses {
  packW: number;
  motorW: number;
  inverterW: number;
}

export interface ThermalState {
  ambientC: number;
  packC: number;
  motorC: number;
  inverterC: number;
}

export interface ThermalPlant {
  step(losses: ThermalLosses, dtS: number): void;
  state(): ThermalState;
}

export function createThermal(p: Readonly<ThermalParams>, ambientC: number): ThermalPlant {
  const s: ThermalState = { ambientC, packC: ambientC, motorC: ambientC, inverterC: ambientC };
  const next = (tC: number, heatW: number, gWPerK: number, cJPerK: number, dtS: number) =>
    tC + ((heatW - gWPerK * (tC - s.ambientC)) * dtS) / cJPerK;
  return {
    step(losses, dtS) {
      s.packC = next(s.packC, losses.packW, p.packToAmbientWPerK, p.packHeatCapacityJPerK, dtS);
      s.motorC = next(s.motorC, losses.motorW, p.motorToAmbientWPerK, p.motorHeatCapacityJPerK, dtS);
      s.inverterC = next(s.inverterC, losses.inverterW, p.inverterToAmbientWPerK, p.inverterHeatCapacityJPerK, dtS);
    },
    state: () => ({ ...s }),
  };
}
