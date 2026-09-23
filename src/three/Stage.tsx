import { Canvas } from '@react-three/fiber';
import { ContactShadows, OrbitControls } from '@react-three/drei';
import { tokens } from '../ui/tokens';

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
