import { Link, useNavigate } from 'react-router-dom';
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { SectionHeading } from '@components/common/SectionHeading';
import { EmptyState } from '@components/common/EmptyState';
import { Button } from '@components/ui/Button';
import { Card, CardDescription } from '@components/ui/Card';
import { useAppDispatch, useAppSelector } from '@app/hooks';
import { useAppState } from '@context/AppStateContext';
import { removeItem, updateItemQuantity } from '../cartSlice';
import { formatCurrency } from '@lib/format';
import { ROUTES } from '@constants/routes';

/**
 * Carrito local (Redux + localStorage).
 * En la Fase 3 el carrito se persiste en el backend y el total lo recotiza el
 * servidor con cupones, delivery y saldo (RN-007).
 */
const CartPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const { items, subtotal } = useAppSelector((state) => state.cart);
  const { hasCoverage, openLocationModal } = useAppState();

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 sm:py-20">
        <EmptyState
          icon={ShoppingBag}
          title="Tu carrito está vacío"
          description="Explora el menú o arma un bowl a tu medida."
          action={<div className="flex flex-wrap justify-center gap-3">
          <Link to={ROUTES.menu}>
            <Button>Ver el menú</Button>
          </Link>
          <Link to={ROUTES.builder}>
            <Button variant="outline">Arma tu bowl</Button>
          </Link>
          </div>}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12">
      <SectionHeading title="Tu carrito" description={`${items.length} plato(s) listos para pedir`} />

      <div className="grid gap-8 lg:grid-cols-[1fr_320px]">
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={item.id}>
              <Card className="flex gap-4">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{item.name}</p>
                  <p className="mt-0.5 text-sm text-ink-muted">{item.variantName}</p>

                  {item.nutrition && (
                    <p className="mt-2 text-xs text-ink-muted">
                      {Math.round(item.nutrition.calories)} kcal ·{' '}
                      {Math.round(item.nutrition.protein)} g proteina
                    </p>
                  )}

                  <div className="mt-3 flex items-center gap-3">
                    <div className="flex items-center rounded-full border border-line">
                      <button
                        type="button"
                        aria-label="Quitar uno"
                        onClick={() =>
                          dispatch(
                            updateItemQuantity({ id: item.id, quantity: item.quantity - 1 }),
                          )
                        }
                        className="p-2 text-ink-muted hover:text-brand-700"
                      >
                        <Minus className="size-3.5" />
                      </button>
                      <span className="w-7 text-center text-sm font-semibold">{item.quantity}</span>
                      <button
                        type="button"
                        aria-label="Agregar uno"
                        onClick={() =>
                          dispatch(
                            updateItemQuantity({ id: item.id, quantity: item.quantity + 1 }),
                          )
                        }
                        className="p-2 text-ink-muted hover:text-brand-700"
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => dispatch(removeItem(item.id))}
                      className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-red-600"
                    >
                      <Trash2 className="size-3.5" /> Quitar
                    </button>
                  </div>
                </div>

                <p className="shrink-0 font-bold text-brand-700">{formatCurrency(item.lineTotal)}</p>
              </Card>
            </li>
          ))}
        </ul>

        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <Card>
            <h2 className="text-lg font-semibold text-ink">Resumen</h2>

            <dl className="mt-4 space-y-1.5 text-sm">
              <div className="flex justify-between text-ink-muted">
                <dt>Subtotal</dt>
                <dd>{formatCurrency(subtotal)}</dd>
              </div>
              <div className="flex justify-between text-ink-muted">
                <dt>Delivery</dt>
                <dd>Se calcula en el checkout</dd>
              </div>
              <div className="flex justify-between border-t border-line pt-2 text-base font-bold text-ink">
                <dt>Total estimado</dt>
                <dd className="text-brand-700">{formatCurrency(subtotal)}</dd>
              </div>
            </dl>

            <CardDescription className="mt-3 text-xs">
              El total final lo confirma el servidor en el checkout, con delivery, cupones y
              promociones.
            </CardDescription>

            {hasCoverage ? (
              <Button className="mt-5 w-full" size="lg" onClick={() => navigate(ROUTES.checkout)}>
                Ir al checkout
              </Button>
            ) : (
              <Button className="mt-5 w-full" size="lg" variant="outline" onClick={openLocationModal}>
                Elige tu direccion para continuar
              </Button>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
};

export default CartPage;
