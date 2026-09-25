import type { SimSnapshot } from '../../sim';
import { Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { faultCatalogue } from '../../sim/faults';
import { tokens } from '../../ui/tokens';
import type { CarPart } from './index';

export interface CarVisualState {
  wheelAngleRad: number;
  brakeLightIntensity: number;
  headlightsOn: boolean;
  roadSpeedMs: number;
  chargePort: 'unplugged' | 'plugged' | 'charging';
  faultHighlight: { part: CarPart; module: string; severity: 'amber' | 'red' } | null;
}

/** The stage consumes plant render data without subscribing its React tree to sim ticks. */
export function visualStateFromSnapshot(snapshot: SimSnapshot): CarVisualState {
  // Catalogue order breaks ties within a severity. Unknown/stale frames never assert a healthy state.
  const active = faultCatalogue.filter((fault) => {
    const bus = snapshot.diagnostics.busStatus[fault.owner];
    if (!bus.available || bus.activeBits === null) return false;
    const bit = faultCatalogue.filter((item) => item.owner === fault.owner).findIndex((item) => item.key === fault.key);
    return (bus.activeBits & (1 << bit)) !== 0;
  });
  const selected = active.find((fault) => fault.severity === 'red') ?? active[0];
  return {
    wheelAngleRad: snapshot.render.wheelAngleRad,
    brakeLightIntensity: snapshot.render.brakeLights,
    headlightsOn: snapshot.render.headlights,
    roadSpeedMs: snapshot.speedMs,
    chargePort: snapshot.charge.session === 'charging' ? 'charging' : snapshot.charge.connected ? 'plugged' : 'unplugged',
    faultHighlight: selected ? { part: selected.part, module: selected.module, severity: selected.severity } : null,
  };
}

const shellParts = ['body', 'glass', 'mirrors', 'lamp-lenses', 'trim-details'];

/** Apply ghost mode, the fault highlight and the charge-port state to the car model. */
export function applyCarVisualState(car: Object3D, visual: CarVisualState): void {
  // Ghost mode: the whole outer shell turns see-through so the faulty module shows inside.
  for (const name of shellParts) {
    const mesh = car.getObjectByName(name);
    if (!(mesh instanceof Mesh)) continue;
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (!(material instanceof MeshStandardMaterial)) continue;
      material.transparent = visual.faultHighlight !== null;
      material.opacity = visual.faultHighlight ? 0.16 : 1;
      material.depthWrite = visual.faultHighlight === null;
    }
  }
  const internals = car.getObjectByName('internals');
  if (internals) {
    internals.visible = visual.faultHighlight !== null;
    for (const part of internals.children) {
      part.visible = part.name === visual.faultHighlight?.part;
      if (part instanceof Mesh && part.material instanceof MeshStandardMaterial) {
        part.material.color.set(part.visible ? visual.faultHighlight?.severity === 'red' ? tokens.fault : tokens.warn : '#86aeb8');
      }
    }
  }
  const port = car.getObjectByName('charge-port');
  if (!port) return;
  port.getObjectByName('port-flap')!.visible = visual.chargePort === 'unplugged';
  port.getObjectByName('port-plug')!.visible = visual.chargePort !== 'unplugged';
  port.getObjectByName('port-charging-marker')!.visible = visual.chargePort === 'charging';
}
