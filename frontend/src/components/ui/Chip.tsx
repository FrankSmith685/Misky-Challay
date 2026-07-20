import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@lib/cn';

interface ChipProps {
  children: ReactNode;
  /** Si se pasa, muestra la "x" para quitar. */
  onRemove?: () => void;
  /** Marca el chip como seleccionado (util para filtros). */
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

/** Ficha compacta seleccionable o removible (filtros, etiquetas de entrada). */
export const Chip = ({ children, onRemove, active, onClick, className }: ChipProps) => (
  <span
    onClick={onClick}
    className={cn(
      'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-all',
      active ? 'border-brand-600 bg-brand-600 text-white shadow-sm' : 'border-line bg-surface text-ink-muted',
      onClick && 'cursor-pointer select-none hover:-translate-y-0.5 hover:border-brand-300 hover:shadow-sm',
      className,
    )}
  >
    {children}
    {onRemove && (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onRemove();
        }}
        className="-mr-1 rounded-full p-0.5 hover:text-red-600"
        aria-label="Quitar"
      >
        <X className="size-3.5" />
      </button>
    )}
  </span>
);
