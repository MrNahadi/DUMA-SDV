import { Canvas, useFrame } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import { useMemo, useRef } from 'react';
import { Group, Mesh, MeshStandardMaterial } from 'three';
import { useSimStore } from '../app/simStore';
import { tokens } from '../ui/tokens';
import { vehicleParams } from '../sim/vehicle/params';
import { applyCarVisualState, buildCar, visualStateFromSnapshot } from './car';

const wheelNames = ['wheel-front-left', 'wheel-front-right', 'wheel-back-left', 'wheel-back-right'];
const stripeSpacingM = 0.9;

function Car() {
  const model = useMemo(() => buildCar(vehicleParams), []);
  useFrame(() => {
    const visual = visualStateFromSnapshot(useSimStore.getState().snapshot);
    for (const name of wheelNames) {
      const wheel = model.getObjectByName(name);
      // Forward is +X and Z points left, so rolling forward is a negative rotation about Z.
      if (wheel) wheel.rotation.z = -visual.wheelAngleRad;
    }
    const brake = model.getObjectByName('brake-lights') as Mesh;
    const head = model.getObjectByName('headlights') as Mesh;
    (brake.material as MeshStandardMaterial).emissiveIntensity = visual.brakeLightIntensity;
    (head.material as MeshStandardMaterial).emissiveIntensity = visual.headlightsOn ? 1 : 0;
    applyCarVisualState(model, visual);
  });
  return <primitive object={model} />;
}

function RollingRoad() {
  const stripes = useRef<Group>(null);
  const lastTimeS = useRef<number | null>(null);
  const phaseM = useRef(0);
  useFrame(() => {
    const snapshot = useSimStore.getState().snapshot;
    const visual = visualStateFromSnapshot(snapshot);
    const elapsedS = lastTimeS.current === null ? 0 : Math.max(0, snapshot.timeS - lastTimeS.current);
    lastTimeS.current = snapshot.timeS;
    const moving = visual.roadSpeedMs !== 0;
    // R10: the rolling road is shown only while the car moves.
    if (stripes.current) stripes.current.visible = moving;
    if (moving) {
      phaseM.current = ((phaseM.current - visual.roadSpeedMs * elapsedS) % stripeSpacingM + stripeSpacingM) % stripeSpacingM;
      if (stripes.current) stripes.current.position.x = phaseM.current;
    }
  });
  return (
    <group ref={stripes} position-y={0.004} visible={false}>
      {[-2, -1, 0, 1, 2].map((index) => (
        <mesh key={index} rotation-x={-Math.PI / 2} position-x={index * stripeSpacingM}>
          <planeGeometry args={[0.025, 2.5]} />
          <meshBasicMaterial color={tokens.line} transparent opacity={0.34} depthWrite={false} />
        </mesh>
      ))}
    </group>
  );
}

/**
 * The 3D stage: a quiet studio floor the car will sit on (roadmap 02).
 * 1 unit = 1 m. No idle motion (DESIGN-RULES.md §6).
 */
export default function Stage() {
  return (
    <Canvas
      data-testid="stage-canvas"
      shadows
      dpr={[1, 2]}
      camera={{ position: [6.4, 2.6, 7.2], fov: 30, near: 0.1, far: 100 }}
      gl={{ antialias: true, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={[tokens.bg]} />
      <fog attach="fog" args={[tokens.bg, 14, 30]} />

      <hemisphereLight args={[tokens.surface, tokens.surface2, 1.1]} />
      <directionalLight position={[4, 8, 3]} intensity={1.6} castShadow />
      <Car />
      <RollingRoad />

      {/* Seamless studio floor: unlit so it matches the page background exactly. */}
      <mesh rotation-x={-Math.PI / 2}>
        <planeGeometry args={[80, 80]} />
        <meshBasicMaterial color={tokens.bg} toneMapped={false} />
      </mesh>
      {/* Turntable the car sits on. */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.001}>
        <circleGeometry args={[3.4, 96]} />
        <meshBasicMaterial color={tokens.surface2} toneMapped={false} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.002}>
        <ringGeometry args={[3.39, 3.41, 128]} />
        <meshBasicMaterial color={tokens.line} toneMapped={false} />
      </mesh>
      <ContactShadows position-y={0.003} opacity={0.4} scale={8} blur={2.4} far={2} />

      <OrbitControls
        makeDefault
        target={[0, 0.5, 0]}
        enablePan={false}
        minDistance={4}
        maxDistance={14}
        minPolarAngle={0.35}
        maxPolarAngle={Math.PI / 2.1}
      />
    </Canvas>
  );
}
