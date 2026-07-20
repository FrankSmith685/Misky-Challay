import type { HTMLAttributes } from 'react';
import { cn } from '@lib/cn';

export type BadgeVariant =
  | 'brand'
  | 'accent'
  | 'neutral'
  | 'success'
  | 'warning'
  | 'danger'
  | 'outline';

const VARIANTS: Record<BadgeVariant, string> = {
  brand: 'bg-brand-50 text-brand-700',
  accent: 'bg-accent-400/15 text-accent-500',
  neutral: 'bg-surface-muted text-ink-muted',
  success: 'bg-brand-100 text-brand-800',
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
      'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
      VARIANTS[variant],
      className,
    )}
    {...props}
  />
);
