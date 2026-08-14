import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Heart, PackageCheck, RotateCcw, Wallet } from 'lucide-react';
import { useAppSelector } from '@app/hooks';
import { Button } from '@components/ui/Button';
import { Skeleton } from '@components/ui/Skeleton';
import { useWalletBalance } from '@hooks/useWalletBalance';
import { ordersApi } from '@features/orders/services/orders.service';
import { useReorder } from '@features/orders/hooks/useReorder';
import { OrderStatusBadge } from '@features/orders/components/OrderStatusBadge';
import { formatCurrency, formatDate } from '@lib/format';
import { ROUTES } from '@constants/routes';
import type { OrderDetail } from '@features/checkout/types';

/** Mismos estados que el filtro "En curso" de Mis pedidos. */
const ACTIVE_STATUSES = ['PENDING_PAYMENT', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'];

/** Que se pidio, en una linea: el numero de pedido no le dice nada a nadie. */
const summarizeItems = (order: OrderDetail): string => {
  const names = order.items.map((item) => item.productNameSnapshot);
  if (names.length <= 2) return names.join(' · ');
  return `${names.slice(0, 2).join(' · ')} y ${names.length - 2} más`;
};

const chipClass =
  'inline-flex min-h-9 items-center gap-1.5 rounded-pill border px-3 text-xs font-extrabold transition-colors';

/**
 * BLOQUE DE CONTINUIDAD PARA QUIEN YA COMPRO
 *
 * La portada era identica para un invitado y para un cliente con diez pedidos: el
 * mas visitado de la tienda aterrizaba en un discurso de captacion y tenia que ir
 * a /cuenta a buscar lo suyo. Aqui arriba estan su pedido en curso, sus tres
 * ultimas compras repetibles, su saldo y sus favoritos.
 *
 * Lo monta HomePage solo con sesion iniciada: el invitado ve exactamente la misma
 * portada de antes y no dispara ni una peticion de mas.
 *
 * Coste: una lectura de pedidos al montar, fuera del render (la portada se pinta
 * completa mientras viaja). El saldo no cuesta nada extra, lo comparte la cache de
 * `useWalletBalance` con la cabecera.
 */
export const HomeReturningCustomer = () => {
  const userId = useAppSelector((state) => state.auth.user?.id ?? null);
  const firstName = useAppSelector((state) => state.auth.user?.firstName?.trim() || null);
  const favoriteCount = useAppSelector((state) => state.favorites.items.length);
  const { balance } = useWalletBalance();
  const { reorder, isReordering } = useReorder();
  /** `null` mientras carga; `[]` cuando no hay pedidos O cuando la consulta fallo. */
  const [orders, setOrders] = useState<OrderDetail[] | null>(null);
  /** Que tarjeta lanzo el "Volver a pedir": el spinner va solo en su boton. */
  const [reorderingNumber, setReorderingNumber] = useState<string | null>(null);

  useEffect(() => {
    if (userId === null) return undefined;

    let cancelled = false;
    void ordersApi
      .list()
      .then((rows) => {
        if (!cancelled) setOrders(rows);
      })
      // Es contenido complementario de una pagina de marketing: si el API falla,
      // calla y deja la portada intacta. Quien informa del fallo es Mis pedidos,
      // que es la pantalla que el cliente abrio a proposito.
      .catch(() => {
        if (!cancelled) setOrders([]);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const sorted = orders
    ? [...orders].sort((a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime())
    : [];
  const activeOrder = sorted.find((order) => ACTIVE_STATUSES.includes(order.status)) ?? null;
  /* Un pedido sin pagar no se repite, se paga; y el que ya esta arriba no se ofrece
   * dos veces en la misma pantalla. */
  const repeatable = sorted
    .filter((order) => order.status !== 'PENDING_PAYMENT' && order.id !== activeOrder?.id)
    .slice(0, 3);

  const handleReorder = async (orderNumber: string) => {
    setReorderingNumber(orderNumber);
    try {
      await reorder(orderNumber);
    } finally {
      setReorderingNumber(null);
    }
  };

  return (
    <section aria-label="Tu actividad en Verde Bowl" className="border-b border-line bg-white">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[.2em] text-brand-700">Qué gusto verte de nuevo</p>
            <h2 className="mt-2 text-2xl font-black tracking-[-.04em] text-ink sm:text-3xl">
              {firstName ? `Hola, ${firstName}` : 'Hola de nuevo'}
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {balance !== null && balance > 0 && (
              <Link
                to={ROUTES.accountWallet}
                className={`${chipClass} border-brand-200 bg-brand-50 text-brand-800 hover:border-brand-300`}
              >
                <Wallet className="size-3.5" aria-hidden="true" /> Saldo {formatCurrency(balance)}
              </Link>
            )}
            {favoriteCount > 0 && (
              <Link
                to={ROUTES.accountFavorites}
                className={`${chipClass} border-line bg-surface text-ink-muted hover:border-brand-300 hover:text-brand-800`}
              >
                <Heart className="size-3.5" aria-hidden="true" /> Mis favoritos ({favoriteCount})
              </Link>
            )}
            <Link
              to={ROUTES.account}
              className={`${chipClass} border-line bg-surface text-ink-muted hover:border-brand-300 hover:text-brand-800`}
            >
              Mi cuenta <ChevronRight className="size-3.5" aria-hidden="true" />
            </Link>
          </div>
        </div>

        {/* La pildora global del layout es una linea de estado que ademas se puede
          * ocultar; esta tarjeta es la version accionable, con importe y seguimiento. */}
        {activeOrder && (
          <div className="mt-5 flex flex-col gap-3 border-l-2 border-brand-600 bg-brand-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-card bg-brand-700 text-white">
                <PackageCheck className="size-4" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-extrabold text-ink">Pedido {activeOrder.orderNumber}</p>
                  <OrderStatusBadge status={activeOrder.status} />
                </div>
                <p className="mt-1 text-xs text-ink-muted">
                  {formatDate(activeOrder.placedAt)} · {formatCurrency(activeOrder.grandTotal)}
                </p>
              </div>
            </div>
            <Button
              component={Link}
              to={ROUTES.accountOrderDetail(activeOrder.orderNumber)}
              size="sm"
              className="shrink-0"
            >
              {activeOrder.status === 'PENDING_PAYMENT' ? 'Ver el pedido' : 'Seguir mi pedido'}
              <ChevronRight className="size-3.5" aria-hidden="true" />
            </Button>
          </div>
        )}

        {(orders === null || repeatable.length > 0) && (
          <div className="mt-6">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <h3 className="text-xs font-black uppercase tracking-[.16em] text-ink-muted">Vuelve a pedir</h3>
              <Link
                to={ROUTES.accountOrders}
                className="inline-flex items-center gap-1 text-xs font-extrabold text-brand-700 hover:underline"
              >
                Ver todos mis pedidos <ChevronRight className="size-3.5" aria-hidden="true" />
              </Link>
            </div>

            <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {orders === null
                ? Array.from({ length: 3 }, (_, index) => (
                    <li key={index}>
                      <Skeleton className="h-[132px] w-full rounded-card" />
                    </li>
                  ))
                : repeatable.map((order) => (
                    <li
                      key={order.id}
                      className="flex flex-col justify-between gap-3 rounded-card border border-line bg-surface p-4 transition hover:border-brand-200"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center justify-between gap-2 text-xs text-ink-muted">
                          <span>{formatDate(order.placedAt)}</span>
                          <span className="font-black text-brand-800">{formatCurrency(order.grandTotal)}</span>
                        </div>
                        <p className="mt-2 line-clamp-2 text-sm font-bold leading-5 text-ink">
                          {summarizeItems(order)}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          leftIcon={<RotateCcw className="size-3.5" />}
                          isLoading={reorderingNumber === order.orderNumber}
                          disabled={isReordering}
                          onClick={() => void handleReorder(order.orderNumber)}
                          className="flex-1"
                        >
                          Volver a pedir
                        </Button>
                        <Button
                          component={Link}
                          to={ROUTES.accountOrderDetail(order.orderNumber)}
                          size="sm"
                          variant="ghost"
                        >
                          Detalle
                        </Button>
                      </div>
                    </li>
                  ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  );
};
