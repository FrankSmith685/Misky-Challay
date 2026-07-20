import type { ReactNode } from 'react';
import { cn } from '@lib/cn';

export interface TimelineItem {
  title: ReactNode;
  meta?: ReactNode;
  /** Paso ya cumplido (punto en verde). */
  done?: boolean;
}

/** Linea de tiempo vertical: ideal para el seguimiento de un pedido. */
export const Timeline = ({ items, className }: { items: TimelineItem[]; className?: string }) => (
  <ol className={cn('space-y-0', className)}>
    {items.map((item, index) => {
      const isLast = index === items.length - 1;
      return (
        <li key={index} className="flex gap-3">
          <div className="flex flex-col items-center">
            <span
              className={cn(
                'mt-1 size-3 shrink-0 rounded-full ring-4 ring-surface',
                item.done ? 'bg-brand-600' : 'bg-line',
              )}
            />
            {!isLast && <span className="my-1 w-px flex-1 bg-line" />}
          </div>
          <div className={cn('pb-5', isLast && 'pb-0')}>
            <p className={cn('text-sm', item.done ? 'font-medium text-ink' : 'text-ink-muted')}>
              {item.title}
            </p>
            {item.meta && <p className="mt-0.5 text-xs text-ink-muted">{item.meta}</p>}
          </div>
        </li>
      );
    })}
  </ol>
);
