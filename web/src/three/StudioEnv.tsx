import { Environment, Lightformer } from '@react-three/drei';

/**
 * Estúdio de luz construído em memória (sem baixar HDRI): três softboxes
 * quentes, um rebatedor frio e um rim light — é o que faz o ouro parecer ouro.
 */
export function StudioEnv({
  resolution = 256,
  /** Fundo do ambiente refletido pelo metal. Claro = ouro mais luminoso. */
  backdrop = '#0b0b0d',
}: {
  resolution?: number;
  backdrop?: string;
}) {
  return (
    <Environment resolution={resolution} frames={1}>
      <color attach="background" args={[backdrop]} />

      {/* key light quente */}
      <Lightformer
        form="rect"
        intensity={5.5}
        color="#FFE9BE"
        position={[3.2, 2.6, 2.4]}
        rotation={[0, -Math.PI / 3.4, 0]}
        scale={[6, 5, 1]}
      />
      {/* fill dourado */}
      <Lightformer
        form="rect"
        intensity={2.6}
        color="#C9A050"
        position={[-4, 1.2, 1.6]}
        rotation={[0, Math.PI / 3, 0]}
        scale={[5, 6, 1]}
      />
      {/* rebatedor frio discreto — só o bastante para dar contraste ao metal */}
      <Lightformer
        form="rect"
        intensity={0.85}
        color="#BFD4DC"
        position={[0, -3.2, 1.6]}
        rotation={[Math.PI / 2, 0, 0]}
        scale={[8, 4, 1]}
      />
      {/* rim light superior */}
      <Lightformer
        form="ring"
        intensity={3.2}
        color="#FFF6DC"
        position={[0, 4.2, -2]}
        scale={[4, 4, 1]}
      />
      {/* faixa que desliza no reflexo */}
      <Lightformer
        form="rect"
        intensity={1.8}
        color="#FFFFFF"
        position={[-1.6, 3.4, 3.2]}
        rotation={[Math.PI / 5, 0, Math.PI / 8]}
        scale={[1.2, 7, 1]}
      />
    </Environment>
  );
}
