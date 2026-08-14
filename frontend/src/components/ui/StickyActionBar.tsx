import { useEffect, useRef, type ReactNode } from 'react';
import { cn } from '@lib/cn';

type HideFrom = 'md' | 'lg' | 'xl';
type MaxWidth = 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl' | '6xl';

interface StickyActionBarProps {
  /** Texto pequeño y atenuado encima del valor (p. ej. "Total estimado"). */
  label?: ReactNode;
  /** Valor destacado, normalmente el precio. */
  value?: ReactNode;
  /** Breakpoint a partir del cual se oculta (en desktop el resumen vive en línea). Por defecto 'lg'. */
  hideFrom?: HideFrom;
  /** Ancho máximo del contenido interior; alinéalo con el contenedor de la página. Por defecto '5xl'. */
  maxWidth?: MaxWidth;
  /** La(s) acción(es): normalmente un <Button>. */
  children: ReactNode;
  className?: string;
}

// Clases literales para que el JIT de Tailwind las detecte (no se pueden interpolar).
const HIDE_FROM: Record<HideFrom, string> = {
  md: 'md:hidden',
  lg: 'lg:hidden',
  xl: 'xl:hidden',
};

const MAX_WIDTH: Record<MaxWidth, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
  '6xl': 'max-w-6xl',
};

/**
 * Variable CSS con el alto REAL de la barra, publicada en <html>. La consume todo
 * lo que se apoya en el pie de la pantalla (hoy el banner de cookies, que tapaba
 * "Agregar", "Continuar" y "Confirmar pedido" en las cuatro pantallas con barra).
 * Vale `0px` cuando la barra está oculta por `hideFrom`, así que en escritorio el
 * consumidor no arrastra un hueco fantasma.
 */
export const STICKY_ACTION_BAR_HEIGHT_VAR = '--sticky-action-bar-h';

/**
 * Barra de acción fija al pie, visible solo en móvil/tablet (se oculta desde `hideFrom`),
 * pensada para pantallas donde el CTA principal debe permanecer siempre a la vista.
 * Respeta el safe-area inferior de iOS (requiere `viewport-fit=cover` en el <meta viewport>).
 *
 * Para que el contenido de la página no quede tapado, añade padding inferior en el
 * contenedor de la página dentro del mismo rango (p. ej. `pb-28 lg:pb-12`).
 */
export const StickyActionBar = ({
  label,
  value,
  hideFrom = 'lg',
  maxWidth = '5xl',
  children,
  className,
}: StickyActionBarProps) => {
  const hasInfo = label != null || value != null;
  const barRef = useRef<HTMLDivElement>(null);

  /* El alto no es una constante: cambia con el safe-area, con el salto de línea
   * del CTA en 320px y con el propio breakpoint que oculta la barra. Se mide y se
   * publica en vez de estimarlo, y se retira al desmontar para que la pantalla
   * siguiente no herede el offset de la anterior. */
  useEffect(() => {
    const node = barRef.current;
    if (!node) return;

    const root = document.documentElement;
    const publish = () => root.style.setProperty(STICKY_ACTION_BAR_HEIGHT_VAR, `${node.offsetHeight}px`);
    publish();

    // El resize cubre el cruce del breakpoint: al pasar a display:none no todos
    // los navegadores notifican al observador.
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(publish);
    observer?.observe(node);
    window.addEventListener('resize', publish);

    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', publish);
      root.style.removeProperty(STICKY_ACTION_BAR_HEIGHT_VAR);
    };
  }, []);

  return (
    <div
      ref={barRef}
      className={cn(
        /* Unica sombra fuera de la escala e1..e5: proyecta hacia ARRIBA. Cualquier
         * paso de la escala caeria por debajo del borde de la pantalla y no se
         * veria, que es justo la separacion que esta barra necesita del contenido. */
        'fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 pt-3 shadow-[0_-12px_32px_rgba(20,55,37,.12)] backdrop-blur',
        HIDE_FROM[hideFrom],
        className,
      )}
      style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div className={cn('mx-auto flex items-center gap-3', MAX_WIDTH[maxWidth])}>
        {hasInfo && (
          <div className="min-w-0 flex-1">
            {label != null && <p className="text-[11px] leading-tight text-ink-muted">{label}</p>}
            {value != null && <p className="truncate text-lg font-black text-brand-700">{value}</p>}
          </div>
        )}
        <div className={cn('flex items-center gap-2', hasInfo ? 'shrink-0' : 'w-full')}>{children}</div>
      </div>
    </div>
  );
};
