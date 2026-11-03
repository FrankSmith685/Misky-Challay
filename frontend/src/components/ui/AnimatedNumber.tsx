import { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  /** Duración del tween en ms. */
  duration?: number;
  /** Formatea el número interpolado (p. ej. formatCurrency o Math.round). */
  format?: (value: number) => string;
  className?: string;
}

const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3;

/**
 * Interpola una cifra con requestAnimationFrame (easeOutCubic). Da vida a totales,
 * precios. Respeta prefers-reduced-motion (salta al valor final).
 */
export const AnimatedNumber = ({
  value,
  duration = 500,
  format = (n) => String(Math.round(n)),
  className,
}: AnimatedNumberProps) => {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const prefersReduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const from = fromRef.current;
    const to = value;

    if (prefersReduced || from === to) {
      setDisplay(to);
      fromRef.current = to;
      return;
    }

    let startTs: number | null = null;
    const tick = (ts: number) => {
      if (startTs === null) startTs = ts;
      const progress = Math.min(1, (ts - startTs) / duration);
      setDisplay(from + (to - from) * easeOutCubic(progress));
      if (progress < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        fromRef.current = to;
      }
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [value, duration]);

  return <span className={className}>{format(display)}</span>;
};
