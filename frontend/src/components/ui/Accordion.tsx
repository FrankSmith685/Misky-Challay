import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@lib/cn';

export interface AccordionItem {
  value: string;
  title: string;
  content: ReactNode;
}

/** Lista de paneles plegables. Por defecto abre el primero. */
export const Accordion = ({
  items,
  className,
}: {
  items: AccordionItem[];
  className?: string;
}) => {
  const [open, setOpen] = useState<string | null>(items[0]?.value ?? null);

  return (
    <div className={cn('divide-y divide-line overflow-hidden rounded-card border border-line', className)}>
      {items.map((item) => {
        const isOpen = open === item.value;
        return (
          <div key={item.value}>
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : item.value)}
              aria-expanded={isOpen}
              className="flex w-full items-center justify-between gap-3 bg-surface px-4 py-3 text-left text-sm font-medium text-ink hover:bg-surface-muted"
            >
              {item.title}
              <ChevronDown
                className={cn('size-4 shrink-0 text-ink-muted transition-transform', isOpen && 'rotate-180')}
              />
            </button>
            {isOpen && <div className="bg-surface px-4 pb-4 text-sm text-ink-muted">{item.content}</div>}
          </div>
        );
      })}
    </div>
  );
};
