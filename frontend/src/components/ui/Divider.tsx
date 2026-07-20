import type { ReactNode } from 'react';
import { cn } from '@lib/cn';

/** Separador horizontal, con etiqueta opcional al centro. */
export const Divider = ({ label, className }: { label?: ReactNode; className?: string }) => {
  if (!label) return <hr className={cn('border-line', className)} />;

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="h-px flex-1 bg-line" />
      <span className="text-xs font-medium uppercase tracking-wide text-ink-muted">{label}</span>
      <span className="h-px flex-1 bg-line" />
    </div>
  );
};
