import type { SimSnapshot } from '../../sim';
import { Color, Mesh, MeshStandardMaterial, ShaderMaterial, type Material, type Object3D } from 'three';
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

/**
 * X-ray material for fault view: every outer part of the car swaps to this one shared
 * material, faint face-on and brighter towards silhouettes. One uniform material means no
 * transparency sorting between overlapping parts, so nothing flickers.
 */
export const xrayMaterial = new ShaderMaterial({
  uniforms: { colour: { value: new Color(tokens.ink2) }, faceOn: { value: 0.05 }, edge: { value: 0.42 } },
  vertexShader: /* glsl */ `
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
      vNormal = normalize(normalMatrix * normal);
      vView = normalize(-viewPosition.xyz);
      gl_Position = projectionMatrix * viewPosition;
    }`,
  fragmentShader: /* glsl */ `
    uniform vec3 colour;
    uniform float faceOn;
    uniform float edge;
    varying vec3 vNormal;
    varying vec3 vView;
    void main() {
      float rim = pow(1.0 - abs(dot(normalize(vNormal), normalize(vView))), 2.5);
      gl_FragColor = vec4(colour, mix(faceOn, edge, rim));
    }`,
  transparent: true,
  depthWrite: false,
});

/** The part's own material, even while the x-ray material is swapped in. */
export function solidMaterial(mesh: Mesh): Material | Material[] {
  return (mesh.userData.solidMaterial as Material | Material[] | undefined) ?? mesh.material;
}

function insideInternals(node: Object3D): boolean {
  for (let p: Object3D | null = node; p; p = p.parent) if (p.name === 'internals') return true;
  return false;
}

/** Swap every outer mesh to the x-ray material, or back to its own. */
function setXray(car: Object3D, on: boolean): void {
  car.traverse((node) => {
    if (!(node instanceof Mesh) || insideInternals(node)) return;
    if (on && node.userData.solidMaterial === undefined) {
      node.userData.solidMaterial = node.material;
      node.material = xrayMaterial;
    } else if (!on && node.userData.solidMaterial !== undefined) {
      node.material = node.userData.solidMaterial as Material | Material[];
      delete node.userData.solidMaterial;
    }
  });
}

/** Apply fault x-ray view, the faulted part's glow and the charge-port state to the car model. */
export function applyCarVisualState(car: Object3D, visual: CarVisualState): void {
  setXray(car, visual.faultHighlight !== null);
  // The wheel-well liners span the car's width; in x-ray view they would read as tubes through it.
  const wells = car.getObjectByName('wheel-wells');
  if (wells) wells.visible = visual.faultHighlight === null;
  const internals = car.getObjectByName('internals');
  if (internals) {
    internals.visible = visual.faultHighlight !== null;
    for (const part of internals.children) {
      part.visible = part.name === visual.faultHighlight?.part;
      if (part instanceof Mesh && part.material instanceof MeshStandardMaterial) {
        // The faulted module glows steadily in its severity colour (no idle motion, DESIGN-RULES §6).
        const colour = visual.faultHighlight?.severity === 'red' ? tokens.fault : tokens.warn;
        part.material.color.set(part.visible ? colour : '#86aeb8');
        part.material.emissive.set(part.visible ? colour : '#000000');
        part.material.emissiveIntensity = part.visible ? 0.85 : 0;
      }
    }
  }
  const port = car.getObjectByName('charge-port');
  if (!port) return;
  port.getObjectByName('port-flap')!.visible = visual.chargePort === 'unplugged';
  port.getObjectByName('port-plug')!.visible = visual.chargePort !== 'unplugged';
  port.getObjectByName('port-charging-marker')!.visible = visual.chargePort === 'charging';
}
