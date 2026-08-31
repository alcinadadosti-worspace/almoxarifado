import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { createMonogramGeometry } from './monogram-geometry';

interface GoldMonogramProps {
  scale?: number;
  /** Reage ao giroscópio além do ponteiro (celular). */
  gyroscope?: boolean;
  spin?: number;
}

/**
 * O monograma AM em ouro maciço: geometria extrudada do traço real da marca,
 * material metálico com clearcoat e reação ao ponteiro/giroscópio.
 */
export function GoldMonogram({ scale = 1.75, gyroscope = true, spin = 0.06 }: GoldMonogramProps) {
  const group = useRef<THREE.Group>(null);
  const mesh = useRef<THREE.Mesh>(null);
  const tilt = useRef({ x: 0, y: 0 });

  const geometry = useMemo(() => createMonogramGeometry(), []);

  useEffect(() => () => geometry.dispose(), [geometry]);

  /* Giroscópio: no celular o monograma acompanha a inclinação do aparelho. */
  useEffect(() => {
    if (!gyroscope || typeof window === 'undefined') return;
    const handler = (event: DeviceOrientationEvent) => {
      if (event.beta == null || event.gamma == null) return;
      tilt.current.y = THREE.MathUtils.clamp(event.gamma / 45, -1, 1);
      tilt.current.x = THREE.MathUtils.clamp((event.beta - 45) / 45, -1, 1);
    };
    window.addEventListener('deviceorientation', handler);
    return () => window.removeEventListener('deviceorientation', handler);
  }, [gyroscope]);

  useFrame((state, delta) => {
    const node = group.current;
    if (!node) return;

    const time = state.clock.elapsedTime;
    const targetY = state.pointer.x * 0.42 + tilt.current.y * 0.3 + Math.sin(time * spin) * 0.16;
    const targetX = -state.pointer.y * 0.28 + tilt.current.x * 0.2 + Math.cos(time * spin * 0.8) * 0.07;

    node.rotation.y = THREE.MathUtils.damp(node.rotation.y, targetY, 2.6, delta);
    node.rotation.x = THREE.MathUtils.damp(node.rotation.x, targetX, 2.6, delta);
    node.position.y = Math.sin(time * 0.55) * 0.075;
    node.position.x = THREE.MathUtils.damp(node.position.x, state.pointer.x * 0.12, 2, delta);
  });

  return (
    <group ref={group}>
      <mesh ref={mesh} geometry={geometry} scale={scale} castShadow receiveShadow>
        <meshPhysicalMaterial
          color="#C9A050"
          metalness={1}
          roughness={0.16}
          clearcoat={0.7}
          clearcoatRoughness={0.24}
          reflectivity={1}
          envMapIntensity={2}
        />
      </mesh>
    </group>
  );
}
