import { Fragment } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { cn } from '@lib/cn';

export interface Crumb {
  label: string;
  to?: string;
}

/** Migas de pan: la ruta de navegacion hasta la pantalla actual. */
export const Breadcrumbs = ({ items, className }: { items: Crumb[]; className?: string }) => (
  <nav aria-label="Ruta de navegacion" className={cn('flex flex-wrap items-center gap-1 text-sm', className)}>
    {items.map((crumb, index) => {
      const isLast = index === items.length - 1;
      return (
        <Fragment key={index}>
          {crumb.to && !isLast ? (
            <Link to={crumb.to} className="text-ink-muted hover:text-brand-700">
              {crumb.label}
            </Link>
          ) : (
            <span className={isLast ? 'font-medium text-ink' : 'text-ink-muted'} aria-current={isLast ? 'page' : undefined}>
              {crumb.label}
            </span>
          )}
          {!isLast && <ChevronRight className="size-3.5 shrink-0 text-ink-muted" />}
        </Fragment>
      );
    })}
  </nav>
);
