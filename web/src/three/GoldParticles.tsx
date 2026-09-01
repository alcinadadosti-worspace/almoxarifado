import { useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { createParticleTexture } from './monogram-geometry';

interface GoldParticlesProps {
  count?: number;
  radius?: number;
  /** Velocidade da deriva vertical. */
  speed?: number;
}

/**
 * Poeira dourada suspensa — cada partícula sobe devagar, oscila em seno e
 * reinicia embaixo. Um único draw call (THREE.Points) com blending aditivo.
 */
export function GoldParticles({ count = 420, radius = 4.2, speed = 0.055 }: GoldParticlesProps) {
  const points = useRef<THREE.Points>(null);
  const texture = useMemo(() => createParticleTexture(), []);

  const { geometry, seeds } = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const scales = new Float32Array(count);
    const data = new Float32Array(count * 3); // fase, amplitude, velocidade

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.sqrt(Math.random()) * radius;
      positions[i * 3] = Math.cos(angle) * distance;
      positions[i * 3 + 1] = (Math.random() - 0.5) * radius * 1.7;
      positions[i * 3 + 2] = Math.sin(angle) * distance * 0.6 - 0.6;

      scales[i] = 0.02 + Math.random() * 0.055;
      data[i * 3] = Math.random() * Math.PI * 2;
      data[i * 3 + 1] = 0.05 + Math.random() * 0.22;
      data[i * 3 + 2] = 0.4 + Math.random() * 1.5;
    }

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(scales, 1));
    return { geometry: geo, seeds: data };
  }, [count, radius]);

  // recursos de GPU não são coletados pelo GC: liberar ao desmontar
  useEffect(
    () => () => {
      geometry.dispose();
      texture.dispose();
    },
    [geometry, texture],
  );

  useFrame((state, delta) => {
    const node = points.current;
    if (!node) return;

    const attribute = node.geometry.getAttribute('position') as THREE.BufferAttribute;
    const array = attribute.array as Float32Array;
    const time = state.clock.elapsedTime;
    const limit = radius * 0.85;

    for (let i = 0; i < count; i++) {
      const phase = seeds[i * 3];
      const amplitude = seeds[i * 3 + 1];
      const rate = seeds[i * 3 + 2];

      array[i * 3 + 1] += delta * speed * rate;
      if (array[i * 3 + 1] > limit) array[i * 3 + 1] = -limit;
      array[i * 3] += Math.sin(time * 0.35 * rate + phase) * delta * amplitude * 0.25;
    }
    attribute.needsUpdate = true;

    // parallax discreto com o ponteiro
    node.rotation.y = THREE.MathUtils.lerp(node.rotation.y, state.pointer.x * 0.12, 0.03);
    node.rotation.x = THREE.MathUtils.lerp(node.rotation.x, -state.pointer.y * 0.08, 0.03);
  });

  return (
    <points ref={points} geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        map={texture}
        color="#E3C27E"
        size={0.055}
        sizeAttenuation
        transparent
        opacity={0.85}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}
