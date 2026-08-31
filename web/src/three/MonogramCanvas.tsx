import { AdaptiveDpr, AdaptiveEvents, Float, Preload } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import {
  Bloom,
  ChromaticAberration,
  DepthOfField,
  EffectComposer,
  Noise,
  Vignette,
} from '@react-three/postprocessing';
import { BlendFunction } from 'postprocessing';
import { Suspense } from 'react';
import { Vector2 } from 'three';
import { GoldMonogram } from './GoldMonogram';
import { GoldParticles } from './GoldParticles';
import { StudioEnv } from './StudioEnv';

export interface MonogramCanvasProps {
  /** `hero` é a cena completa; `compact` roda leve dentro de cartões. */
  quality?: 'hero' | 'compact';
  className?: string;
  particles?: number;
}

/**
 * Cena WebGL do monograma. Carregada sob demanda (`React.lazy`) para nunca
 * pesar no bundle inicial de quem só vai assinar o termo pelo celular.
 */
export default function MonogramCanvas({
  quality = 'hero',
  className,
  particles,
}: MonogramCanvasProps) {
  const hero = quality === 'hero';

  return (
    <Canvas
      className={className}
      dpr={[1, hero ? 1.9 : 1.5]}
      gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => gl.setClearAlpha(0)}
      camera={{ position: [0, 0, 5.6], fov: 34 }}
      style={{ pointerEvents: 'none', background: 'transparent' }}
    >
      <Suspense fallback={null}>
        <StudioEnv resolution={hero ? 256 : 128} />

        <ambientLight intensity={0.35} />
        <spotLight
          position={[4, 6, 5]}
          angle={0.35}
          penumbra={0.9}
          intensity={90}
          color="#FFE9BE"
          distance={22}
        />
        <pointLight position={[-4, -2, 3]} intensity={26} color="#C9A050" distance={16} />

        <Float
          speed={1.15}
          rotationIntensity={hero ? 0.18 : 0.1}
          floatIntensity={hero ? 0.5 : 0.28}
          floatingRange={[-0.06, 0.06]}
        >
          <GoldMonogram scale={hero ? 1.98 : 1.6} gyroscope={hero} />
        </Float>

        <GoldParticles count={particles ?? (hero ? 420 : 140)} radius={hero ? 4.4 : 3} />

        {hero ? (
          <EffectComposer multisampling={0}>
            <DepthOfField focusDistance={0.012} focalLength={0.05} bokehScale={3.4} height={480} />
            <Bloom
              intensity={0.72}
              luminanceThreshold={0.32}
              luminanceSmoothing={0.85}
              mipmapBlur
              height={360}
            />
            <ChromaticAberration
              offset={new Vector2(0.0006, 0.0009)}
              blendFunction={BlendFunction.NORMAL}
              radialModulation={false}
              modulationOffset={0}
            />
            <Noise premultiply blendFunction={BlendFunction.SOFT_LIGHT} opacity={0.32} />
            <Vignette eskil={false} offset={0.22} darkness={0.85} />
          </EffectComposer>
        ) : (
          <EffectComposer multisampling={0}>
            <Bloom intensity={0.5} luminanceThreshold={0.4} mipmapBlur height={240} />
            <Vignette offset={0.3} darkness={0.7} />
          </EffectComposer>
        )}

        <Preload all />
        <AdaptiveDpr pixelated={false} />
        <AdaptiveEvents />
      </Suspense>
    </Canvas>
  );
}
