import { describe, expect, it } from 'vitest';
import { Box3, Mesh, MeshStandardMaterial, Vector3, type Material } from 'three';
import { vehicleParams } from '../../sim/vehicle/params';
import { buildCar, carParts } from './index';
import { carShape } from './shape';

const sizeOf = (name: string) => {
  const car = buildCar();
  return new Box3().setFromObject(car.getObjectByName(name)!).getSize(new Vector3());
};

describe('procedural car', () => {
  it('exposes every part, with internals hidden in solid mode', () => {
    const car = buildCar();
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
      if (['pack', 'inverter', 'motor', 'obc', 'dcdc', 'battery-12v', 'hv-cables'].includes(id)) {
        expect(part?.visible).toBe(false);
      }
    }
  });

  it('matches the reference car: length and width from the body, height at the roof, wheelbase and tyres', () => {
    const body = sizeOf('body');
    expect(body.x).toBeCloseTo(vehicleParams.lengthM, 2);
    expect(body.z).toBeCloseTo(vehicleParams.widthM, 2);
    const car = buildCar();
    const glass = new Box3().setFromObject(car.getObjectByName('glass')!);
    expect(glass.max.y).toBeCloseTo(vehicleParams.heightM, 2);
    const front = car.getObjectByName('wheel-front-left')!;
    const back = car.getObjectByName('wheel-back-left')!;
    expect(front.position.x - back.position.x).toBeCloseTo(vehicleParams.wheelbaseM, 5);
    const tyre = (front.children[0] as Mesh).geometry;
    tyre.computeBoundingBox();
    expect(tyre.boundingBox!.max.x - tyre.boundingBox!.min.x).toBeCloseTo(vehicleParams.wheelRadiusM * 2, 3);
  });

  it('stays within the triangle and draw-call budget (ADR 0002)', () => {
    const car = buildCar();
    let triangles = 0;
    let drawCalls = 0;
    car.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      const geometry = node.geometry;
      triangles += geometry.index ? geometry.index.count / 3 : geometry.attributes.position!.count / 3;
      let visible = node.visible;
      for (let p = node.parent; p; p = p.parent) visible &&= p.visible;
      if (visible) drawCalls += Array.isArray(node.material) ? geometry.groups.length : 1;
    });
    expect(triangles).toBeLessThan(30_000);
    expect(drawCalls).toBeLessThan(20);
  });

  it('lofts one smooth body with raised wheel arches and dark cladding', () => {
    const car = buildCar();
    const body = car.getObjectByName('body') as Mesh;
    expect(body.geometry.index).not.toBeNull();
    expect(body.geometry.attributes.normal).toBeDefined();
    const [paint, trim] = body.material as Material[];
    expect(paint).toBeInstanceOf(MeshStandardMaterial);
    expect(trim).toBeDefined();
    expect(body.geometry.groups).toHaveLength(2);

    const position = body.geometry.getAttribute('position');
    const lowest = (from: number, to: number) => {
      let min = Infinity;
      for (let i = 0; i < position.count; i++) {
        const x = position.getX(i);
        if (x >= from && x <= to) min = Math.min(min, position.getY(i));
      }
      return min;
    };
    const half = vehicleParams.wheelbaseM / 2;
    const between = lowest(-0.3, 0.3);
    expect(lowest(half - 0.05, half + 0.05)).toBeGreaterThan(vehicleParams.wheelRadiusM * 2);
    expect(lowest(-half - 0.05, -half + 0.05)).toBeGreaterThan(vehicleParams.wheelRadiusM * 2);
    expect(between).toBeLessThan(0.25);
  });

  it('keeps the glasshouse inside the body plan and above the beltline', () => {
    const shape = carShape();
    for (let x = shape.glass.xRear; x <= shape.glass.xFront; x += 0.1) {
      expect(shape.glass.baseHalfWidth(x)).toBeLessThan(shape.section(x).hw);
      expect(shape.glass.roofY(x)).toBeGreaterThanOrEqual(shape.topY(x, shape.glass.baseHalfWidth(x)) - 0.02);
    }
  });
});
