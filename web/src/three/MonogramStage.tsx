import { Suspense, lazy, useEffect, useState } from 'react';
import { MonogramMark } from '@/components/brand/MonogramMark';
import { cn } from '@/lib/cn';
import { useCanRender3D } from '@/lib/device';
import type { MonogramCanvasProps } from './MonogramCanvas';

const MonogramCanvas = lazy(() => import('./MonogramCanvas'));

interface MonogramStageProps extends MonogramCanvasProps {
  className?: string;
  /** Atrasa a montagem da cena para não competir com o primeiro paint. */
  delay?: number;
}

/**
 * Fallback estático: o mesmo monograma em SVG com brilho em CSS.
 * É o que dispositivos fracos, `prefers-reduced-motion` e o SSR veem —
 * a página nunca fica vazia esperando WebGL.
 */
function StaticMonogram({ className }: { className?: string }) {
  return (
    <div className={cn('relative grid h-full w-full place-items-center', className)}>
      <div
        aria-hidden
        className="absolute h-[46%] w-[46%] rounded-full bg-gold-400/20 blur-[90px]"
      />
      <MonogramMark className="relative h-[46%] w-[46%] animate-float drop-shadow-[0_18px_60px_rgba(201,160,80,0.35)]" />
    </div>
  );
}

export function MonogramStage({ className, delay = 260, ...props }: MonogramStageProps) {
  const canRender3D = useCanRender3D();
  const [mounted, setMounted] = useState(delay === 0);

  useEffect(() => {
    if (delay === 0) return;
    const timer = window.setTimeout(() => setMounted(true), delay);
    return () => window.clearTimeout(timer);
  }, [delay]);

  if (!canRender3D || !mounted) {
    return <StaticMonogram className={className} />;
  }

  return (
    <Suspense fallback={<StaticMonogram className={className} />}>
      <MonogramCanvas className={className} {...props} />
    </Suspense>
  );
}
