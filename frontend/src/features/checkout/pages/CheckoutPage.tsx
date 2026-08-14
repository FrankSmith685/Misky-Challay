import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle,
  Banknote,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CreditCard,
  Loader2,
  MapPin,
  Pencil,
  ReceiptText,
  Smartphone,
  RefreshCw,
  Store,
  Tag,
  UserRound,
  Utensils,
  Wallet,
} from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { PageHeader } from '@components/common/PageHeader';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Textarea } from '@components/ui/Textarea';
import { Select, SelectOption } from '@components/ui/Select';
import { Checkbox } from '@components/ui/Checkbox';
import { Chip } from '@components/ui/Chip';
import { Card, CardDescription, CardTitle } from '@components/ui/Card';
import { StickyActionBar } from '@components/ui/StickyActionBar';
import { TrustBadges } from '@components/ui/TrustBadges';
import { PriceBreakdown, type SummaryLine } from '@components/ui/PriceBreakdown';
import { ChoiceGroup } from '@components/ui/ChoiceGroup';
import { Callout } from '@components/ui/Callout';
import { CheckoutStepper } from '@components/ui/CheckoutStepper';
import { FormGrid, FormSection, FormStack } from '@components/ui/FormSection';
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
import {
  useCodSettings,
  useInvoicingSettings,
  useLocalPaymentSettings,
  useOnlinePaymentSettings,
  useReceiptSettings,
} from '@services/businessInfo';
import { checkoutApi } from '../services/checkout.service';
import { rememberPendingOrder } from '../pendingOrder';
import { PendingOrderBanner } from '../components/PendingOrderBanner';
import { usePendingOrder } from '../usePendingOrder';
import type { CheckoutInput, OrderQuote } from '../types';

const IDEMPOTENCY_KEY_STORAGE = 'verde-bowl:checkout-idempotency:v1';
const DRAFT_STORAGE = 'verde-bowl:checkout-draft:v1';
/**
 * La facturacion NO viaja en el borrador: el borrador se borra al confirmar la
 * compra y con el se iban el RUC y la razon social, que no cambian de un pedido al
 * siguiente. Quien factura los reteclaba cada vez.
 */
const BILLING_STORAGE = 'verde-bowl:checkout-billing:v1';

/**
 * Motivo por el que todavia no se puede confirmar. Es la UNICA fuente de verdad de
 * los dos CTA (aside y barra fija): antes cada uno decidia por su cuenta con
 * `!quote?.meetsMinimum || missingDestination` y, como sin destino la cotizacion ni
 * arranca, la barra movil se quedaba en "Calculando..." con el boton muerto.
 */
type BlockReason = 'falta_direccion' | 'falta_local' | 'bajo_minimo' | 'error_cotizacion';

interface BlockAction {
  /** Lo que se lee en la barra fija en lugar del importe. */
  value: string;
  /** Etiqueta corta del boton: la barra fija mide 360 px en el peor caso. */
  label: string;
  icon: ReactNode;
  run: () => void;
}

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
  const {
    address,
    branchId,
    pickupBranch,
    deliveryType,
    setDeliveryType,
    selectDelivery,
    openLocationModal,
  } = useAppState();
  const cod = useCodSettings();
  const invoicing = useInvoicingSettings();
  const localPayments = useLocalPaymentSettings();
  const onlinePayments = useOnlinePaymentSettings();
  const receipts = useReceiptSettings();
  const { pending, dismiss: dismissPending } = usePendingOrder();

  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [useWallet, setUseWallet] = useState(true);
  // Como paga: online (tarjeta) o en efectivo al recibir.
  const [paymentMethod, setPaymentMethod] = useState<'ONLINE' | 'CASH' | 'YAPE' | 'PLIN'>('ONLINE');
  const [operationCode, setOperationCode] = useState('');
  const [payerPhone, setPayerPhone] = useState('');
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
  /*
   * El contacto sale del perfil, no en blanco: quien acaba de registrarse ya dio
   * su nombre y su telefono, y volver a pedirselos aqui parece que la cuenta no
   * hubiera servido de nada. Sigue siendo editable —se pide para ESTE pedido, no
   * para la cuenta—, asi que cambiarlo aqui no toca su perfil.
   */
  const profileName = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  const [contactName, setContactName] = useState(profileName);
  const [contactPhone, setContactPhone] = useState(user?.phone ?? '');
  const [kitchenNotes, setKitchenNotes] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);

  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isPaying, setIsPaying] = useState(false);
  const [contactErrors, setContactErrors] = useState<{ name?: string; phone?: string }>({});
  /*
   * Permite relanzar la cotizacion sin que cambie la entrada. `quoteInput` ignora
   * contacto, notas, DNI, RUC y metodo de pago, asi que ante un 500 puntual la unica
   * salida era marcar y desmarcar "usar saldo" o recargar la pagina.
   */
  const [quoteNonce, setQuoteNonce] = useState(0);

  // Resumen plegable de movil y control de "ya lo ha visto" (ver `handleStickyAction`).
  const [isSummaryOpen, setIsSummaryOpen] = useState(false);
  const [summarySeen, setSummarySeen] = useState(false);
  const summaryRef = useRef<HTMLElement>(null);
  const breakdownRef = useRef<HTMLDivElement>(null);
  /*
   * Ultima cotizacion valida. El fallo de red ya no vacia el resumen: sin esto un 500
   * puntual borraba desglose, ETA y medio de pago y dejaba el CTA sin nada que decir.
   */
  const lastValidQuoteRef = useRef<OrderQuote | null>(null);
  // Para llevar el foco al primer campo invalido, no solo hacer scroll a su seccion.
  const contactNameRef = useRef<HTMLInputElement>(null);
  const contactPhoneRef = useRef<HTMLInputElement>(null);
  const rucRef = useRef<HTMLInputElement>(null);
  const razonSocialRef = useRef<HTMLInputElement>(null);
  const boletaDniRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_STORAGE) ?? 'null') as {
        couponInput?: string; appliedCoupon?: string | null; useWallet?: boolean;
        serviceMode?: 'ASAP' | 'SCHEDULED'; slotId?: number | null;
        contactName?: string; contactPhone?: string; kitchenNotes?: string; deliveryNotes?: string;
        paymentMethod?: 'ONLINE' | 'CASH' | 'YAPE' | 'PLIN';
      } | null;
      if (!draft) return;
      setCouponInput(draft.couponInput ?? '');
      setAppliedCoupon(draft.appliedCoupon ?? null);
      setUseWallet(draft.useWallet ?? true);
      setServiceMode(draft.serviceMode === 'SCHEDULED' ? 'SCHEDULED' : 'ASAP');
      setSlotId(draft.slotId ?? null);
      setContactName(draft.contactName || profileName);
      setContactPhone(draft.contactPhone || (user?.phone ?? ''));
      setKitchenNotes(draft.kitchenNotes ?? '');
      setDeliveryNotes(draft.deliveryNotes ?? '');
      setPaymentMethod(['CASH', 'YAPE', 'PLIN'].includes(draft.paymentMethod ?? '') ? draft.paymentMethod! : 'ONLINE');
    } catch {
      localStorage.removeItem(DRAFT_STORAGE);
    }
    // El borrador se restaura solo al entrar al checkout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /*
   * La facturacion se guarda atada al usuario. Va aparte del borrador para sobrevivir
   * a la compra, y comprobar el id evita lo unico malo de esa supervivencia: que en un
   * equipo compartido el RUC del cliente anterior se cuele en el pedido del siguiente.
   */
  useEffect(() => {
    if (!user) return;
    try {
      const billing = JSON.parse(localStorage.getItem(BILLING_STORAGE) ?? 'null') as {
        userId?: number; documentType?: 'BOLETA' | 'FACTURA';
        ruc?: string; razonSocial?: string; fiscalAddress?: string; boletaDni?: string;
      } | null;
      if (!billing) return;
      if (billing.userId !== user.id) {
        localStorage.removeItem(BILLING_STORAGE);
        return;
      }
      setDocumentType(billing.documentType === 'FACTURA' ? 'FACTURA' : 'BOLETA');
      setRuc(billing.ruc ?? '');
      setRazonSocial(billing.razonSocial ?? '');
      setFiscalAddress(billing.fiscalAddress ?? '');
      setBoletaDni(billing.boletaDni ?? '');
    } catch {
      localStorage.removeItem(BILLING_STORAGE);
    }
  }, [user]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      localStorage.setItem(DRAFT_STORAGE, JSON.stringify({
        couponInput, appliedCoupon, useWallet, serviceMode, slotId, contactName, contactPhone, kitchenNotes, deliveryNotes,
        paymentMethod,
      }));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [couponInput, appliedCoupon, useWallet, serviceMode, slotId, contactName, contactPhone, kitchenNotes, deliveryNotes, paymentMethod]);

  useEffect(() => {
    if (!user) return;
    const timer = window.setTimeout(() => {
      localStorage.setItem(BILLING_STORAGE, JSON.stringify({
        userId: user.id, documentType, ruc, razonSocial, fiscalAddress, boletaDni,
      }));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [user, documentType, ruc, razonSocial, fiscalAddress, boletaDni]);

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
      selectDelivery({
        id: saved.id, label: saved.label, line1: saved.line1, reference: saved.reference ?? undefined,
        districtId: saved.districtId ?? undefined,
        latitude: saved.latitude == null ? undefined : Number(saved.latitude),
        longitude: saved.longitude == null ? undefined : Number(saved.longitude),
      }, coverage.branch.id);
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
      if (!branchId || pickupBranch?.id !== branchId) return null;
      base.branchId = branchId;
    }

    return base;
  }, [items, deliveryType, serviceMode, slotId, address, branchId, pickupBranch, appliedCoupon, useWallet]);

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
      ...((paymentMethod === 'YAPE' || paymentMethod === 'PLIN') ? {
        mobilePayment: { operationCode: operationCode.trim(), payerPhone: payerPhone.trim() || undefined },
      } : {}),
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
        lastValidQuoteRef.current = result;
        setQuote(result);
        setQuoteError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        // El fallo se degrada a banner: se mantiene el ultimo desglose bueno para que
        // el cliente conserve importes, ETA y medio de pago mientras reintenta.
        setQuote(lastValidQuoteRef.current);
        setQuoteError(getApiErrorMessage(error));
      })
      .finally(() => {
        if (!cancelled) setIsQuoting(false);
      });

    return () => {
      cancelled = true;
    };
  }, [quoteInput, quoteNonce]);

  // El comprobante se emite por el valor total de la venta (el saldo es un medio de
  // pago, no un descuento): esto es lo que compara SUNAT contra el umbral.
  const invoiceTotal = quote ? quote.grandTotal + quote.walletAmount : 0;
  // La boleta pide DNI a partir del umbral SUNAT (el backend lo revalida).
  const boletaNeedsDni =
    receipts.mode !== 'INTERNAL_ONLY' && documentType === 'BOLETA' && invoiceTotal >= invoicing.boletaDniThreshold;

  // El efectivo se ofrece si esta activo y el total a cobrar no supera el tope.
  const codAvailable =
    cod.enabled && quote != null && quote.grandTotal > 0 && quote.grandTotal <= cod.maxAmount;
  /*
   * Si el medio elegido deja de estar disponible se cae al primero que si lo
   * este. Antes se caia siempre a tarjeta, que sin pasarela configurada no se
   * ofrece: el cliente quedaba con un medio invisible seleccionado.
   */
  useEffect(() => {
    const available: Array<'ONLINE' | 'CASH' | 'YAPE' | 'PLIN'> = [
      ...(onlinePayments.onlineEnabled ? (['ONLINE'] as const) : []),
      ...(codAvailable ? (['CASH'] as const) : []),
      ...(localPayments.yapeEnabled ? (['YAPE'] as const) : []),
      ...(localPayments.plinEnabled ? (['PLIN'] as const) : []),
    ];
    if (available.length > 0 && !available.includes(paymentMethod)) {
      setPaymentMethod(available[0]);
    }
  }, [
    codAvailable,
    localPayments.plinEnabled,
    localPayments.yapeEnabled,
    onlinePayments.onlineEnabled,
    paymentMethod,
  ]);

  /*
   * Da por visto el resumen cuando el desglose del aside llega a pantalla. En
   * escritorio ocurre al entrar; en movil, solo si el cliente baja hasta el final. Con
   * esto la barra fija no rebota a quien ya reviso el total (ver `confirmOrReveal`).
   */
  useEffect(() => {
    const target = quote ? breakdownRef.current : null;
    if (!target || summarySeen) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) setSummarySeen(true);
      },
      { threshold: 0.5 },
    );
    observer.observe(target);

    return () => observer.disconnect();
  }, [summarySeen, quote]);

  if (items.length === 0) {
    /*
     * Es la pantalla a la que vuelve quien pulsa "atras" en la pasarela: el pedido
     * ya se creo y el carrito se vacio al crearlo. Sin el aviso, esto se leia como
     * "he perdido mi compra" cuando en realidad el pedido sigue vivo esperando pago.
     */
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <PendingOrderBanner pending={pending} onResolved={dismissPending} />
        <div className="grid justify-items-center gap-4 text-center">
          <p className="text-ink-muted">
            {pending
              ? 'No hay nada más que pagar aquí: tus productos están en el pedido de arriba.'
              : 'Tu carrito está vacío.'}
          </p>
          <Button variant={pending ? 'outline' : 'primary'} onClick={() => navigate(ROUTES.menu)}>
            Ver el menú
          </Button>
        </div>
      </div>
    );
  }

  /** Relanza la cotizacion sin que cambie `quoteInput` (ver `quoteNonce`). */
  const retryQuote = () => setQuoteNonce((current) => current + 1);

  const handleApplyCoupon = () => {
    const code = couponInput.trim().toUpperCase();
    // Aplicar con el campo vacio es como se quita un cupon a mano. El `return` temprano
    // de antes dejaba pegado el codigo que el backend acababa de rechazar, y como el
    // cupon se persiste, ni recargar desbloqueaba.
    setCouponInput(code);
    setAppliedCoupon(code || null);
    // Reaplicar el mismo codigo no cambia `quoteInput`: sin esto "Aplicar" no hacia nada.
    retryQuote();
  };

  const handleRemoveCoupon = () => {
    setCouponInput('');
    setAppliedCoupon(null);
    setQuoteError(null);
    retryQuote();
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
      // El scroll llevaba a la seccion pero no al campo: sin foco, quien va con teclado
      // o lector de pantalla se quedaba sin saber cual de los dos hay que corregir.
      (errors.name ? contactNameRef : contactPhoneRef).current?.focus({ preventScroll: true });
      return;
    }

    // Comprobante: la factura exige un RUC valido y razon social; la boleta pide DNI a
    // partir del umbral SUNAT. El backend revalida todo antes de crear el pedido.
    const billingIssue = receipts.mode === 'INTERNAL_ONLY'
      ? null
      : documentType === 'FACTURA'
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
      const invalidBillingField =
        documentType === 'FACTURA' ? (isValidRuc(ruc) ? razonSocialRef : rucRef) : boletaDniRef;
      invalidBillingField.current?.focus({ preventScroll: true });
      return;
    }

    if ((paymentMethod === 'YAPE' || paymentMethod === 'PLIN') && !/^[A-Za-z0-9-]{6,24}$/.test(operationCode.trim())) {
      toast.error('Ingresa el código de operación que aparece en tu aplicativo');
      document.getElementById('checkout-payment')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
      // Solo el borrador: la facturacion vive en su propia clave justo para no morir aqui.
      localStorage.removeItem(DRAFT_STORAGE);
      // El pedido ya nacio: la proxima compra debe estrenar clave, o reutilizariamos
      // esta y el backend devolveria el pedido anterior en lugar de crear el nuevo.
      sessionStorage.removeItem(IDEMPOTENCY_KEY_STORAGE);

      // El saldo cubrio todo: el backend ya confirmo el pedido, no hay nada que cobrar.
      if (!order.checkoutUrl) {
        if (order.provider === 'yape' || order.provider === 'plin') rememberPendingOrder(order.orderNumber);
        navigate(`${ROUTES.checkoutSuccess}?pedido=${order.orderNumber}`);
        return;
      }

      // Se deja anotado ANTES de salir de la app: si el cliente cierra la pestana
      // o pulsa atras en la pasarela, es lo unico que permite volver a ofrecerle
      // este pedido en vez de dejarlo invisible con el carrito ya vacio.
      rememberPendingOrder(order.orderNumber);

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
    (deliveryType === 'DELIVERY' && !address)
    || (deliveryType === 'PICKUP' && (!branchId || pickupBranch?.id !== branchId));
  const payingCash = paymentMethod === 'CASH' && codAvailable;
  const payingMobile = paymentMethod === 'YAPE' || paymentMethod === 'PLIN';
  const selectedLocal = paymentMethod === 'YAPE'
    ? { name: 'Yape', phone: localPayments.yapePhone, recipient: localPayments.yapeRecipient, qr: localPayments.yapeQrImageUrl }
    : { name: 'Plin', phone: localPayments.plinPhone, recipient: localPayments.plinRecipient, qr: localPayments.plinQrImageUrl };

  const itemCount = items.reduce((total, item) => total + item.quantity, 0);
  const missingForMinimum = quote ? Math.max(0, quote.minimumOrder - quote.subtotal) : 0;
  /** Primera cotizacion en vuelo: todavia no hay ningun importe que ensenar. */
  const isFirstQuote = isQuoting && !quote;

  const blockReason: BlockReason | null = missingDestination
    ? deliveryType === 'DELIVERY'
      ? 'falta_direccion'
      : 'falta_local'
    : quoteError
      ? 'error_cotizacion'
      : !quote
        ? isFirstQuote
          ? null
          : 'error_cotizacion'
        : !quote.meetsMinimum
          ? 'bajo_minimo'
          : null;

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  /*
   * Los textos van cortos a proposito: en la barra fija comparten 328 px con el boton a
   * 360 px de ancho. El icono se reserva para el CTA del aside, que si tiene sitio.
   */
  const blockAction: BlockAction | null = blockReason
    ? {
        falta_direccion: {
          value: 'Falta tu dirección',
          label: 'Elegir',
          icon: <MapPin className="size-4" />,
          run: openLocationModal,
        },
        falta_local: {
          value: 'Falta elegir local',
          label: 'Elegir',
          icon: <Store className="size-4" />,
          run: openLocationModal,
        },
        bajo_minimo: {
          value: `Te faltan ${formatCurrency(missingForMinimum)}`,
          label: 'Agregar',
          icon: <Utensils className="size-4" />,
          run: () => navigate(ROUTES.menu),
        },
        error_cotizacion: {
          value: 'No pudimos calcular',
          label: 'Reintentar',
          icon: <RefreshCw className="size-4" />,
          run: retryQuote,
        },
      }[blockReason]
    : null;

  /*
   * Etiqueta de confirmacion compartida: la barra fija decia "Continuar al pago" aunque
   * el saldo cubriera todo o el pedido fuera contra entrega. La version compacta se
   * queda sin el importe porque la propia barra ya lo muestra al lado.
   */
  const payLabel =
    quote?.grandTotal === 0
      ? 'Pagar con mi saldo'
      : payingCash
        ? `Confirmar pedido · ${quote ? formatCurrency(quote.grandTotal) : ''} al recibir`
        : `Pagar ${quote ? formatCurrency(quote.grandTotal) : ''}`;
  const payLabelCompact =
    quote?.grandTotal === 0 ? 'Pagar con saldo' : payingCash ? 'Confirmar pedido' : 'Pagar con tarjeta';
  const payIcon =
    quote?.grandTotal === 0 ? (
      <Wallet className="size-4" />
    ) : payingCash ? (
      <Banknote className="size-4" />
    ) : (
      <CreditCard className="size-4" />
    );
  const totalLabel =
    quote?.grandTotal === 0 ? 'Total' : payingCash ? 'A pagar al recibir' : 'A pagar con tarjeta';
  const paymentLabel = quote?.grandTotal === 0 ? 'Con mi saldo' : payingCash ? 'Efectivo al recibir' : 'Tarjeta';

  const summaryLines: SummaryLine[] = quote
    ? [
        { label: 'Subtotal', value: formatCurrency(quote.subtotal) },
        { label: 'Delivery', value: quote.deliveryFee === 0 ? 'Gratis' : formatCurrency(quote.deliveryFee) },
        ...(quote.discountTotal > 0
          ? [{ label: 'Descuentos', value: `-${formatCurrency(quote.discountTotal)}`, tone: 'positive' as const }]
          : []),
        ...(quote.walletAmount > 0
          ? [{ label: 'Saldo aplicado', value: `-${formatCurrency(quote.walletAmount)}`, tone: 'positive' as const }]
          : []),
      ]
    : [];

  const revealSummary = () => {
    setIsSummaryOpen(true);
    setSummarySeen(true);
    // El plegable es `lg:hidden`: en escritorio no tiene caja y hay que ir al aside.
    const target = summaryRef.current?.offsetParent ? summaryRef.current : breakdownRef.current;
    target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  /*
   * Puerta unica de confirmacion. Si algo bloquea, ejecuta la accion correctiva en vez
   * de quedarse muerto; si el cliente aun no ha visto el resumen, se lo abre. Se eligio
   * el plegable frente a un bottom-sheet de confirmacion porque anade una sola pulsacion
   * y solo la primera vez, y evita mantener el desglose duplicado en un tercer sitio.
   */
  const confirmOrReveal = () => {
    if (blockAction) {
      blockAction.run();
      return;
    }
    if (!summarySeen) {
      revealSummary();
      return;
    }
    void handlePay();
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    confirmOrReveal();
  };

  return (
    <main className="mx-auto max-w-6xl px-4 pb-32 pt-8 sm:pt-10 lg:pb-14">
      <PageHeader
        eyebrow="Pago seguro"
        title="Finaliza tu pedido"
        description="Confirma cómo lo recibirás, completa tus datos y revisa el total antes de pagar."
        icon={CreditCard}
        crumbs={[{ label: 'Inicio', to: '/' }, { label: 'Carrito', to: ROUTES.cart }, { label: 'Datos y pago' }]}
      />
      <CheckoutStepper current={1} className="mb-8 max-w-2xl" />

      {/* El contenedor de la rejilla ES el formulario: asi Enter confirma, el teclado
          movil ofrece tecla de accion y el navegador tiene contexto de autorrelleno,
          sin reindentar el arbol. La barra fija queda fuera a proposito (su boton no
          envia: pasa por `confirmOrReveal`). */}
      <form
        onSubmit={handleSubmit}
        noValidate
        className="grid items-start gap-7 lg:grid-cols-[minmax(0,1fr)_380px] xl:gap-9"
      >
        <div className="grid min-w-0 gap-6">
          {/* Resumen de movil. En una sola columna el desglose vive al final del scroll
              mientras la barra fija ya ofrece confirmar desde arriba: aqui el total y el
              numero de productos estan a la vista desde el primer momento. */}
          <section
            ref={summaryRef}
            aria-label="Resumen del pedido"
            className="rounded-card border border-line bg-white lg:hidden"
          >
            <button
              type="button"
              onClick={() => { setIsSummaryOpen((open) => !open); setSummarySeen(true); }}
              aria-expanded={isSummaryOpen}
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
            >
              <span className="min-w-0">
                <span className="block truncate text-xs text-ink-muted">
                  {itemCount} {itemCount === 1 ? 'producto' : 'productos'} · {paymentLabel}
                </span>
                <span className="block text-lg font-black text-brand-700">
                  {isFirstQuote ? 'Calculando…' : quote ? formatCurrency(quote.grandTotal) : '—'}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-ink-muted">
                {isSummaryOpen ? 'Ocultar' : 'Ver detalle'}
                <ChevronDown className={cn('size-4 transition-transform', isSummaryOpen && 'rotate-180')} />
              </span>
            </button>
            {isSummaryOpen && (
              <div className="border-t border-line px-4 py-4">
                {quote ? (
                  <>
                    <PriceBreakdown
                      lines={summaryLines}
                      totalLabel={totalLabel}
                      totalValue={formatCurrency(quote.grandTotal)}
                    />
                    <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-muted">
                      <Clock3 className="size-3.5 shrink-0" />
                      {deliveryType === 'DELIVERY'
                        ? `Entrega estimada: ${quote.etaMinutes} min`
                        : `Preparación estimada: ${quote.etaMinutes} min`}
                    </p>
                    <button
                      type="button"
                      onClick={() => scrollToSection('checkout-payment')}
                      className="mt-1 inline-flex min-h-[44px] items-center text-xs font-semibold text-brand-700 underline underline-offset-2"
                    >
                      Cambiar método de pago
                    </button>
                  </>
                ) : (
                  <p className="text-xs leading-5 text-ink-muted">
                    {isFirstQuote
                      ? 'Estamos calculando el total de tu pedido…'
                      : 'Todavía no podemos calcular el total de tu pedido.'}
                  </p>
                )}
              </div>
            )}
          </section>

          <FormSection
            title="¿Cómo quieres recibirlo?"
            description="Elige delivery o recojo. Validaremos la cobertura y el local antes del pago."
            icon={MapPin}
          >
            <FormStack spacing={2.5}>
            <ChoiceGroup
              ariaLabel="Cómo quieres recibirlo"
              value={deliveryType}
              onChange={setDeliveryType}
              className="flex-col sm:flex-row"
              options={[
                { value: 'DELIVERY', label: 'Delivery', icon: <MapPin className="size-4" /> },
                { value: 'PICKUP', label: 'Recojo en tienda', icon: <Store className="size-4" /> },
              ]}
            />

            {deliveryType === 'DELIVERY' && (
              <div className="rounded-card border border-line bg-surface-muted/55 p-4 text-sm">
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
                    {savedAddresses.map((saved) => <button key={saved.id} type="button" onClick={() => void chooseSavedAddress(saved)} className={cn('shrink-0 rounded-field border px-3 py-1.5 text-xs font-semibold', address?.id === saved.id ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line bg-white text-ink-muted')}>{saved.label}</button>)}
                  </div>
                )}
              </div>
            )}

            {deliveryType === 'PICKUP' && (
              <div className="rounded-card border border-brand-100 bg-brand-50/60 p-4 text-sm">
                {pickupBranch?.id === branchId ? (
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="flex items-center gap-1.5 font-bold text-ink">
                        <Store className="size-4 text-brand-700" />
                        {pickupBranch.name}
                      </p>
                      <p className="mt-1 text-xs text-ink-muted">{pickupBranch.addressLine}</p>
                      <p className="mt-2 text-xs font-semibold text-brand-800">
                        Recojo confirmado · no necesitas dirección de entrega
                      </p>
                    </div>
                    <Button size="sm" variant="ghost" onClick={openLocationModal}>Ver local</Button>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-ink-muted">Elige el local donde recogerás tu pedido.</p>
                    <Button size="sm" variant="outline" onClick={openLocationModal}>Elegir local</Button>
                  </div>
                )}
              </div>
            )}
            </FormStack>
          </FormSection>

          <FormSection
            title="¿Cuándo lo quieres?"
            description="Elige preparación inmediata o reserva una franja disponible."
            icon={CalendarClock}
          >
            <FormStack spacing={2.5}>
            <ChoiceGroup
              ariaLabel="Cuándo lo quieres"
              value={serviceMode}
              onChange={setServiceMode}
              className="flex-col sm:flex-row"
              options={[
                { value: 'ASAP', label: 'Lo antes posible', icon: <Clock3 className="size-4" /> },
                { value: 'SCHEDULED', label: 'Programar horario', icon: <CalendarClock className="size-4" /> },
              ]}
            />

            {serviceMode === 'SCHEDULED' && (
              <div className="rounded-card border border-brand-100 bg-brand-50/35 p-4">
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
            </FormStack>
          </FormSection>

          {quote && quote.walletBalance > 0 && (
            <FormSection
              title="Usa tu saldo"
              description="Decide cuánto cubrir con tu saldo antes de elegir el medio de pago."
              icon={Wallet}
              tone="brand"
            >
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
            </FormSection>
          )}

          <FormSection
            id="checkout-contact"
            title="Datos de contacto"
            description="Los tomamos de tu cuenta y solo los usaremos para coordinar este pedido."
            icon={UserRound}
          >
            <FormGrid>
              <Input
                ref={contactNameRef}
                name="contactName"
                label="Nombre"
                value={contactName}
                onChange={(event) => { setContactName(event.target.value); setContactErrors((current) => ({ ...current, name: undefined })); }}
                placeholder="Para quien es el pedido"
                autoComplete="name"
                error={contactErrors.name}
                hint={contactName === profileName ? 'De tu cuenta' : undefined}
              />
              <Input
                ref={contactPhoneRef}
                name="contactPhone"
                label="Teléfono"
                value={contactPhone}
                onChange={(event) => { setContactPhone(event.target.value); setContactErrors((current) => ({ ...current, phone: undefined })); }}
                placeholder="999 888 777"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                error={contactErrors.phone}
                hint={
                  user?.phone && contactPhone === user.phone
                    ? 'De tu cuenta'
                    : 'Si alguien más recibe el pedido, cámbialo aquí'
                }
              />
            </FormGrid>
            <FormGrid className="mt-5">
              <Textarea rows={3} label="Indicaciones para cocina" value={kitchenNotes} onChange={(event) => setKitchenNotes(event.target.value)} placeholder="Salsa aparte, sin cubiertos…" maxLength={250} />
              <Textarea rows={3} label="Indicaciones para reparto" value={deliveryNotes} onChange={(event) => setDeliveryNotes(event.target.value)} placeholder="Tocar el timbre, recepción…" maxLength={250} />
            </FormGrid>
          </FormSection>

          {receipts.mode === 'INTERNAL_ONLY' ? (
            <FormSection
              id="checkout-billing"
              title="Ticket interno"
              description="Recibiras un resumen de tu pedido. No es una boleta ni una factura y no usa serie o correlativo SUNAT."
              icon={ReceiptText}
            >
              <div className="rounded-card border border-brand-200 bg-brand-50 p-4 text-sm leading-6 text-brand-900">
                El ticket se identifica con el numero de pedido y estara disponible para el personal al preparar la entrega.
              </div>
            </FormSection>
          ) : <FormSection
            id="checkout-billing"
            title="Comprobante de pago"
            description="Emitimos boleta por defecto. Elige factura si necesitas sustentar un gasto empresarial."
            icon={ReceiptText}
          >
            <FormStack spacing={2.5}>
            <ChoiceGroup
              ariaLabel="Tipo de comprobante"
              value={documentType}
              onChange={(type) => { setDocumentType(type); setBillingError(null); }}
              className="flex-col sm:flex-row"
              options={[
                { value: 'BOLETA', label: 'Boleta' },
                { value: 'FACTURA', label: 'Factura' },
              ]}
            />
            {documentType === 'FACTURA' && (
              <FormStack>
                <Input
                  ref={rucRef}
                  name="ruc"
                  label="RUC"
                  value={ruc}
                  onChange={(event) => { setRuc(event.target.value.replace(/\D/g, '').slice(0, 11)); setBillingError(null); }}
                  placeholder="20123456789"
                  inputMode="numeric"
                  /* No hay token de autorrelleno para el RUC: dejarlo abierto invitaba al
                     navegador a ofrecer telefonos y codigos postales guardados. */
                  autoComplete="off"
                  error={billingError && !isValidRuc(ruc) ? billingError : undefined}
                />
                <Input
                  ref={razonSocialRef}
                  name="razonSocial"
                  label="Razón social"
                  value={razonSocial}
                  onChange={(event) => { setRazonSocial(event.target.value); setBillingError(null); }}
                  placeholder="Mi Empresa S.A.C."
                  maxLength={200}
                  autoComplete="organization"
                  error={billingError && isValidRuc(ruc) ? billingError : undefined}
                />
                <Input
                  name="fiscalAddress"
                  label="Dirección fiscal (opcional)"
                  value={fiscalAddress}
                  onChange={(event) => setFiscalAddress(event.target.value)}
                  placeholder="Av. Ejemplo 123, Lima"
                  maxLength={200}
                  autoComplete="street-address"
                />
              </FormStack>
            )}
            {documentType === 'BOLETA' && boletaNeedsDni && (
              <div className="grid gap-2 rounded-card border border-line bg-surface-muted/45 p-4">
                <Input
                  ref={boletaDniRef}
                  name="boletaDni"
                  label="DNI"
                  value={boletaDni}
                  onChange={(event) => { setBoletaDni(event.target.value.replace(/\D/g, '').slice(0, 8)); setBillingError(null); }}
                  placeholder="12345678"
                  inputMode="numeric"
                  autoComplete="off"
                  error={billingError ?? undefined}
                />
                <p className="mt-1 text-xs text-ink-muted">
                  A partir de {formatCurrency(invoicing.boletaDniThreshold)}, SUNAT pide identificar la boleta con tu DNI.
                </p>
              </div>
            )}
            </FormStack>
          </FormSection>}

          {/* El selector vivia solo en el aside, o sea al final del scroll en movil,
              mientras la barra fija ya ofrecia confirmar: quien queria pagar en efectivo
              nunca descubria que existia la opcion. */}
          <FormSection
            id="checkout-payment"
            title="¿Cómo quieres pagar?"
            description="Elige el medio con el que completarás la compra."
            icon={CreditCard}
          >
            {quote && quote.grandTotal > 0 ? (
              <FormStack spacing={2}>
                <ChoiceGroup
                  ariaLabel="Método de pago"
                  value={paymentMethod}
                  onChange={setPaymentMethod}
                  className="flex-col sm:flex-row"
                  options={[
                    /* Sin pasarela configurada el backend rechazaria el cobro al
                     * confirmar: no se ofrece un medio que no se puede cumplir. */
                    ...(onlinePayments.onlineEnabled
                      ? [{ value: 'ONLINE' as const, label: 'Tarjeta', icon: <CreditCard className="size-4" /> }]
                      : []),
                    ...(codAvailable
                      ? [{ value: 'CASH' as const, label: 'Efectivo al recibir', icon: <Banknote className="size-4" /> }]
                      : []),
                    ...(localPayments.yapeEnabled
                      ? [{ value: 'YAPE' as const, label: 'Yape', icon: <Smartphone className="size-4" /> }]
                      : []),
                    ...(localPayments.plinEnabled
                      ? [{ value: 'PLIN' as const, label: 'Plin', icon: <Smartphone className="size-4" /> }]
                      : []),
                  ]}
                />
                {payingMobile && (
                  <div className="grid gap-4 rounded-card border border-violet-200 bg-violet-50/60 p-4 sm:grid-cols-[minmax(0,1fr)_140px]">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-violet-700">Paga el importe exacto con {selectedLocal.name}</p>
                      <p className="mt-2 text-2xl font-black text-ink">{formatCurrency(quote.grandTotal)}</p>
                      <p className="mt-2 text-sm font-bold text-ink">{selectedLocal.phone} · {selectedLocal.recipient}</p>
                      <p className="mt-2 text-xs leading-5 text-ink-muted">{localPayments.instructions}</p>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <Input label="Código de operación" value={operationCode} maxLength={24} autoComplete="off" placeholder="Ej. 12345678" onChange={(event) => setOperationCode(event.target.value.replace(/[^A-Za-z0-9-]/g, '').toUpperCase())} />
                        <Input label="Celular desde el que pagaste (opcional)" value={payerPhone} inputMode="numeric" maxLength={9} placeholder="999999999" onChange={(event) => setPayerPhone(event.target.value.replace(/\D/g, '').slice(0, 9))} />
                      </div>
                    </div>
                    {selectedLocal.qr && <img src={selectedLocal.qr} alt={`QR de ${selectedLocal.name}`} className="mx-auto aspect-square w-full max-w-36 rounded-card border border-white bg-white object-contain p-2 shadow-sm" />}
                  </div>
                )}
                <p className="text-xs leading-5 text-ink-muted">
                  {payingMobile
                    ? 'Caja validará el movimiento. Cocina recibirá el pedido únicamente después de esa aprobación.'
                    : payingCash
                    ? `Confirmamos tu pedido de una vez y pagas ${formatCurrency(quote.grandTotal)} en efectivo cuando lo recibas.`
                    : 'Te llevamos a la pasarela para pagar con tarjeta. Nunca guardamos esos datos.'}
                  {!codAvailable && cod.enabled && ` El efectivo solo está disponible hasta ${formatCurrency(cod.maxAmount)}.`}
                </p>
              </FormStack>
            ) : (
              <p className="text-xs leading-5 text-ink-muted">
                {quote
                  ? 'Tu saldo cubre todo el pedido: no hay medio de pago que elegir.'
                  : 'En cuanto tengamos el total te mostramos los medios de pago disponibles.'}
              </p>
            )}
          </FormSection>

          <FormSection
            title="Cupón o promoción"
            description="Si tienes un código, aplícalo aquí. El total se volverá a validar automáticamente."
            icon={Tag}
          >
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <Input
                name="couponCode"
                label="Código de cupón"
                value={couponInput}
                onChange={(event) => setCouponInput(event.target.value.toUpperCase())}
                onKeyDown={(event) => {
                  // Enter aqui aplica el cupon. Sin esto enviaria el formulario, es decir,
                  // confirmaria el pedido desde el campo de un codigo a medio escribir.
                  if (event.key !== 'Enter') return;
                  event.preventDefault();
                  handleApplyCoupon();
                }}
                placeholder="VERDE10"
                autoComplete="off"
              />
              <Button type="button" variant="outline" onClick={handleApplyCoupon} className="shrink-0">
                Aplicar
              </Button>
            </div>

            {appliedCoupon && (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Chip onRemove={handleRemoveCoupon}>
                  <Tag className="size-3.5" />
                  {appliedCoupon}
                </Chip>
                {isQuoting && <span className="text-xs text-ink-muted">Validando…</span>}
              </div>
            )}

            {/* Sin `!isQuoting` esto parpadeaba en falso mientras viajaba la peticion:
                el desglose que se esta mirando es todavia el del cupon anterior. */}
            {appliedCoupon && !isQuoting && quote?.discounts.length === 0 && !quoteError && (
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
          </FormSection>
        </div>

        <aside className="lg:sticky lg:top-24 lg:h-fit" aria-label="Resumen y pago">
          <Card className="overflow-hidden p-0">
            <div className="flex items-start justify-between gap-3 border-b border-line bg-gradient-to-r from-brand-50 to-white p-5">
              <div>
                <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-brand-700">Confirmación</p>
                <CardTitle className="mt-1 text-lg font-black">Resumen de tu pedido</CardTitle>
                <CardDescription className="mt-1 text-xs">Revisa los importes antes de confirmar.</CardDescription>
              </div>
              {isQuoting && <Loader2 className="size-4 animate-spin text-brand-600" />}
            </div>

            <div className="grid gap-5 p-5">
            <ul className="grid gap-3 text-sm">
              {items.map((item) => (
                <li key={item.id} className="flex justify-between gap-4">
                  <span className="min-w-0 text-ink-muted">
                    {item.quantity}x {item.name}
                  </span>
                  <span className="shrink-0">{formatCurrency(item.lineTotal)}</span>
                </li>
              ))}
            </ul>

            {/* Region viva: cada recotizacion cambiaba el importe en silencio. */}
            {quote && (
              <div ref={breakdownRef} className="border-t border-line pt-4" aria-live="polite" aria-busy={isQuoting}>
                <div className="mb-4 rounded-card border border-brand-100 bg-brand-50 p-4 text-xs leading-5 text-brand-800">
                  <p className="flex items-center gap-1.5 font-bold"><CheckCircle2 className="size-4" /> Atiende {quote.branchName}</p>
                  <p className="mt-1 flex items-center gap-1.5"><Clock3 className="size-3.5" /> {deliveryType === 'DELIVERY' ? `Entrega estimada: ${quote.etaMinutes} min` : `Preparación estimada: ${quote.etaMinutes} min`}{quote.routeDistanceKm ? ` · ${quote.routeDistanceKm} km` : ''}</p>
                  {quote.etaSource === 'LIVE_ROUTE' && <p className="mt-1 font-semibold text-brand-700">Ruta actualizada con la ubicación exacta.</p>}
                  {quote.demandLevel !== 'LOW' && <p className="mt-1 font-semibold text-amber-800">{quote.demandLevel === 'HIGH' ? 'Demanda alta: el tiempo ya incluye la espera actual.' : 'Demanda moderada en esta cocina.'}</p>}
                </div>
                <PriceBreakdown
                  lines={summaryLines}
                  totalLabel={totalLabel}
                  totalValue={formatCurrency(quote.grandTotal)}
                  note={quote.taxTotal > 0 ? (
                    <div className="flex justify-between">
                      <span>Incluye IGV ({Math.round(quote.taxRate * 100)}%)</span>
                      <span>{formatCurrency(quote.taxTotal)}</span>
                    </div>
                  ) : undefined}
                />
              </div>
            )}

            {/* El fallo se resuelve aqui mismo. Antes solo informaba, y como el cupon se
                persiste en localStorage ni recargar sacaba a quien aplicaba uno malo. */}
            {quoteError && (
              <div className="grid gap-2.5 rounded-card border border-red-100 bg-red-50 p-3 text-xs leading-5 text-red-700" role="alert">
                <p className="flex items-start gap-2">
                  <AlertCircle className="mt-0.5 size-4 shrink-0" />
                  <span>
                    {quoteError}
                    {quote && ' Mientras tanto ves los importes de la última cotización válida.'}
                  </span>
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    leftIcon={<RefreshCw className="size-3.5" />}
                    isLoading={isQuoting}
                    onClick={retryQuote}
                  >
                    Reintentar
                  </Button>
                  {appliedCoupon && (
                    <Button type="button" size="sm" variant="ghost" onClick={handleRemoveCoupon}>
                      Quitar cupón y recalcular
                    </Button>
                  )}
                </div>
              </div>
            )}

            {quote && !quote.meetsMinimum && (
              <Callout tone="warning" size="sm" icon={AlertCircle}>
                Agrega {formatCurrency(Math.max(0, quote.minimumOrder - quote.subtotal))} para alcanzar el pedido mínimo de {formatCurrency(quote.minimumOrder)}.
              </Callout>
            )}

            {missingDestination && (
              <p className="rounded-card border border-line bg-surface-muted p-3 text-xs leading-5 text-ink-muted">
                {deliveryType === 'DELIVERY'
                  ? 'Elige tu direccion para continuar.'
                  : 'Elige el local donde vas a recoger.'}
              </p>
            )}

            {/* Recordatorio, no un segundo control: el selector vive en `checkout-payment`
                y desde lg ambas columnas se ven a la vez. Dos grupos identicos para el
                mismo estado se leen como dos decisiones distintas. */}
            {quote && quote.grandTotal > 0 && (
              <div className="flex items-center justify-between gap-3 border-t border-line pt-4 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  {payingCash ? <Banknote className="size-4 shrink-0 text-brand-700" /> : <CreditCard className="size-4 shrink-0 text-brand-700" />}
                  <span className="min-w-0 truncate font-medium text-ink">{paymentLabel}</span>
                </span>
                <Button type="button" size="sm" variant="ghost" onClick={() => scrollToSection('checkout-payment')}>
                  Cambiar
                </Button>
              </div>
            )}

            {/* Nunca deshabilitado: si algo bloquea, el boton hace lo que hay que hacer. */}
            <Button
              type="submit"
              className="w-full"
              size="lg"
              leftIcon={blockAction ? blockAction.icon : payIcon}
              isLoading={isPaying || isFirstQuote}
            >
              {blockAction ? blockAction.label : payLabel}
            </Button>

            <CardDescription className="text-center text-xs leading-5">
              {quote?.grandTotal === 0
                ? 'Tu saldo cubre todo el pedido: no se cobrara nada a tu tarjeta.'
                : payingCash
                  ? 'Confirmamos tu pedido de una vez y pagas en efectivo cuando lo recibas.'
                  : 'El pago se procesa fuera de esta web. Nunca guardamos datos de tu tarjeta.'}
            </CardDescription>

            <TrustBadges className="border-t border-line pt-4" />
            </div>
          </Card>
        </aside>
      </form>

      {/* "Calculando…" solo mientras hay una peticion en vuelo sin nada que ensenar.
          Antes salia siempre que `quote` fuera null, incluido el caso en que la
          cotizacion ni arrancaba por falta de destino: eterno y con el boton muerto. */}
      <StickyActionBar
        hideFrom="lg"
        label={blockAction ? 'Para continuar' : summarySeen ? 'Total confirmado' : 'Total del pedido'}
        value={
          blockAction
            ? blockAction.value
            : isFirstQuote
              ? 'Calculando…'
              : quote
                ? formatCurrency(quote.grandTotal)
                : '—'
        }
      >
        <Button
          type="button"
          size="lg"
          leftIcon={blockAction ? undefined : summarySeen ? payIcon : <ReceiptText className="size-4" />}
          isLoading={isPaying || isFirstQuote}
          onClick={confirmOrReveal}
        >
          {blockAction ? blockAction.label : summarySeen ? payLabelCompact : 'Revisar y pagar'}
        </Button>
      </StickyActionBar>
    </main>
  );
};

export default CheckoutPage;
