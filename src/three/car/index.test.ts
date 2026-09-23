import { describe, expect, it } from 'vitest';
import { Box3, Mesh, Vector3 } from 'three';
import { vehicleParams } from '../../sim/vehicle/params';
import { buildCar, carParts } from './index';

describe('procedural car', () => {
  it('exposes every part in solid mode and matches vehicle dimensions', () => {
    const car = buildCar(vehicleParams);
    for (const id of carParts) {
      const part = car.getObjectByName(id);
      expect(part, id).toBeDefined();
      if (
        [
          'pack',
          'inverter',
          'motor',
          'obc',
          'dcdc',
          'battery-12v',
          'charge-port',
          'hv-cables',
        ].includes(id)
      ) {
        expect(part?.visible).toBe(false);
      }
    }

    const size = new Box3().setFromObject(car).getSize(new Vector3());
    expect(size.x).toBeCloseTo(vehicleParams.lengthM, 2);
    expect(size.y).toBeCloseTo(vehicleParams.heightM, 2);
    expect(size.z).toBeCloseTo(vehicleParams.widthM, 2);
    const front = car.getObjectByName('wheel-front-left')!;
    const back = car.getObjectByName('wheel-back-left')!;
    expect(front.position.x - back.position.x).toBeCloseTo(vehicleParams.wheelbaseM, 2);
    const tyre = (front.children[0] as Mesh).geometry;
    tyre.computeBoundingBox();
    expect(tyre.boundingBox!.max.x - tyre.boundingBox!.min.x).toBeCloseTo(
      vehicleParams.wheelRadiusM * 2,
      2,
    );
    let triangles = 0;
    let drawCalls = 0;
    car.traverse((node) => {
      if (node instanceof Mesh) {
        if (node.visible && node.parent?.visible) drawCalls++;
        const geometry = node.geometry;
        triangles += geometry.index
          ? geometry.index.count / 3
          : geometry.attributes.position.count / 3;
      }
    });
    expect(triangles).toBeLessThan(30_000);
    expect(drawCalls).toBeLessThan(20);
  });
});
