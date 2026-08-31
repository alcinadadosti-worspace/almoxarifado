import { useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { usePrefersReducedMotion } from '@/lib/device';

interface TiltCardProps {
  children: ReactNode;
  className?: string;
  /** Intensidade da inclinação em graus. */
  strength?: number;
  /** Brilho que segue o ponteiro. */
  glare?: boolean;
  onClick?: () => void;
}

/**
 * Cartão com inclinação 3D e reflexo dourado que segue o ponteiro.
 * Sem dependências: escreve direto em CSS custom properties (não re-renderiza).
 */
export function TiltCard({
  children,
  className,
  strength = 7,
  glare = true,
  onClick,
}: TiltCardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const reduced = usePrefersReducedMotion();

  const handleMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (reduced || event.pointerType === 'touch') return;
    const node = ref.current;
    if (!node) return;

    cancelAnimationFrame(frame.current);
    const rect = node.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;

    frame.current = requestAnimationFrame(() => {
      node.style.setProperty('--rx', `${(0.5 - y) * strength}deg`);
      node.style.setProperty('--ry', `${(x - 0.5) * strength}deg`);
      node.style.setProperty('--mx', `${x * 100}%`);
      node.style.setProperty('--my', `${y * 100}%`);
      node.style.setProperty('--glare', '1');
    });
  };

  const handleLeave = () => {
    const node = ref.current;
    if (!node) return;
    cancelAnimationFrame(frame.current);
    node.style.setProperty('--rx', '0deg');
    node.style.setProperty('--ry', '0deg');
    node.style.setProperty('--glare', '0');
  };

  return (
    <div style={{ perspective: '1100px' }} className={cn('relative', onClick && 'cursor-pointer')}>
      <div
        ref={ref}
        onPointerMove={handleMove}
        onPointerLeave={handleLeave}
        onClick={onClick}
        className={cn(
          'relative h-full transition-transform duration-500 ease-premium will-change-transform',
          className,
        )}
        style={{
          transform:
            'rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg)) translateZ(0)',
          transformStyle: 'preserve-3d',
        }}
      >
        {children}
        {glare ? (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-[var(--glare,0)] transition-opacity duration-500"
            style={{
              background:
                'radial-gradient(420px circle at var(--mx,50%) var(--my,50%), rgba(227,194,126,.16), transparent 62%)',
            }}
          />
        ) : null}
      </div>
    </div>
  );
}
