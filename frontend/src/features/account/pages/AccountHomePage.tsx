import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ChevronRight,
  ClipboardList,
  Heart,
  Home,
  MapPin,
  PackageCheck,
  PackageOpen,
  Salad,
  Star,
  ShoppingBag,
  User2,
  Wallet,
} from 'lucide-react';
import { PageHeader } from '@components/common/PageHeader';
import { EmptyState } from '@components/common/EmptyState';
import { StatCard } from '@components/common/StatCard';
import { Button } from '@components/ui/Button';
import { Skeleton } from '@components/ui/Skeleton';
import { useAppSelector } from '@app/hooks';
import { getApiErrorMessage } from '@services/api/client';
import { formatCurrency, formatDate } from '@lib/format';
import { ROUTES } from '@constants/routes';
import { ordersApi } from '@features/orders/services/orders.service';
import { OrderStatusBadge } from '@features/orders/components/OrderStatusBadge';
import { plansApi } from '@features/plans/services/plans.service';
import { accountApi } from '../services/account.service';
import { AccountLoadError, AccountSectionCard } from '../components/AccountSectionCard';
import type { OrderDetail } from '@features/checkout/types';
import type { WalletSummary } from '@features/plans/types';
import type { Address } from '@features/geo/types';

/** Mismos estados que el filtro "En curso" de Mis pedidos. */
const ACTIVE_STATUSES = ['PENDING_PAYMENT', 'CONFIRMED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY'];

const zoneLabel = (address: Address): string =>
  [address.districtName ?? address.district?.name, address.provinceName]
    .filter((value): value is string => Boolean(value))
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(' · ');

/**
 * PANEL DE INICIO DE /cuenta
 *
 * El indice aterrizaba en el formulario de perfil, que es justo lo que menos se
 * consulta en una tienda de comida. Aqui esta lo que el cliente viene a mirar:
 * el pedido en curso con su seguimiento, el saldo, la direccion de entrega y la
 * puerta a sus listas.
 *
 * Las tres consultas viajan en paralelo y ninguna tumba a las otras: cada bloque
 * distingue "no hay nada" de "no pudimos consultarlo" y ofrece reintentar, que es
 * lo que la auditoria exige al resto del area. La cabecera se pinta siempre, tambien
 * mientras carga y cuando falla: el cliente nunca se queda sin saber donde esta.
 */
const AccountHomePage = () => {
  const firstName = useAppSelector((state) => state.auth.user?.firstName?.trim() || null);
  const favoriteCount = useAppSelector((state) => state.favorites.items.length);

  const [orders, setOrders] = useState<OrderDetail[]>([]);
  const [ordersError, setOrdersError] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressesError, setAddressesError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);

    // allSettled y no all: que el saldo falle no puede borrar el pedido en curso.
    void Promise.allSettled([ordersApi.list(), plansApi.wallet(), accountApi.listAddresses()]).then(
      ([ordersResult, walletResult, addressesResult]) => {
        if (cancelled) return;

        setOrders(ordersResult.status === 'fulfilled' ? ordersResult.value : []);
        setOrdersError(
          ordersResult.status === 'rejected' ? getApiErrorMessage(ordersResult.reason) : null,
        );

        setWallet(walletResult.status === 'fulfilled' ? walletResult.value : null);
        setWalletError(
          walletResult.status === 'rejected' ? getApiErrorMessage(walletResult.reason) : null,
        );

        setAddresses(addressesResult.status === 'fulfilled' ? addressesResult.value : []);
        setAddressesError(
          addressesResult.status === 'rejected' ? getApiErrorMessage(addressesResult.reason) : null,
        );

        setIsLoading(false);
      },
    );

    return () => {
      cancelled = true;
    };
  }, [retryNonce]);

  const retry = useCallback(() => setRetryNonce((value) => value + 1), []);

  const sorted = [...orders].sort(
    (a, b) => new Date(b.placedAt).getTime() - new Date(a.placedAt).getTime(),
  );
  const activeOrder = sorted.find((order) => ACTIVE_STATUSES.includes(order.status)) ?? null;
  const lastOrder = sorted[0] ?? null;
  const defaultAddress = addresses.find((address) => address.isDefault) ?? addresses[0] ?? null;
  const everythingFailed = Boolean(ordersError && walletError && addressesError);

  /* La cabecera se declara aparte porque la pantalla tiene tres finales posibles y en
   * los tres el cliente tiene que saber donde esta. */
  const header = (
    <PageHeader
      eyebrow="Mi cuenta"
      title={firstName ? `Hola, ${firstName}` : 'Mi cuenta'}
      description="Tu pedido en curso, tu saldo y la dirección donde recibes, en una sola pantalla."
      icon={Home}
      crumbs={[{ label: 'Inicio', to: '/' }, { label: 'Mi cuenta' }]}
      action={
        <Button component={Link} to={ROUTES.menu} leftIcon={<ShoppingBag className="size-4" />}>
          Hacer un pedido
        </Button>
      }
      className="mb-6"
    />
  );

  if (isLoading) {
    return (
      <div>
        {header}
        <AccountHomeSkeleton />
      </div>
    );
  }

  if (everythingFailed) {
    return (
      <div>
        {header}
        <AccountLoadError
          title="No pudimos cargar tu cuenta"
          /* El fallo es de la consulta, no de sus datos: eso es lo primero que teme
           * quien entra a mirar un pedido que ya pagó. */
          message={`${ordersError ?? 'La consulta no respondió.'} Tus pedidos y tu saldo siguen registrados.`}
          onRetry={retry}
          action={
            <Button component={Link} to={ROUTES.accountOrders} variant="outline">
              Ir a Mis pedidos
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div>
      {header}

      {ordersError ? (
        <AccountLoadError
          title="No pudimos consultar tus pedidos"
          message={ordersError}
          onRetry={retry}
          className="px-5 py-9"
          action={
            <Button component={Link} to={ROUTES.accountOrders} variant="outline">
              Ir a Mis pedidos
            </Button>
          }
        />
      ) : (
        <AccountSectionCard
          icon={PackageCheck}
          title={activeOrder ? 'Tu pedido en curso' : 'Pedidos'}
          description={
            activeOrder
              ? 'Sigue su estado sin salir de tu cuenta.'
              : 'Aquí aparecerá tu pedido mientras esté en preparación o en camino.'
          }
          action={
            <Button component={Link} to={ROUTES.accountOrders} variant="outline" size="sm">
              Ver todos <ChevronRight className="size-3.5" />
            </Button>
          }
        >
          {activeOrder ? (
            <div className="flex flex-col gap-4 border-l-2 border-brand-600 bg-brand-50/60 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-extrabold text-ink">Pedido {activeOrder.orderNumber}</p>
                  <OrderStatusBadge status={activeOrder.status} />
                </div>
                <p className="mt-1.5 text-xs text-ink-muted">
                  {formatDate(activeOrder.placedAt)} · {formatCurrency(activeOrder.grandTotal)} ·{' '}
                  {activeOrder.deliveryType === 'DELIVERY'
                    ? activeOrder.addressSnapshotJson?.districtName ?? 'Entrega a domicilio'
                    : activeOrder.branch?.name ?? 'Recojo en tienda'}
                </p>
              </div>
              <Button
                component={Link}
                to={ROUTES.accountOrderDetail(activeOrder.orderNumber)}
                className="shrink-0"
              >
                {activeOrder.status === 'PENDING_PAYMENT' ? 'Ver el pedido' : 'Seguir mi pedido'}
                <ChevronRight className="size-4" />
              </Button>
            </div>
          ) : lastOrder ? (
            <div className="flex flex-col gap-4 rounded-card border border-line bg-surface-muted/45 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[.1em] text-ink-muted">
                  Tu última compra
                </p>
                <p className="mt-1 font-extrabold text-ink">Pedido {lastOrder.orderNumber}</p>
                <p className="mt-1 text-xs text-ink-muted">
                  {formatDate(lastOrder.placedAt)} · {formatCurrency(lastOrder.grandTotal)}
                </p>
              </div>
              <Button
                component={Link}
                to={ROUTES.accountOrderDetail(lastOrder.orderNumber)}
                variant="outline"
                className="shrink-0"
              >
                Ver detalle <ChevronRight className="size-4" />
              </Button>
            </div>
          ) : (
            <EmptyState
              variant="inset"
              icon={PackageOpen}
              title="Todavía no tienes pedidos"
              description="Cuando hagas tu primera compra podrás seguirla desde aquí."
              action={
                <Button
                  component={Link}
                  to={ROUTES.menu}
                  leftIcon={<ShoppingBag className="size-4" />}
                >
                  Explorar el menú
                </Button>
              }
            />
          )}
        </AccountSectionCard>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {walletError ? (
          <AccountLoadError
            title="Saldo no disponible"
            message={walletError}
            onRetry={retry}
            className="px-4 py-6 sm:col-span-3"
          />
        ) : (
          <StatCard
            label="Saldo disponible"
            value={formatCurrency(wallet?.balance ?? 0)}
            icon={Wallet}
            hint={
              wallet?.nextExpiry
                ? `Vence el primer lote el ${formatDate(wallet.nextExpiry)}`
                : 'Se aplica automáticamente al pagar.'
            }
          />
        )}
        <StatCard
          label="Pedidos"
          value={ordersError ? '—' : orders.length}
          icon={ClipboardList}
          hint={ordersError ? 'No pudimos consultarlos.' : 'Compras realizadas con tu cuenta.'}
        />
        <StatCard
          label="Favoritos"
          value={favoriteCount}
          icon={Heart}
          hint="Guardados en este navegador."
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        {addressesError ? (
          <AccountLoadError
            title="No pudimos cargar tu dirección"
            message={addressesError}
            onRetry={retry}
            className="px-4 py-8"
          />
        ) : (
          <AccountSectionCard
            icon={MapPin}
            title="Dónde recibes"
            description="La dirección principal es la que proponemos al pagar."
            action={
              <Button component={Link} to={ROUTES.accountAddresses} variant="outline" size="sm">
                Administrar
              </Button>
            }
          >
            {defaultAddress ? (
              <div className="rounded-card border border-line bg-surface-muted/45 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-extrabold text-ink">{defaultAddress.label}</p>
                  {defaultAddress.isDefault && (
                    <span className="rounded-pill bg-brand-100 px-2 py-0.5 text-[10px] font-extrabold text-brand-800">
                      Principal
                    </span>
                  )}
                </div>
                <p className="mt-1.5 text-sm leading-6 text-ink-muted">{defaultAddress.line1}</p>
                {zoneLabel(defaultAddress) && (
                  <p className="mt-0.5 text-xs text-ink-muted">{zoneLabel(defaultAddress)}</p>
                )}
              </div>
            ) : (
              <EmptyState
                variant="inset"
                icon={MapPin}
                title="Todavía no tienes direcciones guardadas"
                description="Guarda una y la tendrás lista en cada compra."
                action={
                  <Button component={Link} to={ROUTES.accountAddresses}>
                    Agregar dirección
                  </Button>
                }
              />
            )}
          </AccountSectionCard>
        )}

        <AccountSectionCard
          icon={Salad}
          title="Accesos rápidos"
          description="Lo que sueles abrir, a un toque."
          bodyClassName="p-0 sm:p-0"
        >
          <ul>
            <QuickLink
              to={ROUTES.accountOrders}
              icon={ClipboardList}
              label="Mis pedidos"
              detail={ordersError ? 'Consulta el historial' : `${orders.length} en tu historial`}
            />
            <QuickLink
              to={ROUTES.accountFavorites}
              icon={Heart}
              label="Mis favoritos"
              detail={favoriteCount > 0 ? `${favoriteCount} guardados` : 'Marca los que más pides'}
            />
            <QuickLink
              to={ROUTES.accountSavedBowls}
              icon={Salad}
              label="Bowls guardados"
              detail="Tus recetas listas para repetir"
            />
            <QuickLink
              to={ROUTES.accountReviews}
              icon={Star}
              label="Mis opiniones"
              detail="Califica tus compras entregadas"
            />
            <QuickLink
              to={ROUTES.accountProfile}
              icon={User2}
              label="Mi perfil"
              detail="Datos, clave y preferencias"
            />
          </ul>
        </AccountSectionCard>
      </div>
    </div>
  );
};

const QuickLink = ({
  to,
  icon: Icon,
  label,
  detail,
}: {
  to: string;
  icon: typeof Heart;
  label: string;
  detail: string;
}) => (
  <li className="border-b border-line last:border-b-0">
    <Link
      to={to}
      className="flex min-h-14 items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-muted/60 sm:px-6"
    >
      <span className="grid size-9 shrink-0 place-items-center rounded-card bg-brand-50 text-brand-700">
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold text-ink">{label}</span>
        <span className="block truncate text-xs text-ink-muted">{detail}</span>
      </span>
      <ChevronRight className="size-4 shrink-0 text-ink-muted" aria-hidden="true" />
    </Link>
  </li>
);

/* La forma real de la pantalla, no un spinner que borra la cabecera: al resolver, el
 * contenido cae donde ya estaba su hueco. */
const AccountHomeSkeleton = () => (
  <div>
    <Skeleton className="h-52 w-full rounded-card" />
    <div className="mt-4 grid gap-3 sm:grid-cols-3">
      {Array.from({ length: 3 }, (_, index) => (
        <Skeleton key={index} className="h-32 rounded-card" />
      ))}
    </div>
    <div className="mt-4 grid gap-4 lg:grid-cols-2">
      <Skeleton className="h-60 rounded-card" />
      <Skeleton className="h-60 rounded-card" />
    </div>
  </div>
);

export default AccountHomePage;
