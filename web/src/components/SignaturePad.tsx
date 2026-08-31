import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { cn } from '@/lib/cn';

interface Point {
  x: number;
  y: number;
  /** Largura já suavizada do traço neste ponto. */
  w: number;
}

export interface SignaturePadHandle {
  /** PNG recortado no traço, fundo transparente, 2x. `null` se estiver vazio. */
  toDataUrl: () => string | null;
  clear: () => void;
  undo: () => void;
  isEmpty: () => boolean;
}

interface SignaturePadProps {
  className?: string;
  label?: string;
  hint?: string;
  onChange?: (hasContent: boolean) => void;
  height?: number;
}

const BASE_WIDTH = 2.6;
const MIN_WIDTH = 1.05;
const PADDING = 18;

/**
 * Canvas de assinatura com tinta dourada.
 *
 * A largura do traço responde à velocidade do gesto (rápido = fino), como uma
 * caneta de verdade — é o detalhe que faz a assinatura parecer manuscrita e não
 * um rabisco de mouse. Funciona com dedo, caneta e mouse (Pointer Events).
 */
export const SignaturePad = forwardRef<SignaturePadHandle, SignaturePadProps>(
  function SignaturePad({ className, label, hint, onChange, height = 220 }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const strokes = useRef<Point[][]>([]);
    const current = useRef<Point[] | null>(null);
    const lastWidth = useRef(BASE_WIDTH);
    const [hasContent, setHasContent] = useState(false);

    /* ---------------------------------------------------------- desenho */

    const inkGradient = (context: CanvasRenderingContext2D, width: number) => {
      const gradient = context.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, '#6E5320');
      gradient.addColorStop(0.45, '#A5813A');
      gradient.addColorStop(1, '#C9A050');
      return gradient;
    };

    const paintStrokes = useCallback(
      (
        context: CanvasRenderingContext2D,
        width: number,
        list: Point[][],
        offsetX = 0,
        offsetY = 0,
        scale = 1,
      ) => {
        context.lineCap = 'round';
        context.lineJoin = 'round';
        context.strokeStyle = inkGradient(context, width);

        for (const stroke of list) {
          if (stroke.length === 1) {
            const point = stroke[0];
            context.beginPath();
            context.fillStyle = context.strokeStyle;
            context.arc(
              (point.x - offsetX) * scale,
              (point.y - offsetY) * scale,
              (point.w / 2) * scale,
              0,
              Math.PI * 2,
            );
            context.fill();
            continue;
          }

          for (let i = 1; i < stroke.length; i++) {
            const previous = stroke[i - 1];
            const point = stroke[i];
            context.beginPath();
            context.lineWidth = point.w * scale;
            context.moveTo((previous.x - offsetX) * scale, (previous.y - offsetY) * scale);
            const midX = (previous.x + point.x) / 2;
            const midY = (previous.y + point.y) / 2;
            context.quadraticCurveTo(
              (previous.x - offsetX) * scale,
              (previous.y - offsetY) * scale,
              (midX - offsetX) * scale,
              (midY - offsetY) * scale,
            );
            context.lineTo((point.x - offsetX) * scale, (point.y - offsetY) * scale);
            context.stroke();
          }
        }
      },
      [],
    );

    const redraw = useCallback(() => {
      const canvas = canvasRef.current;
      const context = canvas?.getContext('2d');
      if (!canvas || !context) return;
      const dpr = window.devicePixelRatio || 1;
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      context.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      paintStrokes(context, canvas.width / dpr, strokes.current);
    }, [paintStrokes]);

    /* --------------------------------------------------- redimensionamento */

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const resize = () => {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);
        redraw();
      };

      resize();
      const observer = new ResizeObserver(resize);
      observer.observe(canvas);
      return () => observer.disconnect();
    }, [redraw]);

    /* ------------------------------------------------------------ eventos */

    const positionOf = (event: React.PointerEvent<HTMLCanvasElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      return { x: event.clientX - rect.left, y: event.clientY - rect.top };
    };

    const handleDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      const { x, y } = positionOf(event);
      lastWidth.current = BASE_WIDTH;
      current.current = [{ x, y, w: BASE_WIDTH }];
      strokes.current.push(current.current);
    };

    const handleMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
      const stroke = current.current;
      if (!stroke) return;
      event.preventDefault();

      const { x, y } = positionOf(event);
      const previous = stroke[stroke.length - 1];
      const distance = Math.hypot(x - previous.x, y - previous.y);
      if (distance < 1.1) return;

      // pressão real quando houver (caneta); senão, velocidade do gesto
      const pressure = event.pressure > 0 && event.pressure !== 0.5 ? event.pressure : null;
      const target = pressure
        ? MIN_WIDTH + (BASE_WIDTH * 1.4 - MIN_WIDTH) * pressure
        : Math.max(MIN_WIDTH, BASE_WIDTH - Math.min(distance, 14) * 0.11);
      const width = lastWidth.current + (target - lastWidth.current) * 0.35;
      lastWidth.current = width;

      stroke.push({ x, y, w: width });
      redraw();

      if (!hasContent) {
        setHasContent(true);
        onChange?.(true);
      }
    };

    const handleUp = () => {
      current.current = null;
    };

    /* -------------------------------------------------------------- API */

    const clear = useCallback(() => {
      strokes.current = [];
      current.current = null;
      setHasContent(false);
      onChange?.(false);
      redraw();
    }, [onChange, redraw]);

    const undo = useCallback(() => {
      strokes.current.pop();
      const empty = strokes.current.length === 0;
      setHasContent(!empty);
      onChange?.(!empty);
      redraw();
    }, [onChange, redraw]);

    useImperativeHandle(
      ref,
      () => ({
        clear,
        undo,
        isEmpty: () => strokes.current.length === 0,
        toDataUrl: () => {
          const canvas = canvasRef.current;
          if (!canvas || strokes.current.length === 0) return null;

          // recorta na área realmente assinada e exporta em 2x, sem fundo
          let minX = Infinity;
          let minY = Infinity;
          let maxX = -Infinity;
          let maxY = -Infinity;
          for (const stroke of strokes.current) {
            for (const point of stroke) {
              minX = Math.min(minX, point.x - point.w);
              minY = Math.min(minY, point.y - point.w);
              maxX = Math.max(maxX, point.x + point.w);
              maxY = Math.max(maxY, point.y + point.w);
            }
          }
          minX = Math.max(0, minX - PADDING);
          minY = Math.max(0, minY - PADDING);
          const rect = canvas.getBoundingClientRect();
          maxX = Math.min(rect.width, maxX + PADDING);
          maxY = Math.min(rect.height, maxY + PADDING);

          const scale = 2;
          const output = document.createElement('canvas');
          output.width = Math.max(2, Math.round((maxX - minX) * scale));
          output.height = Math.max(2, Math.round((maxY - minY) * scale));
          const context = output.getContext('2d');
          if (!context) return null;

          paintStrokes(context, output.width, strokes.current, minX, minY, scale);
          return output.toDataURL('image/png');
        },
      }),
      [clear, undo, paintStrokes],
    );

    /* ------------------------------------------------------------- render */

    return (
      <div className={cn('flex flex-col gap-2', className)}>
        {label ? (
          <div className="flex items-baseline justify-between gap-4">
            <span className="text-[0.66rem] font-semibold uppercase tracking-widest text-ink-400">
              {label}
            </span>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={undo}
                disabled={!hasContent}
                className="text-[0.7rem] font-semibold uppercase tracking-wider text-ink-400 transition-colors hover:text-gold-700 disabled:opacity-35"
              >
                Desfazer
              </button>
              <span aria-hidden className="h-3 w-px bg-ink-900/15" />
              <button
                type="button"
                onClick={clear}
                disabled={!hasContent}
                className="text-[0.7rem] font-semibold uppercase tracking-wider text-ink-400 transition-colors hover:text-gold-700 disabled:opacity-35"
              >
                Limpar
              </button>
            </div>
          </div>
        ) : null}

        <div
          className="relative overflow-hidden rounded-2xl border border-ink-900/12 bg-white shadow-[inset_0_1px_2px_rgba(20,18,12,.06)]"
          style={{ height }}
        >
          {/* linha-guia de assinatura, como no papel */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-8 bottom-[28%] h-px bg-gradient-to-r from-transparent via-ink-900/15 to-transparent"
          />
          <span
            aria-hidden
            className="pointer-events-none absolute bottom-[calc(28%-0.75rem)] left-7 font-display text-lg text-ink-900/15"
          >
            ×
          </span>

          {!hasContent ? (
            <span className="pointer-events-none absolute inset-0 grid place-items-center text-center text-[0.8rem] text-ink-400/70">
              Assine aqui com o dedo ou o mouse
            </span>
          ) : null}

          <canvas
            ref={canvasRef}
            onPointerDown={handleDown}
            onPointerMove={handleMove}
            onPointerUp={handleUp}
            onPointerLeave={handleUp}
            onPointerCancel={handleUp}
            className="relative h-full w-full touch-none"
            style={{ cursor: 'crosshair' }}
          />
        </div>

        {hint ? <p className="text-[0.72rem] text-ink-400">{hint}</p> : null}
      </div>
    );
  },
);
