import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  BoxGeometry,
  CanvasTexture,
  Group,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PlaneGeometry,
  RepeatWrapping,
  SRGBColorSpace,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { useSimStore } from '../../app/simStore';
import { tokens } from '../../ui/tokens';
import { DASH_PERIOD_M, POST_PERIOD_M, periodOffset, roadVisible } from './motion';

/** Road layout (ADR 0014): two 3.5 m lanes, the car in the near lane, centre line on its right. */
export const ROAD = {
  lengthM: 110,
  laneM: 3.5,
  dashM: 3,
  markingM: 0.13,
  grainTileM: 4,
  fadeS: 0.45,
} as const;
const nearEdgeZ = ROAD.laneM / 2;
const centreZ = -ROAD.laneM / 2;
const farEdgeZ = -ROAD.laneM * 1.5;
const postZ = [nearEdgeZ + 0.75, farEdgeZ - 0.75] as const;
const dashCount = Math.ceil(ROAD.lengthM / DASH_PERIOD_M) + 1;
const postCount = Math.ceil(ROAD.lengthM / POST_PERIOD_M) + 1;

/** Fine, fixed asphalt grain (seeded, so every load looks the same). */
function grainTexture(): CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const image = ctx.createImageData(size, size);
  let seed = 1337;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < size * size; i++) {
    const v = 236 + Math.floor((rand() - 0.5) * 34);
    image.data.set([v, v, v, 255], i * 4);
  }
  ctx.putImageData(image, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(ROAD.lengthM / ROAD.grainTileM, (ROAD.laneM * 2) / ROAD.grainTileM);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

const scratch = new Matrix4();

function setOpacity(group: Group, opacity: number) {
  group.traverse((node) => {
    if (node instanceof Mesh && node.material instanceof Material) node.material.opacity = opacity;
  });
}

/** Per-frame road state: cross-fade with the turntable and slide the repeats by the travel position. */
function updateRoad(
  road: Group | null,
  turntable: Group | null,
  dashes: InstancedMesh | null,
  posts: InstancedMesh | null,
  f: number,
  travel: number,
) {
  if (!road || !turntable || !dashes || !posts) return;
  setOpacity(road, f);
  setOpacity(turntable, 1 - f);
  road.visible = f > 0;
  turntable.visible = f < 1;
  if (f === 0) return;

  // The world slides backwards past the car by the signed travel position (ADR 0014).
  road.traverse((node) => {
    if (node instanceof Mesh && node.material instanceof MeshBasicMaterial && node.material.map) {
      node.material.map.offset.x = periodOffset(travel, ROAD.grainTileM) / ROAD.grainTileM;
    }
  });
  const start = -ROAD.lengthM / 2;
  const dashShift = periodOffset(travel, DASH_PERIOD_M);
  for (let i = 0; i < dashCount; i++) {
    dashes.setMatrixAt(i, scratch.makeTranslation(start + i * DASH_PERIOD_M - dashShift, 0.004, centreZ));
  }
  dashes.instanceMatrix.needsUpdate = true;
  const postShift = periodOffset(travel, POST_PERIOD_M);
  for (let i = 0; i < postCount; i++) {
    for (const [j, z] of postZ.entries()) {
      posts.setMatrixAt(i * 2 + j, scratch.makeTranslation(start + i * POST_PERIOD_M - postShift + j * POST_PERIOD_M * 0.5, 0, z));
    }
  }
  posts.instanceMatrix.needsUpdate = true;
}

export function Road() {
  const road = useRef<Group>(null);
  const turntable = useRef<Group>(null);
  const dashes = useRef<InstancedMesh>(null);
  const posts = useRef<InstancedMesh>(null);
  const fade = useRef(0);
  const reducedMotion = useMemo(
    () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true,
    [],
  );

  const assets = useMemo(() => {
    const grain = typeof document === 'undefined' ? null : grainTexture();
    const surface = new MeshBasicMaterial({ color: tokens.roadSurface, map: grain, transparent: true, toneMapped: false });
    const marking = new MeshBasicMaterial({ color: tokens.roadMarking, transparent: true, toneMapped: false });
    const post = new MeshStandardMaterial({ color: tokens.roadPost, roughness: 0.6, transparent: true });
    const table = new MeshBasicMaterial({ color: tokens.surface2, transparent: true, toneMapped: false });
    const tableLine = new MeshBasicMaterial({ color: tokens.line, transparent: true, toneMapped: false });
    const dash = new PlaneGeometry(ROAD.dashM, ROAD.markingM);
    dash.rotateX(-Math.PI / 2);
    const edges = mergeGeometries(
      [nearEdgeZ - 0.2, farEdgeZ + 0.2].map((z) => {
        const line = new PlaneGeometry(ROAD.lengthM, ROAD.markingM);
        line.rotateX(-Math.PI / 2);
        line.translate(0, 0, z);
        return line;
      }),
    );
    const postGeometry = new BoxGeometry(0.1, 0.7, 0.1);
    postGeometry.translate(0, 0.35, 0);
    return { grain, surface, marking, post, table, tableLine, dash, edges, postGeometry };
  }, []);

  useFrame((_, delta) => {
    const snapshot = useSimStore.getState().snapshot;
    const target = roadVisible(snapshot) ? 1 : 0;
    // Reduced motion: switch between road and turntable at once instead of fading.
    const step = reducedMotion ? 1 : Math.min(delta, 0.1) / ROAD.fadeS;
    fade.current = target > fade.current ? Math.min(target, fade.current + step) : Math.max(target, fade.current - step);
    updateRoad(road.current, turntable.current, dashes.current, posts.current, fade.current, snapshot.render.travelM);
  });

  return (
    <>
      <group ref={road} visible={false}>
        <mesh rotation-x={-Math.PI / 2} position={[0, 0.002, (nearEdgeZ + farEdgeZ) / 2]} material={assets.surface}>
          <planeGeometry args={[ROAD.lengthM, ROAD.laneM * 2]} />
        </mesh>
        <mesh geometry={assets.edges} material={assets.marking} position-y={0.004} />
        <instancedMesh ref={dashes} args={[assets.dash, assets.marking, dashCount]} frustumCulled={false} />
        <instancedMesh ref={posts} args={[assets.postGeometry, assets.post, postCount * 2]} frustumCulled={false} />
      </group>
      <group ref={turntable}>
        <mesh rotation-x={-Math.PI / 2} position-y={0.001} material={assets.table}>
          <circleGeometry args={[3.4, 96]} />
        </mesh>
        <mesh rotation-x={-Math.PI / 2} position-y={0.002} material={assets.tableLine}>
          <ringGeometry args={[3.39, 3.41, 128]} />
        </mesh>
      </group>
    </>
  );
}
