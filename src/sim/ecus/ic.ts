/**
 * IC (instrument cluster, requirements R4). In this ticket it boots and announces
 * itself. The dashboard model it builds from bus frames arrives with T-005.
 */

import type { Bus } from '../bus';
import { INITIAL_SW_VERSION, createBootTracker } from './ecu';

/** Boot and display self test on the 12 V switched supply; the slowest ECU to wake. */
const BOOT_S = 0.3;

export interface Ic {
  step(t: number, powered: boolean): void;
}

export function createIc(bus: Bus): Ic {
  const boot = createBootTracker(BOOT_S);
  const bootFrame = bus.writer('IC', 'IC_Boot');
  bus.setSenderActive('IC', false);

  return {
    step(t, powered) {
      const edge = boot.update(powered, t);
      if (edge === 'lost') bus.setSenderActive('IC', false);
      if (edge === 'booted') {
        bus.setSenderActive('IC', true);
        bootFrame.set('selfCheck', 'pass').set('swVersion', INITIAL_SW_VERSION).raise();
      }
    },
  };
}
