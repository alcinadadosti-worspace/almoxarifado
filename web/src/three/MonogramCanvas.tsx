import { AdaptiveDpr, AdaptiveEvents, Float, Preload } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { Bloom, ChromaticAberration, EffectComposer, Vignette } from '@react-three/postprocessing';
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

/** Aberração cromática constante — evita recriar o Vector2 a cada render. */
const ABERRATION = new Vector2(0.0005, 0.0008);

/**
 * Cena WebGL do monograma. Carregada sob demanda (`React.lazy`) para nunca
 * pesar no bundle inicial de quem só vai assinar o termo pelo celular.
 *
 * Orçamento de GPU deliberado: a cadeia de pós-processamento tem só passes
 * baratos (bloom com mipmap + vinheta + aberração sutil). Profundidade de
 * campo e ruído de filme foram cortados — bonitos, mas custavam mais quadros
 * do que entregavam em tela cheia, sobretudo em notebooks com gráfico
 * integrado.
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
      dpr={[1, hero ? 1.5 : 1.25]}
      performance={{ min: 0.5, debounce: 200 }}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: 'high-performance',
        stencil: false,
        depth: true,
      }}
      onCreated={({ gl }) => gl.setClearAlpha(0)}
      camera={{ position: [0, 0, 5.6], fov: 34 }}
      style={{ pointerEvents: 'none', background: 'transparent' }}
    >
      <Suspense fallback={null}>
        <StudioEnv resolution={128} />

        <ambientLight intensity={0.4} />
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

        <GoldParticles count={particles ?? (hero ? 220 : 90)} radius={hero ? 4.4 : 3} />

        <EffectComposer multisampling={0} enableNormalPass={false}>
          <Bloom
            intensity={hero ? 0.95 : 0.55}
            luminanceThreshold={0.26}
            luminanceSmoothing={0.85}
            mipmapBlur
            height={hero ? 256 : 180}
          />
          <ChromaticAberration
            offset={ABERRATION}
            blendFunction={BlendFunction.NORMAL}
            radialModulation={false}
            modulationOffset={0}
          />
          <Vignette eskil={false} offset={0.24} darkness={0.82} />
        </EffectComposer>

        <Preload all />
        <AdaptiveDpr pixelated={false} />
        <AdaptiveEvents />
      </Suspense>
    </Canvas>
  );
}
