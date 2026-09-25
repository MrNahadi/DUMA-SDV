import {
  BoxGeometry,
  BufferGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Float32BufferAttribute,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Shape,
} from 'three';
import type { VehicleParams } from '../../sim/vehicle/params';
export { applyCarVisualState, visualStateFromSnapshot } from './animation';

export const carParts = [
  'body',
  'glass',
  'wheel-front-left',
  'wheel-front-right',
  'wheel-back-left',
  'wheel-back-right',
  'headlights',
  'brake-lights',
  'pack',
  'inverter',
  'motor',
  'obc',
  'dcdc',
  'battery-12v',
  'charge-port',
  'hv-cables',
] as const;
export type CarPart = (typeof carParts)[number];

/** Local axes: X is forward, Y is up, Z is left. Ground is Y=0. */
export function buildCar(params: Readonly<VehicleParams>): Group {
  const car = new Group();
  car.name = 'car';
  const paint = new MeshPhysicalMaterial({
    color: '#273841',
    metalness: 0.45,
    roughness: 0.38,
    clearcoat: 0.8,
    clearcoatRoughness: 0.12,
  });
  const glass = new MeshStandardMaterial({ color: '#15252e', metalness: 0.14, roughness: 0.34 });
  const rubber = new MeshStandardMaterial({ color: '#13191c', roughness: 0.94 });
  const metal = new MeshStandardMaterial({ color: '#8b9698', metalness: 0.7, roughness: 0.42 });
  const lamp = new MeshStandardMaterial({
    color: '#d8e9e6',
    emissive: '#adc9c2',
    emissiveIntensity: 0,
  });
  const rearLamp = new MeshStandardMaterial({
    color: '#873329',
    emissive: '#e93422',
    emissiveIntensity: 0,
  });
  const halfLength = params.lengthM / 2;
  const halfWidth = params.widthM / 2;
  const radius = params.wheelRadiusM;
  const shoulder = Math.min(params.heightM * 0.53, radius * 2.5);

  const shell = new Mesh(buildHull(params, shoulder), paint.clone());
  shell.name = 'body';
  car.add(shell);

  const cabin = new Shape();
  cabin.moveTo(-halfLength * 0.52, shoulder);
  cabin.lineTo(-halfLength * 0.24, params.heightM);
  cabin.lineTo(halfLength * 0.35, params.heightM);
  cabin.lineTo(halfLength * 0.7, shoulder);
  cabin.closePath();
  const windows = new Mesh(
    new ExtrudeGeometry(cabin, { depth: params.widthM * 0.76, bevelEnabled: false }),
    glass,
  );
  windows.position.z = (-params.widthM * 0.76) / 2;
  windows.name = 'glass';
  car.add(windows);

  const tireWidth = params.widthM * 0.115;
  const tyreGeometry = new CylinderGeometry(radius, radius, tireWidth, 24);
  tyreGeometry.rotateX(Math.PI / 2);
  const rimGeometry = new CylinderGeometry(radius * 0.58, radius * 0.58, tireWidth + 0.002, 16);
  rimGeometry.rotateX(Math.PI / 2);
  for (const [axle, x] of [
    ['front', params.wheelbaseM / 2],
    ['back', -params.wheelbaseM / 2],
  ] as const) {
    for (const [side, sign] of [
      ['left', 1],
      ['right', -1],
    ] as const) {
      const wheel = new Group();
      wheel.name = `wheel-${axle}-${side}` satisfies CarPart;
      wheel.position.set(x, radius, sign * (halfWidth - tireWidth / 2));
      wheel.add(new Mesh(tyreGeometry, rubber));
      wheel.add(new Mesh(rimGeometry, metal));
      car.add(wheel);
    }
  }

  for (const [name, x, material] of [
    ['headlights', halfLength - 0.012, lamp],
    ['brake-lights', -halfLength + 0.012, rearLamp],
  ] as const) {
    const bar = new Mesh(new BoxGeometry(0.024, 0.045, params.widthM * 0.72), material);
    bar.position.set(x, shoulder * 0.91, 0);
    bar.name = name;
    car.add(bar);
  }

  const internal = new Group();
  internal.visible = false;
  internal.name = 'internals';
  const hiddenMaterial = new MeshStandardMaterial({ color: '#86aeb8', metalness: 0.35 });
  const modules: ReadonlyArray<[CarPart, number, number, number, number, number, number]> = [
    ['pack', 0, radius * 0.66, 0, params.wheelbaseM * 0.62, 0.12, params.widthM * 0.65],
    ['inverter', -params.wheelbaseM * 0.34, radius * 1.28, 0, 0.38, 0.18, 0.42],
    ['motor', -params.wheelbaseM * 0.42, radius, 0, 0.32, 0.3, 0.45],
    ['obc', 0.5, radius * 1.25, 0, 0.35, 0.15, 0.32],
    ['dcdc', -0.45, radius * 1.25, 0, 0.25, 0.14, 0.25],
    ['battery-12v', halfLength * 0.7, radius * 1.4, 0, 0.25, 0.18, 0.18],
    ['hv-cables', 0, radius * 1.02, 0, params.wheelbaseM * 0.7, 0.035, 0.035],
  ];
  for (const [name, x, y, z, sx, sy, sz] of modules) {
    const part = new Mesh(new BoxGeometry(sx, sy, sz), hiddenMaterial.clone());
    part.name = name;
    part.visible = false;
    part.position.set(x, y, z);
    internal.add(part);
  }
  car.add(internal);
  const port = new Group();
  port.name = 'charge-port';
  port.position.set(-halfLength * 0.7, shoulder * 0.85, halfWidth * 0.84);
  const socket = new Mesh(new BoxGeometry(0.19, 0.15, 0.015), rubber);
  port.add(socket);
  const flap = new Mesh(new BoxGeometry(0.21, 0.17, 0.02), paint);
  flap.name = 'port-flap';
  flap.position.z = 0.02;
  port.add(flap);
  const plug = new Mesh(new BoxGeometry(0.13, 0.1, 0.1), metal);
  plug.name = 'port-plug';
  plug.position.z = 0.065;
  plug.visible = false;
  port.add(plug);
  const marker = new Mesh(new BoxGeometry(0.035, 0.12, 0.012), lamp);
  marker.name = 'port-charging-marker';
  marker.position.set(0, 0, 0.123);
  marker.rotation.z = -0.35;
  marker.visible = false;
  port.add(marker);
  car.add(port);
  return car;
}

const HULL_STATIONS = 49;
const HULL_RING = 40;

/** Piecewise smoothstep through [t, value] keys sorted by t. */
function smoothKeys(keys: ReadonlyArray<readonly [number, number]>, t: number): number {
  for (let i = 1; i < keys.length; i++) {
    const [t1, v1] = keys[i]!;
    const [t0, v0] = keys[i - 1]!;
    if (t <= t1) {
      const u = Math.min(Math.max((t - t0) / (t1 - t0), 0), 1);
      return v0 + (v1 - v0) * u * u * (3 - 2 * u);
    }
  }
  return keys[keys.length - 1]![1];
}

/**
 * Lofted superellipse hull. Stations run nose (+X) to tail (-X); each ring
 * narrows above the beltline (tumblehome) and its bottom rises over each axle
 * to form the wheel arches.
 */
function buildHull(params: Readonly<VehicleParams>, shoulder: number): BufferGeometry {
  const halfLength = params.lengthM / 2;
  const halfWidth = params.widthM / 2;
  const radius = params.wheelRadiusM;
  const height = params.heightM;
  const sill = radius * 0.55;
  const roofKeys = [
    [-1, shoulder * 0.88],
    [-0.75, shoulder * 1.08],
    [-0.35, height * 0.93],
    [-0.1, height],
    [0.2, height * 0.97],
    [0.45, shoulder * 1.02],
    [0.8, shoulder * 0.9],
    [1, shoulder * 0.74],
  ] as const;
  const archHalf = radius * 1.2;
  const positions: number[] = [];
  for (let s = 0; s < HULL_STATIONS; s++) {
    const t = 1 - (2 * s) / (HULL_STATIONS - 1);
    const x = t * halfLength;
    const end = Math.pow(1 - Math.pow(Math.abs(t), 6), 1 / 3);
    let bottom = sill;
    for (const axle of [params.wheelbaseM / 2, -params.wheelbaseM / 2]) {
      const d = (x - axle) / archHalf;
      if (Math.abs(d) < 1) bottom = Math.max(bottom, sill + radius * 0.75 * Math.sqrt(1 - d * d));
    }
    const top = smoothKeys(roofKeys, t);
    const centre = (top + bottom) / 2;
    const halfHeight = ((top - bottom) / 2) * Math.max(end, 0.02);
    const width = halfWidth * Math.max(end, 0.02);
    for (let r = 0; r < HULL_RING; r++) {
      const angle = (2 * Math.PI * r) / HULL_RING;
      const c = Math.cos(angle);
      const sn = Math.sin(angle);
      const tumble = 1 - 0.2 * Math.max(sn, 0) ** 2;
      positions.push(
        x,
        centre + halfHeight * Math.sign(sn) * Math.abs(sn) ** 0.5,
        width * tumble * Math.sign(c) * Math.abs(c) ** 0.4,
      );
    }
  }
  const index: number[] = [];
  for (let s = 0; s < HULL_STATIONS - 1; s++) {
    for (let r = 0; r < HULL_RING; r++) {
      const a = s * HULL_RING + r;
      const b = s * HULL_RING + ((r + 1) % HULL_RING);
      const c = a + HULL_RING;
      const d = b + HULL_RING;
      index.push(a, b, c, b, d, c);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}
