import type { HTMLAttributes, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, type LucideIcon } from 'lucide-react';
import { Card, CardDescription, CardTitle } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { cn } from '@lib/cn';

interface AccountSectionCardProps extends HTMLAttributes<HTMLDivElement> {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  bodyClassName?: string;
}

/** Estructura compartida para las secciones editables del área de cuenta. */
export const AccountSectionCard = ({
  icon: Icon,
  title,
  description,
  action,
  bodyClassName,
  className,
  children,
  ...props
}: AccountSectionCardProps) => (
  /* El margen de scroll sale de la altura real de la cabecera más la barra de anclas:
   * con un valor fijo el título de la sección aterrizaba debajo de ambas. */
  <Card
    className={cn(
      'overflow-hidden rounded-card p-0 scroll-mt-[calc(var(--vb-header-h,73px)_+_3.5rem)]',
      className,
    )}
    {...props}
  >
    <div className="flex flex-col gap-4 border-b border-line bg-surface-muted/55 p-5 sm:flex-row sm:items-start sm:justify-between sm:px-6">
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-card border border-brand-100 bg-brand-50 text-brand-700">
          <Icon className="size-5" />
        </span>
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          <CardDescription className="mt-1 max-w-2xl leading-5">{description}</CardDescription>
        </div>
      </div>
      {action && <div className="shrink-0 self-start">{action}</div>}
    </div>
    <div className={cn('p-5 sm:p-6', bodyClassName)}>{children}</div>
  </Card>
);

interface AccountLoadErrorProps {
  title: string;
  /** Mensaje real del fallo (`getApiErrorMessage`), no una frase genérica. */
  message: string;
  onRetry: () => void;
  /** Acción secundaria opcional, a la derecha de Reintentar. */
  action?: ReactNode;
  className?: string;
}

/**
 * Fallo de carga de una pantalla de /cuenta.
 *
 * Existe para que un timeout deje de contarse como "todavía no tienes nada":
 * las páginas ramifican a este panel ANTES de mirar la longitud de la lista, así
 * que el estado vacío solo aparece cuando el servidor respondió sin datos.
 */
export const AccountLoadError = ({
  title,
  message,
  onRetry,
  action,
  className,
}: AccountLoadErrorProps) => (
  <div
    role="alert"
    className={cn(
      'flex flex-col items-center rounded-card border border-red-200 bg-red-50/45 px-6 py-12 text-center',
      className,
    )}
  >
    <span className="grid size-12 place-items-center rounded-card bg-white text-red-600 ring-1 ring-red-100">
      <AlertTriangle className="size-6" />
    </span>
    <h2 className="mt-4 text-base font-extrabold text-ink">{title}</h2>
    <p className="mt-1.5 max-w-md text-sm leading-6 text-ink-muted">{message}</p>
    <div className="mt-5 flex flex-col gap-2 sm:flex-row">
      <Button onClick={onRetry} leftIcon={<RefreshCw className="size-4" />}>
        Reintentar
      </Button>
      {action}
    </div>
  </div>
);
