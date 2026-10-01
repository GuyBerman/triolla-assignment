import { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../api/client';

export interface ApiState<T> {
  data: T | null;
  error: string | null;
  /** First load only, so a pull-to-refresh does not blank the screen. */
  loading: boolean;
  refreshing: boolean;
  refetch: () => void;
}

export function useApi<T>(path: string | null): ApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [refreshing, setRefreshing] = useState(false);

  // Guards against a slow earlier request resolving after a newer one and
  // overwriting fresher data, which shows up as a flicker back to stale values.
  const requestId = useRef(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(
    async (mode: 'initial' | 'refresh') => {
      if (path === null) return;

      const id = requestId.current + 1;
      requestId.current = id;

      if (mode === 'initial') setLoading(true);
      else setRefreshing(true);

      try {
        const result = await api.get<T>(path);
        if (!mounted.current || requestId.current !== id) return;
        setData(result);
        setError(null);
      } catch (err) {
        if (!mounted.current || requestId.current !== id) return;
        setError(err instanceof Error ? err.message : 'Something went wrong');
      } finally {
        if (mounted.current && requestId.current === id) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    },
    [path],
  );

  useEffect(() => {
    void load('initial');
  }, [load]);

  const refetch = useCallback(() => {
    void load('refresh');
  }, [load]);

  return { data, error, loading, refreshing, refetch };
}
