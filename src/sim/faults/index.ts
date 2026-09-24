/** Stable Duma diagnostic identities and ECU ownership, ADR 0011. */
export const faultCatalogue = [
  { key: 'cellOverTemperature', code: 'P0A7E', owner: 'BMS', part: 'pack', module: 'Traction battery', severity: 'amber' },
  { key: 'insulationFault', code: 'P0AA6', owner: 'BMS', part: 'hv-cables', module: 'High-voltage cables', severity: 'red' },
  { key: 'motorOverTemperature', code: 'P0A2F', owner: 'MCU', part: 'motor', module: 'Drive motor', severity: 'amber' },
  { key: 'low12V', code: 'P0562', owner: 'VCU', part: 'battery-12v', module: '12 V battery', severity: 'amber' },
] as const;

export type FaultKey = (typeof faultCatalogue)[number]['key'];
export type FaultCommand = { key: FaultKey; action: 'inject' | 'restore' | 'clear' } | { action: 'clearAll' };
export type FaultActionResult = 'accepted' | 'alreadyInState' | 'active' | 'missing' | 'invalid';
export type FaultRecord = (typeof faultCatalogue)[number] & {
  status: 'active' | 'stored';
  firstSeenS: number;
  lastActivatedS: number;
};
export interface DiagnosticsSnapshot {
  records: FaultRecord[];
  lastAction: { command: FaultCommand; result: FaultActionResult } | null;
}

export function createFaultRecords() {
  const active = new Set<FaultKey>();
  const records = new Map<FaultKey, FaultRecord>();
  let lastAction: DiagnosticsSnapshot['lastAction'] = null;

  function known(key: string): key is FaultKey {
    return faultCatalogue.some((fault) => fault.key === key);
  }

  function apply(command: FaultCommand, timeS: number): void {
    let result: FaultActionResult = 'accepted';
    if (command.action === 'clearAll') {
      for (const [key, record] of records) if (record.status === 'stored') records.delete(key);
    } else if (!known(command.key) || !['inject', 'restore', 'clear'].includes(command.action)) {
      result = 'invalid';
    } else if (command.action === 'inject') {
      if (active.has(command.key)) result = 'alreadyInState';
      else {
        active.add(command.key);
        const existing = records.get(command.key);
        if (existing) { existing.status = 'active'; existing.lastActivatedS = timeS; }
        else {
          const fault = faultCatalogue.find((item) => item.key === command.key)!;
          records.set(command.key, { ...fault, status: 'active', firstSeenS: timeS, lastActivatedS: timeS });
        }
      }
    } else if (command.action === 'restore') {
      if (!active.delete(command.key)) result = 'alreadyInState';
      else records.get(command.key)!.status = 'stored';
    } else {
      const record = records.get(command.key);
      if (!record) result = 'missing';
      else if (active.has(command.key)) result = 'active';
      else records.delete(command.key);
    }
    lastAction = { command: { ...command }, result };
  }

  return {
    apply,
    snapshot(): DiagnosticsSnapshot {
      return {
        records: faultCatalogue.flatMap((fault) => {
          const record = records.get(fault.key);
          return record ? [{ ...record }] : [];
        }),
        lastAction: lastAction ? { command: { ...lastAction.command }, result: lastAction.result } : null,
      };
    },
  };
}
