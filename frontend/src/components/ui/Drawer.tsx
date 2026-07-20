import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@lib/cn';

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  side?: 'left' | 'right';
  children: ReactNode;
}

/** Panel lateral deslizante. Cierra con Escape, con el fondo o el boton. */
export const Drawer = ({ isOpen, onClose, title, description, side = 'right', children }: DrawerProps) => {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKeyDown);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-ink/40 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />

      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'absolute top-0 flex h-full w-96 max-w-[90%] flex-col border-line bg-surface shadow-xl',
          side === 'right' ? 'right-0 border-l' : 'left-0 border-r',
        )}
      >
        <div className="flex items-start justify-between border-b border-line p-5">
          <div>
            <h2 className="text-lg font-semibold text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-ink-muted">{description}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="rounded-full p-1 text-ink-muted hover:bg-surface-muted"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">{children}</div>
      </aside>
    </div>
  );
};
