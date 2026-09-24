import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createSim } from './index';
import { GRAVITY_MS2, vehicleParams } from './vehicle';

describe('regen control decision', () => {
  it('records an accepted decision against the existing public brake and vehicle contracts', () => {
    const adr = readFileSync('docs/adr/0009-regenerative-braking-control.md', 'utf8');
    expect(adr).toContain('Status: accepted');
    expect(adr).toContain('createSim()');
    expect(adr).toContain('vehicleParams');

    const sim = createSim();
    expect(sim.snapshot().pedals.brake).toBe(0);
    expect(vehicleParams.tyreRoadFriction).toBe(0.95);
    expect(vehicleParams.tyreRoadFriction * GRAVITY_MS2).toBeGreaterThan(9);
  });
});
