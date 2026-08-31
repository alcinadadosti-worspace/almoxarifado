import { useEffect, useRef } from 'react';
import { cn } from '@/lib/cn';
import { usePrefersReducedMotion } from '@/lib/device';

interface CountUpProps {
  value: number;
  duration?: number;
  decimals?: number;
  className?: string;
  suffix?: string;
}

/**
 * Contador animado com easing "expo out" — usa rAF direto e só toca o
 * textContent, então não dispara re-render a cada quadro.
 */
export function CountUp({ value, duration = 1.4, decimals = 0, className, suffix }: CountUpProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  const reduced = usePrefersReducedMotion();

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    const format = (input: number) =>
      input.toLocaleString('pt-BR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
      });

    if (reduced) {
      node.textContent = format(value);
      from.current = value;
      return;
    }

    const start = performance.now();
    const initial = from.current;
    const delta = value - initial;
    let raf = 0;

    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / (duration * 1000));
      const eased = 1 - Math.pow(1 - progress, 4);
      node.textContent = format(initial + delta * eased);
      if (progress < 1) raf = requestAnimationFrame(tick);
      else from.current = value;
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration, decimals, reduced]);

  return (
    <span className={cn('tabular', className)}>
      <span ref={ref}>0</span>
      {suffix}
    </span>
  );
}
