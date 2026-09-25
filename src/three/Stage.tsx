import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import { memo, useMemo } from 'react';
import { Mesh, MeshStandardMaterial } from 'three';
import { useSimStore } from '../app/simStore';
import { tokens } from '../ui/tokens';
import { applyCarVisualState, buildCar, visualStateFromSnapshot } from './car';
import { solidMaterial } from './car/animation';
import { Road } from './road/Road';
import './Stage.css';

const wheelNames = ['wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right'];

function Car() {
  const model = useMemo(() => buildCar(), []);
  useFrame(() => {
    const visual = visualStateFromSnapshot(useSimStore.getState().snapshot);
    for (const name of wheelNames) {
      const wheel = model.getObjectByName(name);
      // Forward is +X and Z points left, so rolling forward is a negative rotation about Z.
      if (wheel) wheel.rotation.z = -visual.wheelAngleRad;
    }
    // The lamps' own materials, even while the fault x-ray view has swapped them out.
    const brake = solidMaterial(model.getObjectByName('brake-lights') as Mesh) as MeshStandardMaterial;
    const head = solidMaterial(model.getObjectByName('headlights') as Mesh) as MeshStandardMaterial;
    brake.emissiveIntensity = visual.brakeLightIntensity * 2.5;
    head.emissiveIntensity = visual.headlightsOn ? 1.6 : 0;
    applyCarVisualState(model, visual);
  });
  return <primitive object={model} />;
}

/**
 * Everything inside the canvas except the camera controls. Memoised: it reads the sim in
 * useFrame, so it must never re-render with the store (that would rebuild the environment map).
 */
export const StageScene = memo(function StageScene() {
  return (
    <>
      <color attach="background" args={[tokens.bg]} />
      <fog attach="fog" args={[tokens.bg, 16, 42]} />

      {/* Plain studio lights (no environment map): cheap enough for integrated graphics (brief §4). */}
      <hemisphereLight args={['#ffffff', '#b9bcc0', 1.35]} />
      <directionalLight position={[5, 8, 4]} intensity={1.5} />
      <directionalLight position={[-6, 4, -3]} intensity={0.55} />
      <directionalLight position={[-2, 3, 7]} intensity={0.35} />
      <Car />
      <Road />

      {/* Seamless studio floor: unlit so it matches the page background exactly. */}
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[120, 120]} />
        <meshBasicMaterial color={tokens.bg} toneMapped={false} />
      </mesh>
      {/* The car never moves on the stage, so its soft shadow is drawn once. */}
      <ContactShadows frames={1} position-y={0.006} opacity={0.55} scale={9} blur={2.2} far={2.2} resolution={512} color="#1b1e21" />
    </>
  );
});

/**
 * The 3D stage: the car on a quiet studio floor that becomes a road while driving.
 * 1 unit = 1 m. No idle motion (docs/design-rules.md §6).
 */
export default function Stage() {
  // Primitive selectors: the stage re-renders only when the fault label changes, not every tick.
  const faultModule = useSimStore((state) => visualStateFromSnapshot(state.snapshot).faultHighlight?.module ?? null);
  const faultSeverity = useSimStore((state) => visualStateFromSnapshot(state.snapshot).faultHighlight?.severity ?? null);
  return (
    <>
    <Canvas
      data-testid="stage-canvas"
      dpr={[1, 1.5]}
      camera={{ position: [6.4, 2.4, 7.2], fov: 30, near: 0.1, far: 120 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <StageScene />
      <OrbitControls
        makeDefault
        target={[0, 0.6, 0]}
        enablePan={false}
        minDistance={4}
        maxDistance={14}
        minPolarAngle={0.35}
        maxPolarAngle={Math.PI / 2.1}
      />
    </Canvas>
    {faultModule && <div className="stage-fault-label" role="status" aria-live="polite" data-severity={faultSeverity}>
      <span aria-hidden="true">●</span> {faultModule}
    </div>}
    </>
  );
}
