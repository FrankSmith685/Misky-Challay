import { Link } from 'react-router-dom';
import { Heart, Salad, Trash2 } from 'lucide-react';
import { SectionHeading } from '@components/common/SectionHeading';
import { Button } from '@components/ui/Button';
import { Card, CardDescription } from '@components/ui/Card';
import { useAppDispatch, useAppSelector } from '@app/hooks';
import { removeFavorite } from '../favoritesSlice';
import { formatCurrency } from '@lib/format';
import { ROUTES } from '@constants/routes';

const FavoritesPage = () => {
  const dispatch = useAppDispatch();
  const items = useAppSelector((state) => state.favorites.items);

  if (items.length === 0) {
    return (
      <div>
        <SectionHeading title="Mis favoritos" description="Guarda los platos que mas te gustan." />
        <Card className="border-dashed py-12 text-center">
          <Heart className="mx-auto size-10 text-ink-muted" />
          <CardDescription className="mt-3">
            Todavia no tienes favoritos. Toca el corazon en cualquier plato del menu.
          </CardDescription>
          <Link to={ROUTES.menu}>
            <Button className="mt-4">Ver el menu</Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <SectionHeading title="Mis favoritos" description="Tus platos guardados, listos para pedir." />

      <ul className="grid gap-3 sm:grid-cols-2">
        {items.map((item) => {
          const to = item.type === 'CUSTOMIZABLE' ? ROUTES.builder : ROUTES.product(item.slug);
          return (
            <li key={item.productId}>
              <Card className="flex items-center gap-3">
                <Link to={to} className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-brand-50">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt={item.name} className="size-full object-cover" />
                  ) : (
                    <Salad className="size-7 text-brand-300" />
                  )}
                </Link>

                <div className="min-w-0 flex-1">
                  <Link to={to} className="font-semibold text-ink hover:text-brand-700">
                    {item.name}
                  </Link>
                  <p className="text-sm text-brand-700">{formatCurrency(item.priceFrom)}</p>
                </div>

                <div className="flex shrink-0 flex-col gap-1.5">
                  <Link to={to}>
                    <Button size="sm">Pedir</Button>
                  </Link>
                  <Button
                    size="sm"
                    variant="ghost"
                    leftIcon={<Trash2 className="size-3.5" />}
                    onClick={() => dispatch(removeFavorite(item.productId))}
                  >
                    Quitar
                  </Button>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>
    </div>
  );
};

export default FavoritesPage;
