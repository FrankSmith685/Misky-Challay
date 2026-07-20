import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@lib/cn';

interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  className?: string;
}

/** Ventana de hasta 5 numeros de pagina alrededor del actual. */
const windowed = (page: number, totalPages: number): number[] => {
  const start = Math.max(1, Math.min(page - 2, totalPages - 4));
  const end = Math.min(totalPages, start + 4);
  const pages: number[] = [];
  for (let i = start; i <= end; i += 1) pages.push(i);
  return pages;
};

/** Paginacion: anterior, numeros de pagina y siguiente. */
export const Pagination = ({ page, totalPages, onChange, className }: PaginationProps) => {
  if (totalPages <= 1) return null;

  const base =
    'flex size-9 items-center justify-center rounded-lg border border-line text-sm text-ink-muted transition-colors hover:border-brand-300 disabled:cursor-not-allowed disabled:opacity-40';

  return (
    <nav className={cn('flex items-center gap-1', className)} aria-label="Paginacion">
      <button
        type="button"
        className={base}
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        aria-label="Pagina anterior"
      >
        <ChevronLeft className="size-4" />
      </button>

      {windowed(page, totalPages).map((number) => (
        <button
          key={number}
          type="button"
          onClick={() => onChange(number)}
          aria-current={number === page ? 'page' : undefined}
          className={cn(
            base,
            number === page && 'border-brand-600 bg-brand-600 font-medium text-white hover:border-brand-600',
          )}
        >
          {number}
        </button>
      ))}

      <button
        type="button"
        className={base}
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        aria-label="Pagina siguiente"
      >
        <ChevronRight className="size-4" />
      </button>
    </nav>
  );
};
