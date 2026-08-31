import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { usePrefersReducedMotion } from '@/lib/device';

const GOLDS = ['#F6E7C1', '#E3C27E', '#C9A050', '#A5813A', '#8A6A2F'];

/**
 * Chuva de lâminas douradas em DOM — leve, funciona em qualquer aparelho e
 * complementa a explosão 3D do selo sem custo de WebGL.
 */
export function Confetti({ count = 64 }: { count?: number }) {
  const reduced = usePrefersReducedMotion();

  const shards = useMemo(
    () =>
      Array.from({ length: count }).map((_, index) => ({
        id: index,
        left: Math.random() * 100,
        delay: Math.random() * 0.6,
        duration: 2.4 + Math.random() * 2.2,
        drift: (Math.random() - 0.5) * 220,
        rotate: Math.random() * 720 - 360,
        width: 4 + Math.random() * 5,
        height: 9 + Math.random() * 14,
        color: GOLDS[index % GOLDS.length],
        radius: Math.random() > 0.7 ? '99px' : '1px',
      })),
    [count],
  );

  if (reduced) return null;

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-[110] overflow-hidden">
      {shards.map((shard) => (
        <motion.span
          key={shard.id}
          className="absolute top-[-8%] block"
          style={{
            left: `${shard.left}%`,
            width: shard.width,
            height: shard.height,
            background: shard.color,
            borderRadius: shard.radius,
            boxShadow: `0 0 12px ${shard.color}66`,
          }}
          initial={{ y: '-10vh', opacity: 0, rotate: 0 }}
          animate={{
            y: '112vh',
            x: shard.drift,
            opacity: [0, 1, 1, 0],
            rotate: shard.rotate,
          }}
          transition={{
            duration: shard.duration,
            delay: shard.delay,
            ease: [0.2, 0.6, 0.4, 1],
            times: [0, 0.08, 0.75, 1],
          }}
        />
      ))}
    </div>
  );
}
