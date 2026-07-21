import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Clock3,
  CreditCard,
  Loader2,
  MapPin,
  Pencil,
  Store,
  Tag,
  Wallet,
} from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { SectionHeading } from '@components/common/SectionHeading';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Textarea } from '@components/ui/Textarea';
import { Select, SelectOption } from '@components/ui/Select';
import { Checkbox } from '@components/ui/Checkbox';
import { Card, CardDescription, CardTitle } from '@components/ui/Card';
import { useAppDispatch, useAppSelector } from '@app/hooks';
import { clearCart } from '@features/cart/cartSlice';
import { useAppState } from '@context/AppStateContext';
import { getApiErrorMessage } from '@services/api/client';
import { formatCurrency, formatDate } from '@lib/format';
import { cn } from '@lib/cn';
import { isValidDni, isValidRuc } from '@lib/peruDocs';
import { ROUTES } from '@constants/routes';
import { geoApi } from '@features/geo/services/geo.service';
import type { Address, DeliverySlot } from '@features/geo/types';
import { accountApi } from '@features/account/services/account.service';
import { trackUxEvent } from '@services/analytics';
import { useCodSettings, useInvoicingSettings } from '@services/businessInfo';
import { checkoutApi } from '../services/checkout.service';
import type { CheckoutInput, OrderQuote } from '../types';

const IDEMPOTENCY_KEY_STORAGE = 'verde-bowl:checkout-idempotency:v1';

/**
 * Checkout (M08).
 * El total NO se calcula aqui: cada cambio se recotiza en el backend (RN-007).
 * Al pagar, el pedido nace PENDING_PAYMENT y solo el webhook lo confirma (RN-014).
 */
const CheckoutPage = () => {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const { items } = useAppSelector((state) => state.cart);
  const user = useAppSelector((state) => state.auth.user);
  const { address, branchId, deliveryType, setDeliveryType, setAddress, setBranch, openLocationModal } = useAppState();
  const cod = useCodSettings();
  const invoicing = useInvoicingSettings();

  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [useWallet, setUseWallet] = useState(true);
  // Como paga: online (tarjeta) o en efectivo al recibir.
  const [paymentMethod, setPaymentMethod] = useState<'ONLINE' | 'CASH'>('ONLINE');
  // Comprobante: boleta (por defecto) o factura con RUC.
  const [documentType, setDocumentType] = useState<'BOLETA' | 'FACTURA'>('BOLETA');
  const [ruc, setRuc] = useState('');
  const [razonSocial, setRazonSocial] = useState('');
  const [fiscalAddress, setFiscalAddress] = useState('');
  // DNI del comprador: la boleta lo pide a partir del umbral SUNAT.
  const [boletaDni, setBoletaDni] = useState('');
  const [billingError, setBillingError] = useState<string | null>(null);
  const [serviceMode, setServiceMode] = useState<'ASAP' | 'SCHEDULED'>('ASAP');
  const [slotId, setSlotId] = useState<number | null>(null);
  const [slots, setSlots] = useState<DeliverySlot[]>([]);
  const [contactName, setContactName] = useState(
    [user?.firstName, user?.lastName].filter(Boolean).join(' '),
  );
  const [contactPhone, setContactPhone] = useState('');
  const [kitchenNotes, setKitchenNotes] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);

  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [contactErrors, setContactErrors] = useState<{ name?: string; phone?: string }>({});

  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem('verde-bowl:checkout-draft:v1') ?? 'null') as {
        couponInput?: string; appliedCoupon?: string | null; useWallet?: boolean;
        serviceMode?: 'ASAP' | 'SCHEDULED'; slotId?: number | null;
        contactName?: string; contactPhone?: string; kitchenNotes?: string; deliveryNotes?: string;
        paymentMethod?: 'ONLINE' | 'CASH'; documentType?: 'BOLETA' | 'FACTURA';
        ruc?: string; razonSocial?: string; fiscalAddress?: string; boletaDni?: string;
      } | null;
      if (!draft) return;
      setCouponInput(draft.couponInput ?? '');
      setAppliedCoupon(draft.appliedCoupon ?? null);
      setUseWallet(draft.useWallet ?? true);
      setServiceMode(draft.serviceMode === 'SCHEDULED' ? 'SCHEDULED' : 'ASAP');
      setSlotId(draft.slotId ?? null);
      setContactName(draft.contactName || [user?.firstName, user?.lastName].filter(Boolean).join(' '));
      setContactPhone(draft.contactPhone ?? '');
      setKitchenNotes(draft.kitchenNotes ?? '');
      setDeliveryNotes(draft.deliveryNotes ?? '');
      setPaymentMethod(draft.paymentMethod === 'CASH' ? 'CASH' : 'ONLINE');
      setDocumentType(draft.documentType === 'FACTURA' ? 'FACTURA' : 'BOLETA');
      setRuc(draft.ruc ?? '');
      setRazonSocial(draft.razonSocial ?? '');
      setFiscalAddress(draft.fiscalAddress ?? '');
      setBoletaDni(draft.boletaDni ?? '');
    } catch {
      localStorage.removeItem('verde-bowl:checkout-draft:v1');
    }
    // El borrador se restaura solo al entrar al checkout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      localStorage.setItem('verde-bowl:checkout-draft:v1', JSON.stringify({
        couponInput, appliedCoupon, useWallet, serviceMode, slotId, contactName, contactPhone, kitchenNotes, deliveryNotes,
        paymentMethod, documentType, ruc, razonSocial, fiscalAddress, boletaDni,
      }));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [couponInput, appliedCoupon, useWallet, serviceMode, slotId, contactName, contactPhone, kitchenNotes, deliveryNotes, paymentMethod, documentType, ruc, razonSocial, fiscalAddress, boletaDni]);

  useEffect(() => {
    if (!user) return;
    accountApi.listAddresses().then(setSavedAddresses).catch(() => setSavedAddresses([]));
  }, [user]);

  const chooseSavedAddress = async (saved: Address) => {
    try {
      const coverage = await geoApi.checkCoverage({
        districtId: saved.districtId ?? undefined,
        latitude: saved.latitude == null ? undefined : Number(saved.latitude),
        longitude: saved.longitude == null ? undefined : Number(saved.longitude),
      });
      if (!coverage.covered || !coverage.branch) throw new Error(coverage.reason ?? 'Esta dirección no tiene cobertura');
      setAddress({
        id: saved.id, label: saved.label, line1: saved.line1, reference: saved.reference ?? undefined,
        districtId: saved.districtId ?? undefined,
        latitude: saved.latitude == null ? undefined : Number(saved.latitude),
        longitude: saved.longitude == null ? undefined : Number(saved.longitude),
      });
      setBranch(coverage.branch.id);
      toast.success(`Dirección cambiada a ${saved.label}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : getApiErrorMessage(error));
    }
  };

  /** Clave de idempotencia: una por intento de compra (RN-015). */
  /**
   * Clave de idempotencia estable mientras dure el intento de compra. Vive en
   * sessionStorage para que recargar la pagina o volver de la pasarela reutilice la
   * misma clave: el backend devuelve el pedido ya creado en vez de crear otro.
   * Solo se renueva cuando el intento falla de verdad.
   */
  const [idempotencyKey, setIdempotencyKey] = useState(() => {
    const stored = sessionStorage.getItem(IDEMPOTENCY_KEY_STORAGE);
    if (stored) return stored;
    const fresh = crypto.randomUUID();
    sessionStorage.setItem(IDEMPOTENCY_KEY_STORAGE, fresh);
    return fresh;
  });

  const renewIdempotencyKey = () => {
    const fresh = crypto.randomUUID();
    sessionStorage.setItem(IDEMPOTENCY_KEY_STORAGE, fresh);
    setIdempotencyKey(fresh);
  };

  /**
   * Entrada de la COTIZACION: solo lo que puede cambiar el precio.
   * El contacto y las notas se anaden al confirmar (`buildPlaceInput`). Tenerlos aqui
   * disparaba un POST /checkout/quote por cada tecla escrita, y cada quote recotiza
   * items, cupones, cobertura y saldo.
   */
  const quoteInput = useMemo<CheckoutInput | null>(() => {
    if (items.length === 0) return null;

    const base: CheckoutInput = {
      items: items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        selections: item.selections.map((selection) => ({
          optionId: selection.optionId,
          quantity: selection.quantity,
        })),
      })),
      deliveryType,
      serviceMode,
      deliverySlotId: serviceMode === 'SCHEDULED' ? (slotId ?? undefined) : undefined,
      couponCode: appliedCoupon ?? undefined,
      useWallet,
    };

    if (deliveryType === 'DELIVERY') {
      if (!address) return null;
      base.address = {
        label: address.label,
        line1: address.line1,
        reference: address.reference,
        districtId: address.districtId,
        latitude: address.latitude,
        longitude: address.longitude,
      };
    } else {
      if (!branchId) return null;
      base.branchId = branchId;
    }

    return base;
  }, [items, deliveryType, serviceMode, slotId, address, branchId, appliedCoupon, useWallet]);

  /** Carga util del pedido: la cotizacion mas los datos que no afectan al precio. */
  const buildPlaceInput = (): CheckoutInput | null => {
    if (!quoteInput) return null;
    const notes = [
      kitchenNotes.trim() ? `COCINA: ${kitchenNotes.trim()}` : '',
      deliveryNotes.trim() ? `REPARTO: ${deliveryNotes.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return {
      ...quoteInput,
      contactName: contactName || undefined,
      contactPhone: contactPhone || undefined,
      notes: notes || undefined,
      paymentMethod,
      billing:
        documentType === 'FACTURA'
          ? {
              documentType: 'FACTURA',
              docNumber: ruc.trim(),
              name: razonSocial.trim(),
              address: fiscalAddress.trim() || undefined,
            }
          : {
              documentType: 'BOLETA',
              // Solo se manda el DNI cuando el umbral lo exige y el campo esta visible:
              // asi un DNI a medias de un total anterior no viaja escondido.
              docNumber: boletaNeedsDni ? boletaDni.trim() || undefined : undefined,
            },
    };
  };

  /** Franjas de la sucursal, para los pedidos programados (RN-004). */
  useEffect(() => {
    if (!branchId || serviceMode !== 'SCHEDULED') return;

    geoApi
      .getSlots(branchId)
      .then((available) => {
        setSlots(available);
        if (available.length > 0) setSlotId((current) => current ?? available[0].id);
      })
      .catch(() => setSlots([]));
  }, [branchId, serviceMode]);

  useEffect(() => {
    if (!quoteInput) return;

    let cancelled = false;
    setIsQuoting(true);

    checkoutApi
      .quote(quoteInput)
      .then((result) => {
        if (cancelled) return;
        setQuote(result);
        setQuoteError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setQuote(null);
        setQuoteError(getApiErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setIsQuoting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [quoteInput]);

  // El comprobante se emite por el valor total de la venta (el saldo es un medio de
  // pago, no un descuento): esto es lo que compara SUNAT contra el umbral.
  const invoiceTotal = quote ? quote.grandTotal + quote.walletAmount : 0;
  // La boleta pide DNI a partir del umbral SUNAT (el backend lo revalida).
  const boletaNeedsDni =
    documentType === 'BOLETA' && invoiceTotal >= invoicing.boletaDniThreshold;

  // El efectivo se ofrece si esta activo y el total a cobrar no supera el tope.
  const codAvailable =
    cod.enabled && quote != null && quote.grandTotal > 0 && quote.grandTotal <= cod.maxAmount;
  // Si el efectivo deja de estar disponible (cambio de total), se vuelve a tarjeta.
  useEffect(() => {
    if (paymentMethod === 'CASH' && !codAvailable) setPaymentMethod('ONLINE');
  }, [codAvailable, paymentMethod]);

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <p className="text-ink-muted">Tu carrito esta vacio.</p>
        <Button className="mt-4" onClick={() => navigate(ROUTES.menu)}>
          Ver el menu
        </Button>
      </div>
    );
  }

  const handleApplyCoupon = () => {
    const code = couponInput.trim().toUpperCase();
    if (!code) return;
    setAppliedCoupon(code);
  };

  const handlePay = async () => {
    const placeInput = buildPlaceInput();
    if (!placeInput || !quote?.meetsMinimum) return;

    const errors = {
      ...(contactName.trim().length < 2 ? { name: 'Escribe el nombre de quien recibirá el pedido.' } : {}),
      ...(!/^[0-9+\s-]{6,20}$/.test(contactPhone.trim()) ? { phone: 'Ingresa un teléfono válido de 6 a 20 dígitos.' } : {}),
    };
    setContactErrors(errors);
    if (Object.keys(errors).length) {
      document.getElementById('checkout-contact')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // Comprobante: la factura exige un RUC valido y razon social; la boleta pide DNI a
    // partir del umbral SUNAT. El backend revalida todo antes de crear el pedido.
    const billingIssue =
      documentType === 'FACTURA'
        ? !isValidRuc(ruc)
          ? 'Ingresa un RUC válido (11 dígitos, empieza en 10/20).'
          : razonSocial.trim().length < 3
            ? 'Ingresa la razón social.'
            : null
        : boletaNeedsDni && !boletaDni.trim()
          ? `Para una boleta de ${formatCurrency(invoiceTotal)} necesitamos tu DNI.`
          : boletaNeedsDni && !isValidDni(boletaDni)
            ? 'El DNI debe tener 8 dígitos.'
            : null;
    setBillingError(billingIssue);
    if (billingIssue) {
      document.getElementById('checkout-billing')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setIsPaying(true);
    void trackUxEvent('CHECKOUT_START', { deliveryType, itemCount: items.length, total: quote.grandTotal });
    try {
      const order = await checkoutApi.place(placeInput, idempotencyKey);

      // El pedido YA existe en el backend: el carrito se vacia aqui, no en la pantalla
      // de retorno. Esperar a la confirmacion dejaba el carrito intacto si el cliente
      // cerraba la pestana en la pasarela; al volver pagaba lo mismo otra vez y, como
      // la clave de idempotencia se regeneraba, el backend creaba un segundo pedido real.
      dispatch(clearCart());
      localStorage.removeItem('verde-bowl:checkout-draft:v1');
      // El pedido ya nacio: la proxima compra debe estrenar clave, o reutilizariamos
      // esta y el backend devolveria el pedido anterior en lugar de crear el nuevo.
      sessionStorage.removeItem(IDEMPOTENCY_KEY_STORAGE);

      // El saldo cubrio todo: el backend ya confirmo el pedido, no hay nada que cobrar.
      if (!order.checkoutUrl) {
        navigate(`${ROUTES.checkoutSuccess}?pedido=${order.orderNumber}`);
        return;
      }

      // Stripe (o el simulador) cobra en su propia pagina: aqui no toca ninguna tarjeta.
      void trackUxEvent('PAYMENT_REDIRECT', { provider: order.provider ?? 'unknown', total: order.grandTotal });
      window.location.href = order.checkoutUrl;
    } catch (error) {
      const message = getApiErrorMessage(error);
      void trackUxEvent('CHECKOUT_ERROR', { message: message.slice(0, 120), deliveryType });
      toast.error(message);
      // Si el pedido no se creo, el siguiente intento necesita una clave nueva.
      renewIdempotencyKey();
    } finally {
      setIsPaying(false);
    }
  };

  const missingDestination =
    (deliveryType === 'DELIVERY' && !address) || (deliveryType === 'PICKUP' && !branchId);
  const payingCash = paymentMethod === 'CASH' && codAvailable;

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 pb-32 lg:pb-12">
      <SectionHeading title="Checkout" description="Revisa tu pedido y paga de forma segura." />

      <div className="grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          <Card>
            <CardTitle className="mb-3 text-base">Como quieres recibirlo?</CardTitle>
            <div className="flex gap-2">
              {(['DELIVERY', 'PICKUP'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => setDeliveryType(type)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm transition-colors',
                    deliveryType === type
                      ? 'border-brand-600 bg-brand-50 font-medium text-brand-700'
                      : 'border-line text-ink-muted hover:border-brand-300',
                  )}
                >
                  {type === 'DELIVERY' ? <MapPin className="size-4" /> : <Store className="size-4" />}
                  {type === 'DELIVERY' ? 'Delivery' : 'Recojo en tienda'}
                </button>
              ))}
            </div>

            {deliveryType === 'DELIVERY' && (
              <div className="mt-4 rounded-xl bg-surface-muted p-3 text-sm">
                {address ? (
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-ink"><span className="font-medium">{address.label}:</span> {address.line1}</p>
                    <Button size="sm" variant="ghost" leftIcon={<Pencil className="size-3.5" />} onClick={openLocationModal}>Editar</Button>
                  </div>
                ) : (
                  <p className="text-ink-muted">
                    Aun no elegiste direccion. Usa el boton de ubicacion del menu superior.
                  </p>
                )}
                {savedAddresses.length > 0 && (
                  <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                    {savedAddresses.map((saved) => <button key={saved.id} type="button" onClick={() => void chooseSavedAddress(saved)} className={cn('shrink-0 rounded-full border px-3 py-1.5 text-xs font-semibold', address?.id === saved.id ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line bg-white text-ink-muted')}>{saved.label}</button>)}
                  </div>
                )}
              </div>
            )}
          </Card>

          <Card>
            <CardTitle className="mb-3 text-base">Cuando lo quieres?</CardTitle>
            <div className="flex gap-2">
              {(['ASAP', 'SCHEDULED'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setServiceMode(mode)}
                  className={cn(
                    'flex flex-1 items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm transition-colors',
                    serviceMode === mode
                      ? 'border-brand-600 bg-brand-50 font-medium text-brand-700'
                      : 'border-line text-ink-muted hover:border-brand-300',
                  )}
                >
                  <CalendarClock className="size-4" />
                  {mode === 'ASAP' ? 'Lo antes posible' : 'Programarlo'}
                </button>
              ))}
            </div>

            {serviceMode === 'SCHEDULED' && (
              <div className="mt-4">
                {slots.length === 0 ? (
                  <CardDescription>
                    No hay franjas disponibles ahora mismo. Prueba con entrega inmediata.
                  </CardDescription>
                ) : (
                    <Select
                      id="slot"
                      label="Franja de entrega"
                      value={slotId ?? ''}
                      onChange={(event) => setSlotId(Number(event.target.value))}
                    >
                      {slots.map((slot) => (
                        <SelectOption key={slot.id} value={slot.id}>
                          {formatDate(slot.startsAt)} — quedan {slot.available} cupos
                        </SelectOption>
                      ))}
                    </Select>
                )}
              </div>
            )}
          </Card>

          {quote && quote.walletBalance > 0 && (
            <Card>
              <CardTitle className="mb-3 text-base">Tu saldo</CardTitle>

              <Checkbox
                checked={useWallet}
                onChange={(event) => setUseWallet(event.target.checked)}
                label={<span>
                  <span className="flex items-center gap-1.5 text-sm font-medium text-ink">
                    <Wallet className="size-4 text-brand-600" />
                    Usar mi saldo ({formatCurrency(quote.walletBalance)} disponibles)
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-muted">
                    {useWallet && quote.walletAmount > 0
                      ? `Se aplicaran ${formatCurrency(quote.walletAmount)}${
                          quote.grandTotal > 0
                            ? ` y el resto (${formatCurrency(quote.grandTotal)}) se cobra con tarjeta.`
                            : ' y no se cobrara nada a tu tarjeta.'
                        }`
                      : 'Si no alcanza, cobramos la diferencia con tu tarjeta.'}
                  </span>
                </span>}
              />
            </Card>
          )}

          <Card id="checkout-contact">
            <CardTitle className="mb-3 text-base">Datos de contacto</CardTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Nombre"
                value={contactName}
                onChange={(event) => { setContactName(event.target.value); setContactErrors((current) => ({ ...current, name: undefined })); }}
                placeholder="Para quien es el pedido"
                autoComplete="name"
                error={contactErrors.name}
              />
              <Input
                label="Telefono"
                value={contactPhone}
                onChange={(event) => { setContactPhone(event.target.value); setContactErrors((current) => ({ ...current, phone: undefined })); }}
                placeholder="999 888 777"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                error={contactErrors.phone}
              />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Textarea rows={3} label="Indicaciones para cocina" value={kitchenNotes} onChange={(event) => setKitchenNotes(event.target.value)} placeholder="Salsa aparte, sin cubiertos…" maxLength={250} />
              <Textarea rows={3} label="Indicaciones para reparto" value={deliveryNotes} onChange={(event) => setDeliveryNotes(event.target.value)} placeholder="Tocar el timbre, recepción…" maxLength={250} />
            </div>
          </Card>

          <Card id="checkout-billing">
            <CardTitle className="mb-1 text-base">Comprobante de pago</CardTitle>
            <CardDescription className="mb-3 text-xs">
              Emitimos boleta por defecto. Elige factura si necesitas sustentar el gasto de tu empresa.
            </CardDescription>
            <div className="grid grid-cols-2 gap-2">
              {(['BOLETA', 'FACTURA'] as const).map((type) => (
                <button
                  key={type}
                  type="button"
                  onClick={() => { setDocumentType(type); setBillingError(null); }}
                  aria-pressed={documentType === type}
                  className={`rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                    documentType === type
                      ? 'border-brand-600 bg-brand-50 text-brand-800'
                      : 'border-line text-ink-muted hover:border-brand-300'
                  }`}
                >
                  {type === 'BOLETA' ? 'Boleta' : 'Factura'}
                </button>
              ))}
            </div>
            {documentType === 'FACTURA' && (
              <div className="mt-3 grid gap-3">
                <Input
                  label="RUC"
                  value={ruc}
                  onChange={(event) => { setRuc(event.target.value.replace(/\D/g, '').slice(0, 11)); setBillingError(null); }}
                  placeholder="20123456789"
                  inputMode="numeric"
                  error={billingError && !isValidRuc(ruc) ? billingError : undefined}
                />
                <Input
                  label="Razón social"
                  value={razonSocial}
                  onChange={(event) => { setRazonSocial(event.target.value); setBillingError(null); }}
                  placeholder="Mi Empresa S.A.C."
                  maxLength={200}
                  error={billingError && isValidRuc(ruc) ? billingError : undefined}
                />
                <Input
                  label="Dirección fiscal (opcional)"
                  value={fiscalAddress}
                  onChange={(event) => setFiscalAddress(event.target.value)}
                  placeholder="Av. Ejemplo 123, Lima"
                  maxLength={200}
                />
              </div>
            )}
            {documentType === 'BOLETA' && boletaNeedsDni && (
              <div className="mt-3">
                <Input
                  label="DNI"
                  value={boletaDni}
                  onChange={(event) => { setBoletaDni(event.target.value.replace(/\D/g, '').slice(0, 8)); setBillingError(null); }}
                  placeholder="12345678"
                  inputMode="numeric"
                  error={billingError ?? undefined}
                />
                <p className="mt-1 text-xs text-ink-muted">
                  A partir de {formatCurrency(invoicing.boletaDniThreshold)}, SUNAT pide identificar la boleta con tu DNI.
                </p>
              </div>
            )}
          </Card>

          <Card>
            <CardTitle className="mb-3 text-base">Cupon</CardTitle>
            <div className="flex gap-2">
              <Input
                value={couponInput}
                onChange={(event) => setCouponInput(event.target.value.toUpperCase())}
                placeholder="VERDE10"
              />
              <Button variant="outline" onClick={handleApplyCoupon} className="shrink-0">
                Aplicar
              </Button>
            </div>

            {appliedCoupon && quote?.discounts.length === 0 && !quoteError && (
              <CardDescription className="mt-2 text-xs">
                El cupon {appliedCoupon} no aplica a este pedido.
              </CardDescription>
            )}

            {quote?.discounts.map((discount) => (
              <p
                key={discount.code}
                className="mt-2 flex items-center gap-1.5 text-sm text-brand-700"
              >
                <Tag className="size-4" />
                {discount.description} · -{formatCurrency(discount.amount)}
              </p>
            ))}
            {!appliedCoupon && quote?.discounts.some((discount) => discount.source === 'COUPON') && (
              <CardDescription className="mt-2 text-xs">Aplicamos automáticamente el mejor cupón disponible.</CardDescription>
            )}
          </Card>
        </div>

        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <Card>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Resumen</CardTitle>
              {isQuoting && <Loader2 className="size-4 animate-spin text-brand-600" />}
            </div>

            <ul className="mt-3 space-y-2 text-sm">
              {items.map((item) => (
                <li key={item.id} className="flex justify-between gap-3">
                  <span className="min-w-0 text-ink-muted">
                    {item.quantity}x {item.name}
                  </span>
                  <span className="shrink-0">{formatCurrency(item.lineTotal)}</span>
                </li>
              ))}
            </ul>

            {quote && (
              <dl className="mt-4 space-y-1.5 border-t border-line pt-3 text-sm">
                <div className="mb-3 rounded-xl bg-brand-50 p-3 text-xs text-brand-800">
                  <p className="flex items-center gap-1.5 font-bold"><CheckCircle2 className="size-4" /> Atiende {quote.branchName}</p>
                  <p className="mt-1 flex items-center gap-1.5"><Clock3 className="size-3.5" /> {deliveryType === 'DELIVERY' ? `Entrega estimada: ${quote.etaMinutes} min` : `Preparación estimada: ${quote.etaMinutes} min`}{quote.routeDistanceKm ? ` · ${quote.routeDistanceKm} km` : ''}</p>
                  {quote.etaSource === 'LIVE_ROUTE' && <p className="mt-1 font-semibold text-brand-700">Ruta actualizada con la ubicación exacta.</p>}
                  {quote.demandLevel !== 'LOW' && <p className="mt-1 font-semibold text-amber-800">{quote.demandLevel === 'HIGH' ? 'Demanda alta: el tiempo ya incluye la espera actual.' : 'Demanda moderada en esta cocina.'}</p>}
                </div>
                <div className="flex justify-between text-ink-muted">
                  <dt>Subtotal</dt>
                  <dd>{formatCurrency(quote.subtotal)}</dd>
                </div>
                <div className="flex justify-between text-ink-muted">
                  <dt>Delivery</dt>
                  <dd>{quote.deliveryFee === 0 ? 'Gratis' : formatCurrency(quote.deliveryFee)}</dd>
                </div>
                {quote.discountTotal > 0 && (
                  <div className="flex justify-between text-brand-700">
                    <dt>Descuentos</dt>
                    <dd>-{formatCurrency(quote.discountTotal)}</dd>
                  </div>
                )}
                {quote.walletAmount > 0 && (
                  <div className="flex justify-between text-brand-700">
                    <dt>Saldo aplicado</dt>
                    <dd>-{formatCurrency(quote.walletAmount)}</dd>
                  </div>
                )}
                <div className="flex justify-between border-t border-line pt-2 text-base font-bold text-ink">
                  <dt>{quote.grandTotal > 0 ? 'A pagar con tarjeta' : 'Total'}</dt>
                  <dd className="text-brand-700">{formatCurrency(quote.grandTotal)}</dd>
                </div>
                {quote.taxTotal > 0 && (
                  // El IGV ya está dentro del precio: se informa, no se suma. Mostrarlo
                  // es obligatorio para que el cliente sepa qué parte es impuesto.
                  <div className="flex justify-between text-xs text-ink-muted">
                    <dt>
                      Incluye IGV ({Math.round(quote.taxRate * 100)}%)
                    </dt>
                    <dd>{formatCurrency(quote.taxTotal)}</dd>
                  </div>
                )}
              </dl>
            )}

            {quoteError && (
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700">
                <AlertCircle className="mt-0.5 size-4 shrink-0" />
                {quoteError}
              </p>
            )}

            {quote && !quote.meetsMinimum && (
              <p className="mt-4 flex items-start gap-2 rounded-xl bg-surface-muted p-3 text-xs text-ink-muted">
                <AlertCircle className="mt-0.5 size-4 shrink-0 text-accent-500" />
                Agrega {formatCurrency(Math.max(0, quote.minimumOrder - quote.subtotal))} para alcanzar el pedido mínimo de {formatCurrency(quote.minimumOrder)}.
              </p>
            )}

            {missingDestination && (
              <p className="mt-4 rounded-xl bg-surface-muted p-3 text-xs text-ink-muted">
                {deliveryType === 'DELIVERY'
                  ? 'Elige tu direccion para continuar.'
                  : 'Elige el local donde vas a recoger.'}
              </p>
            )}

            {/* Metodo de pago: solo cuando queda algo por cobrar (si el saldo cubre
                todo, no hay eleccion que hacer). El efectivo se oculta si esta
                desactivado o el total supera el tope. */}
            {quote && quote.grandTotal > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-sm font-medium text-ink">¿Cómo quieres pagar?</p>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('ONLINE')}
                    aria-pressed={paymentMethod === 'ONLINE'}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                      paymentMethod === 'ONLINE'
                        ? 'border-brand-600 bg-brand-50 text-brand-800'
                        : 'border-line text-ink-muted hover:border-brand-300'
                    }`}
                  >
                    <CreditCard className="size-4" /> Tarjeta
                  </button>
                  {codAvailable && (
                    <button
                      type="button"
                      onClick={() => setPaymentMethod('CASH')}
                      aria-pressed={paymentMethod === 'CASH'}
                      className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-sm transition-colors ${
                        paymentMethod === 'CASH'
                          ? 'border-brand-600 bg-brand-50 text-brand-800'
                          : 'border-line text-ink-muted hover:border-brand-300'
                      }`}
                    >
                      <Banknote className="size-4" /> Efectivo al recibir
                    </button>
                  )}
                </div>
              </div>
            )}

            <Button
              className="mt-4 w-full"
              size="lg"
              leftIcon={
                quote?.grandTotal === 0 ? (
                  <Wallet className="size-4" />
                ) : payingCash ? (
                  <Banknote className="size-4" />
                ) : (
                  <CreditCard className="size-4" />
                )
              }
              disabled={!quote?.meetsMinimum || missingDestination}
              isLoading={isPaying}
              onClick={handlePay}
            >
              {quote?.grandTotal === 0
                ? 'Pagar con mi saldo'
                : payingCash
                  ? `Confirmar pedido · ${quote ? formatCurrency(quote.grandTotal) : ''} al recibir`
                  : `Pagar ${quote ? formatCurrency(quote.grandTotal) : ''}`}
            </Button>

            <CardDescription className="mt-3 text-center text-xs">
              {quote?.grandTotal === 0
                ? 'Tu saldo cubre todo el pedido: no se cobrara nada a tu tarjeta.'
                : payingCash
                  ? 'Confirmamos tu pedido de una vez y pagas en efectivo cuando lo recibas.'
                  : 'El pago se procesa fuera de esta web. Nunca guardamos datos de tu tarjeta.'}
            </CardDescription>
          </Card>
        </aside>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 p-3 shadow-[0_-12px_32px_rgba(20,55,37,.12)] backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-ink-muted">Total confirmado</p>
            <p className="truncate text-lg font-black text-brand-700">{quote ? formatCurrency(quote.grandTotal) : 'Calculando…'}</p>
          </div>
          <Button
            size="lg"
            disabled={!quote?.meetsMinimum || missingDestination}
            isLoading={isPaying}
            onClick={handlePay}
          >
            Continuar al pago
          </Button>
        </div>
      </div>
    </div>
  );
};

export default CheckoutPage;
