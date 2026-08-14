import { Link } from 'react-router-dom';
import { Leaf } from 'lucide-react';
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

/** Identidad unificada de la marca para tienda, cuenta y panel. */
export const AppLogo = ({ inverse = false, compact = false, onClick, className }: AppLogoProps) => (
  <Link to={ROUTES.home} onClick={onClick} className={cn('inline-flex items-center gap-2.5', className)} aria-label="Ir al inicio de Verde Bowl">
    <span className={cn('grid size-9 shrink-0 place-items-center rounded-xl shadow-sm', inverse ? 'bg-brand-600 text-white' : 'bg-brand-600 text-white')}><Leaf className="size-5" /></span>
    {compact !== true && (
      <span
        className={cn(
          'text-xl font-extrabold tracking-tight',
          compact === 'xs' && 'hidden sm:inline',
          inverse ? 'text-white' : 'text-brand-800',
        )}
      >
        Verde<span className="text-accent-500">Bowl</span>
      </span>
    )}
  </Link>
);
