import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { AppImage } from '../../src/components/AppImage';
import { env } from '../../src/config/env';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { Skeleton } from '../../src/components/Skeleton';
import { useResource } from '../../src/hooks/useResource';
import { isValidDni, isValidRuc } from '../../src/lib/peruDocs';
import { money } from '../../src/lib/format';
import { useCart } from '../../src/providers/CartProvider';
import { usePurchase } from '../../src/providers/PurchaseProvider';
import { useSession } from '../../src/providers/SessionProvider';
import { useToast } from '../../src/providers/ToastProvider';
import { mobileAnalytics } from '../../src/services/analytics';
import { accountApi } from '../../src/services/api/account.service';
import { businessApi } from '../../src/services/api/business.service';
import { checkoutApi } from '../../src/services/api/checkout.service';
import { geoApi } from '../../src/services/api/geo.service';
import { colors, layout, radius, shadow, spacing, type } from '../../src/theme/tokens';
import type {
  Address,
  CheckoutInput,
  DeliverySlot,
  OrderQuote,
  PublicSettings,
} from '../../src/types/domain';

type PaymentMethod = 'ONLINE' | 'CASH' | 'YAPE' | 'PLIN';
type Timing = 'ASAP' | 'SCHEDULED';
type DocumentType = 'BOLETA' | 'FACTURA';

interface PaymentOption {
  value: PaymentMethod;
  label: string;
  hint: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
}

/** Motivo por el que todavía no se puede confirmar, con la salida en el propio botón. */
interface BlockAction {
  label: string;
  detail: string;
  run: () => void;
}

interface FieldErrors {
  contactName?: string;
  contactPhone?: string;
  billing?: string;
  operationCode?: string;
  payerPhone?: string;
}

/** El total se recotiza solo; esta pausa evita un POST por cada tecla del cupón. */
const QUOTE_DEBOUNCE_MS = 350;


const attemptKey = () => `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

const isValidPhone = (value: string) => /^[0-9+\s-]{6,20}$/.test(value.trim());

const HOST_PATTERN = /^(https?):\/\/([^/?#]+)/i;

/** Nuestros propios orígenes: el simulador de pago vive en el mismo host que la web. */
const OWN_HOSTS = [env.webUrl, env.apiUrl]
  .map((value) => HOST_PATTERN.exec(value)?.[2]?.toLowerCase() ?? '')
  .filter(Boolean);

/**
 * La pasarela se abre SOLO con la URL que devuelve el backend, y aun así se
 * comprueba: https siempre, http únicamente contra nuestro propio host (el
 * simulador local). Cualquier otro esquema se descarta.
 */
const isSafeCheckoutUrl = (value: string | null | undefined): value is string => {
  if (!value) return false;
  const match = HOST_PATTERN.exec(value.trim());
  if (!match) return false;
  if (match[1].toLowerCase() === 'https') return true;
  return OWN_HOSTS.includes(match[2].toLowerCase());
};

const slotLabel = (slot: DeliverySlot) => {
  const start = new Date(slot.startsAt);
  const end = new Date(slot.endsAt);
  return {
    day: start.toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'short' }),
    range: `${start.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`,
  };
};

/**
 * Huella de lo que se envía a confirmar. Sirve para distinguir un doble toque
 * (misma huella) de un reintento con el carrito ya cambiado, donde reutilizar la
 * clave de idempotencia devolvería el pedido ANTIGUO sin lo agregado después.
 */
const cartFingerprint = (input: CheckoutInput): string =>
  JSON.stringify({
    items: input.items.map((item) => [
      item.productId,
      item.variantId,
      item.quantity,
      item.selections.map((selection) => [selection.optionId, selection.quantity]),
    ]),
    deliveryType: input.deliveryType,
    serviceMode: input.serviceMode,
    slotId: input.deliverySlotId ?? null,
    branchId: input.branchId ?? null,
    address: input.address?.line1 ?? null,
    coupon: input.couponCode ?? null,
    wallet: input.useWallet ?? false,
  });

interface SectionProps {
  title: string;
  description?: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  children: ReactNode;
}

function Section({ title, description, icon, children }: SectionProps) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionIcon}>
          <MaterialCommunityIcons name={icon} size={20} color={colors.brand700} />
        </View>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionTitle}>{title}</Text>
          {description ? <Text style={styles.sectionDescription}>{description}</Text> : null}
        </View>
      </View>

      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

interface OptionRowProps {
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  subtitle?: string;
  selected: boolean;
  onPress: () => void;
}

function OptionRow({ icon, title, subtitle, selected, onPress }: OptionRowProps) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={subtitle ? `${title}. ${subtitle}` : title}
      onPress={() => {
        void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => [styles.option, selected && styles.optionActive, pressed && styles.pressed]}
    >
      <MaterialCommunityIcons
        name={icon}
        size={23}
        color={selected ? colors.brand700 : colors.inkMuted}
      />

      <View style={styles.optionCopy}>
        <Text style={styles.optionTitle}>{title}</Text>
        {subtitle ? <Text style={styles.optionSubtitle}>{subtitle}</Text> : null}
      </View>

      <MaterialCommunityIcons
        name={selected ? 'radiobox-marked' : 'radiobox-blank'}
        size={21}
        color={selected ? colors.brand600 : '#a6b0aa'}
      />
    </Pressable>
  );
}

export default function CheckoutScreen() {
  const { status, user } = useSession();
  const { items, clear } = useCart();
  const {
    serviceMode,
    branch,
    address: purchaseAddress,
    coverage: purchaseCoverage,
    selectDeliveryAddress,
  } = usePurchase();
  const toast = useToast();

  const [addressId, setAddressId] = useState<number | null>(null);
  const [timing, setTiming] = useState<Timing>('ASAP');
  const [slots, setSlots] = useState<DeliverySlot[]>([]);
  const [slotId, setSlotId] = useState<number | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState('');

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [operationCode, setOperationCode] = useState('');
  const [payerPhone, setPayerPhone] = useState('');

  const [documentType, setDocumentType] = useState<DocumentType>('BOLETA');
  const [dni, setDni] = useState('');
  const [ruc, setRuc] = useState('');
  const [billingName, setBillingName] = useState('');
  const [billingAddress, setBillingAddress] = useState('');

  const profileName = [user?.firstName, user?.lastName].filter(Boolean).join(' ');
  const [contactName, setContactName] = useState(profileName);
  const [contactPhone, setContactPhone] = useState(user?.phone ?? '');
  const [kitchenNotes, setKitchenNotes] = useState('');
  const [deliveryNotes, setDeliveryNotes] = useState('');

  const [couponInput, setCouponInput] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<string | null>(null);
  const [useWallet, setUseWallet] = useState(true);

  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [quoteError, setQuoteError] = useState('');
  const [quoting, setQuoting] = useState(false);
  const [quoteNonce, setQuoteNonce] = useState(0);
  const [placing, setPlacing] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  /** Última cotización válida: un fallo puntual no debe borrar los importes en pantalla. */
  const lastValidQuote = useRef<OrderQuote | null>(null);
  /** Clave de idempotencia del intento y huella de lo que se envió con ella (RN-015). */
  const attempt = useRef<{ key: string; fingerprint: string | null }>({
    key: attemptKey(),
    fingerprint: null,
  });
  /** El pedido ya nació: el carrito puede vaciarse sin que eso expulse de la pantalla. */
  const placed = useRef(false);
  const trackedStart = useRef(false);
  const checkoutScroll = useRef<ScrollView>(null);

  const addresses = useResource<Address[]>({
    key: status === 'authenticated' ? 'account:addresses' : null,
    fetcher: () => accountApi.addresses(),
  });
  const settings = useResource<PublicSettings>({
    key: 'settings:public',
    fetcher: () => businessApi.publicSettings(),
    cacheMs: 300_000,
  });

  const addressRows = useMemo(() => addresses.data ?? [], [addresses.data]);
  const selectedAddress = useMemo(
    () => addressRows.find((row) => row.id === addressId) ?? null,
    [addressId, addressRows],
  );

  // --- Guardas de entrada ------------------------------------------------
  useEffect(() => {
    if (status === 'bootstrapping') return;

    if (status !== 'authenticated') {
      router.replace({ pathname: '/(auth)/login', params: { returnTo: '/checkout' } });
      return;
    }
    if (serviceMode === 'DINE_IN') {
      router.replace('/scan-table');
      return;
    }
    /*
     * El carrito vacío solo devuelve al carrito si NO acabamos de crear el pedido:
     * al confirmar se vacía a propósito y la salida correcta es el comprobante. Sin
     * esta guarda el cliente aterrizaba en un carrito vacío sin ver su número de
     * pedido y creyendo que no se había registrado.
     */
    if (items.length === 0 && !placed.current) router.replace('/(tabs)/cart');
  }, [items.length, serviceMode, status]);

  useEffect(() => {
    if (trackedStart.current || items.length === 0) return;
    trackedStart.current = true;
    void mobileAnalytics.track(
      'CHECKOUT_START',
      { serviceMode, itemCount: items.length },
      branch?.id,
    );
  }, [branch?.id, items.length, serviceMode]);

  // El perfil puede llegar después del primer render en un arranque en frío.
  useEffect(() => {
    setContactName((current) => current || profileName);
    setContactPhone((current) => current || (user?.phone ?? ''));
  }, [profileName, user?.phone]);

  useEffect(() => {
    if (addressRows.length === 0) return;
    setAddressId((current) =>
      current !== null && addressRows.some((row) => row.id === current)
        ? current
        : (addressRows.find((row) => row.id === purchaseAddress?.id)?.id
          ?? addressRows.find((row) => row.isDefault)?.id
          ?? addressRows[0].id),
    );
  }, [addressRows, purchaseAddress?.id]);

  const chooseAddress = useCallback(async (row: Address) => {
    setAddressId(row.id);
    setQuoteError('');
    try {
      const result = await selectDeliveryAddress(row);
      if (result && !result.covered) {
        toast.show({
          message: result.reason ?? 'Esa dirección está fuera de cobertura. Elige otra para continuar.',
          tone: 'warning',
          placement: 'top',
        });
      }
    } catch (caught) {
      toast.show({
        message: caught instanceof Error ? caught.message : 'No pudimos comprobar esa dirección.',
        tone: 'error',
      });
    }
  }, [selectDeliveryAddress, toast]);

  // --- Franjas horarias --------------------------------------------------
  useEffect(() => {
    if (timing !== 'SCHEDULED') {
      setSlots([]);
      setSlotId(null);
      setSlotsError('');
      return;
    }
    if (serviceMode === 'PICKUP' && !branch) return;
    if (serviceMode === 'DELIVERY' && !selectedAddress) return;

    let active = true;

    const loadSlots = async () => {
      setSlotsLoading(true);
      setSlotsError('');
      setSlotId(null);

      try {
        let targetBranchId = branch?.id ?? null;

        if (serviceMode === 'DELIVERY' && selectedAddress) {
          /*
           * La cobertura de la dirección vigente ya la resolvió PurchaseProvider
           * al elegirla: reutilizarla evita un POST /locations/coverage repetido
           * al entrar aquí y garantiza que la sede del menú y la del cobro son la
           * misma. Solo se vuelve a preguntar si el cliente cambió de dirección.
           */
          const reusable =
            purchaseCoverage !== null && purchaseAddress?.id === selectedAddress.id
              ? purchaseCoverage
              : await geoApi.coverage({
                  districtId: selectedAddress.districtId ?? undefined,
                  latitude: selectedAddress.latitude ?? undefined,
                  longitude: selectedAddress.longitude ?? undefined,
                });

          targetBranchId = reusable.covered ? (reusable.branch?.id ?? null) : null;
          if (!targetBranchId) {
            throw new Error(reusable.reason || 'La dirección no tiene una sede asignada.');
          }
        }
        if (!targetBranchId) throw new Error('Elige primero el local de recojo.');

        const rows = await geoApi.slots(targetBranchId, 7);
        if (!active) return;

        setSlots(rows);
        if (rows.length > 0) setSlotId(rows[0].id);
        else setSlotsError('No hay franjas con cupo para los próximos 7 días.');
      } catch (caught) {
        if (active) {
          setSlotsError(caught instanceof Error ? caught.message : 'No pudimos cargar las franjas.');
        }
      } finally {
        if (active) setSlotsLoading(false);
      }
    };

    void loadSlots();
    return () => {
      active = false;
    };
  }, [branch, purchaseAddress?.id, purchaseCoverage, selectedAddress, serviceMode, timing]);

  // --- Cotización automática ---------------------------------------------
  /**
   * Solo lo que puede cambiar el precio. Contacto, notas, comprobante y medio de
   * pago se añaden al confirmar: tenerlos aquí dispararía una cotización completa
   * por cada tecla escrita.
   */
  const quoteInput = useMemo<CheckoutInput | null>(() => {
    if (items.length === 0) return null;
    if (serviceMode === 'PICKUP' ? !branch : !selectedAddress) return null;
    if (timing === 'SCHEDULED' && !slotId) return null;

    return {
      items: items.map((item) => ({
        productId: item.productId,
        variantId: item.variantId,
        quantity: item.quantity,
        selections: item.selections.map((selection) => ({
          optionId: selection.optionId,
          quantity: selection.quantity,
        })),
        ...(item.specialInstructions ? { specialInstructions: item.specialInstructions } : {}),
      })),
      deliveryType: serviceMode === 'PICKUP' ? 'PICKUP' : 'DELIVERY',
      serviceMode: timing,
      ...(timing === 'SCHEDULED' && slotId ? { deliverySlotId: slotId } : {}),
      ...(serviceMode === 'PICKUP'
        ? { branchId: branch?.id }
        : selectedAddress
          ? {
              address: {
                label: selectedAddress.label,
                line1: selectedAddress.line1,
                reference: selectedAddress.reference || undefined,
                districtId: selectedAddress.districtId || undefined,
                latitude: selectedAddress.latitude || undefined,
                longitude: selectedAddress.longitude || undefined,
              },
            }
          : {}),
      couponCode: appliedCoupon ?? undefined,
      useWallet,
      // El medio de pago no cambia el precio: se decide al confirmar.
      paymentMethod: 'ONLINE',
      billing: { documentType: 'BOLETA' },
    };
  }, [appliedCoupon, branch, items, selectedAddress, serviceMode, slotId, timing, useWallet]);

  useEffect(() => {
    if (!quoteInput) {
      setQuote(null);
      setQuoting(false);
      return;
    }

    let cancelled = false;
    setQuoting(true);

    const timer = setTimeout(() => {
      checkoutApi
        .quote(quoteInput)
        .then((result) => {
          if (cancelled) return;
          lastValidQuote.current = result;
          setQuote(result);
          setQuoteError('');
          void mobileAnalytics.track(
            'CHECKOUT_STEP',
            { step: 'quoted', serviceMode, total: result.grandTotal },
            result.branchId,
          );
        })
        .catch((caught: unknown) => {
          if (cancelled) return;
          // Se conserva el último desglose bueno: un 500 puntual no puede dejar la
          // pantalla sin importes ni sin medio de pago mientras se reintenta.
          setQuote(lastValidQuote.current);
          setQuoteError(
            caught instanceof Error ? caught.message : 'No pudimos calcular tu pedido.',
          );
        })
        .finally(() => {
          if (!cancelled) setQuoting(false);
        });
    }, QUOTE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [quoteInput, quoteNonce, serviceMode]);

  const retryQuote = useCallback(() => setQuoteNonce((value) => value + 1), []);

  // --- Comprobante y medios de pago --------------------------------------
  const config = settings.data;
  const refetchSettings = settings.refetch;

  /*
   * El comprobante se emite por el valor TOTAL de la venta: el saldo es un medio
   * de pago, no un descuento. Es lo que SUNAT compara contra el umbral.
   */
  const invoiceTotal = quote ? quote.grandTotal + quote.walletAmount : 0;
  const fiscalEnabled = config?.receipts.mode !== 'INTERNAL_ONLY';
  const boletaThreshold = config?.invoicing.boletaDniThreshold ?? null;
  const boletaNeedsDni =
    fiscalEnabled && documentType === 'BOLETA' && boletaThreshold !== null && invoiceTotal >= boletaThreshold;

  const codAvailable =
    Boolean(config?.cod.enabled) &&
    quote !== null &&
    quote.grandTotal > 0 &&
    quote.grandTotal <= (config?.cod.maxAmount ?? 0);

  /** Con el saldo cubriendo todo no hay nada que cobrar ni medio que elegir. */
  const needsPayment = quote === null || quote.grandTotal > 0;

  const paymentOptions = useMemo<PaymentOption[]>(() => {
    // Sin la configuración del negocio no se ofrece ningún medio: hacerlo a ciegas
    // era la razón de que el cliente eligiera efectivo o tarjeta y el backend lo
    // rechazara recién al confirmar.
    if (!config || !needsPayment) return [];

    const rows: PaymentOption[] = [];

    // Sin pasarela configurada el backend rechazaría el cobro al confirmar: mejor
    // no ofrecer la tarjeta que ofrecerla y fallar con el pedido ya armado.
    if (config.payments.onlineEnabled) {
      rows.push({
        value: 'ONLINE',
        label: 'Tarjeta',
        hint: 'Pagas en la pasarela segura. Nunca guardamos tus datos.',
        icon: 'credit-card-outline',
      });
    }

    if (codAvailable) {
      rows.push({
        value: 'CASH',
        label: 'Efectivo al recibir',
        hint: `Disponible hasta ${money(config.cod.maxAmount)}.`,
        icon: 'cash',
      });
    }
    if (config.localPayments.yapeEnabled) {
      rows.push({
        value: 'YAPE',
        label: 'Yape',
        hint: 'Caja valida el movimiento antes de cocinar.',
        icon: 'cellphone-check',
      });
    }
    if (config.localPayments.plinEnabled) {
      rows.push({
        value: 'PLIN',
        label: 'Plin',
        hint: 'Caja valida el movimiento antes de cocinar.',
        icon: 'cellphone-check',
      });
    }

    return rows;
  }, [codAvailable, config, needsPayment]);

  useEffect(() => {
    if (paymentOptions.length === 0) return;
    // El valor inicial es el primer medio REALMENTE habilitado, y si el elegido
    // deja de estarlo (el total supera el tope del efectivo) se cae al primero.
    setPaymentMethod((current) =>
      current !== null && paymentOptions.some((option) => option.value === current)
        ? current
        : paymentOptions[0].value,
    );
  }, [paymentOptions]);

  const isMobilePayment = paymentMethod === 'YAPE' || paymentMethod === 'PLIN';
  const localPayment = useMemo(() => {
    if (!config || !isMobilePayment) return null;
    const yape = paymentMethod === 'YAPE';
    return {
      name: yape ? 'Yape' : 'Plin',
      phone: yape ? config.localPayments.yapePhone : config.localPayments.plinPhone,
      recipient: yape ? config.localPayments.yapeRecipient : config.localPayments.plinRecipient,
      qr: yape ? config.localPayments.yapeQrImageUrl : config.localPayments.plinQrImageUrl,
      instructions: config.localPayments.instructions,
    };
  }, [config, isMobilePayment, paymentMethod]);

  // --- Confirmación -------------------------------------------------------
  const buildPlaceInput = useCallback((): CheckoutInput | null => {
    if (!quoteInput) return null;

    const notes = [
      kitchenNotes.trim() ? `COCINA: ${kitchenNotes.trim()}` : '',
      deliveryNotes.trim() ? `REPARTO: ${deliveryNotes.trim()}` : '',
    ]
      .filter(Boolean)
      .join('\n');

    return {
      ...quoteInput,
      paymentMethod: paymentMethod ?? 'ONLINE',
      ...(isMobilePayment
        ? {
            mobilePayment: {
              operationCode: operationCode.trim(),
              payerPhone: payerPhone.trim() || undefined,
            },
          }
        : {}),
      billing:
        documentType === 'FACTURA'
          ? {
              documentType: 'FACTURA',
              docNumber: ruc.trim(),
              name: billingName.trim(),
              address: billingAddress.trim() || undefined,
            }
          : {
              documentType: 'BOLETA',
              // El DNI solo viaja cuando el umbral lo exige: así un documento a
              // medias de un total anterior no se cuela escondido en la boleta.
              docNumber: boletaNeedsDni ? dni.trim() || undefined : undefined,
            },
      contactName: contactName.trim() || undefined,
      contactPhone: contactPhone.trim() || undefined,
      notes: notes || undefined,
    };
  }, [
    billingAddress,
    billingName,
    boletaNeedsDni,
    contactName,
    contactPhone,
    deliveryNotes,
    dni,
    documentType,
    isMobilePayment,
    kitchenNotes,
    operationCode,
    payerPhone,
    paymentMethod,
    quoteInput,
    ruc,
  ]);

  const validate = useCallback((): FieldErrors => {
    const found: FieldErrors = {};

    if (contactName.trim().length < 2) {
      found.contactName = 'Escribe el nombre de quien recibirá el pedido.';
    }
    /*
     * El teléfono es opcional al registrarse: sin este campo TODOS los pedidos de
     * quien no lo dio salían sin número y el tablero de reparto se quedaba sin
     * forma de avisar que ya está abajo.
     */
    if (!isValidPhone(contactPhone)) {
      found.contactPhone = 'Ingresa un teléfono de contacto válido (6 a 20 dígitos).';
    }

    if (fiscalEnabled && documentType === 'FACTURA') {
      if (!isValidRuc(ruc)) found.billing = 'Ingresa un RUC válido (11 dígitos, empieza en 10/20).';
      else if (billingName.trim().length < 3) found.billing = 'Ingresa la razón social.';
      else if (billingAddress.trim().length < 5) found.billing = 'Ingresa el domicilio fiscal.';
    } else if (fiscalEnabled && boletaNeedsDni) {
      if (!dni.trim()) {
        found.billing = `Para una boleta de ${money(invoiceTotal)} necesitamos tu DNI.`;
      } else if (!isValidDni(dni)) {
        found.billing = 'El DNI debe tener 8 dígitos.';
      }
    }

    if (isMobilePayment) {
      if (!/^[A-Za-z0-9-]{6,24}$/.test(operationCode.trim())) {
        found.operationCode = 'Ingresa el código de operación que aparece en tu aplicativo.';
      }
      // El backend exige los 9 dígitos completos si el celular viaja: medio
      // número hacía fallar el pedido entero por un campo opcional.
      if (payerPhone.trim() && !/^\d{9}$/.test(payerPhone.trim())) {
        found.payerPhone = 'El celular debe tener 9 dígitos, o déjalo vacío.';
      }
    }

    return found;
  }, [
    billingAddress,
    billingName,
    boletaNeedsDni,
    contactName,
    contactPhone,
    dni,
    documentType,
    invoiceTotal,
    isMobilePayment,
    operationCode,
    payerPhone,
    ruc,
  ]);

  /**
   * El backend devolvió un pedido que YA existía con esta clave, pero el carrito
   * cambió desde entonces: lo agregado después NO está en ese pedido. Vaciar el
   * carrito e ir al comprobante como si nada haría desaparecer esos productos.
   */
  const warnReusedOrder = useCallback((orderNumber: string) => {
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    Alert.alert(
      'Este pedido ya estaba creado',
      `El pedido ${orderNumber} nació en un intento anterior, así que NO incluye los cambios que hiciste después. Tu carrito sigue intacto: decide si quieres ese pedido o uno nuevo con lo que tienes ahora.`,
      [
        {
          text: 'Crear un pedido nuevo',
          onPress: () => {
            // Clave nueva: con la anterior el servidor seguiría devolviendo el pedido viejo.
            attempt.current = { key: attemptKey(), fingerprint: null };
          },
        },
        {
          text: 'Ver el pedido anterior',
          onPress: () => router.push({ pathname: '/checkout/result', params: { orderNumber } }),
        },
      ],
    );
  }, []);

  const place = useCallback(async () => {
    const input = buildPlaceInput();
    if (!input || !quote) return;

    const found = validate();
    setErrors(found);
    const firstIssue =
      found.contactName ??
      found.contactPhone ??
      found.billing ??
      found.operationCode ??
      found.payerPhone;
    if (firstIssue) {
      toast.show({ message: firstIssue, tone: 'error', placement: 'top' });
      return;
    }

    setPlacing(true);
    const fingerprint = cartFingerprint(input);
    if (attempt.current.fingerprint === null) attempt.current.fingerprint = fingerprint;

    try {
      const result = await checkoutApi.place({ ...input, idempotencyKey: attempt.current.key });

      if (result.reused && attempt.current.fingerprint !== fingerprint) {
        warnReusedOrder(result.orderNumber);
        return;
      }

      void mobileAnalytics.track(
        'ORDER_COMPLETED',
        { orderNumber: result.orderNumber, total: result.grandTotal, status: result.status },
        quote.branchId,
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      if (result.reused) {
        toast.show({ message: 'Este pedido ya estaba creado; te llevamos a él.', tone: 'info' });
      }

      /*
       * Primero la pantalla del pedido y DESPUÉS el vaciado. Al revés, el carrito
       * quedaba en cero mientras seguíamos aquí y la guarda de arriba expulsaba al
       * cliente al carrito vacío sin haber visto nunca su número de pedido.
       */
      placed.current = true;
      router.replace({
        pathname: '/checkout/result',
        params: { orderNumber: result.orderNumber },
      });
      void clear();

      /*
       * La pasarela se abre encima del comprobante, no en su lugar: si el cliente
       * cierra el navegador sin pagar vuelve a una pantalla que ya tiene su número
       * de pedido y el botón para retomar el cobro.
       */
      if (isSafeCheckoutUrl(result.checkoutUrl)) {
        const url = result.checkoutUrl;
        void mobileAnalytics.track(
          'PAYMENT_REDIRECT',
          { provider: result.provider ?? 'desconocido' },
          quote.branchId,
        );
        void Linking.canOpenURL(url)
          .then((supported) => (supported ? Linking.openURL(url) : undefined))
          .catch(() => undefined);
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'No pudimos crear el pedido.';
      void mobileAnalytics.track(
        'CHECKOUT_ERROR',
        { message: message.slice(0, 120) },
        quote.branchId,
      );
      toast.show({ message, tone: 'error' });
    } finally {
      setPlacing(false);
    }
  }, [buildPlaceInput, clear, quote, toast, validate, warnReusedOrder]);

  // --- Estado del botón principal ----------------------------------------
  const missingDestination = serviceMode === 'PICKUP' ? !branch : !selectedAddress;
  /** Todavía no hay ningún importe que enseñar y tampoco un fallo que resolver. */
  const awaitingFirstQuote = quoteInput !== null && quote === null && quoteError === '';
  const missingForMinimum = quote ? Math.max(0, quote.minimumOrder - quote.subtotal) : 0;

  const blockAction = useMemo<BlockAction | null>(() => {
    if (missingDestination) {
      return serviceMode === 'PICKUP'
        ? {
            label: 'Elegir local',
            detail: 'Falta el local de recojo',
            run: () => router.push('/location'),
          }
        : {
            label: 'Elegir dirección',
            detail: 'Falta tu dirección de entrega',
            run: () => router.push('/addresses'),
          };
    }
    if (timing === 'SCHEDULED' && !slotId) {
      return {
        label: 'Entregar cuanto antes',
        detail: 'Falta elegir una franja',
        run: () => setTiming('ASAP'),
      };
    }
    // Sin cotización y sin error todavía se está calculando: el botón espera con
    // su spinner en vez de ofrecer un reintento que no hace falta.
    if (quote === null) {
      return quoteError
        ? { label: 'Reintentar', detail: 'No pudimos calcular el total', run: retryQuote }
        : null;
    }
    if (quoteError) {
      return { label: 'Reintentar', detail: 'La última cotización falló', run: retryQuote };
    }
    if (!quote.meetsMinimum) {
      return {
        label: 'Agregar productos',
        detail: `Te faltan ${money(missingForMinimum)}`,
        run: () => router.push('/(tabs)/menu'),
      };
    }
    if (timing === 'ASAP' && !quote.isOpenNow) {
      return {
        label: 'Programar pedido',
        detail: `${quote.branchName} está cerrado ahora`,
        run: () => setTiming('SCHEDULED'),
      };
    }
    // Sin saber qué medios acepta el negocio no se confirma: el pedido nacería
    // con un método que el servidor puede rechazar después de crearlo.
    if (needsPayment && paymentMethod === null) {
      return {
        label: 'Reintentar',
        detail: 'Faltan los medios de pago',
        run: () => void refetchSettings(),
      };
    }
    return null;
  }, [
    missingDestination,
    missingForMinimum,
    needsPayment,
    paymentMethod,
    quote,
    quoteError,
    refetchSettings,
    retryQuote,
    serviceMode,
    slotId,
    timing,
  ]);

  const confirmLabel = useMemo(() => {
    if (!quote) return 'Calculando tu total…';
    if (quote.grandTotal === 0) return 'Confirmar con mi saldo';
    if (paymentMethod === 'CASH') return `Confirmar · ${money(quote.grandTotal)} al recibir`;
    if (isMobilePayment) return `Ya pagué ${money(quote.grandTotal)}, confirmar`;
    return `Pagar ${money(quote.grandTotal)}`;
  }, [isMobilePayment, paymentMethod, quote]);

  const loadingScreen = addresses.loading || settings.loading;

  const footer = (
    <View style={styles.footer}>
      <View style={styles.footerTotals}>
        <Text style={styles.footerLabel}>
          {blockAction ? blockAction.detail : quoting ? 'Actualizando total…' : 'Total a pagar'}
        </Text>
        <Text style={styles.footerValue}>{quote ? money(quote.grandTotal) : '—'}</Text>
      </View>

      {serviceMode === 'DELIVERY' && selectedAddress ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cambiar dirección de entrega"
          onPress={() => checkoutScroll.current?.scrollTo({ y: 0, animated: true })}
          style={({ pressed }) => [styles.changeAddress, pressed && styles.pressed]}
        >
          <MaterialCommunityIcons name="map-marker-outline" size={18} color={colors.brand700} />
          <Text style={styles.changeAddressText}>Cambiar dirección</Text>
        </Pressable>
      ) : null}

      <PrimaryButton
        loading={placing || (!blockAction && awaitingFirstQuote)}
        label={blockAction ? blockAction.label : confirmLabel}
        onPress={() => (blockAction ? blockAction.run() : void place())}
      />
    </View>
  );

  return (
    <ScreenScaffold
      title="Confirmar pedido"
      subtitle="Último paso: revisa y paga"
      onBack={() => router.back()}
      footer={footer}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          ref={checkoutScroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {loadingScreen ? (
            <View style={styles.loading}>
              <Skeleton height={92} rounded="md" />
              <Skeleton height={140} rounded="md" style={styles.loadingBlock} />
              <Skeleton height={180} rounded="md" style={styles.loadingBlock} />
            </View>
          ) : (
            <>
              <Section
                icon={serviceMode === 'PICKUP' ? 'storefront-outline' : 'map-marker-outline'}
                title={serviceMode === 'PICKUP' ? 'Local de recojo' : 'Dirección de entrega'}
                description={
                  serviceMode === 'PICKUP'
                    ? 'Recoges tu pedido en el local que elegiste.'
                    : 'Validamos cobertura y costo de envío con esta dirección.'
                }
              >
                {serviceMode === 'PICKUP' ? (
                  branch ? (
                    <View style={styles.branchCard}>
                      <MaterialCommunityIcons
                        name="check-circle"
                        size={22}
                        color={colors.success}
                      />
                      <View style={styles.optionCopy}>
                        <Text style={styles.optionTitle}>{branch.name}</Text>
                        <Text style={styles.optionSubtitle}>{branch.addressLine}</Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.warning}>
                      <MaterialCommunityIcons name="alert-outline" size={20} color={colors.warning} />
                      <Text style={styles.warningText}>
                        Elige el local desde la barra de ubicación.
                      </Text>
                    </View>
                  )
                ) : addresses.error && addressRows.length === 0 ? (
                  <View style={styles.warning}>
                    <MaterialCommunityIcons name="cloud-alert-outline" size={20} color={colors.warning} />
                    <View style={styles.optionCopy}>
                      <Text style={styles.warningText}>{addresses.error.message}</Text>
                      <PrimaryButton
                        label="Reintentar"
                        variant="secondary"
                        onPress={() => void addresses.refetch()}
                        style={styles.inlineAction}
                      />
                    </View>
                  </View>
                ) : addressRows.length > 0 ? (
                  <>
                    {addressRows.map((row) => (
                      <OptionRow
                        key={row.id}
                        icon="map-marker-outline"
                        title={row.label}
                        subtitle={row.line1}
                        selected={row.id === addressId}
                        onPress={() => void chooseAddress(row)}
                      />
                    ))}

                    <PrimaryButton
                      label="Agregar otra dirección"
                      variant="ghost"
                      onPress={() => router.push('/addresses/new')}
                      style={styles.inlineAction}
                    />
                  </>
                ) : (
                  <View style={styles.warning}>
                    <MaterialCommunityIcons name="alert-outline" size={20} color={colors.warning} />
                    <View style={styles.optionCopy}>
                      <Text style={styles.warningText}>
                        Necesitas una dirección con cobertura para continuar.
                      </Text>
                      <PrimaryButton
                        label="Agregar dirección"
                        variant="secondary"
                        onPress={() => router.push('/addresses/new')}
                        style={styles.inlineAction}
                      />
                    </View>
                  </View>
                )}
              </Section>

              <Section
                icon="clock-outline"
                title="¿Cuándo lo quieres?"
                description="Preparación inmediata o una franja reservada."
              >
                <OptionRow
                  icon="clock-fast"
                  title="Lo antes posible"
                  subtitle={quote ? `Aprox. ${quote.etaMinutes} min` : 'Salimos apenas esté listo'}
                  selected={timing === 'ASAP'}
                  onPress={() => setTiming('ASAP')}
                />
                <OptionRow
                  icon="calendar-clock"
                  title="Programar pedido"
                  subtitle="Eliges el día y la franja horaria"
                  selected={timing === 'SCHEDULED'}
                  onPress={() => setTiming('SCHEDULED')}
                />

                {timing === 'SCHEDULED' ? (
                  slotsLoading ? (
                    <Skeleton height={78} rounded="md" style={styles.inlineAction} />
                  ) : slotsError ? (
                    <View style={styles.warning}>
                      <MaterialCommunityIcons
                        name="calendar-remove-outline"
                        size={20}
                        color={colors.warning}
                      />
                      <Text style={styles.warningText}>{slotsError}</Text>
                    </View>
                  ) : (
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.slots}
                    >
                      {slots.map((slot) => {
                        const label = slotLabel(slot);
                        const active = slot.id === slotId;
                        return (
                          <Pressable
                            key={slot.id}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: active }}
                            accessibilityLabel={`${label.day}, ${label.range}`}
                            onPress={() => {
                              void Haptics.selectionAsync();
                              setSlotId(slot.id);
                            }}
                            style={({ pressed }) => [
                              styles.slot,
                              active && styles.slotActive,
                              pressed && styles.pressed,
                            ]}
                          >
                            <Text style={[styles.slotDay, active && styles.slotTextActive]}>
                              {label.day}
                            </Text>
                            <Text style={[styles.slotRange, active && styles.slotTextActive]}>
                              {label.range}
                            </Text>
                            <Text style={[styles.slotSeats, active && styles.slotTextActive]}>
                              {slot.available} cupos
                            </Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>
                  )
                ) : null}
              </Section>

              <Section
                icon="account-outline"
                title="Datos de contacto"
                description="Solo para coordinar este pedido; no cambian tu cuenta."
              >
                <FormField
                  label="Nombre de quien recibe"
                  value={contactName}
                  onChangeText={(value) => {
                    setContactName(value);
                    setErrors((current) => ({ ...current, contactName: undefined }));
                  }}
                  placeholder="Para quién es el pedido"
                  autoComplete="name"
                  maxLength={120}
                  icon="account-outline"
                  error={errors.contactName}
                  hint={contactName === profileName && profileName ? 'De tu cuenta' : undefined}
                />

                <FormField
                  label="Teléfono de contacto"
                  value={contactPhone}
                  onChangeText={(value) => {
                    setContactPhone(value.replace(/[^0-9+\s-]/g, ''));
                    setErrors((current) => ({ ...current, contactPhone: undefined }));
                  }}
                  placeholder="999 888 777"
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  maxLength={20}
                  icon="phone-outline"
                  error={errors.contactPhone}
                  hint={
                    user?.phone && contactPhone === user.phone
                      ? 'De tu cuenta'
                      : 'El repartidor llamará a este número'
                  }
                />

                <FormField
                  label="Indicaciones para cocina"
                  value={kitchenNotes}
                  onChangeText={setKitchenNotes}
                  placeholder="Salsa aparte, sin cubiertos…"
                  maxLength={250}
                  multiline
                  icon="chef-hat"
                />

                <FormField
                  label="Indicaciones para reparto"
                  value={deliveryNotes}
                  onChangeText={setDeliveryNotes}
                  placeholder="Tocar el timbre, dejar en recepción…"
                  maxLength={250}
                  multiline
                  icon="moped-outline"
                />
              </Section>

              {!fiscalEnabled ? (
                <Section
                  icon="receipt-text-outline"
                  title="Ticket interno"
                  description="Recibiras un resumen del pedido, sin serie ni correlativo fiscal."
                >
                  <View style={styles.notice}>
                    <MaterialCommunityIcons name="information-outline" size={19} color={colors.brand700} />
                    <Text style={styles.noticeText}>El ticket usa el numero de tu pedido para identificar la entrega. No es una boleta ni una factura.</Text>
                  </View>
                </Section>
              ) : <Section
                icon="receipt-text-outline"
                title="Comprobante"
                description="Boleta por defecto; factura si necesitas sustentar el gasto."
              >
                <View style={styles.segment}>
                  {(['BOLETA', 'FACTURA'] as const).map((value) => {
                    const active = documentType === value;
                    return (
                      <Pressable
                        key={value}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        onPress={() => {
                          void Haptics.selectionAsync();
                          setDocumentType(value);
                          setErrors((current) => ({ ...current, billing: undefined }));
                        }}
                        style={[styles.segmentButton, active && styles.segmentActive]}
                      >
                        <Text style={[styles.segmentText, active && styles.segmentTextActive]}>
                          {value === 'BOLETA' ? 'Boleta' : 'Factura'}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                {documentType === 'FACTURA' ? (
                  <>
                    <FormField
                      label="RUC"
                      value={ruc}
                      onChangeText={(value) => {
                        setRuc(value.replace(/\D/g, '').slice(0, 11));
                        setErrors((current) => ({ ...current, billing: undefined }));
                      }}
                      placeholder="20123456789"
                      keyboardType="number-pad"
                      maxLength={11}
                      icon="card-account-details-outline"
                      error={errors.billing}
                    />
                    <FormField
                      label="Razón social"
                      value={billingName}
                      onChangeText={(value) => {
                        setBillingName(value);
                        setErrors((current) => ({ ...current, billing: undefined }));
                      }}
                      placeholder="Mi Empresa S.A.C."
                      maxLength={200}
                      icon="office-building-outline"
                    />
                    <FormField
                      label="Domicilio fiscal"
                      value={billingAddress}
                      onChangeText={(value) => {
                        setBillingAddress(value);
                        setErrors((current) => ({ ...current, billing: undefined }));
                      }}
                      placeholder="Av. Ejemplo 123, Lima"
                      maxLength={200}
                      icon="map-marker-outline"
                    />
                  </>
                ) : boletaNeedsDni ? (
                  <>
                    <FormField
                      label="DNI"
                      value={dni}
                      onChangeText={(value) => {
                        setDni(value.replace(/\D/g, '').slice(0, 8));
                        setErrors((current) => ({ ...current, billing: undefined }));
                      }}
                      placeholder="12345678"
                      keyboardType="number-pad"
                      maxLength={8}
                      icon="card-account-details-outline"
                      error={errors.billing}
                    />
                    {/* Se avisa AQUÍ, no al confirmar: el rechazo llegaba con el
                        pedido ya intentado y sin decir por qué. */}
                    <View style={styles.notice}>
                      <MaterialCommunityIcons
                        name="information-outline"
                        size={19}
                        color={colors.brand700}
                      />
                      <Text style={styles.noticeText}>
                        Desde {boletaThreshold !== null ? money(boletaThreshold) : ''}, SUNAT exige
                        identificar la boleta con tu DNI.
                      </Text>
                    </View>
                  </>
                ) : (
                  <Text style={styles.hint}>
                    La boleta queda solicitada con tu pedido. Podrás revisar su estado y descargarla
                    desde Pedidos cuando el emisor electrónico la confirme.
                  </Text>
                )}
              </Section>}

              <Section
                icon="credit-card-outline"
                title="¿Cómo quieres pagar?"
                description="Todo se cobra fuera de la app o al recibir el pedido."
              >
                {!config && settings.error ? (
                  <View style={styles.warning}>
                    <MaterialCommunityIcons name="cloud-alert-outline" size={20} color={colors.warning} />
                    <View style={styles.optionCopy}>
                      <Text style={styles.warningText}>
                        No pudimos leer los medios de pago habilitados. Sin ese dato no te
                        ofrecemos ninguno para que el servidor no rechace tu pedido al final.
                      </Text>
                      <PrimaryButton
                        label="Reintentar"
                        variant="secondary"
                        onPress={() => void settings.refetch()}
                        style={styles.inlineAction}
                      />
                    </View>
                  </View>
                ) : !config ? (
                  <Skeleton height={70} rounded="md" count={2} />
                ) : !needsPayment ? (
                  <View style={styles.notice}>
                    <MaterialCommunityIcons name="wallet-outline" size={19} color={colors.brand700} />
                    <Text style={styles.noticeText}>
                      Tu saldo cubre todo el pedido: no hay nada que cobrar.
                    </Text>
                  </View>
                ) : (
                  <>
                    {paymentOptions.map((option) => (
                      <OptionRow
                        key={option.value}
                        icon={option.icon}
                        title={option.label}
                        subtitle={option.hint}
                        selected={paymentMethod === option.value}
                        onPress={() => setPaymentMethod(option.value)}
                      />
                    ))}

                    {config.cod.enabled && !codAvailable && quote !== null ? (
                      <Text style={styles.hint}>
                        El efectivo está disponible hasta {money(config.cod.maxAmount)}.
                      </Text>
                    ) : null}

                    {localPayment && quote ? (
                      <View style={styles.mobilePayment}>
                        <Text style={styles.mobilePaymentEyebrow}>PAGA EL IMPORTE EXACTO</Text>
                        <Text style={styles.mobilePaymentAmount}>{money(quote.grandTotal)}</Text>

                        {localPayment.qr ? (
                          <AppImage
                            uri={localPayment.qr}
                            contentFit="contain"
                            style={styles.qr}
                            accessibilityLabel={`Código QR de ${localPayment.name}`}
                            fallbackIcon="qrcode"
                          />
                        ) : null}

                        <Text style={styles.mobilePaymentAccount}>
                          {localPayment.name} · {localPayment.phone}
                        </Text>
                        <Text style={styles.mobilePaymentRecipient}>{localPayment.recipient}</Text>
                        <Text style={styles.mobilePaymentCopy}>{localPayment.instructions}</Text>

                        <FormField
                          label="Código de operación"
                          value={operationCode}
                          onChangeText={(value) => {
                            setOperationCode(value.replace(/[^A-Za-z0-9-]/g, '').toUpperCase());
                            setErrors((current) => ({ ...current, operationCode: undefined }));
                          }}
                          placeholder="Ej. 12345678"
                          maxLength={24}
                          autoCapitalize="characters"
                          icon="identifier"
                          error={errors.operationCode}
                        />
                        <FormField
                          label="Celular desde el que pagaste (opcional)"
                          value={payerPhone}
                          onChangeText={(value) => {
                            setPayerPhone(value.replace(/\D/g, '').slice(0, 9));
                            setErrors((current) => ({ ...current, payerPhone: undefined }));
                          }}
                          placeholder="999999999"
                          keyboardType="number-pad"
                          maxLength={9}
                          icon="cellphone"
                          error={errors.payerPhone}
                        />

                        <View style={styles.notice}>
                          <MaterialCommunityIcons
                            name="shield-check-outline"
                            size={19}
                            color={colors.brand700}
                          />
                          <Text style={styles.noticeText}>
                            Caja contrasta el código con el movimiento real. Cocina recibe tu pedido
                            solo después de esa aprobación.
                          </Text>
                        </View>
                      </View>
                    ) : null}
                  </>
                )}
              </Section>

              <Section
                icon="ticket-percent-outline"
                title="Cupón o promoción"
                description="El total se vuelve a validar en el servidor al aplicarlo."
              >
                <View style={styles.couponRow}>
                  <View style={styles.couponField}>
                    <FormField
                      label="Código"
                      value={couponInput}
                      onChangeText={(value) => setCouponInput(value.toUpperCase().trim())}
                      placeholder="VERDE10"
                      autoCapitalize="characters"
                      maxLength={40}
                      icon="tag-outline"
                    />
                  </View>

                  <PrimaryButton
                    label={appliedCoupon ? 'Quitar' : 'Aplicar'}
                    variant="secondary"
                    onPress={() => {
                      void Haptics.selectionAsync();
                      if (appliedCoupon) {
                        setCouponInput('');
                        setAppliedCoupon(null);
                        return;
                      }
                      setAppliedCoupon(couponInput.trim() || null);
                    }}
                    style={styles.couponButton}
                  />
                </View>

                {quote?.discounts.map((discount) => (
                  <View key={`${discount.source}-${discount.code}`} style={styles.discountRow}>
                    <MaterialCommunityIcons
                      name="tag-check-outline"
                      size={18}
                      color={colors.success}
                    />
                    <Text style={styles.discountText}>
                      {discount.description} · −{money(discount.amount)}
                    </Text>
                  </View>
                ))}

                {appliedCoupon && !quoting && quote?.discounts.length === 0 ? (
                  <Text style={styles.hint}>El cupón {appliedCoupon} no aplica a este pedido.</Text>
                ) : null}
              </Section>

              {quoteError ? (
                <View style={styles.errorCard}>
                  <MaterialCommunityIcons
                    name="alert-circle-outline"
                    size={20}
                    color={colors.danger}
                  />
                  <View style={styles.optionCopy}>
                    <Text style={styles.errorText}>
                      {quoteError}
                      {quote ? ' Mientras tanto ves los importes de la última cotización válida.' : ''}
                    </Text>
                    <PrimaryButton
                      label="Reintentar"
                      variant="secondary"
                      loading={quoting}
                      onPress={retryQuote}
                      style={styles.inlineAction}
                    />
                  </View>
                </View>
              ) : null}

              {quote ? (
                <View style={styles.summary}>
                  <Text style={styles.summaryTitle}>Resumen validado por el servidor</Text>

                  {[
                    ['Subtotal', quote.subtotal],
                    [serviceMode === 'PICKUP' ? 'Recojo en tienda' : 'Delivery', quote.deliveryFee],
                    ...(quote.discountTotal > 0
                      ? ([['Descuentos', -quote.discountTotal]] as Array<[string, number]>)
                      : []),
                  ].map(([label, value]) => (
                    <View key={String(label)} style={styles.summaryRow}>
                      <Text style={styles.summaryLabel}>{label}</Text>
                      <Text style={styles.summaryValue}>{money(Number(value))}</Text>
                    </View>
                  ))}

                  {quote.walletBalance > 0 ? (
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: useWallet }}
                      accessibilityLabel={`Usar mi saldo de ${money(quote.walletBalance)}`}
                      onPress={() => {
                        void Haptics.selectionAsync();
                        setUseWallet((value) => !value);
                      }}
                      style={({ pressed }) => [
                        styles.wallet,
                        useWallet && styles.walletActive,
                        pressed && styles.pressed,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="wallet-outline"
                        size={22}
                        color={colors.brand700}
                      />
                      <View style={styles.optionCopy}>
                        <Text style={styles.optionTitle}>
                          Usar mi saldo ({money(quote.walletBalance)})
                        </Text>
                        <Text style={styles.optionSubtitle}>
                          {useWallet
                            ? `Se aplican ${money(quote.walletAmount)} a este pedido.`
                            : 'Tu saldo se conserva para después.'}
                        </Text>
                      </View>
                      <MaterialCommunityIcons
                        name={useWallet ? 'checkbox-marked' : 'checkbox-blank-outline'}
                        size={23}
                        color={useWallet ? colors.brand600 : colors.inkMuted}
                      />
                    </Pressable>
                  ) : null}

                  {quote.walletAmount > 0 ? (
                    <View style={styles.summaryRow}>
                      <Text style={styles.summaryPositive}>Saldo aplicado</Text>
                      <Text style={styles.summaryPositive}>− {money(quote.walletAmount)}</Text>
                    </View>
                  ) : null}

                  <View style={styles.totalRow}>
                    <View style={styles.optionCopy}>
                      <Text style={styles.totalLabel}>
                        {quote.grandTotal === 0 ? 'Cubierto con tu saldo' : 'Por pagar'}
                      </Text>
                      <Text style={styles.totalTax}>Incluye IGV {money(quote.taxTotal)}</Text>
                    </View>
                    <Text style={styles.totalValue}>{money(quote.grandTotal)}</Text>
                  </View>

                  <View style={styles.notice}>
                    <MaterialCommunityIcons
                      name={timing === 'SCHEDULED' ? 'calendar-check' : 'clock-fast'}
                      size={19}
                      color={colors.brand700}
                    />
                    <Text style={styles.noticeText}>
                      {timing === 'SCHEDULED'
                        ? `Franja reservada al confirmar · ${quote.branchName}`
                        : `${quote.branchName} · aprox. ${quote.etaMinutes} min`}
                      {quote.demandLevel === 'HIGH' ? ' · demanda alta ahora mismo' : ''}
                    </Text>
                  </View>

                  {!quote.meetsMinimum ? (
                    <Text style={styles.minimum}>
                      Agrega {money(missingForMinimum)} para alcanzar el pedido mínimo de{' '}
                      {money(quote.minimumOrder)}.
                    </Text>
                  ) : null}
                </View>
              ) : null}

              <View style={styles.trust}>
                <MaterialCommunityIcons
                  name="shield-check-outline"
                  size={19}
                  color={colors.brand700}
                />
                <Text style={styles.trustText}>
                  El servidor vuelve a validar precios, stock, saldo, franja y cupón. Confirmar dos
                  veces no duplica tu pedido.
                </Text>
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  loading: {
    paddingTop: spacing.sm,
  },
  loadingBlock: {
    marginTop: spacing.md,
  },
  section: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    padding: spacing.md,
    ...shadow.sm,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
  },
  sectionIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.sm + 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand50,
  },
  sectionHeading: {
    flex: 1,
  },
  sectionTitle: {
    ...type.heading,
    color: colors.ink,
  },
  sectionDescription: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 2,
  },
  sectionBody: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    minHeight: 62,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: spacing.sm + spacing.xs,
    paddingVertical: spacing.sm + spacing.xs,
  },
  optionActive: {
    borderColor: '#83b99c',
    backgroundColor: colors.brand50,
  },
  optionCopy: {
    flex: 1,
  },
  optionTitle: {
    ...type.body,
    fontWeight: '800',
    color: colors.ink,
  },
  optionSubtitle: {
    ...type.bodySm,
    color: colors.inkMuted,
    marginTop: 2,
  },
  branchCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    backgroundColor: colors.brand50,
    borderRadius: radius.md,
    padding: spacing.sm + spacing.xs,
  },
  warning: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: '#fff8e8',
    borderRadius: radius.md,
    padding: spacing.sm + spacing.xs,
  },
  warningText: {
    ...type.bodySm,
    flex: 1,
    color: '#7a4f00',
  },
  notice: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: colors.brand50,
    borderRadius: radius.md,
    padding: spacing.sm + spacing.xs,
  },
  noticeText: {
    ...type.bodySm,
    flex: 1,
    color: colors.brand800,
  },
  hint: {
    ...type.bodySm,
    color: colors.inkMuted,
  },
  inlineAction: {
    marginTop: spacing.sm,
  },
  slots: {
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  slot: {
    minWidth: 150,
    minHeight: 78,
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    padding: spacing.sm + spacing.xs,
  },
  slotActive: {
    backgroundColor: colors.brand700,
    borderColor: colors.brand700,
  },
  slotDay: {
    ...type.label,
    color: colors.ink,
    textTransform: 'capitalize',
  },
  slotRange: {
    ...type.body,
    fontWeight: '800',
    color: colors.brand700,
    marginTop: 3,
  },
  slotSeats: {
    ...type.caption,
    color: colors.inkMuted,
    marginTop: 3,
  },
  slotTextActive: {
    color: colors.onDark,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    padding: 4,
  },
  segmentButton: {
    flex: 1,
    minHeight: layout.minTouch,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm + 2,
  },
  segmentActive: {
    backgroundColor: colors.surface,
    ...shadow.sm,
  },
  segmentText: {
    ...type.body,
    fontWeight: '800',
    color: colors.inkMuted,
  },
  segmentTextActive: {
    color: colors.brand700,
  },
  mobilePayment: {
    backgroundColor: '#f7f1ff',
    borderWidth: 1,
    borderColor: '#dac5f4',
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  mobilePaymentEyebrow: {
    ...type.label,
    color: '#5b3b91',
    textTransform: 'uppercase',
  },
  mobilePaymentAmount: {
    ...type.display,
    color: colors.ink,
  },
  qr: {
    width: 176,
    height: 176,
    alignSelf: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  mobilePaymentAccount: {
    ...type.heading,
    color: colors.ink,
    textAlign: 'center',
  },
  mobilePaymentRecipient: {
    ...type.bodySm,
    color: colors.inkMuted,
    textAlign: 'center',
  },
  mobilePaymentCopy: {
    ...type.bodySm,
    color: '#5b3b91',
  },
  couponRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  couponField: {
    flex: 1,
  },
  couponButton: {
    marginTop: 27,
    minWidth: 104,
  },
  discountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  discountText: {
    ...type.bodySm,
    flex: 1,
    color: colors.success,
    fontWeight: '700',
  },
  errorCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    backgroundColor: '#fff1f1',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#f3d3d3',
    padding: spacing.md,
  },
  errorText: {
    ...type.bodySm,
    color: '#8e2020',
  },
  summary: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    padding: spacing.md,
    gap: spacing.sm,
    ...shadow.sm,
  },
  summaryTitle: {
    ...type.heading,
    color: colors.ink,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  summaryLabel: {
    ...type.body,
    color: colors.inkMuted,
  },
  summaryValue: {
    ...type.body,
    fontWeight: '700',
    color: colors.ink,
  },
  summaryPositive: {
    ...type.body,
    fontWeight: '800',
    color: colors.success,
  },
  wallet: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm + spacing.xs,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.sm + spacing.xs,
  },
  walletActive: {
    backgroundColor: colors.brand50,
    borderColor: '#83b99c',
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: spacing.sm + spacing.xs,
  },
  totalLabel: {
    ...type.heading,
    color: colors.ink,
  },
  totalTax: {
    ...type.caption,
    color: colors.inkMuted,
    marginTop: 2,
  },
  totalValue: {
    ...type.title,
    color: colors.brand700,
  },
  minimum: {
    ...type.bodySm,
    color: colors.danger,
    fontWeight: '700',
  },
  trust: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-start',
    paddingHorizontal: spacing.xs,
  },
  trustText: {
    ...type.caption,
    flex: 1,
    color: colors.inkMuted,
    lineHeight: 18,
  },
  footer: {
    paddingBottom: spacing.sm,
  },
  footerTotals: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  footerLabel: {
    ...type.bodySm,
    flex: 1,
    color: colors.inkMuted,
  },
  footerValue: {
    ...type.title,
    color: colors.brand700,
  },
  changeAddress: {
    minHeight: layout.minTouch,
    marginBottom: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  changeAddressText: {
    ...type.bodySm,
    color: colors.brand700,
    fontWeight: '800',
  },
  pressed: {
    opacity: 0.75,
  },
});
