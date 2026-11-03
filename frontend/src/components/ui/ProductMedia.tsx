import { useState, type ReactNode } from 'react';
import { CakeSlice } from 'lucide-react';
import { cn } from '@lib/cn';

type Ratio = 'square' | '4/3' | '3/2' | '16/9';

interface ProductMediaProps {
  src?: string | null;
  alt: string;
  /** Relación de aspecto. Por defecto '4/3' para toda la vitrina. */
  ratio?: Ratio;
  /** Zoom sutil al pasar el cursor por encima. Por defecto true. */
  zoom?: boolean;
  /** Carga eager (para imágenes above-the-fold como la ficha). Por defecto lazy. */
  priority?: boolean;
  className?: string;
  compact?: boolean;
  /** Overlays posicionados sobre la imagen (badges, chips). */
  children?: ReactNode;
}

const RATIO: Record<Ratio, string> = {
  square: 'aspect-square',
  '4/3': 'aspect-[4/3]',
  '3/2': 'aspect-[3/2]',
  '16/9': 'aspect-video',
};

/**
 * Imagen de producto con relación de aspecto única, object-cover, lazy-load y un
 * fallback de marca apetecible (en vez del icono plano). Unifica el tratamiento de
 * imagen de ProductCard, ProductPage y otras superficies de vitrina.
 */
export const ProductMedia = ({
  src,
  alt,
  ratio = '4/3',
  zoom = true,
  priority = false,
  className,
  compact = false,
  children,
}: ProductMediaProps) => {
  // Una URL rota debe caer al mismo placeholder que un producto sin foto: el icono
  // de imagen rota del navegador en mitad de la vitrina se lee como plato averiado.
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const showImage = Boolean(src) && src !== brokenSrc;

  return (
    <div className={cn('group relative overflow-hidden bg-surface-muted', RATIO[ratio], className)}>
      {showImage ? (
        <img
          src={src as string}
          alt={alt}
          loading={priority ? 'eager' : 'lazy'}
          onError={() => setBrokenSrc(src ?? null)}
          className={cn(
            'size-full object-cover transition-transform duration-500 ease-out',
            zoom && 'group-hover:scale-105',
          )}
        />
      ) : (
        <div
          className="grid size-full place-items-center bg-gradient-to-br from-accent-50 via-surface-muted to-brand-50"
          aria-label={alt}
          role="img"
        >
          <div className={cn('flex flex-col items-center gap-3 text-center', compact ? 'p-2' : 'p-5')}><span className={cn('grid place-items-center rounded-full border border-accent-200 bg-white/70', compact ? 'size-16' : 'size-24')}><CakeSlice className={cn('text-brand-400', compact ? 'size-8' : 'size-12')} strokeWidth={1.1} /></span>{!compact && <span className="text-[10px] font-medium uppercase tracking-[.16em] text-ink-muted">Foto no disponible</span>}</div>
        </div>
      )}
      {children}
    </div>
  );
};
