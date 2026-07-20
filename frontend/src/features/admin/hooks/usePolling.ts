import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Refresca datos cada X segundos.
 * El tablero de cocina tiene que estar vivo sin que nadie pulse F5. Cuando el
 * volumen lo justifique, esto se reemplaza por WebSockets sin tocar las pantallas.
 */
export const usePolling = <T>(fetcher: () => Promise<T>, intervalMs = 5000) => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const savedFetcher = useRef(fetcher);

  savedFetcher.current = fetcher;

  const refresh = useCallback(async () => {
    try {
      const result = await savedFetcher.current();
      setData(result);
      setError(null);
    } catch (fetchError) {
      setError(fetchError instanceof Error ? fetchError.message : 'Error al cargar');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [refresh, intervalMs, fetcher]);

  return { data, error, isLoading, refresh };
};
