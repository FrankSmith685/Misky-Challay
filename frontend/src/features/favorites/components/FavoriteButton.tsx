import { Heart } from 'lucide-react';
import { useAppDispatch, useAppSelector } from '@app/hooks';
import { toggleFavorite, type FavoriteItem } from '../favoritesSlice';
import { cn } from '@lib/cn';

/**
 * Corazon para guardar/quitar un producto de favoritos.
 * Preparado para vivir dentro de un <Link>: detiene la navegacion al hacer clic.
 */
export const FavoriteButton = ({
  product,
  className,
}: {
  product: FavoriteItem;
  className?: string;
}) => {
  const dispatch = useAppDispatch();
  const isFavorite = useAppSelector((state) =>
    state.favorites.items.some((item) => item.productId === product.productId),
  );

  return (
    <button
      type="button"
      aria-label={isFavorite ? 'Quitar de favoritos' : 'Guardar en favoritos'}
      aria-pressed={isFavorite}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        dispatch(toggleFavorite(product));
      }}
      className={cn(
        'inline-flex items-center justify-center rounded-field p-2 shadow-sm transition-colors',
        isFavorite
          ? 'bg-red-50 text-red-500'
          : 'bg-surface/90 text-ink-muted hover:text-red-500',
        className,
      )}
    >
      <Heart className={cn('size-4', isFavorite && 'fill-current')} />
    </button>
  );
};
