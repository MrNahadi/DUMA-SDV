import {
  BoxGeometry,
  CylinderGeometry,
  ExtrudeGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Shape,
} from 'three';
import type { VehicleParams } from '../../sim/vehicle/params';

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
  const paint = new MeshStandardMaterial({ color: '#273841', metalness: 0.35, roughness: 0.52 });
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

  const profile = new Shape();
  profile.moveTo(-halfLength, radius * 0.65);
  profile.lineTo(-halfLength, shoulder * 0.82);
  profile.quadraticCurveTo(-halfLength * 0.92, shoulder, -halfLength * 0.75, shoulder);
  profile.lineTo(halfLength * 0.82, shoulder);
  profile.quadraticCurveTo(halfLength, shoulder, halfLength, shoulder * 0.79);
  profile.lineTo(halfLength, radius * 0.65);
  profile.lineTo(-halfLength, radius * 0.65);
  const shell = new Mesh(
    new ExtrudeGeometry(profile, {
      depth: params.widthM * 0.87,
      bevelEnabled: false,
      curveSegments: 8,
    }),
    paint,
  );
  shell.position.z = (-params.widthM * 0.87) / 2;
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
    ['charge-port', -halfLength * 0.7, shoulder * 0.85, halfWidth * 0.75, 0.08, 0.11, 0.08],
    ['hv-cables', 0, radius * 1.02, 0, params.wheelbaseM * 0.7, 0.035, 0.035],
  ];
  for (const [name, x, y, z, sx, sy, sz] of modules) {
    const part = new Mesh(new BoxGeometry(sx, sy, sz), hiddenMaterial);
    part.name = name;
    part.visible = false;
    part.position.set(x, y, z);
    internal.add(part);
  }
  car.add(internal);
  return car;
}
