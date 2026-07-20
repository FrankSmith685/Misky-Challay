import { useEffect, useState } from 'react';

/** Retrasa un valor: util para buscadores del menu sin disparar una peticion por tecla. */
export const useDebounce = <T>(value: T, delay = 400): T => {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);

  return debounced;
};
