import { useEffect, useRef } from 'react';
import { useHasFinePointer, usePrefersReducedMotion } from '@/lib/device';

/**
 * Cursor dourado das páginas de marca (landing e login).
 *
 * Três estados, decididos pelo que está sob o ponteiro **a cada quadro** — não
 * só quando o mouse se move. Rolagem, troca de página e conteúdo que aparece
 * ou some trocam o elemento debaixo do cursor sem nenhum `pointermove`, e a
 * versão anterior ficava presa ao alvo antigo até o próximo gesto.
 *
 *  - **livre**: um ponto que se alonga na direção do movimento;
 *  - **alvo**: sobre algo clicável, um anel interpola até o retângulo exato do
 *    elemento e o abraça; elementos com `data-magnetic` ainda são puxados na
 *    direção do ponteiro;
 *  - **texto**: sobre campos de digitação, uma barra vertical fina.
 */

const CLICKABLE =
  'a[href], button, [role="button"], summary, label[for], select, ' +
  'input[type="checkbox"], input[type="radio"], input[type="submit"], [data-magnetic]';

const TEXT_FIELD =
  'input:not([type="checkbox"]):not([type="radio"]):not([type="submit"]):not([type="button"]), ' +
  'textarea, [contenteditable="true"]';

const DOT = 7;
const PAD = 14;

type Mode = 'free' | 'target' | 'text';

interface Frame {
  x: number;
  y: number;
  w: number;
  h: number;
  r: number;
  alpha: number;
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

    const pointer = { x: -100, y: -100 };
    const previous = { ...pointer };
    const velocity = { x: 0, y: 0 };
    let seen = false;

    const current: Frame = { x: pointer.x, y: pointer.y, w: DOT, h: DOT, r: DOT / 2, alpha: 0 };
    const target: Frame = { ...current };

    let mode: Mode = 'free';
    let element: HTMLElement | null = null;
    let magnet: HTMLElement | null = null;
    let pressed = false;
    let raf = 0;

    const releaseMagnet = () => {
      if (!magnet) return;
      magnet.style.transition = 'transform .6s cubic-bezier(.16,1,.3,1)';
      magnet.style.transform = '';
      magnet = null;
    };

    const isDisabled = (node: HTMLElement) =>
      node.hasAttribute('disabled') || node.getAttribute('aria-disabled') === 'true';

    /** Decide o modo a partir do elemento realmente sob o ponteiro agora. */
    const resolve = () => {
      const under = seen ? (document.elementFromPoint(pointer.x, pointer.y) as HTMLElement | null) : null;
      if (!under?.closest) {
        mode = 'free';
        element = null;
        return;
      }
      const clickable = under.closest(CLICKABLE) as HTMLElement | null;
      if (clickable && !isDisabled(clickable)) {
        mode = 'target';
        element = clickable;
        return;
      }
      const field = under.closest(TEXT_FIELD) as HTMLElement | null;
      if (field && !isDisabled(field)) {
        mode = 'text';
        element = field;
        return;
      }
      mode = 'free';
      element = null;
    };

    /** Puxa o elemento magnético alguns pixels na direção do ponteiro. */
    const syncMagnet = () => {
      const wanted =
        mode === 'target' ? ((element?.closest('[data-magnetic]') as HTMLElement | null) ?? null) : null;
      if (wanted !== magnet) {
        releaseMagnet();
        magnet = wanted;
      }
      if (!magnet) return;
      const rect = magnet.getBoundingClientRect();
      const strength = magnet.dataset.magnetic === 'strong' ? 0.22 : 0.1;
      const dx = (pointer.x - (rect.left + rect.width / 2)) * strength;
      const dy = (pointer.y - (rect.top + rect.height / 2)) * strength;
      magnet.style.transition = 'transform .25s cubic-bezier(.16,1,.3,1)';
      magnet.style.transform = `translate3d(${dx.toFixed(2)}px, ${dy.toFixed(2)}px, 0)`;
    };

    const measure = () => {
      if (mode === 'target' && element) {
        const rect = element.getBoundingClientRect();
        const radius = Number.parseFloat(getComputedStyle(element).borderRadius) || 10;
        target.x = rect.left + rect.width / 2;
        target.y = rect.top + rect.height / 2;
        target.w = rect.width + PAD;
        target.h = rect.height + PAD;
        target.r = Math.min(radius + PAD / 2, (rect.height + PAD) / 2);
        target.alpha = 1;
        return;
      }
      if (mode === 'text' && element) {
        const size = Number.parseFloat(getComputedStyle(element).fontSize) || 16;
        target.x = pointer.x;
        target.y = pointer.y;
        target.w = 2;
        target.h = size * 1.5;
        target.r = 1;
        target.alpha = 0.9;
        return;
      }
      target.x = pointer.x;
      target.y = pointer.y;
      target.w = DOT;
      target.h = DOT;
      target.r = DOT / 2;
      target.alpha = 0;
    };

    const onMove = (event: PointerEvent) => {
      pointer.x = event.clientX;
      pointer.y = event.clientY;
      if (!seen) {
        // primeiro contato: nasce onde o mouse está, sem viajar do canto da tela
        seen = true;
        current.x = pointer.x;
        current.y = pointer.y;
        previous.x = pointer.x;
        previous.y = pointer.y;
      }
    };
    const onDown = () => {
      pressed = true;
    };
    const onUp = () => {
      pressed = false;
    };
    const onLeave = () => {
      seen = false;
      releaseMagnet();
    };

    const tick = () => {
      resolve();
      syncMagnet();
      measure();

      const ease = mode === 'target' ? 0.26 : 0.2;
      current.x = lerp(current.x, target.x, ease);
      current.y = lerp(current.y, target.y, ease);
      current.w = lerp(current.w, target.w, 0.24);
      current.h = lerp(current.h, target.h, 0.24);
      current.r = lerp(current.r, target.r, 0.24);
      current.alpha = lerp(current.alpha, target.alpha, 0.2);

      velocity.x = lerp(velocity.x, pointer.x - previous.x, 0.25);
      velocity.y = lerp(velocity.y, pointer.y - previous.y, 0.25);
      previous.x = pointer.x;
      previous.y = pointer.y;

      const node = ring.current;
      if (node) {
        node.style.width = `${current.w.toFixed(1)}px`;
        node.style.height = `${current.h.toFixed(1)}px`;
        node.style.borderRadius = `${current.r.toFixed(1)}px`;
        node.style.opacity = seen ? current.alpha.toFixed(2) : '0';
        node.style.transform = `translate3d(${current.x.toFixed(1)}px, ${current.y.toFixed(1)}px, 0) translate(-50%, -50%)`;
        node.style.backgroundColor = mode === 'text' ? 'rgb(201 160 80)' : 'transparent';
      }

      const point = dot.current;
      if (point) {
        const speed = Math.min(Math.hypot(velocity.x, velocity.y), 80);
        const amount = speed / 80;
        const angle = speed > 1 ? (Math.atan2(velocity.y, velocity.x) * 180) / Math.PI : 0;
        const scale = !seen ? 0 : mode === 'free' ? (pressed ? 0.6 : 1) : 0;
        point.style.transform =
          `translate3d(${pointer.x}px, ${pointer.y}px, 0) translate(-50%, -50%) ` +
          `rotate(${angle.toFixed(1)}deg) ` +
          `scale(${(scale * (1 + amount * 1.1)).toFixed(3)}, ${(scale * (1 - amount * 0.45)).toFixed(3)})`;
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
        className="pointer-events-none fixed left-0 top-0 z-[199] border border-gold-300/85"
        style={{ width: DOT, height: DOT, opacity: 0, willChange: 'width, height, transform, opacity' }}
      />
      <div
        ref={dot}
        aria-hidden
        className="pointer-events-none fixed left-0 top-0 z-[200] rounded-full bg-gold-200"
        style={{ width: DOT, height: DOT, willChange: 'transform' }}
      />
    </>
  );
}
