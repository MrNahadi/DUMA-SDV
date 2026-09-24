/**
 * Lumped thermal plant ("the world", not an ECU): pack, motor and inverter
 * masses heated by their losses, coupled to two coolant loops (battery;
 * motor + inverter) that reject heat to ambient through radiators. SI units,
 * °C for temperature. Explicit Euler; never reads the wall clock.
 * Every parameter is an estimate recorded in ADR 0012.
 */

export interface ThermalParams {
  /** Heat capacity, J/K. */
  packHeatCapacityJPerK: number;
  motorHeatCapacityJPerK: number;
  inverterHeatCapacityJPerK: number;
  batteryCoolantHeatCapacityJPerK: number;
  driveCoolantHeatCapacityJPerK: number;
  /** Conductance from each mass to its loop's coolant with the pump running, W/K. */
  packToCoolantWPerK: number;
  motorToCoolantWPerK: number;
  inverterToCoolantWPerK: number;
  /** Fraction of the mass-to-coolant conductance left with the pump stopped. */
  pumpOffConductanceFraction: number;
  /** Radiator conductance from coolant to ambient, W/K. */
  batteryRadiatorWPerK: number;
  driveRadiatorWPerK: number;
}

export const thermalParams: Readonly<ThermalParams> = Object.freeze({
  packHeatCapacityJPerK: 5.0e5, // estimate: ~500 kg of LFP cells and structure at ~1 kJ/(kg·K), ADR 0012
  motorHeatCapacityJPerK: 3.0e4, // estimate: ~65 kg steel and copper at ~0.46 kJ/(kg·K), ADR 0012
  inverterHeatCapacityJPerK: 8.0e3, // estimate: ~9 kg cold plate, modules and housing, ADR 0012
  batteryCoolantHeatCapacityJPerK: 2.0e4, // estimate: ~5 L glycol mix plus pipes and plates, ADR 0012
  driveCoolantHeatCapacityJPerK: 1.5e4, // estimate: ~4 L glycol mix plus pipes, ADR 0012
  packToCoolantWPerK: 150, // estimate: pack cooling plates, ADR 0012
  motorToCoolantWPerK: 80, // estimate: motor water jacket, ADR 0012
  inverterToCoolantWPerK: 60, // estimate: inverter cold plate, ADR 0012
  pumpOffConductanceFraction: 0.1, // estimate: natural convection in a stopped loop, ADR 0012
  batteryRadiatorWPerK: 60, // estimate: battery loop radiator/chiller share, ADR 0012
  driveRadiatorWPerK: 50, // estimate: front radiator for the drive loop, ADR 0012
});

/** Heat input to each mass, W. */
export interface ThermalLosses {
  packW: number;
  motorW: number;
  inverterW: number;
}

export interface CoolantLoopState {
  coolantC: number;
  pumpOn: boolean;
  /** Heat the radiator rejected to ambient during the latest step, W. */
  rejectedW: number;
}

export interface ThermalState {
  ambientC: number;
  packC: number;
  motorC: number;
  inverterC: number;
  batteryLoop: CoolantLoopState;
  driveLoop: CoolantLoopState;
  /** Energy accounting since creation, J: heat generated, rejected to ambient, and stored above the start temperature. */
  heatInJ: number;
  rejectedJ: number;
  storedJ: number;
}

export interface ThermalPlant {
  step(losses: ThermalLosses, dtS: number, pumpsOn?: boolean): void;
  state(): ThermalState;
}

export function createThermal(p: Readonly<ThermalParams>, ambientC: number): ThermalPlant {
  const t = { packC: ambientC, motorC: ambientC, inverterC: ambientC, batteryC: ambientC, driveC: ambientC };
  const battery: CoolantLoopState = { coolantC: ambientC, pumpOn: false, rejectedW: 0 };
  const drive: CoolantLoopState = { coolantC: ambientC, pumpOn: false, rejectedW: 0 };
  let heatInJ = 0;
  let rejectedJ = 0;
  const storedJ = () =>
    p.packHeatCapacityJPerK * (t.packC - ambientC) +
    p.motorHeatCapacityJPerK * (t.motorC - ambientC) +
    p.inverterHeatCapacityJPerK * (t.inverterC - ambientC) +
    p.batteryCoolantHeatCapacityJPerK * (t.batteryC - ambientC) +
    p.driveCoolantHeatCapacityJPerK * (t.driveC - ambientC);
  return {
    step(losses, dtS, pumpsOn = true) {
      const k = pumpsOn ? 1 : p.pumpOffConductanceFraction;
      // Every flow comes from the state at the start of the step, so energy is conserved exactly.
      const packW = k * p.packToCoolantWPerK * (t.packC - t.batteryC);
      const motorW = k * p.motorToCoolantWPerK * (t.motorC - t.driveC);
      const inverterW = k * p.inverterToCoolantWPerK * (t.inverterC - t.driveC);
      battery.rejectedW = p.batteryRadiatorWPerK * (t.batteryC - ambientC);
      drive.rejectedW = p.driveRadiatorWPerK * (t.driveC - ambientC);
      t.packC += ((losses.packW - packW) * dtS) / p.packHeatCapacityJPerK;
      t.motorC += ((losses.motorW - motorW) * dtS) / p.motorHeatCapacityJPerK;
      t.inverterC += ((losses.inverterW - inverterW) * dtS) / p.inverterHeatCapacityJPerK;
      t.batteryC += ((packW - battery.rejectedW) * dtS) / p.batteryCoolantHeatCapacityJPerK;
      t.driveC += ((motorW + inverterW - drive.rejectedW) * dtS) / p.driveCoolantHeatCapacityJPerK;
      battery.coolantC = t.batteryC;
      drive.coolantC = t.driveC;
      battery.pumpOn = drive.pumpOn = pumpsOn;
      heatInJ += (losses.packW + losses.motorW + losses.inverterW) * dtS;
      rejectedJ += (battery.rejectedW + drive.rejectedW) * dtS;
    },
    state: () => ({
      ambientC,
      packC: t.packC,
      motorC: t.motorC,
      inverterC: t.inverterC,
      batteryLoop: { ...battery },
      driveLoop: { ...drive },
      heatInJ,
      rejectedJ,
      storedJ: storedJ(),
    }),
  };
}
