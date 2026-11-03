import type { HTMLAttributes } from 'react';
import { cn } from '@lib/cn';

export type BadgeVariant =
  | 'brand'
  | 'accent'
  | 'neutral'
  | 'success'
  | 'strong'
  | 'solid'
  | 'warning'
  | 'danger'
  | 'outline';

const VARIANTS: Record<BadgeVariant, string> = {
  brand: 'bg-brand-50 text-brand-700',
  // 700 y no 500: el 500 (#ff8a0b) da 2,42:1 sobre blanco, la mitad del minimo
  // AA para 12px. El 700 sube a 6,58:1 sin salirse de la rampa de acento.
  accent: 'bg-accent-400/15 text-accent-700',
  neutral: 'bg-surface-muted text-ink-muted',
  success: 'bg-brand-100 text-brand-800',
  strong: 'bg-brand-200 text-brand-900',
  solid: 'bg-brand-600 text-white',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-red-50 text-red-700',
  outline: 'border border-line text-ink-muted',
};

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
}

/** Etiqueta compacta para estados, conteos y categorias. */
export const Badge = ({ variant = 'brand', className, ...props }: BadgeProps) => (
  <span
    className={cn(
      'inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-xs font-medium',
      VARIANTS[variant],
      className,
    )}
    {...props}
  />
);
