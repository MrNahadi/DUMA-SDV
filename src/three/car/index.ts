import {
  BoxGeometry,
  BufferGeometry,
  CircleGeometry,
  CylinderGeometry,
  DoubleSide,
  ExtrudeGeometry,
  Float32BufferAttribute,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  Path,
  Shape,
  SphereGeometry,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CAR_BODY, V_CORNER, V_CREASE, V_SHOULDER, V_SIDE, V_TRIM, carShape, type CarBody, type CarShape } from './shape';
export { CAR_BODY } from './shape';
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

/** Paint and trim colours (ADR 0014): white clearcoat body, dark glasshouse and cladding. */
export const carColours = {
  paint: '#f3f3f0',
  glass: '#20272d',
  trim: '#1b1e21',
  tyre: '#16181a',
  rim: '#c9cdd1',
  lamp: '#eef4f6',
  lampGlow: '#dff1ff',
  tail: '#5a1512',
  tailGlow: '#ff2a1f',
} as const;

/** Local axes: X is forward, Y is up, Z is left. Ground is Y=0. */
export function buildCar(params: Readonly<CarBody> = CAR_BODY): Group {
  const shape = carShape(params);
  const car = new Group();
  car.name = 'car';

  // Standard materials only: no environment map or clearcoat, to hold 60 fps on integrated graphics.
  const paint = new MeshStandardMaterial({ color: carColours.paint, metalness: 0, roughness: 0.34 });
  const trim = new MeshStandardMaterial({ color: carColours.trim, roughness: 0.62, metalness: 0.1 });
  const trimOverlay = trim.clone();
  trimOverlay.side = DoubleSide;
  const glass = new MeshStandardMaterial({ color: carColours.glass, metalness: 0, roughness: 0.18 });
  const rubber = new MeshStandardMaterial({ color: carColours.tyre, roughness: 0.9 });
  const rimMetal = new MeshStandardMaterial({ color: carColours.rim, metalness: 0.15, roughness: 0.35 });
  const lamp = new MeshStandardMaterial({
    color: carColours.lamp,
    emissive: carColours.lampGlow,
    emissiveIntensity: 0,
    roughness: 0.2,
    side: DoubleSide,
  });
  const rearLamp = new MeshStandardMaterial({
    color: carColours.tail,
    emissive: carColours.tailGlow,
    emissiveIntensity: 0,
    roughness: 0.25,
    side: DoubleSide,
  });

  const body = new Mesh(buildBody(shape), [paint, trim]);
  body.name = 'body';
  body.castShadow = true;
  car.add(body);

  const greenhouse = new Mesh(buildGreenhouse(shape), glass);
  greenhouse.name = 'glass';
  greenhouse.castShadow = true;
  car.add(greenhouse);

  const mirrors = new Mesh(buildMirrors(shape), glass);
  mirrors.name = 'mirrors';
  car.add(mirrors);

  const { xNose, xTail } = shape;
  // Dark lower front intake laid over the bumper along its outline, tapering round the corners.
  const trimDetails = new Mesh(
    mergeGeometries(
      ([1, -1] as const).map((side) => contourStrip(shape, 'front', 0.3, side, (t) => [0.42 + 0.04 * t * t, 0.535 - 0.025 * t], 0.004)),
    ),
    trimOverlay,
  );
  trimDetails.name = 'trim-details';
  car.add(trimDetails);

  // Dark wheel-well liners so the far side's bodywork never shows through an arch.
  const wells = new Mesh(
    mergeGeometries(
      shape.axleX.map((ax) => {
        const liner = new CylinderGeometry(shape.archRadius - 0.01, shape.archRadius - 0.01, params.widthM * 0.9, 24, 1, true, -Math.PI / 2, Math.PI);
        // The open half-cylinder's axis runs across the car; its arc covers the top of the arch.
        liner.rotateX(-Math.PI / 2);
        liner.translate(ax, shape.archCentreY, 0);
        return liner.toNonIndexed();
      }),
    ),
    trimOverlay,
  );
  wells.name = 'wheel-wells';
  car.add(wells);
  // Slim wedge headlamps high on the front corners (blueprint: 0.70–0.84 m), a dark lens with a bright LED line.
  const lampTop = (x: number, u: number) => Math.min(shape.section(x).yShoulder - 0.012, 0.8 + 0.05 * u);
  const lens = new Mesh(
    mergeGeometries(
      ([1, -1] as const).map((side) =>
        surfaceStrip(shape, xNose - 0.02, xNose - 0.36, side, (x, u) => [lampTop(x, u) - 0.035 - 0.04 * u ** 1.2, lampTop(x, u)], 0.003),
      ),
    ),
    glass,
  );
  lens.name = 'lamp-lenses';
  car.add(lens);
  const headlights = new Mesh(
    mergeGeometries(
      ([1, -1] as const).map((side) =>
        surfaceStrip(shape, xNose - 0.035, xNose - 0.34, side, (x, u) => [lampTop(x, u) - 0.018 - 0.012 * u, lampTop(x, u) - 0.007], 0.005),
      ),
    ),
    lamp,
  );
  headlights.name = 'headlights';
  car.add(headlights);

  // Full-width tail-lamp bar under the deck lip (blueprint: 0.89–0.97 m), wrapping onto the rear quarters.
  const brakeLights = new Mesh(
    mergeGeometries(
      ([1, -1] as const).map((side) => contourStrip(shape, 'rear', 0.6, side, (t) => [0.895 + 0.02 * t, 0.957], 0.004)),
    ),
    rearLamp,
  );
  brakeLights.name = 'brake-lights';
  car.add(brakeLights);

  const radius = params.wheelRadiusM;
  const tyreHalf = 0.118;
  const tyreGeometry = buildTyre(radius, tyreHalf);
  const rimGeometry = buildRim(radius * 0.755, tyreHalf);
  for (const [axle, x] of [
    ['front', shape.axleX[0]],
    ['back', shape.axleX[1]],
  ] as const) {
    for (const [side, sign] of [
      ['left', 1],
      ['right', -1],
    ] as const) {
      const wheel = new Group();
      wheel.name = `wheel-${axle}-${side}` satisfies CarPart;
      wheel.position.set(x, radius, sign * (params.widthM / 2 - tyreHalf - 0.02));
      // The wheel group spins about its local Z; the hub is flipped on the right so the rim faces out.
      const tyre = new Mesh(tyreGeometry, rubber);
      tyre.castShadow = true;
      const rim = new Mesh(rimGeometry, rimMetal);
      if (sign < 0) rim.rotation.y = Math.PI;
      wheel.add(tyre, rim);
      car.add(wheel);
    }
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
    ['battery-12v', xNose * 0.7, radius * 1.4, 0, 0.25, 0.18, 0.18],
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

  // Charge port on the left rear quarter, set into the body side.
  const portX = xTail * 0.7;
  const [, portY, portZ] = shape.point(portX, (V_SIDE + V_SHOULDER) / 2 + 0.07, 1);
  const port = new Group();
  port.name = 'charge-port';
  port.position.set(portX, portY, portZ - 0.012);
  const socket = new Mesh(new BoxGeometry(0.17, 0.13, 0.015), trim);
  port.add(socket);
  const flap = new Mesh(new BoxGeometry(0.19, 0.15, 0.012), paint);
  flap.name = 'port-flap';
  flap.position.z = 0.012;
  port.add(flap);
  const plug = new Mesh(new BoxGeometry(0.13, 0.1, 0.1), rimMetal);
  plug.name = 'port-plug';
  plug.position.z = 0.06;
  plug.visible = false;
  port.add(plug);
  const marker = new Mesh(new BoxGeometry(0.035, 0.12, 0.012), lamp);
  marker.name = 'port-charging-marker';
  marker.position.set(0, 0, 0.118);
  marker.rotation.z = -0.35;
  marker.visible = false;
  port.add(marker);
  car.add(port);
  return car;
}

/** Ring parameters for the body loft: centre bottom, round the side, centre top. */
function bodyRing(): number[] {
  const band = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => from + ((to - from) * i) / n);
  return [
    ...band(0, V_CORNER, 2),
    ...band(V_CORNER, V_TRIM, 3),
    ...band(V_TRIM, V_SIDE, 2),
    ...band(V_SIDE, V_CREASE, 5),
    ...band(V_CREASE, V_SHOULDER, 5),
    ...band(V_SHOULDER, 1, 9),
    1,
  ];
}

/** Stations nose to tail, denser at the ends, with doubled stations at each wheel-arch edge. */
function bodyStations(shape: CarShape): number[] {
  const count = 92;
  const xs: number[] = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    // Ease so the nose and tail get more stations than the flat middle.
    const e = t - Math.sin(2 * Math.PI * t) * 0.11;
    xs.push(shape.xNose + (shape.xTail - shape.xNose) * e);
  }
  // Extra stations through each arch's ends, where the underside turns sharply.
  for (const ax of shape.axleX) {
    for (const edge of [ax - shape.archRadius, ax + shape.archRadius]) {
      for (let k = -4; k <= 4; k++) xs.push(edge + k * 0.02);
    }
  }
  // The end stations sit exactly at the nose and tail, where the plan width closes to zero.
  return [...new Set(xs)].sort((a, b) => b - a);
}

/** Loft the body. Group 0 is paint, group 1 is dark cladding (everything below V_SIDE). */
function buildBody(shape: CarShape): BufferGeometry {
  const ring = bodyRing();
  const stations = bodyStations(shape);
  const positions: number[] = [];
  // Full ring: left side v ascending, then right side v descending (shared centre points).
  const full: Array<[number, 1 | -1]> = [
    ...ring.map((v) => [v, 1] as [number, 1]),
    ...ring.slice(1, -1).reverse().map((v) => [v, -1] as [number, -1]),
  ];
  for (const x of stations) {
    for (const [v, side] of full) positions.push(...shape.point(x, v, side));
  }
  const n = full.length;
  const paintIdx: number[] = [];
  const trimIdx: number[] = [];
  for (let s = 0; s < stations.length - 1; s++) {
    for (let k = 0; k < n; k++) {
      const a = s * n + k;
      const b = s * n + ((k + 1) % n);
      const c = a + n;
      const d = b + n;
      const vMid = (full[k]![0] + full[(k + 1) % n]![0]) / 2;
      (shape.isTrim((stations[s]! + stations[s + 1]!) / 2, vMid) ? trimIdx : paintIdx).push(a, b, c, b, d, c);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex([...paintIdx, ...trimIdx]);
  geometry.addGroup(0, paintIdx.length, 0);
  geometry.addGroup(paintIdx.length, trimIdx.length, 1);
  geometry.computeVertexNormals();
  return geometry;
}

/** Loft the one-piece dark glasshouse from the scuttle to the rear deck. Open underneath. */
function buildGreenhouse(shape: CarShape): BufferGeometry {
  const { glass } = shape;
  const count = 58;
  const sideRows = 5;
  const roofRows = 12;
  const positions: number[] = [];
  const rowsPerSide = sideRows + roofRows;
  for (let i = 0; i <= count; i++) {
    const x = glass.xFront + ((glass.xRear - glass.xFront) * i) / count;
    const gwB = glass.baseHalfWidth(x);
    const baseY = shape.topY(x, gwB) - 0.012;
    const roof = Math.max(glass.roofY(x), baseY);
    const h = roof - baseY;
    const gwT = Math.min(glass.roofHalfWidth(x), gwB);
    const rr = Math.min(0.1, h * 0.35);
    const ring: Array<[number, number]> = [];
    for (let k = 0; k <= sideRows; k++) {
      const u = k / sideRows;
      ring.push([baseY + (h - rr) * u, gwB + (gwT - gwB) * Math.pow(u, 1.15)]);
    }
    for (let k = 1; k <= roofRows; k++) {
      const a = (k / roofRows) * (Math.PI / 2);
      ring.push([roof - rr + rr * Math.pow(Math.sin(a), 2 / 2.4), gwT * Math.pow(Math.cos(a), 2 / 2.4)]);
    }
    // Left side bottom→top, then right side top→bottom (centre shared).
    for (let k = 1; k < ring.length; k++) ring[k]![0] = Math.max(ring[k]![0], shape.topY(x, ring[k]![1]) + 0.003);
    for (const [y, z] of ring) positions.push(x, y, z);
    for (let k = ring.length - 2; k >= 0; k--) positions.push(x, ring[k]![0], -ring[k]![1]);
  }
  const n = rowsPerSide * 2 + 1;
  const index: number[] = [];
  for (let s = 0; s < count; s++) {
    for (let k = 0; k < n - 1; k++) {
      const a = s * n + k;
      const b = a + 1;
      const c = a + n;
      const d = b + n;
      index.push(a, b, c, b, d, c);
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

/** A thin light strip laid just proud of the body between stations x0 and x1. */
function surfaceStrip(
  shape: CarShape,
  x0: number,
  x1: number,
  side: 1 | -1,
  /** Bottom and top height of the strip at station x (u runs 0→1 from x0 to x1). */
  band: (x: number, u: number) => [number, number],
  offset: number,
): BufferGeometry {
  const steps = 28;
  const positions: number[] = [];
  const normalAt = (x: number, v: number) => {
    const p = new Vector3(...shape.point(x, v, side));
    const dx = new Vector3(...shape.point(x + 0.002, v, side)).sub(p);
    const dv = new Vector3(...shape.point(x, v + 0.002, side)).sub(p);
    const nrm = dx.cross(dv).normalize();
    return side > 0 ? nrm : nrm.negate();
  };
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const x = x0 + (x1 - x0) * u;
    for (const y of band(x, u)) {
      const v = shape.vAtY(x, y);
      const p = new Vector3(...shape.point(x, v, side));
      p.addScaledVector(normalAt(x, v), offset);
      positions.push(p.x, p.y, p.z);
    }
  }
  // Wind the strip so its faces point away from the body, whichever way x0→x1 runs.
  const at = (i: number) => new Vector3(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
  const face = at(2).sub(at(0)).cross(at(1).sub(at(0)));
  const outward = face.dot(normalAt(x0, shape.vAtY(x0, band(x0, 0)[0]))) > 0;
  const index: number[] = [];
  for (let i = 0; i < steps; i++) {
    const a = i * 2;
    if (outward) index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    else index.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry.toNonIndexed();
}

/** Outline point of the body at height y: across the end face by z, then back along the side by x. */
function outlinePoint(shape: CarShape, end: 'front' | 'rear', y: number, t: number, depth: number): Vector3 | null {
  const dir = end === 'front' ? -1 : 1;
  const x0 = end === 'front' ? shape.xNose : shape.xTail;
  const faceDepth = 0.22;
  const xFace = x0 + dir * faceDepth;
  const zFace = shape.outerZ(xFace, y);
  if (zFace === null) return null;
  const faceShare = 0.45;
  if (t <= faceShare) {
    // Bisect along x for the station where the outline reaches this z.
    const z = zFace * (t / faceShare);
    let lo = 0;
    let hi = faceDepth;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      const zm = shape.outerZ(x0 + dir * mid, y) ?? -1;
      if (zm < z) lo = mid;
      else hi = mid;
    }
    return new Vector3(x0 + dir * hi, y, z);
  }
  const x = xFace + dir * (depth - faceDepth) * ((t - faceShare) / (1 - faceShare));
  const z = shape.outerZ(x, y);
  return z === null ? null : new Vector3(x, y, z);
}

/**
 * A band following the body's outline between two heights, from the centre of the nose or
 * tail, round the corner and back along the side for `depth` metres (depth ≥ 0.22).
 */
function contourStrip(
  shape: CarShape,
  end: 'front' | 'rear',
  depth: number,
  side: 1 | -1,
  band: (t: number) => [number, number],
  offset: number,
): BufferGeometry {
  const dir = end === 'front' ? -1 : 1;
  const samples = 96;
  const rows: Array<[Vector3, Vector3]> = [];
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const [yLow, yHigh] = band(t);
    const low = outlinePoint(shape, end, yLow, t, depth);
    const high = outlinePoint(shape, end, yHigh, t, depth);
    if (low && high) rows.push([low.setZ(side * low.z), high.setZ(side * high.z)]);
  }
  // Push each row off the surface along the outline's in-plane normal.
  const positions: number[] = [];
  for (let i = 0; i < rows.length; i++) {
    const prev = rows[Math.max(i - 1, 0)]![0];
    const next = rows[Math.min(i + 1, rows.length - 1)]![0];
    const tangent = next.clone().sub(prev).setY(0).normalize();
    const normal = new Vector3(tangent.z, 0, -tangent.x);
    // Outward points away from a reference point 1 m inside the end, on the centreline.
    const inside = new Vector3((end === 'front' ? shape.xNose : shape.xTail) + dir * 1, 0, 0);
    if (normal.dot(rows[i]![0].clone().setY(0).sub(inside)) < 0) normal.negate();
    for (const p of rows[i]!) {
      const q = p.clone().addScaledVector(normal, offset);
      positions.push(q.x, q.y, q.z);
    }
  }
  const index: number[] = [];
  for (let i = 0; i < rows.length - 1; i++) {
    const a = i * 2;
    index.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry.toNonIndexed();
}

function buildMirrors(shape: CarShape): BufferGeometry {
  const parts: BufferGeometry[] = [];
  const x = shape.glass.xFront - 0.35;
  for (const side of [1, -1] as const) {
    const [, y, z] = shape.point(x, V_SHOULDER + 0.06, side);
    const head = new SphereGeometry(0.1, 20, 12);
    head.scale(0.62, 0.42, 0.95);
    head.translate(x - 0.03, y + 0.09, z + side * 0.07);
    const arm = new CylinderGeometry(0.014, 0.018, 0.09, 8);
    arm.rotateX((side * Math.PI) / 2.4);
    arm.translate(x, y + 0.05, z + side * 0.015);
    parts.push(head.toNonIndexed(), arm.toNonIndexed());
  }
  return mergeGeometries(parts.map((g) => {
    g.deleteAttribute('uv');
    return g;
  }));
}

/** Tyre with rounded shoulders, plus a dark back plate so the spokes read against shadow. */
function buildTyre(radius: number, half: number): BufferGeometry {
  const rin = radius * 0.77;
  const profile = [
    [rin, -half * 0.92],
    [radius * 0.92, -half],
    [radius * 0.965, -half * 0.94],
    [radius * 0.993, -half * 0.8],
    [radius, -half * 0.5],
    [radius, half * 0.5],
    [radius * 0.993, half * 0.8],
    [radius * 0.965, half * 0.94],
    [radius * 0.92, half],
    [rin, half * 0.92],
  ].map(([rr, y]) => new Vector2(rr, y));
  const tyre = new LatheGeometry(profile, 40);
  tyre.rotateX(Math.PI / 2);
  const back = new CircleGeometry(rin, 32);
  back.translate(0, 0, -half * 0.2);
  const barrel = new CylinderGeometry(rin, rin, half * 1.6, 32, 1, true);
  barrel.rotateX(Math.PI / 2);
  return mergeGeometries([tyre.toNonIndexed(), back.toNonIndexed(), barrel.toNonIndexed()]);
}

/** Ten-slot turbine rim face, extruded, sitting just inside the tyre sidewall. */
function buildRim(radius: number, tyreHalf: number): BufferGeometry {
  const face = new Shape();
  face.absarc(0, 0, radius, 0, Math.PI * 2, false);
  const spokes = 10;
  const inner = radius * 0.3;
  const outer = radius * 0.9;
  const twist = 0.42;
  for (let i = 0; i < spokes; i++) {
    const a0 = (i / spokes) * Math.PI * 2;
    const slotIn = (Math.PI * 2) / spokes - 0.26;
    const slotOut = (Math.PI * 2) / spokes - 0.12;
    const hole = new Path();
    const steps = 6;
    for (let k = 0; k <= steps; k++) {
      const a = a0 + (slotIn * k) / steps;
      const pt = [inner * Math.cos(a), inner * Math.sin(a)] as const;
      if (k === 0) hole.moveTo(pt[0], pt[1]);
      else hole.lineTo(pt[0], pt[1]);
    }
    for (let k = steps; k >= 0; k--) {
      const a = a0 + twist + (slotOut * k) / steps - (slotOut - slotIn) / 2;
      hole.lineTo(outer * Math.cos(a), outer * Math.sin(a));
    }
    hole.closePath();
    face.holes.push(hole);
  }
  const geometry = new ExtrudeGeometry(face, {
    depth: 0.03,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.006,
    bevelSegments: 1,
    curveSegments: 24,
  });
  geometry.translate(0, 0, tyreHalf * 0.55);
  return geometry;
}
