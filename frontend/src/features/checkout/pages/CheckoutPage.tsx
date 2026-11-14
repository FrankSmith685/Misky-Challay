import { allergenLabel } from '@lib/allergens';
import axios from 'axios';
import { beginCheckoutAttempt, readCheckoutAttempt, forgetCheckoutAttempt, type CheckoutAttempt } from '../checkoutAttempt';
import { useLiveRefresh } from '@services/realtime';
import { useCheckoutTerms } from '@services/checkoutTerms';
import { ExperienceCheckout } from '@features/experiences/ExperienceCheckout';
import { describeCakeVisualDesign } from '@features/cakes/utils/cakeVisualDesign';
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
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
import { PageLoader } from '@components/common/PageLoader';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Textarea } from '@components/ui/Textarea';
import { DeliverySlotCalendar } from '@features/geo/components/DeliverySlotCalendar';
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
import { consumePurchasedItems, updateItemQuantity } from '@features/cart/cartSlice';
import { useAppState } from '@context/AppStateContext';
import { getApiErrorMessage } from '@services/api/client';
import { formatCurrency } from '@lib/format';
import { cn } from '@lib/cn';
import { whatsappNumber } from '@lib/whatsapp';
import { isValidDni, isValidRuc } from '@lib/peruDocs';
import { ROUTES } from '@constants/routes';
import { geoApi } from '@features/geo/services/geo.service';
import { getDeliveryReferenceError } from '@features/geo/utils/deliveryAddress';
import type { Address, DeliverySlot } from '@features/geo/types';
import { accountApi } from '@features/account/services/account.service';
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
import { CheckoutDestinationPicker } from '../components/CheckoutDestinationPicker';
import { CheckoutMinimumDialog } from '../components/CheckoutMinimumDialog';
import { usePendingOrder } from '../usePendingOrder';
import type { CheckoutInput, OrderQuote } from '../types';

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
type BlockReason = 'falta_experiencia' | 'falta_direccion' | 'falta_local' | 'referencia_invalida' | 'falta_horario' | 'bajo_minimo' | 'error_cotizacion' | 'falta_pago';

interface BlockAction {
  /** Lo que se lee en la barra fija en lugar del importe. */
  value: string;
  /** Etiqueta corta del boton: la barra fija mide 360 px en el peor caso. */
  label: string;
  /** Acción explícita en el resumen lateral, donde hay más espacio. */
  desktopLabel?: string;
  icon: ReactNode;
  run: () => void;
}

interface QuoteState {
  inputKey: string;
  value: OrderQuote | null;
  error: string | null;
  loading: boolean;
}

/**
 * Checkout (M08).
 * El total NO se calcula aqui: cada cambio se recotiza en el backend (RN-007).
 * Al pagar, el pedido nace PENDING_PAYMENT y solo el webhook lo confirma (RN-014).
 */
const CheckoutPage = () => {
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const dispatch = useAppDispatch();
  const { items } = useAppSelector((state) => state.cart);
  const user = useAppSelector((state) => state.auth.user);
  const { terms, error: termsLoadError, refresh: refreshTerms } = useCheckoutTerms();
  const [consent, setConsent] = useState<{ version: number; userId: number | null } | null>(null);
  const [termsIssue, setTermsIssue] = useState('');
  const termsAccepted = Boolean(terms && consent?.version === terms.version && consent?.userId === (user?.id ?? null));
  useEffect(() => { setConsent(null); setTermsIssue(''); }, [user?.id]);
  const {
    address,
    branchId,
    pickupBranch,
    deliveryType,
    setDeliveryType,
    selectDelivery,
    selectPickup,
    setAddress,
    setBranch,
    openLocationModal,
  } = useAppState();
  const invoicing = useInvoicingSettings();
  const localPayments = useLocalPaymentSettings();
  const cod = useCodSettings();
  const onlinePayments = useOnlinePaymentSettings();
  const receipts = useReceiptSettings();
  const { pending, isChecking: isCheckingPending, dismiss: dismissPending, recoveryError, retryRecovery } = usePendingOrder();

  const [experience, setExperience] = useState<CheckoutInput['experience']>();
  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [useWallet, setUseWallet] = useState(true);
  const [paymentMethod, setPaymentMethod] = useState<'ONLINE' | 'YAPE' | 'PLIN' | 'CASH'>('ONLINE');
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
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsReason, setSlotsReason] = useState('');
  const [slotsError, setSlotsError] = useState(false);
  const [slotsRetry, setSlotsRetry] = useState(0);
  const [serverSchedule, setServerSchedule] = useState<{ key: string; requiresScheduledDelivery: boolean; minimumLeadHours: number; isOpenNow: boolean; deliveryVehicleType?: 'CAR' | null } | null>(null);
  // No trasladar las restricciones de otra dirección, sede o producto al pedido actual.
  const scheduleKey = JSON.stringify({
    items: items.map((item) => [item.productId, item.theme?.id, item.designQuoteId]),
    experience: experience?.packageId, deliveryType, branchId, latitude: address?.latitude, longitude: address?.longitude,
  });
  const currentSchedule = serverSchedule?.key === scheduleKey ? serverSchedule : null;
  const branchClosed = currentSchedule?.isOpenNow === false;
  const preferredCakeSlotId = items.find((item) => item.preferredSlotId)?.preferredSlotId;
  const hasCake = Boolean(experience) || Boolean(currentSchedule?.requiresScheduledDelivery) || items.some((item) => item.requiresScheduledDelivery || item.preferredSlotId || item.designQuoteId);
  const needsCar = currentSchedule?.deliveryVehicleType === 'CAR' || items.some((item) => item.requiresCarDelivery);
  const minimumLeadHours = Math.max(currentSchedule?.minimumLeadHours ?? 0, ...items.map((item) => item.minLeadHours ?? 0));

  useEffect(() => {
    if (hasCake || branchClosed) {
      setServiceMode('SCHEDULED');
      if (preferredCakeSlotId) setSlotId(preferredCakeSlotId);
    }
  }, [hasCake, branchClosed, preferredCakeSlotId]);
  /*
   * El contacto sale del perfil, no en blanco: quien acaba de registrarse ya dio
   * su nombre y su telefono, y volver a pedirselos aqui parece que la cuenta no
   * hubiera servido de nada. Sigue siendo editable —se pide para ESTE pedido, no
   * para la cuenta—, asi que cambiarlo aqui no toca su perfil.
   */
  const profileName = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  const accountWhatsAppAvailable = Boolean(whatsappNumber(user?.phone));
  const [contactName, setContactName] = useState(profileName);
  const [contactPhone, setContactPhone] = useState(user?.phone ?? '');
  const [isGift, setIsGift] = useState(false);
  const [gift, setGift] = useState({ recipientName: '', recipientPhone: '', hidePrices: true, message: '' });
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const [kitchenNotes, setKitchenNotes] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');
  const [savedAddresses, setSavedAddresses] = useState<Address[]>([]);
  const deliveryReferenceError = deliveryType === 'DELIVERY' && address ? getDeliveryReferenceError(address) : undefined;

  const [quoteState, setQuoteState] = useState<QuoteState | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const isRedirecting = useRef(false);
  const [minimumDialog, setMinimumDialog] = useState<{ minimumOrder: number } | null>(null);
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
  const lastValidQuoteRef = useRef<{ inputKey: string; value: OrderQuote } | null>(null);
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
        experience?: CheckoutInput['experience'];
      } | null;
      if (!draft) return;
      setCouponInput(draft.couponInput ?? '');
      setAppliedCoupon(draft.appliedCoupon ?? null);
      setUseWallet(draft.useWallet ?? true);
      setServiceMode(hasCake || draft.serviceMode === 'SCHEDULED' ? 'SCHEDULED' : 'ASAP');
      setSlotId(preferredCakeSlotId ?? draft.slotId ?? null);
      setContactName(draft.contactName || profileName);
      setContactPhone(draft.contactPhone || (user?.phone ?? ''));
      setKitchenNotes(draft.kitchenNotes ?? '');
      setDeliveryNotes(draft.deliveryNotes ?? '');
      setExperience(draft.experience);
      setPaymentMethod(draft.paymentMethod === 'YAPE' || draft.paymentMethod === 'PLIN' || draft.paymentMethod === 'CASH' ? draft.paymentMethod : 'ONLINE');
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
        paymentMethod, experience,
      }));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [couponInput, appliedCoupon, useWallet, serviceMode, slotId, contactName, contactPhone, kitchenNotes, deliveryNotes, paymentMethod, experience]);

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
    if (saved.latitude == null || saved.longitude == null) {
      toast.error('Esta dirección no tiene un punto exacto. Búscala de nuevo o márcala en el mapa para calcular el delivery.');
      return;
    }
    try {
      const coverage = await geoApi.checkCoverage({
        districtId: saved.districtId ?? undefined,
        latitude: Number(saved.latitude),
        longitude: Number(saved.longitude),
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

  const [purchaseAttempt, setPurchaseAttempt] = useState(() => readCheckoutAttempt(user?.id));

  /**
   * Entrada de la COTIZACION: solo lo que puede cambiar el precio.
   * El contacto y las notas se anaden al confirmar (`buildPlaceInput`). Tenerlos aqui
   * disparaba un POST /checkout/quote por cada tecla escrita, y cada quote recotiza
   * items, cupones, cobertura y saldo.
   */
  const addressLabel = address?.label;
  const addressLine1 = address?.line1;
  const addressDistrictId = address?.districtId;
  const addressLatitude = address?.latitude;
  const addressLongitude = address?.longitude;
  const quoteAddress = useMemo(() => addressLine1 ? {
    label: addressLabel,
    line1: addressLine1,
    districtId: addressDistrictId,
    latitude: addressLatitude,
    longitude: addressLongitude,
  } : null, [addressLabel, addressLine1, addressDistrictId, addressLatitude, addressLongitude]);

  const quoteInput = useMemo<CheckoutInput | null>(() => {
    if (items.length === 0) return null;

    const base: CheckoutInput = {
      items: items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        requestedServings: item.requestedServings,
        quantity: item.quantity,
        designQuoteId: item.designQuoteId,
        themeId: item.theme?.id,
        themeVersion: item.theme?.version,
        specialInstructions: [item.specialInstructions, describeCakeVisualDesign(item.cakeVisualDesign, Boolean(item.referenceDataUrl))].filter(Boolean).join('\n') || undefined,
        selections: item.selections.map((selection) => ({
          optionId: selection.optionId,
          quantity: selection.quantity,
        })),
      })),
      experience,
      deliveryType,
      serviceMode: hasCake ? 'SCHEDULED' : serviceMode,
      deliverySlotId: hasCake || serviceMode === 'SCHEDULED' ? (slotId ?? undefined) : undefined,
      couponCode: appliedCoupon ?? undefined,
      useWallet,
    };

    if (deliveryType === 'DELIVERY') {
      if (!quoteAddress || !branchId) return null;
      base.address = quoteAddress;
    } else {
      if (!branchId || pickupBranch?.id !== branchId) return null;
      base.branchId = branchId;
    }

    return base;
  }, [items, hasCake, deliveryType, serviceMode, slotId, quoteAddress, branchId, pickupBranch, appliedCoupon, useWallet, experience]);

  // Los precios pertenecen a una entrada concreta: nunca se reutiliza la tarifa
  // de otra dirección, modalidad o cantidad mientras llega la nueva respuesta.
  const quoteInputKey = quoteInput ? JSON.stringify(quoteInput) : '';
  const currentQuoteState = quoteState?.inputKey === quoteInputKey ? quoteState : null;
  const quote = currentQuoteState?.value ?? null;
  const quoteError = currentQuoteState?.error ?? null;
  const isQuoting = Boolean(quoteInput && (!currentQuoteState || currentQuoteState.loading));
  const schedulePending = ((hasCake || branchClosed || serviceMode === 'SCHEDULED') && !slotId) || Boolean(quote?.schedulePending);

  /** Carga util del pedido: la cotizacion mas los datos que no afectan al precio. */
  const buildPlaceInput = (): CheckoutInput | null => {
    if (!quoteInput || deliveryReferenceError || schedulePending || (experience && experience.brief.trim().length < 10)) return null;
    const notes = [
      kitchenNotes.trim() ? `COCINA: ${kitchenNotes.trim()}` : '',
      deliveryType === 'DELIVERY' && deliveryNotes.trim() ? `REPARTO: ${deliveryNotes.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return {
      ...quoteInput,
      ...(quoteInput.address && address ? {
        address: { ...quoteInput.address, reference: address.reference?.trim() || undefined, hasHouseNumber: address.hasHouseNumber },
      } : {}),
      items: quoteInput.items.map((entry, index) => ({ ...entry, referenceDataUrl: items[index]?.referenceDataUrl, aiProposalDataUrl: items[index]?.cakeAiProposal?.dataUrl ?? items[index]?.archivedAiProposalDataUrl, designDetails: items[index]?.designDetails })),
      contactName: contactName || undefined,
      contactPhone: contactPhone || undefined,
      whatsappOptIn,
      gift: isGift ? gift : undefined,
      termsAccepted,
      termsVersion: terms?.version,
      notes: notes || undefined,
      paymentMethod,
      billing:
        receipts.mode === 'INTERNAL_ONLY'
          ? undefined
          : documentType === 'FACTURA'
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

  const availabilityKey = quoteInput ? JSON.stringify({ ...quoteInput, deliverySlotId: undefined, serviceMode: 'ASAP', couponCode: undefined, useWallet: false }) : '';
  useLiveRefresh(['availability', 'coverage', 'production', 'inventory', 'delivery', 'catalog'], () => setSlotsRetry((value) => value + 1), { enabled: serviceMode === 'SCHEDULED' });

  /** Franjas de la sucursal, para los pedidos programados (RN-004). */
  useEffect(() => {
    setSlots([]);
    setSlotsError(false);
    if (!branchId || serviceMode !== 'SCHEDULED' || !availabilityKey) { setSlotsLoading(false); setSlotId(null); return; }
    let active = true;
    setSlotsLoading(true);

    checkoutApi
      .availability(JSON.parse(availabilityKey) as CheckoutInput)
      .then((response) => {
        const available = response.slots;
        if (!active) return;
        const valid = available.filter((slot) => slot.available > 0 && new Date(slot.startsAt).getTime() >= Date.now() + minimumLeadHours * 3_600_000);
        setSlots(valid);
        setSlotsReason(response.reasons.map((reason) => reason.message).join(' '));
        setSlotsLoading(false);
        setSlotId((current) => valid.some((slot) => slot.id === current) ? current : valid.some((slot) => slot.id === preferredCakeSlotId) ? preferredCakeSlotId ?? null : null);
      })
      .catch(() => { if (active) { setSlots([]); setSlotsLoading(false); setSlotsError(true); setSlotId(null); } });
    return () => { active = false; };
  }, [branchId, serviceMode, preferredCakeSlotId, minimumLeadHours, slotsRetry, availabilityKey]);

  useEffect(() => {
    if (lastValidQuoteRef.current?.inputKey !== quoteInputKey) {
      lastValidQuoteRef.current = null;
    }
    if (!quoteInput) { setQuoteState(null); return; }

    let cancelled = false;
    setQuoteState({ inputKey: quoteInputKey, value: lastValidQuoteRef.current?.value ?? null, error: null, loading: true });

    checkoutApi
      .quote(quoteInput)
      .then((result) => {
        if (cancelled) return;
        setServerSchedule({ key: scheduleKey, requiresScheduledDelivery: Boolean(result.requiresScheduledDelivery), minimumLeadHours: result.minimumLeadHours ?? 0, isOpenNow: result.isOpenNow, deliveryVehicleType: result.deliveryVehicleType });
        lastValidQuoteRef.current = { inputKey: quoteInputKey, value: result };
        setQuoteState({ inputKey: quoteInputKey, value: result, error: null, loading: false });
      })
      .catch((error) => {
        if (cancelled) return;
        // El fallo se degrada a banner: se mantiene el ultimo desglose bueno para que
        // el cliente conserve importes, ETA y medio de pago mientras reintenta.
        setQuoteState({ inputKey: quoteInputKey, value: lastValidQuoteRef.current?.value ?? null, error: getApiErrorMessage(error), loading: false });
      });

    return () => {
      cancelled = true;
    };
  }, [quoteInput, quoteInputKey, quoteNonce, scheduleKey]);

  // El comprobante se emite por el valor total de la venta (el saldo es un medio de
  // pago, no un descuento): esto es lo que compara SUNAT contra el umbral.
  const invoiceTotal = quote ? quote.grandTotal + quote.walletAmount : 0;
  // La boleta pide DNI a partir del umbral SUNAT (el backend lo revalida).
  const boletaNeedsDni =
    receipts.mode !== 'INTERNAL_ONLY' && documentType === 'BOLETA' && invoiceTotal >= invoicing.boletaDniThreshold;

  const onlineLabel = onlinePayments.onlineProvider === 'mercadopago' ? 'Mercado Pago' : 'Pago en línea';
  const depositPlan = quote?.paymentPlan === 'DEPOSIT_BALANCE';
  const codAvailable = cod.enabled && deliveryType === 'DELIVERY' && !depositPlan && !!quote && quote.grandTotal <= cod.maxAmount;
  const paymentMethodAvailable = paymentMethod === 'ONLINE' ? onlinePayments.onlineEnabled
    : paymentMethod === 'YAPE' ? localPayments.yapeEnabled
    : paymentMethod === 'PLIN' ? localPayments.plinEnabled : codAvailable;
  /*
   * Si el medio elegido deja de estar disponible se cae al primero que si lo
   * este. Antes se caia siempre a tarjeta, que sin pasarela configurada no se
   * ofrece: el cliente quedaba con un medio invisible seleccionado.
   */
  useEffect(() => {
    if (!quote || isQuoting) return;
    const available: Array<'ONLINE' | 'YAPE' | 'PLIN' | 'CASH'> = [
          ...(onlinePayments.onlineEnabled ? (['ONLINE'] as const) : []),
          ...(localPayments.yapeEnabled ? (['YAPE'] as const) : []),
          ...(localPayments.plinEnabled ? (['PLIN'] as const) : []),
          ...(codAvailable ? (['CASH'] as const) : []),
        ];
    if (available.length > 0 && !available.includes(paymentMethod)) {
      setPaymentMethod(available[0]);
    }
  }, [
    localPayments.plinEnabled,
    localPayments.yapeEnabled,
    codAvailable,
    onlinePayments.onlineEnabled,
    paymentMethod,
    depositPlan,
    quote,
    isQuoting,
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
    if (isCheckingPending || isPaying || isRedirecting.current) return <PageLoader />;
    if (!pending) return <Navigate to={ROUTES.cart} replace />;
    /*
     * Es la pantalla a la que vuelve quien pulsa "atras" en la pasarela: el pedido
     * ya se creo y el carrito se vacio al crearlo. Sin el aviso, esto se leia como
     * "he perdido mi compra" cuando en realidad el pedido sigue vivo esperando pago.
     */
    return (
      <div className="mx-auto max-w-3xl px-4 py-16">
        <PendingOrderBanner pending={pending} onResolved={dismissPending} recoveryError={recoveryError} onRetry={retryRecovery} />
        <div className="grid justify-items-center gap-4 text-center">
          <p className="text-ink-muted">
            No hay nada más que pagar aquí: tus productos están en el pedido de arriba.
          </p>
          <Button variant="outline" onClick={() => navigate(ROUTES.menu)}>
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
    retryQuote();
  };

  const handlePay = async () => {
    if (purchaseAttempt) { await submitPurchase(purchaseAttempt); return; }
    if (!user) {
      toast('Inicia sesión para confirmar y pagar. Conservaremos tu carrito y dirección.');
      navigate(ROUTES.login, { state: { from: `${routeLocation.pathname}${routeLocation.search}` } });
      return;
    }
    if (!terms || termsLoadError || !termsAccepted) {
      setTermsIssue(termsLoadError ? 'No pudimos cargar las condiciones. Reintenta para continuar.' : 'Acepta los términos y condiciones antes de confirmar el pedido.');
      document.getElementById('checkout-terms')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      document.getElementById('checkout-terms-checkbox')?.focus({ preventScroll: true });
      return;
    }
    const placeInput = buildPlaceInput();
    if (isPaying || isQuoting || quoteError || !placeInput || !quote?.meetsMinimum || (quote.grandTotal > 0 && !paymentMethodAvailable)) return;

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

    try {
      const attempt = beginCheckoutAttempt(user.id, placeInput, items);
      setPurchaseAttempt(attempt);
      await submitPurchase(attempt);
    } catch (error) { toast.error(getApiErrorMessage(error)); }
  };

  async function submitPurchase(attempt: CheckoutAttempt) {
    if (isPaying || attempt.userId !== user?.id) return;
    setIsPaying(true);
    try {
      const order = await checkoutApi.place(attempt.input, attempt.key);
      isRedirecting.current = true;
      dispatch(consumePurchasedItems(attempt.items));
      forgetCheckoutAttempt(); setPurchaseAttempt(null);
      localStorage.removeItem(DRAFT_STORAGE);
      if (order.status === 'PENDING_PAYMENT') rememberPendingOrder(order.orderNumber);
      if (order.checkoutUrl && order.status === 'PENDING_PAYMENT') window.location.assign(order.checkoutUrl);
      else navigate(`${ROUTES.checkoutSuccess}?pedido=${order.orderNumber}`);
    } catch (error) {
      isRedirecting.current = false;
      // A transport error or a 5xx can arrive after COMMIT: keep the frozen purchase.
      const status = axios.isAxiosError(error) ? error.response?.status : undefined;
      const code = axios.isAxiosError(error) ? error.response?.data?.code : undefined;
      if (status && status >= 400 && status < 500 && ![408, 409, 429].includes(status) || code === 'TERMS_CHANGED') {
        forgetCheckoutAttempt(); setPurchaseAttempt(null);
      }
      void refreshTerms();
      toast.error(getApiErrorMessage(error));
    } finally { setIsPaying(false); }
  }

  const missingDestination =
    (deliveryType === 'DELIVERY' && (!address || !branchId))
    || (deliveryType === 'PICKUP' && (!branchId || pickupBranch?.id !== branchId));
  const payingMobile = paymentMethod === 'YAPE' || paymentMethod === 'PLIN';
  const payingCash = paymentMethod === 'CASH';
  const selectedLocal = paymentMethod === 'YAPE'
    ? { name: 'Yape', phone: localPayments.yapePhone, recipient: localPayments.yapeRecipient, qr: localPayments.yapeQrImageUrl }
    : { name: 'Plin', phone: localPayments.plinPhone, recipient: localPayments.plinRecipient, qr: localPayments.plinQrImageUrl };

  const itemCount = items.reduce((total, item) => total + item.quantity, 0);
  const missingForMinimum = quote ? Math.max(0, quote.minimumOrder - (quote.productSubtotal ?? quote.subtotal)) : 0;
  /** Primera cotizacion en vuelo: todavia no hay ningun importe que ensenar. */
  const isFirstQuote = isQuoting && !quote;
  const updateCheckoutQuantity = (id: string, quantity: number) => {
    const item = items.find((entry) => entry.id === id);
    if (!item || item.designQuoteId || !Number.isInteger(quantity) || quantity < 1 || quantity > 20 || quantity === item.quantity || isPaying || isQuoting) return;
    // La cantidad cambió: el importe anterior deja de servir para confirmar.
    setQuoteState(null);
    setSummarySeen(false);
    dispatch(updateItemQuantity({ id, quantity }));
  };

  const blockReason: BlockReason | null = missingDestination
    ? deliveryType === 'DELIVERY'
      ? 'falta_direccion'
      : 'falta_local'
    : deliveryReferenceError
      ? 'referencia_invalida'
    : quoteError
      ? 'error_cotizacion'
    : schedulePending
      ? 'falta_horario'
      : !quote
        ? isFirstQuote
          ? null
          : 'error_cotizacion'
        : !quote.meetsMinimum
          ? 'bajo_minimo'
          : experience && experience.brief.trim().length < 10 ? 'falta_experiencia' : quote.grandTotal > 0 && !paymentMethodAvailable ? 'falta_pago' : null;

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
          label: 'Dirección',
          desktopLabel: 'Ir a dirección',
          icon: <MapPin className="size-4" />,
          run: () => scrollToSection('checkout-destination'),
        },
        falta_local: {
          value: 'Falta elegir local',
          label: 'Local',
          desktopLabel: 'Ir a locales',
          icon: <Store className="size-4" />,
          run: () => scrollToSection('checkout-destination'),
        },
        falta_horario: {
          value: 'Falta elegir horario',
          label: 'Elegir',
          desktopLabel: 'Elegir horario',
          icon: <CalendarClock className="size-4" />,
          run: () => scrollToSection('checkout-schedule'),
        },
        referencia_invalida: {
          value: 'Revisa la referencia',
          label: 'Referencia',
          desktopLabel: 'Revisar referencia',
          icon: <MapPin className="size-4" />,
          run: () => {
            scrollToSection('checkout-destination');
            document.getElementById('checkout-address-reference')?.focus({ preventScroll: true });
          },
        },
        bajo_minimo: {
          value: `Te faltan ${formatCurrency(missingForMinimum)}`,
          label: 'Completar mínimo',
          desktopLabel: 'Completar pedido mínimo',
          icon: <Utensils className="size-4" />,
          run: () => { if (quote) setMinimumDialog({ minimumOrder: quote.minimumOrder }); },
        },
        error_cotizacion: {
          value: 'No pudimos calcular',
          label: 'Reintentar',
          icon: <RefreshCw className="size-4" />,
          run: retryQuote,
        },
        falta_experiencia: { value: 'Describe tu idea para el QR', label: 'Completar idea', icon: <Tag className="size-4" />, run: () => scrollToSection('checkout-experience') },
        falta_pago: {
          value: 'Elige cómo pagar',
          label: 'Elegir pago',
          icon: <CreditCard className="size-4" />,
          run: () => scrollToSection('checkout-payment'),
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
          ? `Confirmar pedido · pagar ${quote ? formatCurrency(quote.grandTotal) : ''} al recibir`
      : payingMobile
          ? `Continuar con ${selectedLocal.name}`
          : `${depositPlan ? 'Pagar anticipo' : 'Pagar'} ${quote ? formatCurrency(depositPlan ? quote.depositAmount ?? 0 : quote.grandTotal) : ''}`;
  const payLabelCompact =
    quote?.grandTotal === 0 ? 'Pagar con saldo' : payingCash ? 'Confirmar · pagar al recibir' : payingMobile ? `Continuar con ${selectedLocal.name}` : depositPlan ? 'Pagar anticipo' : 'Pagar en línea';
  const payIcon =
    quote?.grandTotal === 0 ? (
      <Wallet className="size-4" />
    ) : payingMobile ? (
      <Smartphone className="size-4" />
    ) : payingCash ? (
      <Banknote className="size-4" />
    ) : (
      <CreditCard className="size-4" />
    );
  const totalLabel =
    schedulePending ? 'Total estimado' : quote?.grandTotal === 0 ? 'Total' : depositPlan ? 'Total del pedido' : payingCash ? 'A pagar al recibir' : payingMobile ? `A pagar con ${selectedLocal.name}` : 'A pagar en línea';
  const paymentLabel = quote?.grandTotal === 0 ? 'Con mi saldo' : payingCash ? 'Efectivo al recibir' : payingMobile ? selectedLocal.name : onlineLabel;
  const cakeDeliveryFee = quote?.cakeDeliveryFee ?? 0;
  const baseDeliveryFee = quote ? Math.max(0, quote.deliveryFee - cakeDeliveryFee) : 0;
  const destinationSummary = deliveryType === 'PICKUP'
    ? pickupBranch
      ? `${pickupBranch.name} · ${pickupBranch.addressLine}`
      : 'Local de recojo pendiente'
    : address
      ? [address.label, address.line1].filter(Boolean).join(' · ')
      : 'Dirección de entrega pendiente';

  const summaryLines: SummaryLine[] = quote
    ? [
        { label: 'Productos', value: formatCurrency(quote.productSubtotal ?? quote.subtotal) },
        ...(quote.experience ? [{ label: quote.experience.name, value: formatCurrency(quote.experience.price) }] : []),
        { label: deliveryType === 'DELIVERY' ? (quote.deliveryVehicleType === 'CAR' ? 'Entrega en auto' : 'Delivery') : 'Recojo en taller', value: baseDeliveryFee === 0 ? (deliveryType === 'PICKUP' ? 'Sin costo' : 'Gratis') : formatCurrency(baseDeliveryFee) },
        ...(cakeDeliveryFee > 0 ? [{ label: 'Manejo especial de torta', value: formatCurrency(cakeDeliveryFee) }] : []),
        ...(quote.discountTotal > 0
          ? [{ label: 'Descuentos', value: `-${formatCurrency(quote.discountTotal)}`, tone: 'positive' as const }]
          : []),
        ...(quote.walletAmount > 0
          ? [{ label: 'Saldo aplicado', value: `-${formatCurrency(quote.walletAmount)}`, tone: 'positive' as const }]
          : []),
        ...(quote.paymentPlan === 'DEPOSIT_BALANCE'
          ? [
              { label: 'Anticipo (50%)', value: formatCurrency(quote.depositAmount ?? 0) },
              { label: 'Saldo antes de entrega', value: formatCurrency(quote.balanceAmount ?? 0) },
            ]
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
    if (isPaying || isQuoting) return;
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
    <main className="mx-auto max-w-8xl px-4 pb-32 pt-8 sm:pt-10 lg:pb-14">
      <PageHeader
        eyebrow="Pago seguro"
        title="Finaliza tu pedido"
        description="Confirma cómo lo recibirás, completa tus datos y revisa el total antes de pagar."
        icon={CreditCard}
        crumbs={[{ label: 'Inicio', to: '/' }, { label: 'Carrito', to: ROUTES.cart }, { label: 'Datos y pago' }]}
      />
      <CheckoutStepper current={1} className="mb-8 max-w-2xl" />
      <PendingOrderBanner pending={pending} onResolved={dismissPending} recoveryError={recoveryError} onRetry={retryRecovery} />
      {purchaseAttempt && <div role="alert" className="mb-5 rounded-card border border-amber-300 bg-amber-50 p-4"><p>La confirmación anterior quedó pendiente de respuesta. Recupera esa misma compra antes de iniciar otra. Los cambios posteriores de tu carrito se conservarán.</p><Button className="mt-3" isLoading={isPaying} onClick={() => void submitPurchase(purchaseAttempt)}>Recuperar compra anterior</Button></div>}

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
                      note={schedulePending ? 'Elige fecha y horario para confirmar disponibilidad.' : undefined}
                    />
                    <div className="mt-4 rounded-card border border-line bg-surface-muted/60 p-3 text-xs leading-5">
                      <p className="font-bold text-ink">{deliveryType === 'PICKUP' ? 'Recojo en taller' : 'Dirección de entrega'}</p>
                      <p className="mt-1 break-words text-ink-muted">{destinationSummary}</p>
                      {deliveryType === 'DELIVERY' && address?.reference && <p className="mt-1 break-words text-ink-muted">Referencia: {address.reference}</p>}
                    </div>
                    {serviceMode === 'ASAP' && !hasCake && !branchClosed && <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-muted">
                      <Clock3 className="size-3.5 shrink-0" />
                      {deliveryType === 'DELIVERY'
                        ? `Entrega estimada: ${quote.etaMinutes} min`
                        : `Preparación estimada: ${quote.etaMinutes} min`}
                    </p>}
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
            id="checkout-destination"
            title="¿Cómo quieres recibirlo?"
            description="Elige delivery o recojo. Te mostramos el costo de envío antes de pagar."
            icon={MapPin}
          >
            <FormStack spacing={2.5}>
            <ChoiceGroup
              ariaLabel="Cómo quieres recibirlo"
              value={deliveryType}
              onChange={setDeliveryType}
              className="flex-col sm:flex-row"
              options={[
                { value: 'DELIVERY', label: needsCar ? 'Entrega en auto' : 'Delivery', icon: <MapPin className="size-4" /> },
                { value: 'PICKUP', label: 'Recojo en taller', icon: <Store className="size-4" /> },
              ]}
            />

            <CheckoutDestinationPicker
              deliveryLabel={needsCar ? 'Entrega en auto' : 'Delivery'}
              deliveryType={deliveryType}
              address={deliveryType === 'DELIVERY' ? address : null}
              pickupBranch={deliveryType === 'PICKUP' && pickupBranch?.id === branchId ? pickupBranch : null}
              branchId={branchId}
              deliveryFee={quote?.deliveryFee}
              cakeDeliveryFee={quote?.cakeDeliveryFee}
              extraDeliveryFee={quote?.extraDeliveryFee}
              deliveryFeeLoading={isFirstQuote}
              onReferenceChange={(reference) => { if (address) setAddress({ ...address, reference }); }}
              onDelivery={selectDelivery}
              onPickup={selectPickup}
              onCoverageInvalid={() => setBranch(null)}
              onChangeAddress={() => { setAddress(null); setBranch(null); }}
              onChangePickup={() => setBranch(null)}
              onOpenMap={openLocationModal}
            />
            {needsCar && deliveryType === 'DELIVERY' && <div role="note" className="rounded-field border border-brand-100 bg-brand-50 p-4 text-sm leading-6"><strong className="block text-brand-800">Tu torta viaja en auto</strong><p className="mt-1 text-ink-muted">Coordinamos su traslado con embalaje y cuidados adecuados. El costo y los horarios disponibles se confirman con tu dirección. Si no hay cupo, puedes elegir otra fecha o recojo en taller.</p></div>}
            {deliveryType === 'DELIVERY' && savedAddresses.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <span className="w-full text-xs font-semibold text-ink-muted">Tus direcciones guardadas</span>
                {savedAddresses.map((saved) => (
                  <button
                    key={saved.id}
                    type="button"
                    onClick={() => void chooseSavedAddress(saved)}
                    className={cn('rounded-field border px-3 py-1.5 text-xs font-semibold', address?.id === saved.id ? 'border-brand-600 bg-brand-50 text-brand-700' : 'border-line bg-white text-ink-muted')}
                  >
                    {saved.label} · {saved.line1}
                  </button>
                ))}
              </div>
            )}
            </FormStack>
          </FormSection>

          <FormSection
            id="checkout-schedule"
            title="¿Cuándo lo quieres?"
            description={hasCake ? 'Este pedido incluye productos preparados bajo pedido. Elige una franja que tenga capacidad de producción.' : 'Elige preparación inmediata o reserva una franja disponible.'}
            icon={CalendarClock}
          >
            <FormStack spacing={2.5}>
            {branchClosed && (
              <Callout tone="info" size="sm" icon={CalendarClock}>
                Puedes reservar tu pedido ahora. La sede está fuera de su horario de atención; elige una fecha y franja disponible para la entrega o el recojo.
              </Callout>
            )}
            {hasCake && minimumLeadHours > 0 && (
              <p className="text-xs leading-5 text-ink-muted">Este pedido requiere al menos {minimumLeadHours} horas de anticipación. Los productos listos para venta se entregarán junto con el resto del pedido.</p>
            )}
            {!hasCake && (
              <ChoiceGroup
                ariaLabel="Cuándo lo quieres"
                value={serviceMode}
                onChange={setServiceMode}
                className="flex-col sm:flex-row"
                options={[
                  { value: 'ASAP' as const, label: 'Lo antes posible', disabled: branchClosed, icon: <Clock3 className="size-4" /> },
                  { value: 'SCHEDULED' as const, label: 'Programar horario', icon: <CalendarClock className="size-4" /> },
                ]}
              />
            )}

            {(hasCake || serviceMode === 'SCHEDULED') && (
              !branchId ? (
                <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-brand-100 bg-brand-50/35 p-4">
                  <div>
                    <p className="text-sm font-bold text-ink">Primero elige dónde recibirás tu pedido</p>
                    <CardDescription>Así podremos mostrarte las fechas y horarios con cupo.</CardDescription>
                  </div>
                  <button type="button" onClick={() => scrollToSection('checkout-destination')} className="min-h-10 rounded-field border border-brand-200 bg-white px-3 text-xs font-bold text-brand-700 transition-colors hover:bg-brand-50">Elegir destino</button>
                </div>
              ) : (
                <DeliverySlotCalendar emptyMessage={slotsReason} id="slot" slots={slots} value={slotId} onChange={setSlotId} loading={slotsLoading} loadError={slotsError} onRetry={() => setSlotsRetry((count) => count + 1)} />
              )
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
            description={user ? 'Los tomamos de tu cuenta y solo los usaremos para coordinar este pedido.' : 'Completa estos datos para coordinar la entrega. Solo pediremos iniciar sesión cuando confirmes el pago.'}
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
            {user && <div className="mt-4 rounded-xl border border-brand-100 bg-brand-50/40 p-3">
              <Checkbox checked={whatsappOptIn} disabled={!accountWhatsAppAvailable} onChange={(event) => setWhatsappOptIn(event.target.checked)} label="Acepto recibir en el celular de mi cuenta avisos de este pedido por WhatsApp de Misky Challay (confirmación, listo y reparto). Es opcional." />
              {!accountWhatsAppAvailable && <p className="ml-8 mt-1 text-xs text-ink-muted">Para activar estos avisos, <Link to={ROUTES.accountProfile} className="font-semibold text-brand-700 underline">agrega tu celular en Mi perfil</Link>.</p>}
            </div>}
            <FormGrid className="mt-5">
              <div className="space-y-3"><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={isGift} onChange={(event) => setIsGift(event.target.checked)} />Es un regalo</label>{isGift && <><Input label="Nombre del destinatario" maxLength={120} value={gift.recipientName} onChange={(event) => setGift({ ...gift, recipientName: event.target.value })} /><Input label="Teléfono del destinatario (para coordinar la entrega)" maxLength={30} value={gift.recipientPhone} onChange={(event) => setGift({ ...gift, recipientPhone: event.target.value })} /><Textarea label="Dedicatoria del regalo" maxLength={500} value={gift.message} onChange={(event) => setGift({ ...gift, message: event.target.value })} /><label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={gift.hidePrices} onChange={(event) => setGift({ ...gift, hidePrices: event.target.checked })} />Ocultar precios en la ficha del destinatario</label><p className="text-xs text-ink-muted">Los avisos de compra siguen llegando a tu cuenta. Podrás compartir una ficha del regalo sin tus datos de pago.</p></>}</div><Textarea rows={3} label="Indicaciones para cocina" value={kitchenNotes} onChange={(event) => setKitchenNotes(event.target.value)} placeholder="Texto en la torta, acabado o empaque…" maxLength={250} />
              {deliveryType === 'DELIVERY' && <Textarea rows={3} label="Indicaciones adicionales para la entrega (opcional)" value={deliveryNotes} onChange={(event) => setDeliveryNotes(event.target.value)} placeholder="Ej. llamar al llegar o dejar en recepción" maxLength={250} />}
            </FormGrid>
          </FormSection>

          {receipts.mode !== 'INTERNAL_ONLY' && <FormSection
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

          <ExperienceCheckout value={experience} onChange={setExperience} />

          <FormSection
            id="checkout-payment"
            title="¿Cómo quieres pagar?"
            description="Elige cómo pagar tu pedido."
            icon={CreditCard}
          >
            {quote && quote.grandTotal > 0 ? (
              <FormStack spacing={2}>
                <ChoiceGroup
                  ariaLabel="Método de pago"
                  value={paymentMethod}
                  onChange={setPaymentMethod}
                  variant="tile"
                  columns={4}
                  className="grid-cols-1 sm:grid-cols-2 xl:grid-cols-4"
                  options={[
                    /* Sin pasarela configurada el backend rechazaria el cobro al
                     * confirmar: no se ofrece un medio que no se puede cumplir. */
                    ...(onlinePayments.onlineEnabled
                      ? [{ value: 'ONLINE' as const, label: onlineLabel, hint: 'Completa el pago en la pasarela.', icon: <CreditCard className="size-4" /> }]
                      : []),
                    { value: 'YAPE' as const, label: 'Yape', hint: localPayments.yapeEnabled ? 'Transferencia directa al taller.' : 'Temporalmente no disponible.', disabled: !localPayments.yapeEnabled, icon: <Smartphone className="size-4" /> },
                    { value: 'PLIN' as const, label: 'Plin', hint: localPayments.plinEnabled ? 'Transferencia directa al taller.' : 'Temporalmente no disponible.', disabled: !localPayments.plinEnabled, icon: <Smartphone className="size-4" /> },
                    { value: 'CASH' as const, label: 'Al recibir', hint: codAvailable ? 'Paga en efectivo cuando llegue tu pedido.' : !cod.enabled ? 'Temporalmente no disponible.' : deliveryType !== 'DELIVERY' ? 'Solo para delivery.' : depositPlan ? 'Este pedido requiere anticipo.' : `Hasta ${formatCurrency(cod.maxAmount)}.`, disabled: !codAvailable, icon: <Banknote className="size-4" /> },
                  ]}
                />
                {payingMobile && (
                  <div className="rounded-card border border-brand-200 bg-brand-50/60 p-4 text-sm leading-6 text-brand-900">
                    Primero registraremos tu pedido y su {depositPlan ? 'anticipo' : 'total'} de <b>{formatCurrency(depositPlan ? quote.depositAmount ?? 0 : quote.grandTotal)}</b>. Después verás el número y QR del taller para transferir con {selectedLocal.name} y reportar el pago.
                  </div>
                )}
                {payingCash && codAvailable && <div className="rounded-card border border-brand-200 bg-brand-50/60 p-4 text-sm leading-6 text-brand-900">Pagarás <b>{formatCurrency(quote.grandTotal)}</b> en efectivo al recibir el pedido. Ten el importe preparado para la entrega.</div>}
                <p className="text-xs leading-5 text-ink-muted">
                  {payingCash
                    ? 'Confirmaremos el pedido ahora; el cobro se registrará al entregar.'
                    : payingMobile
                    ? 'El taller verificará el movimiento recibido antes de confirmar el pago. Podrás seguirlo desde Mis pedidos.'
                    : 'Te llevamos a la pasarela para completar el pago. Nunca guardamos los datos de tu tarjeta.'}
                </p>
                {!onlinePayments.onlineEnabled && !localPayments.yapeEnabled && !localPayments.plinEnabled && !codAvailable && <Callout tone="warning" size="sm">Por ahora no hay medios de pago disponibles para este pedido. Inténtalo más tarde.</Callout>}
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
                placeholder="DULCE10"
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
              {items.map((item, index) => (
                <li key={item.id} className="flex justify-between gap-4">
                  <span className="min-w-0 text-ink-muted">
                    {item.quantity}x {item.name}
                    {quote?.items[index]?.allergenCodes?.length ? <span className="mt-1 block text-xs">Alérgenos declarados: {quote.items[index].allergenCodes!.map(allergenLabel).join(', ')}. Consulta al equipo si tienes una alergia; no se garantiza ausencia de contacto cruzado.</span> : null}
                    {item.specialInstructions && <span className="mt-1 block whitespace-pre-wrap break-words text-xs leading-5">{item.specialInstructions.replace(/^(Descripción del diseño|Indicaciones): /, '')}</span>}
                    {item.approvedDesignSummary && <span className="mt-1 block whitespace-pre-wrap break-words text-xs leading-5">{item.approvedDesignSummary}</span>}
                    {item.referenceDataUrl && <span className="mt-1 inline-flex items-center gap-2 text-xs"><img src={item.referenceDataUrl} alt="Referencia de la torta" className="size-9 rounded-md border border-line object-cover" /> Referencia adjunta</span>}
                    {(item.cakeAiProposal || item.archivedAiProposalDataUrl) && <span className="mt-1 inline-flex items-center gap-2 text-xs"><img src={item.cakeAiProposal?.dataUrl ?? item.archivedAiProposalDataUrl} alt="Propuesta con IA que acompañará el pedido" className="size-9 rounded-md border border-line object-cover" /> Propuesta con IA adjunta</span>}
                  </span>
                  <span className="shrink-0">{formatCurrency(item.lineTotal)}</span>
                </li>
              ))}
            </ul>

            <div className="rounded-card border border-line bg-surface-muted/60 p-3 text-xs leading-5">
              <p className="font-bold text-ink">{deliveryType === 'PICKUP' ? 'Recojo en taller' : 'Dirección de entrega'}</p>
              <p className="mt-1 break-words text-ink-muted">{destinationSummary}</p>
              {deliveryType === 'DELIVERY' && address?.reference && <p className="mt-1 break-words text-ink-muted">Referencia: {address.reference}</p>}
            </div>

            {/* Region viva: cada recotizacion cambiaba el importe en silencio. */}
            {(quote || isFirstQuote) && (
              <div ref={breakdownRef} className="border-t border-line pt-4" aria-live="polite" aria-busy={isQuoting}>
                {quote && <div className="mb-4 rounded-card border border-brand-100 bg-brand-50 p-4 text-xs leading-5 text-brand-800">
                  <p className="flex items-center gap-1.5 font-bold"><CheckCircle2 className="size-4" /> Atiende {quote.branchName}</p>
                  {serviceMode === 'ASAP' && !hasCake && !branchClosed && <p className="mt-1 flex items-center gap-1.5"><Clock3 className="size-3.5" /> {deliveryType === 'DELIVERY' ? `Entrega estimada: ${quote.etaMinutes} min` : `Preparación estimada: ${quote.etaMinutes} min`}{quote.routeDistanceKm ? ` · ${quote.routeDistanceKm} km` : ''}</p>}
                  {quote.etaSource === 'LIVE_ROUTE' && <p className="mt-1 font-semibold text-brand-700">Ruta actualizada con la ubicación exacta.</p>}
                  {serviceMode === 'ASAP' && !hasCake && !branchClosed && quote.demandLevel !== 'LOW' && <p className="mt-1 font-semibold text-amber-800">{quote.demandLevel === 'HIGH' ? 'Demanda alta: el tiempo ya incluye la espera actual.' : 'Demanda moderada en esta cocina.'}</p>}
                </div>}
                <PriceBreakdown
                  lines={summaryLines}
                  totalLabel={totalLabel}
                  totalValue={quote ? formatCurrency(quote.grandTotal) : '—'}
                  isLoading={isFirstQuote}
                  note={quote ? <div className="grid gap-2">
                    {quote.taxTotal > 0 && <div className="flex justify-between">
                      <span>Incluye IGV ({Math.round(quote.taxRate * 100)}%)</span>
                      <span>{formatCurrency(quote.taxTotal)}</span>
                    </div>}
                    {schedulePending && <p>Elige fecha y horario para confirmar disponibilidad.</p>}
                  </div> : undefined}
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
                <strong>Faltan {formatCurrency(missingForMinimum)} en productos.</strong> El mínimo es {formatCurrency(quote.minimumOrder)} y llevas {formatCurrency(quote.subtotal)}. El delivery no cuenta para este mínimo.
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
                  {payingCash ? <Banknote className="size-4 shrink-0 text-brand-700" /> : payingMobile ? <Smartphone className="size-4 shrink-0 text-brand-700" /> : <CreditCard className="size-4 shrink-0 text-brand-700" />}
                  <span className="min-w-0 truncate font-medium text-ink">{paymentLabel}</span>
                </span>
                <Button type="button" size="sm" variant="ghost" onClick={() => scrollToSection('checkout-payment')}>
                  Cambiar
                </Button>
              </div>
            )}

            <section id="checkout-terms" className="rounded-card border border-line bg-surface-muted p-4 text-sm" aria-label="Aceptación de condiciones">
              {terms && !termsLoadError ? <>
                <label className="flex cursor-pointer items-start gap-3 leading-6">
                  <input id="checkout-terms-checkbox" type="checkbox" className="mt-1.5 size-4 shrink-0 accent-brand-700" checked={termsAccepted} disabled={isPaying} aria-describedby={termsIssue ? 'checkout-terms-error' : undefined} onChange={(event) => { setConsent(event.target.checked ? { version: terms.version, userId: user?.id ?? null } : null); setTermsIssue(''); }} />
                  <span>{terms.acceptanceLabel}</span>
                </label>
                <Link className="mt-2 inline-block font-semibold text-brand-700 underline underline-offset-2" to={ROUTES.terms} target="_blank" rel="noopener noreferrer">Leer {terms.title} · versión {terms.version}</Link>
                {consent && consent.version !== terms.version && <p className="mt-2 text-xs">Las condiciones se actualizaron. Revisa y acepta la nueva versión.</p>}
              </> : <><p>{termsLoadError ? 'No pudimos cargar las condiciones de compra.' : 'Cargando condiciones de compra…'}</p><Button type="button" variant="ghost" onClick={() => void refreshTerms()}>Reintentar</Button></>}
              {termsIssue && <p id="checkout-terms-error" role="alert" className="mt-2 text-xs text-red-700">{termsIssue}</p>}
            </section>

            {/* Nunca deshabilitado: si algo bloquea, el boton hace lo que hay que hacer. */}
            <Button
              type="submit"
              className="w-full"
              size="lg"
              leftIcon={blockAction ? blockAction.icon : payIcon}
              isLoading={isPaying || isQuoting}
            >
              {blockAction ? blockAction.desktopLabel ?? blockAction.label : payLabel}
            </Button>

            <CardDescription className="text-center text-xs leading-5">
              {blockReason === 'bajo_minimo'
                ? 'Completa el mínimo ajustando cantidades aquí o eligiendo otros productos. Después podrás pagar.'
                : blockReason === 'falta_horario'
                ? 'Elige un horario disponible para continuar con el pago.'
                : quote?.grandTotal === 0
                ? 'Tu saldo cubre todo el pedido: no se cobrara nada a tu tarjeta.'
                  : payingCash
                    ? 'El pedido se confirma ahora y pagarás en efectivo al recibirlo.'
                  : payingMobile
                    ? 'Crearás el pedido y verás los datos para transferir. El taller verificará el pago reportado.'
                  : 'El pago se procesa fuera de esta web. Nunca guardamos datos de tu tarjeta.'}
            </CardDescription>

            <TrustBadges className="border-t border-line pt-4" />
            </div>
          </Card>
        </aside>
      </form>

      <CheckoutMinimumDialog isOpen={minimumDialog !== null} items={items} quote={quote} minimumOrder={quote?.minimumOrder ?? minimumDialog?.minimumOrder ?? 0} isQuoting={isQuoting} quoteError={quoteError} onQuantityChange={updateCheckoutQuantity} onRetry={retryQuote} onClose={() => setMinimumDialog(null)} />

      {/* "Calculando…" solo mientras hay una peticion en vuelo sin nada que ensenar.
          Antes salia siempre que `quote` fuera null, incluido el caso en que la
          cotizacion ni arrancaba por falta de destino: eterno y con el boton muerto. */}
      <StickyActionBar
        hideFrom="lg"
        label={quote ? schedulePending ? 'Total estimado' : 'Total del pedido' : blockAction ? 'Para continuar' : 'Total del pedido'}
        value={
          isFirstQuote ? 'Calculando…' : quote ? formatCurrency(quote.grandTotal) : blockAction?.value ?? '—'
        }
      >
        <Button
          type="button"
          size="lg"
          leftIcon={blockAction ? undefined : summarySeen ? payIcon : <ReceiptText className="size-4" />}
          isLoading={isPaying || isQuoting}
          onClick={confirmOrReveal}
        >
          {blockAction ? blockAction.label : summarySeen ? payLabelCompact : 'Revisar y pagar'}
        </Button>
      </StickyActionBar>
    </main>
  );
};

export default CheckoutPage;
