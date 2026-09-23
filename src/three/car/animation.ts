import type { SimSnapshot } from '../../sim';

export interface CarVisualState {
  wheelAngleRad: number;
  brakeLightIntensity: number;
  headlightsOn: boolean;
  roadSpeedMs: number;
}

/** The stage consumes plant render data without subscribing its React tree to sim ticks. */
export function visualStateFromSnapshot(snapshot: SimSnapshot): CarVisualState {
  return {
    wheelAngleRad: snapshot.render.wheelAngleRad,
    brakeLightIntensity: snapshot.render.brakeLights,
    headlightsOn: snapshot.render.headlights,
    roadSpeedMs: snapshot.speedMs,
  };
}
