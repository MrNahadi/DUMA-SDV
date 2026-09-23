import { describe, expect, it } from 'vitest';
import { createSim } from '../../sim';
import { visualStateFromSnapshot } from './animation';

describe('car visual state', () => {
  it('maps pedals, READY and signed road speed', () => {
    const sim = createSim();
    const off = visualStateFromSnapshot(sim.snapshot());
    expect(off.brakeLightIntensity).toBe(0);
    expect(off.headlightsOn).toBe(false);
    expect(off.roadSpeedMs).toBe(0);

    sim.setInputs({ powerButton: true, brake: 0.6 });
    sim.step(200);
    const ready = visualStateFromSnapshot(sim.snapshot());
    expect(ready.brakeLightIntensity).toBeCloseTo(0.6);
    expect(ready.headlightsOn).toBe(true);
    expect(ready.roadSpeedMs).toBe(sim.snapshot().speedMs);
  });

  it('stays fixed between parked READY snapshots', () => {
    const sim = createSim();
    sim.setInputs({ powerButton: true });
    sim.step(200);
    const before = visualStateFromSnapshot(sim.snapshot());
    sim.step(20);
    expect(visualStateFromSnapshot(sim.snapshot())).toEqual(before);
  });
});
