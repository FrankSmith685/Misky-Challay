import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { cn } from '@lib/cn';

interface LoadErrorProps {
  /** Encabezado del panel. Por defecto, una frase neutra valida en cualquier pantalla. */
  title?: string;
  /** Mensaje real del fallo (`getApiErrorMessage`), no una frase generica. */
  message: string;
  /** Sin `onRetry` no se pinta el boton: hay cargas que solo se rehacen recargando. */
  onRetry?: () => void;
  className?: string;
}

/**
 * Fallo de carga de una lista o de una pantalla completa.
 *
 * Existe para que un timeout deje de contarse como "todavia no hay nada": las
 * pantallas ramifican a este panel ANTES de mirar la longitud de la lista, asi
 * que el estado vacio solo aparece cuando el servidor respondio sin datos. Es la
 * version generica del patron que ya resolvia /cuenta (`AccountLoadError`), aqui
 * promovida porque el panel no tenia ni un solo boton "Reintentar".
 *
 * `role="alert"` a proposito: en una tablet de cocina el operario no esta mirando
 * la pantalla cuando la red cae, y el fallo tiene que anunciarse solo.
 */
export const LoadError = ({
  title = 'No pudimos cargar esta información',
  message,
  onRetry,
  className,
}: LoadErrorProps) => (
  <div
    role="alert"
    className={cn(
      'flex flex-col items-center rounded-card border border-red-200 bg-red-50/45 px-6 py-10 text-center',
      className,
    )}
  >
    <span className="grid size-12 place-items-center rounded-card bg-white text-red-600 ring-1 ring-red-100">
      <AlertTriangle className="size-6" />
    </span>
    <h2 className="mt-4 text-base font-extrabold text-ink">{title}</h2>
    <p className="mt-1.5 max-w-md text-sm leading-6 text-ink-muted">{message}</p>
    {onRetry && (
      <Button className="mt-5" onClick={onRetry} leftIcon={<RefreshCw className="size-4" />}>
        Reintentar
      </Button>
    )}
  </div>
);
