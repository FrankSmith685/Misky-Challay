import { Link } from 'react-router-dom';
import { ROUTES } from '@constants/routes';
import { cn } from '@lib/cn';

interface AppLogoProps {
  inverse?: boolean;
  /**
   * `true` deja solo el icono. `'xs'` lo deja solo por debajo de 640px: en el
   * header movil ese ancho es el que necesita el contexto de entrega.
   */
  compact?: boolean | 'xs';
  onClick?: () => void;
  className?: string;
}

/** Conserva el logo original de Misky Challay en tienda, cuenta y panel. */
export const AppLogo = ({ compact = false, inverse = false, onClick, className }: AppLogoProps) => (
  <Link
    to={ROUTES.home}
    onClick={onClick}
    className={cn(
      'inline-flex min-w-0 items-center',
      inverse && 'rounded-xl bg-white px-3 py-1',
      className,
    )}
    aria-label="Ir al inicio de Misky Challay"
  >
    {(compact === true || compact === 'xs') && (
      <img
        src="/brand/misky-mark.png"
        alt=""
        width={40}
        height={40}
        aria-hidden="true"
        className={cn('size-10 shrink-0 object-contain', compact === 'xs' && 'sm:hidden')}
      />
    )}
    {compact !== true && (
      <span
        className={cn(
          'block h-14 w-44 shrink-0 overflow-hidden',
          compact === 'xs' && 'hidden sm:block',
        )}
        aria-hidden="true"
      >
        <img
          src="/brand/misky-challay-wordmark.png"
          alt=""
          width={176}
          height={56}
          className="block size-full object-cover object-center"
        />
      </span>
    )}
  </Link>
);
