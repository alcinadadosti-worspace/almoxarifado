import { useEffect, useRef } from 'react';
import { useHasFinePointer, usePrefersReducedMotion } from '@/lib/device';

/**
 * Cursor dourado com magnetismo.
 *
 * O anel gruda em elementos marcados com `data-magnetic="soft|strong"` e o
 * próprio elemento é puxado alguns pixels na direção do ponteiro — o detalhe
 * que dá a sensação "premium". Desliga em toque e em `prefers-reduced-motion`.
 */
export function Cursor() {
  const dot = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLDivElement>(null);
  const fine = useHasFinePointer();
  const reduced = usePrefersReducedMotion();
  const enabled = fine && !reduced;

  useEffect(() => {
    if (!enabled) {
      document.documentElement.removeAttribute('data-cursor');
      return;
    }
    document.documentElement.setAttribute('data-cursor', 'custom');

    const pointer = { x: innerWidth / 2, y: innerHeight / 2 };
    const ringPos = { ...pointer };
    let magnet: HTMLElement | null = null;
    let raf = 0;
    let scale = 1;
    let targetScale = 1;

    const onMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;

      const target = (event.target as HTMLElement | null)?.closest?.(
        '[data-magnetic]',
      ) as HTMLElement | null;

      if (magnet && magnet !== target) {
        magnet.style.transform = '';
        magnet.style.transition = 'transform .5s cubic-bezier(.16,1,.3,1)';
      }
      magnet = target;
      targetScale = target ? 1.9 : 1;

      if (magnet) {
        const rect = magnet.getBoundingClientRect();
        const strength = magnet.dataset.magnetic === 'strong' ? 0.32 : 0.16;
        const dx = (event.clientX - (rect.left + rect.width / 2)) * strength;
        const dy = (event.clientY - (rect.top + rect.height / 2)) * strength;
        magnet.style.transition = 'transform .18s cubic-bezier(.16,1,.3,1)';
        magnet.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
      }
    };

    const onDown = () => {
      targetScale = magnet ? 1.5 : 0.7;
    };
    const onUp = () => {
      targetScale = magnet ? 1.9 : 1;
    };

    const tick = () => {
      // seguidor com atraso — o ponto é exato, o anel "respira" atrás
      ringPos.x += (pointer.x - ringPos.x) * 0.16;
      ringPos.y += (pointer.y - ringPos.y) * 0.16;
      scale += (targetScale - scale) * 0.14;

      if (dot.current) {
        dot.current.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0) translate(-50%, -50%)`;
      }
      if (ring.current) {
        ring.current.style.transform = `translate3d(${ringPos.x}px, ${ringPos.y}px, 0) translate(-50%, -50%) scale(${scale.toFixed(3)})`;
        ring.current.style.opacity = magnet ? '0.85' : '0.45';
      }
      raf = requestAnimationFrame(tick);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      if (magnet) magnet.style.transform = '';
      document.documentElement.removeAttribute('data-cursor');
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      <div
        ref={dot}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[200] h-1.5 w-1.5 rounded-full bg-gold-200 mix-blend-difference"
      />
      <div
        ref={ring}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[199] h-8 w-8 rounded-full border border-gold-300/70 transition-[opacity] duration-300"
      />
    </>
  );
}
