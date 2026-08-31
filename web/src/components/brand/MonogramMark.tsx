import { useId } from 'react';
import { MONOGRAM_PATH, MONOGRAM_VIEWBOX } from '@/assets/monogram';
import { cn } from '@/lib/cn';

interface MonogramMarkProps {
  className?: string;
  /** `gold` usa o gradiente da marca; `current` herda a cor do texto. */
  tone?: 'gold' | 'current';
  title?: string;
  /** Anima o traço como se o monograma fosse desenhado à mão. */
  animate?: boolean;
}

/**
 * Monograma "AM" vetorial — gerado a partir do PNG oficial por
 * `tools/trace-monogram.mjs`, então é o traço real da marca.
 */
export function MonogramMark({
  className,
  tone = 'gold',
  title,
  animate = false,
}: MonogramMarkProps) {
  const id = useId().replace(/:/g, '');
  const gradientId = `am-gold-${id}`;

  return (
    <svg
      viewBox={`0 0 ${MONOGRAM_VIEWBOX} ${MONOGRAM_VIEWBOX}`}
      className={cn('block', className)}
      role={title ? 'img' : 'presentation'}
      aria-label={title}
      aria-hidden={title ? undefined : true}
    >
      {tone === 'gold' ? (
        <defs>
          <linearGradient id={gradientId} x1="18%" y1="6%" x2="86%" y2="94%">
            <stop offset="0%" stopColor="#F6E7C1" />
            <stop offset="34%" stopColor="#E3C27E" />
            <stop offset="62%" stopColor="#C9A050" />
            <stop offset="100%" stopColor="#8A6A2F" />
          </linearGradient>
        </defs>
      ) : null}
      <path
        d={MONOGRAM_PATH}
        fill={tone === 'gold' ? `url(#${gradientId})` : 'currentColor'}
        fillRule="evenodd"
        className={animate ? 'animate-fade-up' : undefined}
      />
    </svg>
  );
}
