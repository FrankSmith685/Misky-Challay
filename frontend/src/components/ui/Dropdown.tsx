import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@lib/cn';

export interface DropdownItem {
  label: string;
  icon?: LucideIcon;
  onClick?: () => void;
  danger?: boolean;
}

interface DropdownProps {
  /** Contenido del boton que abre el menu (texto/icono, NO otro boton). */
  trigger: ReactNode;
  items: DropdownItem[];
  align?: 'left' | 'right';
  className?: string;
}

/** Menu desplegable generico: cierra al hacer clic fuera o con Escape. */
export const Dropdown = ({ trigger, items, align = 'left', className }: DropdownProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className={cn('relative inline-block', className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-field border border-line px-3 py-2 text-sm text-ink hover:border-brand-300"
      >
        {trigger}
      </button>

      {open && (
        <div
          role="menu"
          className={cn(
            'absolute z-50 mt-2 min-w-44 overflow-hidden rounded-xl border border-line bg-surface p-1 shadow-e4',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item, index) => (
            <button
              key={index}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onClick?.();
              }}
              className={cn(
                'flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-surface-muted',
                item.danger ? 'text-red-600 hover:bg-red-50' : 'text-ink-muted',
              )}
            >
              {item.icon && <item.icon className="size-4" />}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
