import type { ReactNode } from 'react';
import { cn } from '@lib/cn';

type Side = 'top' | 'bottom' | 'left' | 'right';

const POSITION: Record<Side, string> = {
  top: 'bottom-full left-1/2 mb-2 -translate-x-1/2',
  bottom: 'top-full left-1/2 mt-2 -translate-x-1/2',
  left: 'right-full top-1/2 mr-2 -translate-y-1/2',
  right: 'left-full top-1/2 ml-2 -translate-y-1/2',
};

/** Globo de ayuda que aparece al pasar el cursor o enfocar el elemento. */
export const Tooltip = ({
  content,
  children,
  side = 'top',
  className,
}: {
  content: ReactNode;
  children: ReactNode;
  side?: Side;
  className?: string;
}) => (
  <span className={cn('group relative inline-flex', className)}>
    {children}
    <span
      role="tooltip"
      className={cn(
        'pointer-events-none absolute z-50 hidden whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-xs font-medium text-white shadow-e4',
        'group-hover:block group-focus-within:block',
        POSITION[side],
      )}
    >
      {content}
    </span>
  </span>
);
