import { describe, expect, it } from 'vitest';
import { createSim } from '../index';
import { faultCatalogue } from './index';

describe('public fault records', () => {
  it('injects every catalogue condition with stable owner metadata and time', () => {
    const sim = createSim();
    for (const fault of faultCatalogue) {
      sim.setInputs({ faultCommand: { key: fault.key, action: 'inject' } });
      sim.step();
    }
    expect(sim.snapshot().diagnostics.records.map(({ key, code, owner, part, status, firstSeenS }) =>
      ({ key, code, owner, part, status, firstSeenS }))).toEqual(
      faultCatalogue.map((fault, i) => ({ ...fault, status: 'active', firstSeenS: i * 0.01 }))
        .map(({ key, code, owner, part, status, firstSeenS }) => ({ key, code, owner, part, status, firstSeenS })),
    );
    expect(sim.snapshot().diagnostics.records).toHaveLength(4);
  });

  it('reports duplicate, invalid, active clear, restore and clear outcomes', () => {
    const sim = createSim();
    sim.setInputs({ faultCommand: { key: 'cellOverTemperature', action: 'inject' } });
    sim.step();
    expect(sim.snapshot().diagnostics.lastAction?.result).toBe('accepted');
    sim.setInputs({ faultCommand: { key: 'cellOverTemperature', action: 'inject' } });
    sim.step();
    expect(sim.snapshot().diagnostics.lastAction?.result).toBe('alreadyInState');
    sim.setInputs({ faultCommand: { key: 'cellOverTemperature', action: 'clear' } });
    sim.step();
    expect(sim.snapshot().diagnostics.lastAction?.result).toBe('active');
    expect(sim.snapshot().diagnostics.records[0]?.status).toBe('active');
    sim.setInputs({ faultCommand: { key: 'cellOverTemperature', action: 'restore' } });
    sim.step();
    expect(sim.snapshot().diagnostics.records[0]?.status).toBe('stored');
    sim.setInputs({ faultCommand: { key: 'cellOverTemperature', action: 'clear' } });
    sim.step();
    expect(sim.snapshot().diagnostics.records).toEqual([]);
    sim.setInputs({ faultCommand: { key: 'invalid' as 'cellOverTemperature', action: 'inject' } });
    sim.step();
    expect(sim.snapshot().diagnostics.lastAction?.result).toBe('invalid');
  });

  it('reactivates one record, clears stored records only, and repeats exactly', () => {
    const run = () => {
      const sim = createSim();
      for (const key of ['low12V', 'cellOverTemperature'] as const) {
        sim.setInputs({ faultCommand: { key, action: 'inject' } }); sim.step();
      }
      sim.setInputs({ faultCommand: { key: 'low12V', action: 'restore' } }); sim.step();
      sim.setInputs({ faultCommand: { key: 'low12V', action: 'inject' } }); sim.step();
      sim.setInputs({ faultCommand: { key: 'low12V', action: 'restore' } }); sim.step();
      const beforeClear = sim.snapshot().diagnostics.records;
      sim.setInputs({ faultCommand: { action: 'clearAll' } }); sim.step();
      return { beforeClear, afterClear: sim.snapshot().diagnostics.records };
    };
    const result = run();
    expect(result).toEqual(run());
    expect(result.beforeClear.find((r) => r.key === 'low12V')).toMatchObject({ firstSeenS: 0, lastActivatedS: 0.03, status: 'stored' });
    expect(result.afterClear.map((r) => r.key)).toEqual(['cellOverTemperature']);
  });
});
