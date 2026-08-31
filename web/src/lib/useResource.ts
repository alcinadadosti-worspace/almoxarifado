import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from './api';

interface ResourceState<T> {
  data: T | null;
  loading: boolean;
  error: ApiError | null;
  reload: () => Promise<void>;
  setData: (updater: T | ((current: T | null) => T | null)) => void;
}

/**
 * Busca simples com recarregamento — suficiente para o volume desta aplicação
 * e sem trazer uma biblioteca de cache para o bundle.
 */
export function useResource<T>(path: string | null, deps: unknown[] = []): ResourceState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const [error, setError] = useState<ApiError | null>(null);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!path) {
      setLoading(false);
      return;
    }
    controller.current?.abort();
    const next = new AbortController();
    controller.current = next;

    setLoading(true);
    setError(null);
    try {
      setData(await api.get<T>(path, { signal: next.signal }));
    } catch (caught) {
      if ((caught as Error).name === 'AbortError') return;
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(0, 'Não foi possível carregar os dados.', 'unknown'),
      );
    } finally {
      if (!next.signal.aborted) setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, ...deps]);

  useEffect(() => {
    void load();
    return () => controller.current?.abort();
  }, [load]);

  return {
    data,
    loading,
    error,
    reload: load,
    setData: (updater) =>
      setData((current) =>
        typeof updater === 'function' ? (updater as (c: T | null) => T | null)(current) : updater,
      ),
  };
}

/** Debounce para campos de busca. */
export function useDebounced<T>(value: T, delay = 320): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}
