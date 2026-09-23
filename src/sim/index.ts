/**
 * Public API of the sim core. Framework-free and deterministic: the same
 * sequence of calls always yields the same snapshots (tech-stack.md, Simulation).
 */

/** Fixed simulation step: 10 ms (100 Hz). */
export const TICK_S = 0.01;

export interface SimSnapshot {
  /** Ticks elapsed since creation. */
  tick: number;
  /** Simulated time in seconds (tick * TICK_S). */
  timeS: number;
}

export interface Sim {
  /** Advance the simulation by a whole number of ticks. */
  step(ticks?: number): void;
  /** Read-only view of the current state. */
  snapshot(): Readonly<SimSnapshot>;
}

export function createSim(): Sim {
  let tick = 0;

  return {
    step(ticks = 1) {
      if (!Number.isInteger(ticks) || ticks < 0) {
        throw new RangeError(`step() needs a non-negative integer tick count, got ${ticks}`);
      }
      tick += ticks;
    },
    snapshot() {
      return { tick, timeS: tick * TICK_S };
    },
  };
}
