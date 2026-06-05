import { useCallback, useEffect, useRef, useState } from "react";

interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/** Async data-fetching hook with auto-cleanup on unmount */
export function useAsyncState<T>(
  asyncFn: () => Promise<T>,
  deps: any[] = []
): AsyncState<T> & { refetch: () => void } {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    loading: true,
    error: null,
  });
  const mountedRef = useRef(true);
  const versionRef = useRef(0);

  const execute = useCallback(async () => {
    const version = ++versionRef.current;
    setState((s) => ({ ...s, loading: true, error: null }));
    try {
      const data = await asyncFn();
      if (mountedRef.current && version === versionRef.current) {
        setState({ data, loading: false, error: null });
      }
    } catch (e: any) {
      if (mountedRef.current && version === versionRef.current) {
        setState((s) => ({
          ...s,
          loading: false,
          error: e?.message ?? "Erro desconhecido",
        }));
      }
    }
  }, deps);

  useEffect(() => {
    mountedRef.current = true;
    execute();
    return () => { mountedRef.current = false; };
  }, [execute]);

  return { ...state, refetch: execute };
}
