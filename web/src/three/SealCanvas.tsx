import { Float } from '@react-three/drei';
import { Canvas, useFrame } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import type * as THREE from 'three';
import { createMonogramGeometry } from './monogram-geometry';
import { StudioEnv } from './StudioEnv';

/**
 * Selo 3D que "carimba" o termo assinado.
 *
 * Só o metal vive no WebGL. Brilho, ondas de choque e confete ficam no DOM
 * (`Confetti` + CSS): sobre a página off-white, blending aditivo escurece em
 * vez de brilhar — e o custo em GPU é uma fração, no aparelho do colaborador.
 */
function Seal() {
  const group = useRef<THREE.Group>(null);
  const start = useRef(0);
  const geometry = useMemo(() => createMonogramGeometry({ depth: 0.06, bevel: 0.006 }), []);
  useEffect(() => () => geometry.dispose(), [geometry]);

  useFrame((state) => {
    if (!start.current) start.current = state.clock.elapsedTime;
    const t = state.clock.elapsedTime - start.current;
    const node = group.current;
    if (!node) return;

    // 0 → 0.55s: o selo desce e carimba; depois oscila até repousar
    const drop = Math.min(1, t / 0.55);
    const eased = 1 - Math.pow(1 - drop, 4);
    const settle = t > 0.55 ? Math.sin((t - 0.55) * 14) * Math.exp(-(t - 0.55) * 5) * 0.06 : 0;

    node.position.z = 2.6 - eased * 2.6 + settle;
    node.rotation.z = (1 - eased) * 0.5 + settle * 0.4;
    node.scale.setScalar(0.85 + eased * 0.15);
  });

  return (
    <group ref={group}>
      {/* disco do selo — a face circular fica de frente para a câmera */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 0, -0.1]}>
        <cylinderGeometry args={[0.92, 0.92, 0.2, 72]} />
        <meshPhysicalMaterial
          color="#C9A050"
          metalness={0.92}
          roughness={0.33}
          clearcoat={0.55}
          envMapIntensity={1.9}
        />
      </mesh>

      {/* aro que contorna a face do selo */}
      <mesh position={[0, 0, -0.02]}>
        <torusGeometry args={[0.92, 0.035, 14, 96]} />
        <meshPhysicalMaterial color="#E3C27E" metalness={1} roughness={0.18} envMapIntensity={2.2} />
      </mesh>

      {/* monograma em relevo */}
      <mesh geometry={geometry} scale={1.32} position={[0, 0, 0.02]}>
        <meshPhysicalMaterial
          color="#F6E7C1"
          metalness={1}
          roughness={0.14}
          clearcoat={0.7}
          envMapIntensity={2.1}
        />
      </mesh>
    </group>
  );
}

export default function SealCanvas({ className }: { className?: string }) {
  return (
    <Canvas
      className={className}
      dpr={[1, 1.8]}
      gl={{ antialias: true, alpha: true, premultipliedAlpha: false }}
      onCreated={({ gl }) => gl.setClearAlpha(0)}
      camera={{ position: [0, 0, 4.2], fov: 38 }}
      style={{ pointerEvents: 'none', background: 'transparent' }}
    >
      <Suspense fallback={null}>
        {/* fundo claro no ambiente: o metal reflete luz, não escuridão —
            essencial porque esta cena aparece sobre a página off-white */}
        <StudioEnv resolution={128} backdrop="#6c5b3c" />
        <ambientLight intensity={1.1} />
        <spotLight position={[3, 4, 4]} intensity={110} color="#FFF3D8" angle={0.6} penumbra={1} />
        <pointLight position={[-2.5, -1.5, 3]} intensity={30} color="#F6E7C1" />

        <Float speed={1.4} rotationIntensity={0.12} floatIntensity={0.35}>
          <Seal />
        </Float>
      </Suspense>
    </Canvas>
  );
}
