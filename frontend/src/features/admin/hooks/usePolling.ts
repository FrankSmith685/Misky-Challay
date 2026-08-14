import { useCallback, useEffect, useRef, useState } from 'react';
import { getApiErrorMessage } from '@services/api/client';

/** A partir de aqui los datos en pantalla dejan de ser "de ahora mismo". */
const STALE_AFTER_MS = 30_000;

export interface PollingState<T> {
  data: T | null;
  /** Mensaje del ULTIMO intento fallido. Null en cuanto una carga vuelve a salir bien. */
  error: string | null;
  isLoading: boolean;
  /** Momento de la ultima carga correcta, para poder decir "datos de hace N s". */
  lastSuccessAt: number | null;
  /** Hay error y lo que se ve tiene mas de 30 s: la pantalla esta mintiendo. */
  isStale: boolean;
  refresh: () => void;
}

/**
 * Refresca datos cada X segundos.
 *
 * El tablero de cocina tiene que estar vivo sin que nadie pulse F5. Cuando el
 * volumen lo justifique, esto se reemplaza por WebSockets sin tocar las pantallas.
 *
 * Cuatro garantias, todas con un defecto real detras (el patron del token de
 * secuencia esta copiado de AdminComplaintsPage):
 *
 * 1. TOKEN DE SECUENCIA. Solo la peticion de la generacion vigente puede escribir
 *    el estado. Sin esto, una respuesta lenta pisaba a una rapida y un ticket
 *    recien avanzado reaparecia en su columna anterior; al volver a pulsarlo el
 *    backend devolvia 422 por una accion que SI habia funcionado.
 * 2. DATOS LIMPIOS AL CAMBIAR DE FUENTE. Cambiar de sucursal dejaba en pantalla
 *    los tickets de la cocina anterior, con sus botones activos: se podia avanzar
 *    el pedido de OTRA cocina.
 * 3. PAUSA POR VISIBILIDAD + ABORTO. Una tablet bloqueada disparaba 17.280
 *    peticiones por jornada. Con la pestana oculta no se pide nada, y al volver se
 *    refresca de inmediato.
 * 4. UN SOLO VUELO A LA VEZ. Si la red va lenta, los ticks no se apilan.
 *
 * El `fetcher` recibe un AbortSignal: pasarselo al servicio (todos los metodos de
 * `admin.service` lo aceptan) es lo que cancela de verdad la peticion en vuelo.
 * Ignorarlo sigue siendo valido; solo se pierde el aborto en red.
 */
export const usePolling = <T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  intervalMs = 5000,
): PollingState<T> => {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastSuccessAt, setLastSuccessAt] = useState<number | null>(null);
  // Marca de tiempo del ultimo fallo. No se lee: existe para que cada tick fallido
  // provoque un render y `isStale` pueda encenderse sola con el paso del tiempo.
  const [, setLastErrorAt] = useState<number | null>(null);

  // Puente hacia el `run` de la generacion vigente: `refresh` es estable y las
  // pantallas lo pasan como dependencia de sus efectos.
  const runRef = useRef<((manual: boolean) => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    let inFlight: AbortController | null = null;

    // Fuente nueva (otra sucursal, otro filtro): lo anterior ya no describe esto.
    setData(null);
    setError(null);
    setLastSuccessAt(null);
    setIsLoading(true);

    const run = async (manual: boolean) => {
      if (cancelled) return;
      // Peticion en curso: el tick automatico se descarta; el manual la sustituye.
      if (inFlight) {
        if (!manual) return;
        inFlight.abort();
      }

      const controller = new AbortController();
      inFlight = controller;
      try {
        const result = await fetcher(controller.signal);
        if (cancelled || controller.signal.aborted) return;
        setData(result);
        setError(null);
        setLastSuccessAt(Date.now());
      } catch (fetchError) {
        // Abortada a proposito: no es un fallo que deba ver el operario.
        if (cancelled || controller.signal.aborted) return;
        setError(getApiErrorMessage(fetchError));
        setLastErrorAt(Date.now());
      } finally {
        if (inFlight === controller) inFlight = null;
        if (!cancelled && !controller.signal.aborted) setIsLoading(false);
      }
    };

    runRef.current = (manual: boolean) => void run(manual);

    void run(false);

    const timer = setInterval(() => {
      // Pestana oculta: la cocina no esta mirando y la tablet no tiene por que pedir.
      if (document.hidden) return;
      void run(false);
    }, intervalMs);

    const onVisibilityChange = () => {
      if (!document.hidden) void run(false);
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      inFlight?.abort();
      runRef.current = null;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [fetcher, intervalMs]);

  const refresh = useCallback(() => runRef.current?.(true), []);

  // Se evalua en cada render, y cada tick fallido provoca uno: la banda de "sin
  // conexion" aparece como muy tarde un intervalo despues de cumplirse el plazo.
  const isStale =
    error !== null && lastSuccessAt !== null && Date.now() - lastSuccessAt > STALE_AFTER_MS;

  return { data, error, isLoading, lastSuccessAt, isStale, refresh };
};
