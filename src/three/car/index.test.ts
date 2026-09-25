import { describe, expect, it } from 'vitest';
import { Box3, Mesh, MeshPhysicalMaterial, Vector3 } from 'three';
import { vehicleParams } from '../../sim/vehicle/params';
import { buildCar, carParts } from './index';

describe('procedural car', () => {
  it('exposes every part in solid mode and matches vehicle dimensions', () => {
    const car = buildCar(vehicleParams);
    for (const id of carParts) {
      const part = car.getObjectByName(id);
      expect(part, id).toBeDefined();
      if (id === 'charge-port') {
        expect(part?.visible).toBe(true);
        expect(part?.getObjectByName('port-flap')).toBeDefined();
        expect(part?.getObjectByName('port-plug')).toBeDefined();
        expect(part?.getObjectByName('port-charging-marker')).toBeDefined();
        continue;
      }
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

  it('lofts one smooth clearcoated body hull with raised arches', () => {
    const car = buildCar(vehicleParams);
    const bodies: Mesh[] = [];
    car.traverse((node) => {
      if (node.name === 'body') bodies.push(node as Mesh);
    });
    expect(bodies).toHaveLength(1);
    const body = bodies[0]!;
    expect(body).toBeInstanceOf(Mesh);
    expect(body.geometry.index).not.toBeNull();
    expect(body.geometry.attributes.normal).toBeDefined();
    body.geometry.computeBoundingBox();
    const size = body.geometry.boundingBox!.getSize(new Vector3());
    expect(Math.abs(size.x / vehicleParams.lengthM - 1)).toBeLessThan(0.02);
    expect(Math.abs(size.z / vehicleParams.widthM - 1)).toBeLessThan(0.02);
    expect(Math.abs(body.geometry.boundingBox!.max.y / vehicleParams.heightM - 1)).toBeLessThan(
      0.02,
    );

    const position = body.geometry.getAttribute('position');
    const lowest = (from: number, to: number) => {
      let min = Infinity;
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i) + body.position.x;
        if (x >= from && x <= to) min = Math.min(min, position.getY(i) + body.position.y);
      }
      return min;
    };
    const half = vehicleParams.wheelbaseM / 2;
    const between = lowest(-0.3, 0.3);
    expect(lowest(half - 0.1, half + 0.1)).toBeGreaterThan(between);
    expect(lowest(-half - 0.1, -half + 0.1)).toBeGreaterThan(between);

    const paint = body.material as MeshPhysicalMaterial;
    expect(paint).toBeInstanceOf(MeshPhysicalMaterial);
    expect(paint.clearcoat).toBeGreaterThan(0);
    expect(paint.transmission).toBe(0);
  });
});
