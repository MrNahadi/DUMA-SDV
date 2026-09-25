import { vehicleParams } from '../../sim/vehicle/params';

/** Size of a car body, in metres. */
export interface CarBody {
  lengthM: number;
  widthM: number;
  heightM: number;
  wheelbaseM: number;
  wheelRadiusM: number;
}

/** The 3D car is drawn at the reference car's size (ADR 0001), with the blueprint's shape (ADR 0014). */
export const CAR_BODY: CarBody = {
  lengthM: vehicleParams.lengthM,
  widthM: vehicleParams.widthM,
  heightM: vehicleParams.heightM,
  wheelbaseM: vehicleParams.wheelbaseM,
  wheelRadiusM: vehicleParams.wheelRadiusM,
};

/**
 * Analytic body surface for the procedural car (ADR 0014). Local axes: X forward,
 * Y up, Z left, ground at Y = 0, origin midway between the axles.
 *
 * A body cross-section at station x is a half ring parameterised by v in [0, 1],
 * from the underbody centre (v = 0) round the side to the top centre (v = 1).
 * Fixed v bands give clean material boundaries: below V_SIDE is dark cladding.
 */
export const V_CORNER = 0.12;
export const V_TRIM = 0.24;
export const V_SIDE = 0.36;
export const V_SHOULDER = 0.62;
/** The side's feature crease, as a fraction up the side band. */
const CREASE_U = 0.56;
export const V_CREASE = V_SIDE + CREASE_U * (V_SHOULDER - V_SIDE);

export interface BodySection {
  yBot: number;
  yTrim: number;
  /** Height of the side's feature crease. */
  yCrease: number;
  yShoulder: number;
  yTop: number;
  hw: number;
}

export interface CarShape {
  /** Front and rear extremes of the body along X (the overhangs differ). */
  xNose: number;
  xTail: number;
  axleX: readonly [number, number];
  archRadius: number;
  /** Height of the wheel-arch circle's centre. */
  archCentreY: number;
  /** True where a quad at station x and ring parameter v is dark cladding or intake. */
  isTrim(x: number, v: number): boolean;
  /** True where station x cuts through a wheel arch. */
  inArch(x: number): boolean;
  /** Body cross-section at station x. */
  section(x: number): BodySection;
  /** Body surface point [x, y, z] at station x, ring parameter v, on the left (+1) or right (-1). */
  point(x: number, v: number, side: 1 | -1): [number, number, number];
  /** Ring parameter on the outer side (between V_CORNER and V_SHOULDER) at height y. */
  vAtY(x: number, y: number): number;
  /** Outer half-width of the body at station x and height y, or null where y is off the section. */
  outerZ(x: number, y: number): number | null;
  /** Height of the body's upper surface at station x and lateral offset z. */
  topY(x: number, z: number): number;
  /** Greenhouse (glass and roof) profile. */
  glass: {
    xFront: number;
    xRear: number;
    roofY(x: number): number;
    baseHalfWidth(x: number): number;
    roofHalfWidth(x: number): number;
  };
}

/** Monotone cubic (Fritsch–Carlson) through [x, y] keys sorted by x: smooth, no overshoot. */
export function monotoneCurve(keys: ReadonlyArray<readonly [number, number]>): (x: number) => number {
  const n = keys.length;
  const xs = keys.map((k) => k[0]);
  const ys = keys.map((k) => k[1]);
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1]! - ys[i]!) / (xs[i + 1]! - xs[i]!));
  const m: number[] = [d[0]!];
  for (let i = 1; i < n - 1; i++) m.push(d[i - 1]! * d[i]! <= 0 ? 0 : (d[i - 1]! + d[i]!) / 2);
  m.push(d[n - 2]!);
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i]! / d[i]!;
    const b = m[i + 1]! / d[i]!;
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i]!;
      m[i + 1] = t * b * d[i]!;
    }
  }
  return (x) => {
    if (x <= xs[0]!) return ys[0]!;
    if (x >= xs[n - 1]!) return ys[n - 1]!;
    let i = 0;
    while (x > xs[i + 1]!) i++;
    const h = xs[i + 1]! - xs[i]!;
    const t = (x - xs[i]!) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i]! +
      (t3 - 2 * t2 + t) * h * m[i]! +
      (-2 * t3 + 3 * t2) * ys[i + 1]! +
      (t3 - t2) * h * m[i + 1]!
    );
  };
}

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.min(Math.max((x - e0) / (e1 - e0), 0), 1);
  return t * t * (3 - 2 * t);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Top shoulder roundness: superellipse exponent of the side-to-top quarter. */
const TOP_N = 4.2;
const CORNER_R = 0.05;

/**
 * Outlines traced from a dimensioned side / top blueprint of a fastback SUV-coupe
 * (ADR 0014), in drawing pixels. Only the shape is used: the wheelbase and wheel radius
 * come from the reference car, the overhangs are scaled so the length is lengthM, the
 * heights so the roof is heightM, and the widths so the widest point is widthM.
 * The front of the car is on the left of the drawing.
 */
const BLUEPRINT = {
  // Side view: nose, front axle, rear axle and tail along the drawing's x; ground and roof in y.
  side: { nose: 490, frontAxle: 627.7, rearAxle: 1075, tail: 1242, ground: 313, roof: 46 },
  // Top view: the same four stations, and the widest half-width, in pixels.
  plan: { nose: 507, frontAxle: 640.5, rearAxle: 1074.2, tail: 1236, maxHalf: 150 },
  /** Centreline top: hood, then beltline plus shoulder under the glass, rear deck lip, tail face. */
  top: [
    [490, 230], [494, 178], [498, 162], [500, 159], [510, 153], [540, 143], [600, 129], [650, 121],
    [695, 117], [760, 112], [900, 111], [1060, 110], [1180, 111], [1226, 111], [1228, 130],
    [1232, 148], [1236, 176], [1242, 215],
  ],
  /** Underside: front bumper lower edge, sills, rear bumper lower edge. */
  bottom: [
    [490, 242], [495, 255], [500, 262], [510, 266], [540, 269], [560, 277], [600, 278], [1100, 278],
    [1150, 266], [1170, 257], [1200, 252], [1220, 248], [1230, 243], [1242, 240],
  ],
  /** Roof silhouette from the windscreen base to where the rear glass meets the deck. */
  roof: [
    [695, 117], [700, 115], [720, 103], [760, 81], [800, 62], [840, 51], [880, 47], [930, 46],
    [980, 47], [1020, 51], [1060, 57], [1100, 69], [1140, 83], [1180, 100], [1205, 109.5],
  ],
  /** Plan half-width from the top view (mirrors excluded). */
  planHalf: [
    [507, 0], [508, 55], [510, 83], [520, 106.5], [530, 121], [540, 131.5], [550, 138], [560, 141],
    [580, 145], [600, 146], [650, 147], [700, 145], [750, 144], [850, 145.5], [1000, 147.5],
    [1040, 150], [1100, 150], [1140, 148.5], [1160, 144.5], [1180, 140.5], [1200, 132.5],
    [1210, 122.5], [1220, 102.5], [1230, 67], [1235, 40], [1236, 0],
  ],
  frontOverhangM: 0.897,
  rearOverhangM: 1.088,
} as const;

type Stations = { nose: number; frontAxle: number; rearAxle: number; tail: number };

export function carShape(p: Readonly<CarBody> = CAR_BODY): CarShape {
  const W = p.widthM / 2;
  const H = p.heightM;
  const r = p.wheelRadiusM;
  const axle = p.wheelbaseM / 2;
  const overhangs = p.lengthM - p.wheelbaseM;
  const bpOverhangs = BLUEPRINT.frontOverhangM + BLUEPRINT.rearOverhangM;
  const xNose = axle + (BLUEPRINT.frontOverhangM / bpOverhangs) * overhangs;
  const xTail = -axle - (BLUEPRINT.rearOverhangM / bpOverhangs) * overhangs;
  const archRadius = r + 0.09;
  const archCentreY = r - 0.01;

  /** Drawing x → car x, piecewise linear so the nose, axles and tail land exactly. */
  const toX = (s: Stations) => (px: number) =>
    px <= s.frontAxle
      ? axle + ((s.frontAxle - px) / (s.frontAxle - s.nose)) * (xNose - axle)
      : px <= s.rearAxle
        ? axle - ((px - s.frontAxle) / (s.rearAxle - s.frontAxle)) * 2 * axle
        : -axle - ((px - s.rearAxle) / (s.tail - s.rearAxle)) * (-axle - xTail);
  const sideX = toX(BLUEPRINT.side);
  const planX = toX(BLUEPRINT.plan);
  const sideY = (py: number) => ((BLUEPRINT.side.ground - py) / (BLUEPRINT.side.ground - BLUEPRINT.side.roof)) * H;
  const sideCurve = (keys: ReadonlyArray<readonly [number, number]>) =>
    monotoneCurve(keys.map(([px, py]) => [sideX(px), sideY(py)] as const).reverse());

  const topY = sideCurve(BLUEPRINT.top);
  const baseBot = sideCurve(BLUEPRINT.bottom);
  const roofY = sideCurve(BLUEPRINT.roof);
  const planWidth = monotoneCurve(
    BLUEPRINT.planHalf.map(([px, half]) => [planX(px), (half / BLUEPRINT.plan.maxHalf) * W] as const).reverse(),
  );
  const shoulderDrop = monotoneCurve([
    [xTail, 0.03],
    [xTail + 0.12, 0.06],
    [0, 0.07],
    [xNose - 0.3, 0.07],
    [xNose, 0.03],
  ]);
  const trimHeight = monotoneCurve([
    [xTail, 0.1],
    [xTail + 0.35, 0.1],
    [-axle + 0.5, 0.04],
    [axle - 0.5, 0.04],
    [xNose - 0.3, 0.09],
    [xNose, 0.08],
  ]);

  /** Wheel-arch underside: a circle over each axle, easing down to the sill just past its ends. */
  const ARCH_RAMP = 0.07;
  function archBottom(x: number): number | null {
    for (const ax of [axle, -axle]) {
      const d = Math.abs(x - ax);
      if (d < archRadius) return archCentreY + Math.sqrt(archRadius ** 2 - d ** 2);
      if (d < archRadius + ARCH_RAMP) {
        const base = baseBot(x);
        return Math.max(base, archCentreY - (archCentreY - base) * smoothstep(archRadius, archRadius + ARCH_RAMP, d));
      }
    }
    return null;
  }

  function halfWidth(x: number): number {
    if (x >= xNose || x <= xTail) return 0;
    return Math.min(W, Math.max(0, planWidth(x)));
  }

  function section(x: number): BodySection {
    const arch = archBottom(x);
    const yBot = arch ?? baseBot(x);
    const yTop = topY(x);
    const yShoulder = yTop - shoulderDrop(x);
    const trim = arch === null ? trimHeight(x) : 0.012;
    const yTrim = Math.min(yBot + CORNER_R + trim, yShoulder - 0.05);
    // The crease height ignores the arches (so the upper side stays smooth past them), but clears their tops.
    const plainTrim = baseBot(x) + CORNER_R + trimHeight(x);
    const yCrease = Math.min(Math.max(lerp(plainTrim, yShoulder, CREASE_U), yTrim + 0.04), yShoulder - 0.02);
    return { yBot, yTrim, yCrease, yShoulder, yTop, hw: halfWidth(x) };
  }

  function point(x: number, v: number, side: 1 | -1): [number, number, number] {
    const sec = section(x);
    const hw = sec.hw;
    const hwBot = hw * 0.965;
    // Tumblehome: the rear view tucks to about 90 % of the full width at the beltline.
    const hwShoulder = hw * 0.91;
    const rc = Math.min(CORNER_R, hwBot * 0.5, (sec.yTrim - sec.yBot) * 0.9);
    let y: number;
    let z: number;
    if (v <= V_CORNER) {
      const u = v / V_CORNER;
      y = sec.yBot;
      z = (hwBot - rc) * u;
    } else if (v <= V_TRIM) {
      const a = -Math.PI / 2 + ((v - V_CORNER) / (V_TRIM - V_CORNER)) * (Math.PI / 2);
      y = sec.yBot + rc + rc * Math.sin(a);
      z = hwBot - rc + rc * Math.cos(a);
    } else if (v <= V_SIDE) {
      const u = (v - V_TRIM) / (V_SIDE - V_TRIM);
      y = lerp(sec.yBot + rc, sec.yTrim, u);
      z = lerp(hwBot, hw * 0.99, u);
    } else if (v <= V_SHOULDER) {
      const u = (v - V_SIDE) / (V_SHOULDER - V_SIDE);
      y =
        u <= CREASE_U
          ? lerp(sec.yTrim, sec.yCrease, u / CREASE_U)
          : lerp(sec.yCrease, sec.yShoulder, (u - CREASE_U) / (1 - CREASE_U));
      // Lower side leans out to a crisp feature crease, the upper side tucks in to the shoulder.
      z =
        u <= CREASE_U
          ? hw * (0.972 + 0.028 * Math.sin((Math.PI / 2) * (u / CREASE_U)))
          : lerp(hw, hwShoulder, Math.pow((u - CREASE_U) / (1 - CREASE_U), 1.25));
    } else {
      const a = ((v - V_SHOULDER) / (1 - V_SHOULDER)) * (Math.PI / 2);
      const c = Math.cos(a);
      const sn = Math.sin(a);
      y = sec.yShoulder + (sec.yTop - sec.yShoulder) * Math.pow(sn, 2 / TOP_N);
      z = hwShoulder * Math.pow(c, 2 / TOP_N);
    }
    return [x, y, side * z];
  }

  function bodyTopY(x: number, z: number): number {
    const sec = section(x);
    const hwShoulder = sec.hw * 0.91;
    if (hwShoulder <= 0) return sec.yTop;
    const q = Math.min(Math.abs(z) / hwShoulder, 1);
    const c = Math.pow(q, TOP_N / 2);
    const sn = Math.sqrt(Math.max(0, 1 - c * c));
    return sec.yShoulder + (sec.yTop - sec.yShoulder) * Math.pow(sn, 2 / TOP_N);
  }

  const roofXs = BLUEPRINT.roof.map(([px]) => sideX(px));
  const xFront = Math.max(...roofXs);
  const xRear = Math.min(...roofXs);
  const glass = {
    xFront,
    xRear,
    roofY,
    // Rear view: the glasshouse is about 80 % of the full width at its base and 65 % at the roof.
    baseHalfWidth: (x: number) => section(x).hw * 0.91 - 0.07 - 0.07 * smoothstep(-1.2, xRear + 0.1, x),
    roofHalfWidth: (x: number) => W * 0.66 - 0.1 * smoothstep(-1.0, xRear, x),
  };

  const inArch = (x: number) => archBottom(x) !== null;
  function isTrim(x: number, v: number): boolean {
    // Arch lips stay body colour; only the wheel-well roof is dark there.
    if (inArch(x)) return v < V_CORNER;
    // Nose: body-coloured bumper with a thin dark lip; the intake is an overlay.
    if (x > xNose - 0.5) return v < V_CORNER + 0.04;
    return v < V_SIDE;
  }
  function outerZ(x: number, y: number): number | null {
    const sec = section(x);
    if (sec.hw <= 0 || y > sec.yTop || y < sec.yBot) return null;
    if (y >= sec.yShoulder) {
      const t = (y - sec.yShoulder) / Math.max(sec.yTop - sec.yShoulder, 1e-6);
      const sn = Math.pow(t, TOP_N / 2);
      return sec.hw * 0.91 * Math.pow(Math.sqrt(Math.max(0, 1 - sn * sn)), 2 / TOP_N);
    }
    return point(x, vAtY(x, y), 1)[2];
  }
  function vAtY(x: number, y: number): number {
    let lo = y < section(x).yTrim ? V_CORNER : V_SIDE;
    let hi = V_SHOULDER;
    for (let i = 0; i < 40; i++) {
      const mid = (lo + hi) / 2;
      if (point(x, mid, 1)[1] < y) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  return {
    xNose,
    xTail,
    axleX: [axle, -axle],
    archRadius,
    archCentreY,
    isTrim,
    inArch,
    section,
    point,
    vAtY,
    outerZ,
    topY: bodyTopY,
    glass,
  };
}
