import { describe, expect, it } from 'vitest';
import { Mesh, MeshStandardMaterial } from 'three';
import { createSim } from '../../sim';
import { visualStateFromSnapshot } from './animation';
import { buildCar, applyCarVisualState } from './index';
import { vehicleParams } from '../../sim/vehicle/params';

describe('car visual state', () => {
  it.each([
    ['cellOverTemperature', 'pack', 'Traction battery', 'amber'],
    ['insulationFault', 'hv-cables', 'High-voltage cables', 'red'],
    ['motorOverTemperature', 'motor', 'Drive motor', 'amber'],
    ['low12V', 'battery-12v', '12 V battery', 'amber'],
  ] as const)('highlights %s on its named part', (key, part, module, severity) => {
    const sim = createSim();
    const car = buildCar(vehicleParams);
    sim.setInputs({ powerButton: true });
    sim.step(150);
    sim.setInputs({ faultCommand: { key, action: 'inject' } });
    sim.step(20);
    const visual = visualStateFromSnapshot(sim.snapshot());
    expect(visual.faultHighlight).toEqual({ part, module, severity });
    applyCarVisualState(car, visual);
    expect(car.getObjectByName('internals')?.visible).toBe(true);
    expect(car.getObjectByName(part)?.visible).toBe(true);
    expect(((car.getObjectByName('body') as Mesh).material as MeshStandardMaterial).opacity).toBeLessThan(1);
    sim.setInputs({ faultCommand: { key, action: 'restore' } });
    sim.step(20);
    applyCarVisualState(car, visualStateFromSnapshot(sim.snapshot()));
    expect(car.getObjectByName('internals')?.visible).toBe(false);
    expect(((car.getObjectByName('body') as Mesh).material as MeshStandardMaterial).opacity).toBe(1);
  });
  it('shows a closed flap, inserted plug, and charging marker from public snapshots', () => {
    const sim = createSim();
    const car = buildCar(vehicleParams);
    const port = car.getObjectByName('charge-port')!;
    const flap = port.getObjectByName('port-flap')!;
    const plug = port.getObjectByName('port-plug')!;
    const marker = port.getObjectByName('port-charging-marker')!;
    applyCarVisualState(car, visualStateFromSnapshot(sim.snapshot()));
    expect(port.visible).toBe(true);
    expect(flap.visible).toBe(true);
    expect(plug.visible).toBe(false);
    expect(marker.visible).toBe(false);

    sim.setInputs({ chargeSource: 'DC', chargeCommand: 'plugIn' });
    sim.step();
    applyCarVisualState(car, visualStateFromSnapshot(sim.snapshot()));
    expect(flap.visible).toBe(false);
    expect(plug.visible).toBe(true);
    expect(marker.visible).toBe(false);

    sim.setInputs({ chargeCommand: 'start' });
    sim.step(200);
    applyCarVisualState(car, visualStateFromSnapshot(sim.snapshot()));
    expect(sim.snapshot().charge.session).toBe('charging');
    expect(plug.visible).toBe(true);
    expect(marker.visible).toBe(true);
  });
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
