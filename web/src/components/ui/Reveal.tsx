import { motion, useInView, type Variants } from 'framer-motion';
import { useRef, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { usePrefersReducedMotion } from '@/lib/device';

const EASE = [0.22, 1, 0.36, 1] as const;

/** Mola macia: chega rápido, assenta sem estourar. */
const SPRING = { type: 'spring', stiffness: 130, damping: 20, mass: 0.9 } as const;

interface RevealProps {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  once?: boolean;
  as?: 'div' | 'section' | 'li' | 'article' | 'header';
}

/** Entrada com mola: sobe, ganha nitidez e assenta. */
export function Reveal({
  children,
  delay = 0,
  y = 26,
  className,
  once = true,
  as = 'div',
}: RevealProps) {
  const reduced = usePrefersReducedMotion();
  const Component = motion[as];

  if (reduced) {
    const Static = as;
    return <Static className={className}>{children}</Static>;
  }

  return (
    <Component
      initial={{ opacity: 0, y, filter: 'blur(7px)' }}
      whileInView={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      viewport={{ once, margin: '-12% 0px -8% 0px' }}
      transition={{ ...SPRING, delay, opacity: { duration: 0.5, delay, ease: EASE } }}
      className={className}
    >
      {children}
    </Component>
  );
}

/**
 * Revelação por máscara: o conteúdo é descoberto de baixo para cima enquanto
 * sobe um pouco mais devagar que a máscara. É o efeito que dá profundidade
 * cinematográfica — o olho lê como se algo estivesse sendo desvelado, não
 * apenas aparecendo.
 */
export function MaskReveal({
  children,
  delay = 0,
  className,
  once = true,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  once?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once, margin: '-10% 0px -6% 0px' });
  const reduced = usePrefersReducedMotion();

  if (reduced) return <div className={className}>{children}</div>;

  return (
    <div ref={ref} className={cn('overflow-hidden', className)}>
      <motion.div
        initial={{ clipPath: 'inset(100% 0% 0% 0%)', y: 34, scale: 1.03 }}
        animate={
          inView
            ? { clipPath: 'inset(0% 0% 0% 0%)', y: 0, scale: 1 }
            : { clipPath: 'inset(100% 0% 0% 0%)', y: 34, scale: 1.03 }
        }
        transition={{
          clipPath: { duration: 0.95, delay, ease: EASE },
          y: { duration: 1.05, delay: delay + 0.04, ease: EASE },
          scale: { duration: 1.2, delay, ease: EASE },
        }}
      >
        {children}
      </motion.div>
    </div>
  );
}

export const staggerContainer: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
};

export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 22, filter: 'blur(6px)' },
  show: { opacity: 1, y: 0, filter: 'blur(0px)', transition: SPRING },
};

/**
 * Título que sobe palavra por palavra de dentro de uma máscara.
 * Cada palavra tem seu próprio atraso e uma leve rotação — o desalinhamento
 * sutil é o que separa "texto animado" de "texto que ganha vida".
 */
export function SplitHeading({
  text,
  className,
  delay = 0,
  stagger = 0.06,
}: {
  text: string;
  className?: string;
  delay?: number;
  stagger?: number;
}) {
  const reduced = usePrefersReducedMotion();
  const words = text.split(' ');

  if (reduced) return <span className={className}>{text}</span>;

  return (
    <span className={cn('inline-block', className)}>
      {words.map((word, index) => (
        <span
          key={`${word}-${index}`}
          className="inline-block overflow-hidden pb-[0.12em] align-bottom"
        >
          <motion.span
            className="inline-block"
            initial={{ y: '115%', rotate: 3, opacity: 0 }}
            animate={{ y: '0%', rotate: 0, opacity: 1 }}
            transition={{
              duration: 1.05,
              delay: delay + index * stagger,
              ease: EASE,
            }}
          >
            {word}
            {index < words.length - 1 ? ' ' : ''}
          </motion.span>
        </span>
      ))}
    </span>
  );
}
