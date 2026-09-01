import { useEffect, useRef } from 'react';
import { useHasFinePointer, usePrefersReducedMotion } from '@/lib/device';

/**
 * Cursor dourado que se molda ao conteúdo.
 *
 * Livre, é um anel pequeno que se alonga na direção do movimento — a
 * deformação por velocidade é o que dá sensação de peso. Sobre um elemento
 * marcado com `data-magnetic`, o anel interpola até o formato exato dele
 * (tamanho e raio de borda) e o "abraça", enquanto o próprio elemento é puxado
 * alguns pixels na direção do ponteiro.
 *
 * Tudo é escrito direto no DOM dentro de um rAF: nenhum re-render do React.
 */

const FREE_SIZE = 26;
const PAD = 14;

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
}

const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount;

export function Cursor() {
  const ring = useRef<HTMLDivElement>(null);
  const dot = useRef<HTMLDivElement>(null);
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
    const previous = { ...pointer };
    const velocity = { x: 0, y: 0 };

    const current: Frame = { x: pointer.x, y: pointer.y, w: FREE_SIZE, h: FREE_SIZE, r: FREE_SIZE / 2 };
    const target: Frame = { ...current };

    let magnet: HTMLElement | null = null;
    let pressed = false;
    let raf = 0;

    const releaseMagnet = () => {
      if (!magnet) return;
      magnet.style.transition = 'transform .6s cubic-bezier(.16,1,.3,1)';
      magnet.style.transform = '';
      magnet = null;
    };

    /** Alvo do anel: o retângulo do elemento sob o cursor, ou um círculo livre. */
    const measure = () => {
      if (magnet) {
        const rect = magnet.getBoundingClientRect();
        const radius = Number.parseFloat(getComputedStyle(magnet).borderRadius) || 10;
        target.x = rect.left + rect.width / 2;
        target.y = rect.top + rect.height / 2;
        target.w = rect.width + PAD;
        target.h = rect.height + PAD;
        target.r = Math.min(radius + PAD / 2, (rect.height + PAD) / 2);
        return;
      }
      target.x = pointer.x;
      target.y = pointer.y;
      const scale = pressed ? 0.72 : 1;
      target.w = FREE_SIZE * scale;
      target.h = FREE_SIZE * scale;
      target.r = (FREE_SIZE * scale) / 2;
    };

    const onMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;

      const found = (event.target as HTMLElement | null)?.closest?.(
        '[data-magnetic]',
      ) as HTMLElement | null;

      if (found !== magnet) {
        releaseMagnet();
        magnet = found;
      }

      if (magnet) {
        const rect = magnet.getBoundingClientRect();
        const strength = magnet.dataset.magnetic === 'strong' ? 0.24 : 0.12;
        const dx = (event.clientX - (rect.left + rect.width / 2)) * strength;
        const dy = (event.clientY - (rect.top + rect.height / 2)) * strength;
        magnet.style.transition = 'transform .25s cubic-bezier(.16,1,.3,1)';
        magnet.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0)`;
      }
    };

    const onDown = () => {
      pressed = true;
    };
    const onUp = () => {
      pressed = false;
    };
    const onLeave = () => {
      releaseMagnet();
    };

    const tick = () => {
      measure();

      // o anel persegue com atraso; o alvo travado no elemento é mais firme
      const ease = magnet ? 0.24 : 0.18;
      current.x = lerp(current.x, target.x, ease);
      current.y = lerp(current.y, target.y, ease);
      current.w = lerp(current.w, target.w, 0.22);
      current.h = lerp(current.h, target.h, 0.22);
      current.r = lerp(current.r, target.r, 0.22);

      velocity.x = lerp(velocity.x, pointer.x - previous.x, 0.25);
      velocity.y = lerp(velocity.y, pointer.y - previous.y, 0.25);
      previous.x = pointer.x;
      previous.y = pointer.y;

      // deformação por velocidade — só quando o cursor está livre
      let stretch = '';
      if (!magnet) {
        const speed = Math.min(Math.hypot(velocity.x, velocity.y), 90);
        if (speed > 1) {
          const angle = (Math.atan2(velocity.y, velocity.x) * 180) / Math.PI;
          const amount = speed / 90;
          stretch = ` rotate(${angle.toFixed(1)}deg) scale(${(1 + amount * 0.5).toFixed(3)}, ${(1 - amount * 0.32).toFixed(3)})`;
        }
      }

      const node = ring.current;
      if (node) {
        node.style.width = `${current.w.toFixed(1)}px`;
        node.style.height = `${current.h.toFixed(1)}px`;
        node.style.borderRadius = `${current.r.toFixed(1)}px`;
        node.style.transform = `translate3d(${current.x.toFixed(1)}px, ${current.y.toFixed(1)}px, 0) translate(-50%, -50%)${stretch}`;
        node.style.opacity = magnet ? '1' : '0.55';
      }

      const point = dot.current;
      if (point) {
        point.style.transform = `translate3d(${pointer.x}px, ${pointer.y}px, 0) translate(-50%, -50%) scale(${magnet ? 0 : 1})`;
      }

      raf = requestAnimationFrame(tick);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('pointerup', onUp, { passive: true });
    document.addEventListener('pointerleave', onLeave);
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointerleave', onLeave);
      releaseMagnet();
      document.documentElement.removeAttribute('data-cursor');
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <>
      <div
        ref={ring}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[199] border border-gold-300/80 transition-[opacity] duration-300"
        style={{ width: FREE_SIZE, height: FREE_SIZE, willChange: 'width, height, transform' }}
      />
      <div
        ref={dot}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[200] h-[3px] w-[3px] rounded-full bg-gold-200 transition-opacity duration-200"
        style={{ willChange: 'transform' }}
      />
    </>
  );
}
