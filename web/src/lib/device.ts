import { useEffect, useState } from 'react';

/** Respeita `prefers-reduced-motion` em toda a camada de animação. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() =>
    typeof matchMedia === 'function'
      ? matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  );

  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }, []);

  return reduced;
}

interface NavigatorWithHints extends Navigator {
  deviceMemory?: number;
  connection?: { saveData?: boolean; effectiveType?: string };
}

/**
 * Heurística de capacidade para decidir entre a cena WebGL completa e o
 * fallback estático: memória, núcleos, economia de dados e suporte a WebGL2.
 */
let lowEndVerdict: boolean | null = null;

export function detectLowEndDevice(): boolean {
  // A sondagem cria um contexto WebGL. Sem cache, cada página que montasse a
  // cena 3D gastaria mais um dos ~16 contextos que o navegador permite — e o
  // "THREE.WebGLRenderer: Context Lost" aparecia depois de algumas navegações.
  if (lowEndVerdict !== null) return lowEndVerdict;
  if (typeof navigator === 'undefined') return true;

  const nav = navigator as NavigatorWithHints;
  const decide = (verdict: boolean) => {
    lowEndVerdict = verdict;
    return verdict;
  };

  if (nav.connection?.saveData) return decide(true);
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory > 0 && nav.deviceMemory <= 3) {
    return decide(true);
  }
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 3) {
    return decide(true);
  }

  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (!gl) return decide(true);
    // devolve o contexto de teste ao navegador em vez de deixá-lo vazar
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  } catch {
    return decide(true);
  }

  return decide(false);
}

/** `true` quando vale a pena renderizar a cena 3D. */
export function useCanRender3D(): boolean {
  const reduced = usePrefersReducedMotion();
  const [capable, setCapable] = useState(false);

  useEffect(() => {
    setCapable(!detectLowEndDevice());
  }, []);

  return capable && !reduced;
}

export function useIsMobile(breakpoint = 768): boolean {
  const [mobile, setMobile] = useState(() =>
    typeof window === 'undefined' ? false : window.innerWidth < breakpoint,
  );

  useEffect(() => {
    const handler = () => setMobile(window.innerWidth < breakpoint);
    window.addEventListener('resize', handler, { passive: true });
    return () => window.removeEventListener('resize', handler);
  }, [breakpoint]);

  return mobile;
}

/**
 * Ponteiro fino **e** com hover real — habilita o cursor customizado.
 * `hover: hover` exclui celulares que reportam `pointer: fine` por causa da
 * caneta, onde esconder o cursor nativo não faria sentido.
 */
export function useHasFinePointer(): boolean {
  const [fine, setFine] = useState(false);

  useEffect(() => {
    const query = matchMedia('(pointer: fine) and (hover: hover)');
    setFine(query.matches);
    const handler = (event: MediaQueryListEvent) => setFine(event.matches);
    query.addEventListener('change', handler);
    return () => query.removeEventListener('change', handler);
  }, []);

  return fine;
}
