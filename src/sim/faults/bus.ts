import type { Bus, Inbox, MessageWriter } from '../bus';
import { isFresh } from '../ecus/ecu';
import { faultCatalogue, type FaultKey } from './index';

export type DiagnosticOwner = 'VCU' | 'BMS' | 'MCU';
export type DiagnosticBusStatus = Record<DiagnosticOwner, {
  available: boolean;
  activeBits: number | null;
  storedBits: number | null;
  frameTimeS: number | null;
}>;

const owners: readonly DiagnosticOwner[] = ['VCU', 'BMS', 'MCU'];
const freshnessS = 0.25;

/** Each writer is bound by the bus to its ECU's own DTC frame. */
export function createDiagnosticBus(bus: Bus, statusOf: (key: FaultKey) => 'active' | 'stored' | null) {
  const writers: Record<DiagnosticOwner, MessageWriter> = {
    VCU: bus.writer('VCU', 'VCU_DTC'),
    BMS: bus.writer('BMS', 'BMS_DTC'),
    MCU: bus.writer('MCU', 'MCU_DTC'),
  };
  const inbox: Inbox = bus.subscribe('Diagnostics', owners.map((owner) => `${owner}_DTC`));

  return {
    publish() {
      for (const owner of owners) {
        let activeBits = 0;
        let storedBits = 0;
        let bit = 1;
        for (const fault of faultCatalogue) {
          if (fault.owner !== owner) continue;
          const status = statusOf(fault.key);
          if (status === 'active') activeBits |= bit;
          if (status === 'stored') storedBits |= bit;
          bit <<= 1;
        }
        writers[owner].set('activeBits', activeBits).set('storedBits', storedBits);
      }
    },
    snapshot(timeS: number): DiagnosticBusStatus {
      const result = {} as DiagnosticBusStatus;
      for (const owner of owners) {
        const name = `${owner}_DTC`;
        const available = isFresh(inbox, name, timeS - freshnessS);
        result[owner] = {
          available,
          activeBits: available ? inbox.read(name, 'activeBits') as number : null,
          storedBits: available ? inbox.read(name, 'storedBits') as number : null,
          frameTimeS: available ? inbox.frameTimeS(name)! : null,
        };
      }
      return result;
    },
  };
}
