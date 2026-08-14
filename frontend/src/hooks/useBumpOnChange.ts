import { useEffect, useRef, useState } from 'react';

/**
 * Devuelve `true` durante `duration` ms cada vez que `value` cambia — para
 * disparar una micro-animación (p. ej. el badge del carrito al añadir).
 * La guarda de reduced-motion la aplica la clase CSS (.animate-bump).
 */
export const useBumpOnChange = (value: unknown, duration = 320): boolean => {
  const [bumping, setBumping] = useState(false);
  const prev = useRef(value);

  useEffect(() => {
    if (prev.current === value) return;
    prev.current = value;
    setBumping(true);
    const timer = window.setTimeout(() => setBumping(false), duration);
    return () => window.clearTimeout(timer);
  }, [value, duration]);

  return bumping;
};
