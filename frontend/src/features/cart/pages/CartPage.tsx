import { CartAvailabilityNotice } from '../components/CartAvailabilityNotice';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarClock,
  LogIn,
  MapPin,
  PackageCheck,
  ShoppingBag,
  Store,
  Trash2,
  Undo2,
  Utensils,
  Wallet,
} from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { PageHeader } from '@components/common/PageHeader';
import { EmptyState } from '@components/common/EmptyState';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { CheckoutStepper } from '@components/ui/CheckoutStepper';
import { Modal } from '@components/ui/Modal';
import { StickyActionBar } from '@components/ui/StickyActionBar';
import { TrustBadges } from '@components/ui/TrustBadges';
import { PriceBreakdown } from '@components/ui/PriceBreakdown';
import { Callout } from '@components/ui/Callout';
import { useAppDispatch, useAppSelector } from '@app/hooks';
import { useWalletBalance } from '@hooks/useWalletBalance';
import {
  cancelItemEdit,
  clearCart,
  removeItem,
  restoreItem,
  startItemEdit,
  updateItemQuantity,
} from '../cartSlice';
import { CartItemCard } from '../components/CartItemCard';
import { PendingOrderBanner } from '@features/checkout/components/PendingOrderBanner';
import { usePendingOrder } from '@features/checkout/usePendingOrder';
import { formatCurrency } from '@lib/format';
import { ROUTES } from '@constants/routes';
import { catalogApi } from '@features/catalog/services/catalog.service';
import type { CartItem } from '@/types/domain';
import { useAppState } from '@context/AppStateContext';

/**
 * Revisión local del carrito. Los importes son referenciales: checkout recotiza
 * disponibilidad, delivery, promociones, cupones y saldo antes de crear el pedido.
 */
const CartPage = () => {
  const dispatch = useAppDispatch();
  const navigate = useNavigate();
  const [confirmClear, setConfirmClear] = useState(false);
  const { items, subtotal } = useAppSelector((state) => state.cart);
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const { address, deliveryType, pickupBranch, serviceMode, hasCoverage, openLocationModal } = useAppState();
  const { pending, dismiss: dismissPending, recoveryError, retryRecovery } = usePendingOrder();
  const { balance, isLoading: isBalanceLoading } = useWalletBalance();
  /** Ultima linea quitada, para poder devolverla a su sitio. */
  const [lastRemoved, setLastRemoved] = useState<{ item: CartItem; index: number } | null>(null);
  const totalUnits = useMemo(
    () => items.reduce((total, item) => total + item.quantity, 0),
    [items],
  );
  /** Saldo que merece mostrarse: del cliente identificado y mayor que cero. */
  const walletBalance = isAuthenticated && balance != null && balance > 0 ? balance : null;
  const hasDestination = hasCoverage;
  const destinationLabel = deliveryType === 'PICKUP'
    ? pickupBranch?.name
    : address?.line1;

  /**
   * Estar aqui significa que la edicion que empezo en esta pantalla no llego al
   * constructor o se abandono: la linea original sigue en el carrito, asi que el
   * proximo bowl que se agregue tiene que ser uno nuevo y no un reemplazo.
   */
  useEffect(() => {
    dispatch(cancelItemEdit());
  }, [dispatch]);

  /** Pasado un rato "Deshacer" ya no habla de una accion reciente y estorba. */
  useEffect(() => {
    if (!lastRemoved) return undefined;
    const timer = window.setTimeout(() => setLastRemoved(null), 10000);
    return () => window.clearTimeout(timer);
  }, [lastRemoved]);

  /*
   * Vaciar el carrito abre un modal y quitar un favorito avisa; quitar un producto
   * era la unica accion destructiva muda del recorrido. No se confirma antes (seria
   * un peaje en la accion mas repetida del carrito): se avisa y se puede revertir.
   */
  const handleRemove = (item: CartItem, index: number) => {
    dispatch(removeItem(item.id));
    setLastRemoved({ item, index });
    toast(`Quitamos ${item.name} del carrito.`);
  };

  const undoRemove = () => {
    if (!lastRemoved) return;
    dispatch(restoreItem(lastRemoved));
    setLastRemoved(null);
  };

  /**
   * Editar un bowl armado: hasta ahora habia que borrarlo y rehacerlo entero. La
   * linea se queda en el carrito mientras tanto —si abandona el constructor no
   * pierde nada— y el bowl que vuelva la reemplaza en su sitio (ver `cartSlice`).
   */
  const editCustomBowl = async (item: CartItem) => {
    const slug = item.slug ?? (await catalogApi.getProducts()).find((product) => product.id === item.productId)?.slug;
    if (!slug) { toast.error('Esta torta ya no está disponible para editar.'); return; }
    dispatch(startItemEdit(item.id));
    navigate(`${ROUTES.cake(slug)}${item.theme ? `?diseno=${encodeURIComponent(item.theme.slug)}` : ''}`, { state: { editItem: item } });
  };

  const undoNotice = lastRemoved && (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface-muted/70 px-4 py-3">
      <p className="min-w-0 text-sm text-ink-muted">
        Quitaste <strong className="font-bold text-ink">{lastRemoved.item.name}</strong> del carrito.
      </p>
      <Button
        size="sm"
        variant="outline"
        leftIcon={<Undo2 className="size-4" />}
        onClick={undoRemove}
      >
        Deshacer
      </Button>
    </div>
  );

  /** El carrito abre checkout para que el visitante revise y complete su destino. */
  const proceed = () => {
    navigate(ROUTES.checkout);
  };

  const ctaLabel = isAuthenticated
      ? 'Continuar al checkout'
      : 'Revisar pedido';

  const destinationSummary = deliveryType === 'PICKUP'
    ? pickupBranch
      ? `${pickupBranch.name} · ${pickupBranch.addressLine}`
      : 'Elige el taller donde recogerás tu pedido.'
    : address
      ? [address.label, address.line1].filter(Boolean).join(' · ')
      : 'Elige una dirección para calcular cobertura y delivery.';

  const destinationCard = (
    <section aria-labelledby="cart-destination-title" className="rounded-card border border-line bg-white p-4 shadow-e2 sm:p-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-card bg-brand-50 text-brand-700">
            {deliveryType === 'PICKUP' ? <Store className="size-5" /> : <MapPin className="size-5" />}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-brand-700">Cómo recibirás tu pedido</p>
            <h2 id="cart-destination-title" className="mt-1 text-base font-black text-ink">
              {deliveryType === 'PICKUP' ? 'Recojo en taller' : 'Delivery a domicilio'}
            </h2>
            <p className="mt-1 truncate text-sm text-ink-muted">
              {hasDestination
                ? destinationLabel
                : deliveryType === 'PICKUP'
                  ? 'Elige el taller donde recogerás tu pedido.'
                  : 'Elige una dirección para calcular cobertura y delivery.'}
            </p>
            {serviceMode === 'SCHEDULED' && (
              <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-800">
                <CalendarClock className="size-3.5" /> Entrega programada
              </p>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant={hasDestination ? 'outline' : 'primary'}
          onClick={openLocationModal}
          className="shrink-0"
        >
          {hasDestination ? 'Cambiar' : 'Elegir destino'}
        </Button>
      </div>
      <p className="mt-3 border-t border-line pt-3 text-xs leading-5 text-ink-muted">
        El costo exacto y los horarios disponibles se confirman en checkout según tu destino y los tiempos de preparación.
      </p>
    </section>
  );

  if (items.length === 0) {
    /*
     * Un carrito vacio no significa lo mismo siempre. Si los productos pasaron a un
     * pedido que quedo sin pagar, el "agrega tus bowls favoritos" de siempre
     * contradecia al aviso de arriba: uno decia que no habia pasado nada y el otro
     * que si. Con un pedido pendiente, el vacio es una consecuencia y se explica
     * como tal; el estado vacio pasa a segundo plano (`inset`) para que el aviso
     * siga siendo lo primero que se lee.
     */
    return (
      <main className="mx-auto max-w-8xl px-4 py-8 sm:py-12">
        <PageHeader
          eyebrow="Tu pedido"
          title="Carrito"
          description={
            pending
              ? 'Tus productos ya pasaron a un pedido que está esperando el pago.'
              : 'Agrega una torta y vuelve aquí para revisar tu compra.'
          }
          icon={ShoppingBag}
          crumbs={[{ label: 'Inicio', to: '/' }, { label: 'Carrito' }]}
        />
        <CheckoutStepper current={0} className="mb-7 max-w-xl" />

        <PendingOrderBanner pending={pending} onResolved={dismissPending} recoveryError={recoveryError} onRetry={retryRecovery} />
        <CartAvailabilityNotice />

        {/* Se puede haber vaciado quitando la ultima linea: la salida sigue disponible. */}
        {undoNotice}

        <EmptyState
          variant={pending ? 'inset' : 'panel'}
          icon={ShoppingBag}
          title={
            pending
              ? 'Tu carrito está vacío porque el pedido ya está creado'
              : 'Tu carrito está listo para tu próxima elección'
          }
          description={
            pending
              ? 'Cuando termines o canceles ese pedido podrás empezar una compra nueva desde aquí.'
              : 'Explora las tortas o crea una a tu gusto. Lo que agregues se conservará mientras continúas comprando.'
          }
          action={
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                component={Link}
                to={ROUTES.menu}
                variant={pending ? 'outline' : 'primary'}
                leftIcon={<Utensils className="size-4" />}
              >
                Explorar el menú
              </Button>
              {!pending && (
                <Button component={Link} to={ROUTES.menuMode('CUSTOM')} variant="outline">
                  Crear mi torta
                </Button>
              )}
            </div>
          }
          className={pending ? undefined : 'min-h-90'}
        />
      </main>
    );
  }

  return (
    <>
    <main className="mx-auto max-w-8xl px-4 pb-32 pt-8 sm:pt-12 lg:pb-14">
        <PageHeader
          eyebrow="Tu pedido"
          title="Revisa tu carrito"
          description={`${totalUnits} ${totalUnits === 1 ? 'producto listo' : 'productos listos'} para continuar.`}
          icon={ShoppingBag}
          crumbs={[{ label: 'Inicio', to: '/' }, { label: 'Carrito' }]}
          action={
            <Button component={Link} to={ROUTES.menu} variant="outline" size="sm">
              Seguir comprando
            </Button>
          }
        />

        <CheckoutStepper current={0} className="mb-7 max-w-xl" />

        {/* Puede haber vuelto a llenar el carrito con un pedido anterior todavia
            sin pagar: pagar dos veces lo mismo no lo evita nadie mas que este aviso. */}
        <PendingOrderBanner pending={pending} onResolved={dismissPending} recoveryError={recoveryError} onRetry={retryRecovery} />
        <CartAvailabilityNotice />

        <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_360px] xl:gap-9">
          <div className="grid min-w-0 gap-5">
            {destinationCard}

            <section aria-labelledby="cart-products-title">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-brand-700">Tu selección</p>
                  <h2 id="cart-products-title" className="mt-1 text-xl font-black text-ink">
                    Productos ({totalUnits})
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmClear(true)}
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-field px-2 text-xs font-bold text-ink-muted transition hover:bg-red-50 hover:text-red-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
                >
                  <Trash2 className="size-4" /> Vaciar carrito
                </button>
              </div>

              {undoNotice}

              <ul className="grid gap-3">
                {items.map((item, index) => (
                  <li key={item.id}>
                    <CartItemCard
                      item={item}
                      onQuantityChange={(quantity) =>
                        dispatch(updateItemQuantity({ id: item.id, quantity }))
                      }
                      onRemove={() => handleRemove(item, index)}
                      onEdit={() => void editCustomBowl(item)}
                    />
                  </li>
                ))}
              </ul>
            </section>

            <Button
              component={Link}
              to={ROUTES.menu}
              variant="ghost"
              className="w-fit"
              leftIcon={<Utensils className="size-4" />}
            >
              Agregar otro producto
            </Button>
          </div>

          <aside className="lg:sticky lg:top-24" aria-label="Resumen del carrito">
            <Card className="overflow-hidden p-0">
              <div className="border-b border-line bg-gradient-to-r from-brand-50 to-white px-5 py-4">
                <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-brand-700">Resumen</p>
                <h2 className="mt-1 text-lg font-black text-ink">Tu pedido</h2>
                <p className="mt-1 text-xs text-ink-muted">
                  {totalUnits} {totalUnits === 1 ? 'unidad' : 'unidades'} · {items.length} {items.length === 1 ? 'preparación' : 'preparaciones'}
                </p>
              </div>

              <div className="grid gap-4 p-5">
                <section aria-label="Detalle de entrega" className="rounded-card border border-line bg-surface-muted/65 p-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-2.5">
                      <span className="grid size-8 shrink-0 place-items-center rounded-card bg-white text-brand-700 ring-1 ring-line">
                        {deliveryType === 'PICKUP' ? <Store className="size-4" /> : <MapPin className="size-4" />}
                      </span>
                      <div className="min-w-0">
                        <p className="text-[10px] font-extrabold uppercase tracking-[.12em] text-brand-700">
                          {deliveryType === 'PICKUP' ? 'Recojo en taller' : 'Delivery a domicilio'}
                        </p>
                        <p className="mt-1 break-words text-sm font-bold leading-5 text-ink">
                          {hasDestination ? destinationSummary : 'Destino pendiente'}
                        </p>
                        {hasDestination && address?.reference && deliveryType === 'DELIVERY' && (
                          <p className="mt-1 break-words text-xs leading-5 text-ink-muted">
                            Referencia: {address.reference}
                          </p>
                        )}
                      </div>
                    </div>
                    <Button type="button" size="sm" variant="outline" className="shrink-0" onClick={openLocationModal}>
                      {hasDestination ? 'Cambiar' : 'Elegir'}
                    </Button>
                  </div>
                  <p className="mt-3 border-t border-line pt-3 text-xs leading-5 text-ink-muted">
                    {hasDestination
                      ? 'Validaremos cobertura, disponibilidad y costo exacto al revisar el checkout.'
                      : 'Puedes elegir tu destino ahora o hacerlo dentro del checkout.'}
                  </p>
                </section>

                <section aria-label="Productos del pedido" className="border-b border-line pb-4">
                  <p className="mb-2 text-[10px] font-extrabold uppercase tracking-[.12em] text-brand-700">
                    Productos
                  </p>
                  <ul className="grid gap-2.5 text-sm">
                    {items.map((item) => (
                      <li key={item.id} className="flex min-w-0 items-start justify-between gap-3">
                        <span className="min-w-0 text-ink-muted">
                          <span className="font-semibold text-ink">{item.quantity}× {item.name}</span>
                          {item.variantName && <span className="block text-xs leading-5">{item.variantName}</span>}
                        </span>
                        <span className="shrink-0 font-semibold text-ink">{formatCurrency(item.lineTotal)}</span>
                      </li>
                    ))}
                  </ul>
                </section>

                <PriceBreakdown
                  lines={[
                    { label: 'Subtotal de productos', value: formatCurrency(subtotal) },
                    {
                      label: deliveryType === 'PICKUP' ? 'Recojo en taller' : 'Delivery a domicilio',
                      value: hasDestination ? 'Destino seleccionado' : 'Pendiente de elegir',
                    },
                    {
                      label: 'Promociones y saldo',
                      // El cliente logueado no tenia forma de saber cuanto saldo tiene
                      // hasta el ultimo paso del checkout: aqui es donde decide seguir.
                      value:
                        walletBalance != null
                          ? `${formatCurrency(walletBalance)} de saldo`
                          : isAuthenticated && isBalanceLoading
                            ? 'Consultando…'
                            : 'En checkout',
                      tone: walletBalance != null ? 'positive' : undefined,
                    },
                  ]}
                  totalLabel="Subtotal referencial"
                  totalValue={formatCurrency(subtotal)}
                  prominentTotal
                  note="El total final se confirma en checkout después de validar disponibilidad, descuentos, saldo, destino y costo de envío."
                />

                {walletBalance != null && (
                  <div className="flex items-start gap-2 rounded-card border border-brand-100 bg-brand-50/60 p-3 text-xs leading-5 text-brand-800">
                    <Wallet className="mt-0.5 size-4 shrink-0 text-brand-700" />
                    <p>
                      Tienes <strong>{formatCurrency(walletBalance)}</strong> de saldo disponible.
                      Podrás aplicarlo a este pedido en el checkout.
                    </p>
                  </div>
                )}

                {!isAuthenticated && (
                  <Callout tone="info" size="sm" icon={LogIn}>
                    Puedes revisar tu pedido y elegir cómo recibirlo sin crear una cuenta.
                    Te pediremos iniciar sesión justo antes de confirmar el pago.
                  </Callout>
                )}

                <Button
                  className="w-full"
                  size="lg"
                  onClick={proceed}
                >
                  {ctaLabel}
                  <ArrowRight className="ml-2 size-4" />
                </Button>

                <div className="flex items-start gap-2 rounded-card bg-surface-muted/60 p-3 text-xs leading-5 text-ink-muted">
                  <PackageCheck className="mt-0.5 size-4 shrink-0 text-brand-700" />
                  <p>No se cobrará nada hasta que revises y confirmes el pedido en el checkout.</p>
                </div>

                <TrustBadges variant="compact" className="border-t border-line pt-4" />
              </div>
            </Card>
          </aside>
        </div>
      </main>

      <StickyActionBar label={`${totalUnits} ${totalUnits === 1 ? 'producto' : 'productos'} · Subtotal referencial`} value={formatCurrency(subtotal)} maxWidth="6xl">
        <Button size="lg" onClick={proceed}>
          {isAuthenticated ? 'Continuar' : 'Revisar pedido'}
        </Button>
      </StickyActionBar>

      <Modal
        isOpen={confirmClear}
        onClose={() => setConfirmClear(false)}
        title="¿Vaciar todo el carrito?"
        description="Se eliminarán todas las preparaciones que agregaste."
        icon={Trash2}
        eyebrow="Confirma la acción"
        maxWidth="xs"
      >
        <div className="rounded-card border border-line bg-surface-muted/60 p-4">
          <p className="text-sm font-bold text-ink">
            {totalUnits} {totalUnits === 1 ? 'producto' : 'productos'} · {formatCurrency(subtotal)}
          </p>
          <p className="mt-1 text-xs leading-5 text-ink-muted">Esta acción no puede deshacerse.</p>
        </div>
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => setConfirmClear(false)}>Conservar productos</Button>
          <Button
            variant="danger"
            onClick={() => {
              dispatch(clearCart());
              setConfirmClear(false);
            }}
          >
            Sí, vaciar carrito
          </Button>
        </div>
      </Modal>
    </>
  );
};

export default CartPage;
