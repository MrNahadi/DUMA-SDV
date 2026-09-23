/** Helpers shared by the ECUs: supply/boot tracking and frame freshness. */

import { swVersionCode, type Inbox } from '../bus';

/** Firmware version every ECU ships with. OTA (feature 09) changes it. */
export const INITIAL_SW_VERSION = swVersionCode(1, 0, 0);

/** Guards comparisons of sim times built from sums of 0.01 s steps. */
export const TIME_EPS_S = 1e-9;

/** `booted`: the application just started. `lost`: a running ECU just lost its supply. */
export type BootEdge = 'booted' | 'lost' | undefined;

/** Tracks one ECU on a switched supply: off, booting, then running. */
export interface BootTracker {
  /** Update with the supply state at sim time `t`. Returns the edge crossed this tick, if any. */
  update(powered: boolean, t: number): BootEdge;
  readonly running: boolean;
  /** Sim time the ECU finished booting (NaN while not running). */
  readonly bootedAtS: number;
}

export function createBootTracker(bootS: number): BootTracker {
  let poweredAtS = Number.NaN;
  const tracker = {
    running: false,
    bootedAtS: Number.NaN,
    update(powered: boolean, t: number): BootEdge {
      if (!powered) {
        const wasRunning = tracker.running;
        poweredAtS = Number.NaN;
        tracker.running = false;
        tracker.bootedAtS = Number.NaN;
        return wasRunning ? 'lost' : undefined;
      }
      if (Number.isNaN(poweredAtS)) poweredAtS = t;
      if (tracker.running || t - poweredAtS < bootS - TIME_EPS_S) return undefined;
      tracker.running = true;
      tracker.bootedAtS = t;
      return 'booted';
    },
  };
  return tracker;
}

/** True if `message` has a delivered frame sent at or after `sinceS`. */
export function isFresh(inbox: Inbox, message: string, sinceS: number): boolean {
  const t = inbox.frameTimeS(message);
  return t !== undefined && t >= sinceS - TIME_EPS_S;
}
