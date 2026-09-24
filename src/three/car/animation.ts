import type { SimSnapshot } from '../../sim';
import type { Object3D } from 'three';

export interface CarVisualState {
  wheelAngleRad: number;
  brakeLightIntensity: number;
  headlightsOn: boolean;
  roadSpeedMs: number;
  chargePort: 'unplugged' | 'plugged' | 'charging';
}

/** The stage consumes plant render data without subscribing its React tree to sim ticks. */
export function visualStateFromSnapshot(snapshot: SimSnapshot): CarVisualState {
  return {
    wheelAngleRad: snapshot.render.wheelAngleRad,
    brakeLightIntensity: snapshot.render.brakeLights,
    headlightsOn: snapshot.render.headlights,
    roadSpeedMs: snapshot.speedMs,
    chargePort: snapshot.charge.session === 'charging' ? 'charging' : snapshot.charge.connected ? 'plugged' : 'unplugged',
  };
}

/** Apply the three static port silhouettes to the named public car part. */
export function applyCarVisualState(car: Object3D, visual: CarVisualState): void {
  const port = car.getObjectByName('charge-port');
  if (!port) return;
  port.getObjectByName('port-flap')!.visible = visual.chargePort === 'unplugged';
  port.getObjectByName('port-plug')!.visible = visual.chargePort !== 'unplugged';
  port.getObjectByName('port-charging-marker')!.visible = visual.chargePort === 'charging';
}
