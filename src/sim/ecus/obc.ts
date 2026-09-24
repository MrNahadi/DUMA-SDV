/** AC on-board charger. Its permission comes only from received bus frames (ADR 0010). */
import type { Bus } from '../bus';
import type { VehicleParams } from '../vehicle';
import { isFresh } from './ecu';

/** Estimated rated AC conversion efficiency, ADR 0010. */
const AC_EFFICIENCY = 0.92;

export interface Obc {
  readonly inputPowerW: number;
  readonly outputPowerW: number;
  readonly lossPowerW: number;
  step(t: number, enabled: boolean, maxOutputW: number): void;
}

export function createObc(bus: Bus, p: Readonly<VehicleParams>): Obc {
  const inbox = bus.subscribe('OBC', ['VCU_Charge', 'BMS_Charge']);
  const obc = {
    inputPowerW: 0,
    outputPowerW: 0,
    lossPowerW: 0,
    step(t: number, enabled: boolean, maxOutputW: number) {
      const allowed = enabled &&
        isFresh(inbox, 'VCU_Charge', t - 0.1) &&
        inbox.read('VCU_Charge', 'authorized') === 'yes' &&
        inbox.read('VCU_Charge', 'source') === 'AC' &&
        isFresh(inbox, 'BMS_Charge', t - 0.1) &&
        inbox.read('BMS_Charge', 'accepted') === 'yes';
      const allowanceW = allowed ? (inbox.read('BMS_Charge', 'maxExternalChargeKw') as number) * 1000 : 0;
      obc.inputPowerW = Math.max(0, Math.min(p.obcMaxPowerW, allowanceW / AC_EFFICIENCY, maxOutputW / AC_EFFICIENCY));
      obc.outputPowerW = obc.inputPowerW * AC_EFFICIENCY;
      obc.lossPowerW = obc.inputPowerW - obc.outputPowerW;
    },
  };
  return obc;
}
