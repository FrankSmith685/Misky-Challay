import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
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
import { useAppState } from '@context/AppStateContext';
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
import type { SavedBowl } from '@features/builder/types';
import type { CartItem } from '@/types/domain';

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
  const {
    address,
    hasCoverage,
    deliveryType,
    pickupBranch,
    openLocationModal,
  } = useAppState();
  const { pending, dismiss: dismissPending } = usePendingOrder();
  const { balance, isLoading: isBalanceLoading } = useWalletBalance();
  /** Ultima linea quitada, para poder devolverla a su sitio. */
  const [lastRemoved, setLastRemoved] = useState<{ item: CartItem; index: number } | null>(null);
  const isPickup = deliveryType === 'PICKUP';
  const totalUnits = useMemo(
    () => items.reduce((total, item) => total + item.quantity, 0),
    [items],
  );
  /** Saldo que merece mostrarse: del cliente identificado y mayor que cero. */
  const walletBalance = isAuthenticated && balance != null && balance > 0 ? balance : null;

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
  const editCustomBowl = (item: CartItem) => {
    // El constructor precarga con la forma de un bowl guardado (solo lee nombre,
    // variante y selecciones): la linea del carrito viaja con esa misma forma.
    const preload: SavedBowl = {
      id: 0,
      name: item.name,
      productId: item.productId,
      variantId: item.variantId,
      selections: item.selections.map(({ optionId, quantity }) => ({ optionId, quantity })),
      updatedAt: new Date().toISOString(),
    };
    dispatch(startItemEdit(item.id));
    navigate(ROUTES.builder, { state: { savedBowl: preload } });
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

  /**
   * El checkout exige sesion. Se avisa AQUI, antes de dar el paso: llegar al
   * checkout y ser rebotado a la pantalla de acceso sin explicacion se lee como
   * un error de la tienda, no como un requisito.
   */
  const proceed = () => {
    if (!hasCoverage) {
      openLocationModal();
      return;
    }
    if (!isAuthenticated) {
      // Al identificarse vuelve al checkout: el carrito y la direccion se conservan.
      navigate(ROUTES.login, { state: { from: ROUTES.checkout } });
      return;
    }
    navigate(ROUTES.checkout);
  };

  const ctaLabel = !hasCoverage
    ? isPickup
      ? 'Elegir local'
      : 'Elegir dirección'
    : isAuthenticated
      ? 'Continuar al checkout'
      : 'Inicia sesión para continuar';

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
      <main className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
        <PageHeader
          eyebrow="Tu pedido"
          title="Carrito"
          description={
            pending
              ? 'Tus productos ya pasaron a un pedido que está esperando el pago.'
              : 'Agrega tus bowls favoritos y vuelve aquí para revisar tu compra.'
          }
          icon={ShoppingBag}
          crumbs={[{ label: 'Inicio', to: '/' }, { label: 'Carrito' }]}
        />
        <CheckoutStepper current={0} className="mb-7 max-w-xl" />

        <PendingOrderBanner pending={pending} onResolved={dismissPending} />

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
              : 'Explora el menú o crea un bowl a tu medida. Lo que agregues se conservará mientras continúas comprando.'
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
                <Button component={Link} to={ROUTES.builder} variant="outline">
                  Armar mi bowl
                </Button>
              )}
            </div>
          }
          className={pending ? undefined : 'min-h-90'}
        />
      </main>
    );
  }

  const destinationTitle = hasCoverage
    ? isPickup
      ? 'Local de recojo confirmado'
      : 'Dirección de entrega confirmada'
    : isPickup
      ? 'Falta elegir el local de recojo'
      : 'Falta confirmar la dirección';
  const destinationDetail = hasCoverage
    ? isPickup
      ? `${pickupBranch?.name ?? 'Local seleccionado'} · ${pickupBranch?.addressLine ?? ''}`
      : `${address?.label ? `${address.label} · ` : ''}${address?.line1 ?? ''}`
    : isPickup
      ? 'Selecciona el local donde recogerás tu pedido.'
      : 'Confirma tu ubicación para validar cobertura y calcular el delivery.';

  return (
    <>
      <main className="mx-auto max-w-6xl px-4 pb-32 pt-8 sm:pt-12 lg:pb-14">
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
        <PendingOrderBanner pending={pending} onResolved={dismissPending} />

        <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_360px] xl:gap-9">
          <div className="grid min-w-0 gap-5">
            <Card className={hasCoverage ? 'border-brand-200 bg-brand-50/45' : 'border-accent-300 bg-accent-50/45'}>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                  <span className={`grid size-10 shrink-0 place-items-center rounded-card ${hasCoverage ? 'bg-brand-700 text-white' : 'bg-accent-100 text-accent-700'}`}>
                    {isPickup ? <Store className="size-5" /> : <MapPin className="size-5" />}
                  </span>
                  <div className="min-w-0">
                    {/* La distincion entre destino resuelto y sin resolver no puede
                        descansar solo en el color de la rampa accent. */}
                    <p className="flex items-center gap-1.5 text-sm font-extrabold text-ink">
                      {destinationTitle}
                      {hasCoverage ? (
                        <CheckCircle2 className="size-4 text-brand-700" />
                      ) : (
                        <AlertTriangle className="size-4 text-accent-700" />
                      )}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-ink-muted sm:text-sm">{destinationDetail}</p>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={openLocationModal} className="w-full sm:w-auto">
                  {hasCoverage ? 'Cambiar' : isPickup ? 'Elegir local' : 'Elegir dirección'}
                </Button>
              </div>
            </Card>

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
                      onEdit={() => editCustomBowl(item)}
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
                <PriceBreakdown
                  lines={[
                    { label: 'Subtotal de productos', value: formatCurrency(subtotal) },
                    {
                      label: isPickup ? 'Recojo en tienda' : 'Delivery',
                      value: isPickup ? 'Gratis' : 'Por calcular',
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
                  totalLabel="Total estimado"
                  totalValue={formatCurrency(subtotal)}
                  prominentTotal
                  note="El servidor confirmará disponibilidad, descuentos, saldo y costo de envío en el siguiente paso."
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

                {!hasCoverage && (
                  <Callout tone="warning" size="sm">
                    {isPickup
                      ? 'Elige un local para habilitar el checkout.'
                      : 'Confirma una dirección con cobertura para habilitar el checkout.'}
                  </Callout>
                )}

                {hasCoverage && !isAuthenticated && (
                  <Callout tone="info" size="sm" icon={LogIn}>
                    Para confirmar el pedido necesitas tu cuenta: es donde sigues el
                    estado, guardas tus direcciones y usas cupones o saldo.
                    <Link
                      to={ROUTES.register}
                      state={{ from: ROUTES.checkout }}
                      className="mt-1 block font-bold underline underline-offset-2"
                    >
                      Crear una cuenta en un minuto
                    </Link>
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

      <StickyActionBar label={`${totalUnits} ${totalUnits === 1 ? 'producto' : 'productos'} · Total estimado`} value={formatCurrency(subtotal)} maxWidth="6xl">
        <Button size="lg" onClick={proceed}>
          {!hasCoverage ? (isPickup ? 'Elegir local' : 'Elegir dirección') : isAuthenticated ? 'Continuar' : 'Iniciar sesión'}
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
