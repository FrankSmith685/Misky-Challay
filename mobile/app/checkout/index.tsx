import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router as expoRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { LoadingState } from '../../src/components/ScreenState';
import { useCart } from '../../src/providers/CartProvider';
import { usePurchase } from '../../src/providers/PurchaseProvider';
import { useSession } from '../../src/providers/SessionProvider';
import { accountApi } from '../../src/services/api/account.service';
import { checkoutApi } from '../../src/services/api/checkout.service';
import { businessApi } from '../../src/services/api/business.service';
import { geoApi } from '../../src/services/api/geo.service';
import { mobileAnalytics } from '../../src/services/analytics';
import { colors, radius, spacing } from '../../src/theme/tokens';
import type { Address, CheckoutInput, DeliverySlot, OrderQuote, PublicSettings } from '../../src/types/domain';

const router = expoRouter as { back(): void; push(href: string | object): void; replace(href: string | object): void };
const attemptKey = () => `mobile-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const money = (value: number) => `S/ ${Number(value).toFixed(2)}`;
const slotLabel = (slot: DeliverySlot) => {
  const start = new Date(slot.startsAt); const end = new Date(slot.endsAt);
  const day = start.toLocaleDateString('es-PE', { weekday: 'short', day: '2-digit', month: 'short' });
  const range = `${start.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })} – ${end.toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' })}`;
  return { day, range };
};

export default function CheckoutScreen() {
  const insets = useSafeAreaInsets();
  const { status, user } = useSession();
  const { items, clear } = useCart();
  const { serviceMode, branch } = usePurchase();
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [addressId, setAddressId] = useState<number | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<'ONLINE' | 'CASH' | 'YAPE' | 'PLIN'>('ONLINE');
  const [operationCode, setOperationCode] = useState('');
  const [payerPhone, setPayerPhone] = useState('');
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [timing, setTiming] = useState<'ASAP' | 'SCHEDULED'>('ASAP');
  const [slots, setSlots] = useState<DeliverySlot[]>([]);
  const [slotId, setSlotId] = useState<number | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotsError, setSlotsError] = useState('');
  const [useWallet, setUseWallet] = useState(true);
  const [documentType, setDocumentType] = useState<'BOLETA' | 'FACTURA'>('BOLETA');
  const [docNumber, setDocNumber] = useState('');
  const [billingName, setBillingName] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [notes, setNotes] = useState('');
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const idempotency = useRef(attemptKey());
  const trackedStart = useRef(false);

  useEffect(() => {
    if (status !== 'authenticated') { router.replace({ pathname: '/(auth)/login', params: { returnTo: '/checkout' } }); return; }
    if (!items.length) { router.replace('/(tabs)/cart'); return; }
    if (serviceMode === 'DINE_IN') { router.replace('/scan-table'); return; }
    if (!trackedStart.current) { trackedStart.current = true; void mobileAnalytics.track('CHECKOUT_START', { serviceMode, itemCount: items.length }, branch?.id); }
    void accountApi.addresses().then((rows) => {
      setAddresses(rows); setAddressId(rows.find((row) => row.isDefault)?.id ?? rows[0]?.id ?? null);
    }).catch((caught) => setError(caught instanceof Error ? caught.message : 'No pudimos cargar tus direcciones.')).finally(() => setLoading(false));
    void businessApi.publicSettings().then(setSettings).catch(() => undefined);
  }, [items.length, serviceMode, status]);

  const selectedAddress = addresses.find((row) => row.id === addressId) ?? null;

  useEffect(() => {
    if (timing !== 'SCHEDULED') { setSlots([]); setSlotId(null); setSlotsError(''); return; }
    if (serviceMode === 'PICKUP' && !branch) return;
    if (serviceMode === 'DELIVERY' && !selectedAddress) return;
    let active = true;
    const loadSlots = async () => {
      setSlotsLoading(true); setSlotsError(''); setSlotId(null); setQuote(null);
      try {
        let targetBranchId = branch?.id ?? null;
        if (serviceMode === 'DELIVERY' && selectedAddress) {
          const coverage = await geoApi.coverage({
            districtId: selectedAddress.districtId ?? undefined,
            latitude: selectedAddress.latitude ?? undefined,
            longitude: selectedAddress.longitude ?? undefined,
          });
          targetBranchId = coverage.covered ? coverage.branch?.id ?? null : null;
          if (!targetBranchId) throw new Error(coverage.reason || 'La dirección no tiene una sede asignada.');
        }
        const rows = await geoApi.slots(targetBranchId!, 7);
        if (!active) return;
        setSlots(rows);
        if (rows.length) setSlotId(rows[0].id);
        else setSlotsError('No hay franjas con cupo para los próximos 7 días.');
      } catch (caught) {
        if (active) setSlotsError(caught instanceof Error ? caught.message : 'No pudimos cargar las franjas.');
      } finally { if (active) setSlotsLoading(false); }
    };
    void loadSlots();
    return () => { active = false; };
  }, [addressId, branch, selectedAddress, serviceMode, timing]);

  const input = useMemo<CheckoutInput>(() => ({
    items: items.map((item) => ({ productId: item.productId, variantId: item.variantId, quantity: item.quantity, selections: item.selections.map((row) => ({ optionId: row.optionId, quantity: row.quantity })), specialInstructions: item.specialInstructions })),
    deliveryType: serviceMode === 'PICKUP' ? 'PICKUP' : 'DELIVERY',
    serviceMode: timing,
    ...(timing === 'SCHEDULED' && slotId ? { deliverySlotId: slotId } : {}),
    ...(serviceMode === 'PICKUP' ? { branchId: branch?.id } : selectedAddress ? { address: { label: selectedAddress.label, line1: selectedAddress.line1, reference: selectedAddress.reference || undefined, districtId: selectedAddress.districtId || undefined, latitude: selectedAddress.latitude || undefined, longitude: selectedAddress.longitude || undefined } } : {}),
    couponCode: couponCode.trim() || undefined,
    useWallet,
    paymentMethod,
    ...((paymentMethod === 'YAPE' || paymentMethod === 'PLIN') && operationCode.trim() ? {
      mobilePayment: { operationCode: operationCode.trim(), payerPhone: payerPhone.trim() || undefined },
    } : {}),
    billing: { documentType, docNumber: docNumber.trim() || undefined, name: billingName.trim() || undefined, address: billingAddress.trim() || undefined },
    contactName: [user?.firstName, user?.lastName].filter(Boolean).join(' ') || undefined,
    contactPhone: user?.phone || undefined,
    notes: notes.trim() || undefined,
  }), [billingAddress, billingName, branch?.id, couponCode, docNumber, documentType, items, notes, operationCode, payerPhone, paymentMethod, selectedAddress, serviceMode, slotId, timing, useWallet, user]);

  const hasDestination = serviceMode === 'PICKUP' ? Boolean(branch) : Boolean(selectedAddress);
  const canQuote = items.length > 0 && hasDestination && (timing === 'ASAP' || Boolean(slotId));
  const invalidate = () => setQuote(null);
  const calculate = async () => { if (!canQuote) return; setBusy(true); setError(''); setQuote(null); try { const result = await checkoutApi.quote(input); setQuote(result); void mobileAnalytics.track('CHECKOUT_STEP', { step: 'quoted', serviceMode, total: result.grandTotal }, result.branchId); } catch (caught) { setError(caught instanceof Error ? caught.message : 'No pudimos calcular el pedido.'); } finally { setBusy(false); } };
  const place = async () => {
    if (!quote) return;
    if ((paymentMethod === 'YAPE' || paymentMethod === 'PLIN') && !/^[A-Za-z0-9-]{6,24}$/.test(operationCode.trim())) {
      setError('Ingresa el código de operación que aparece en Yape o Plin.');
      return;
    }
    setBusy(true); setError('');
    try {
      const result = await checkoutApi.place({ ...input, idempotencyKey: idempotency.current });
      void mobileAnalytics.track('ORDER_COMPLETED', { orderNumber: result.orderNumber, total: result.grandTotal, status: result.status }, quote.branchId);
      await clear();
      router.replace({ pathname: '/checkout/result', params: { orderNumber: result.orderNumber, status: result.status, total: String(result.grandTotal), checkoutUrl: result.checkoutUrl || '', provider: result.provider || '' } });
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No pudimos crear el pedido.'); }
    finally { setBusy(false); }
  };

  if (loading) return <View style={[styles.page, { paddingTop: insets.top }]}><LoadingState label="Preparando checkout seguro…" /></View>;
  return <ScrollView keyboardShouldPersistTaps="handled" style={styles.page} contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}>
    <View style={styles.top}><Pressable style={styles.back} onPress={() => router.back()}><MaterialCommunityIcons name="arrow-left" size={22} color={colors.ink} /></Pressable><View><Text style={styles.eyebrow}>ÚLTIMO PASO</Text><Text style={styles.title}>Confirmar pedido</Text></View></View>
    <View style={styles.steps}><View style={styles.stepDone}><MaterialCommunityIcons name="check" size={14} color={colors.surface} /></View><View style={styles.stepLine} /><View style={styles.stepActive}><Text style={styles.stepNumber}>2</Text></View><View style={styles.stepLine} /><View style={styles.stepIdle}><Text style={styles.stepIdleText}>3</Text></View></View>

    <Text style={styles.sectionTitle}>{serviceMode === 'PICKUP' ? 'Local de recojo' : 'Dirección de entrega'}</Text>
    {serviceMode === 'PICKUP' ? branch ? <View style={styles.locationCard}><View style={styles.icon}><MaterialCommunityIcons name="storefront-outline" size={23} color={colors.brand700} /></View><View style={{ flex: 1 }}><Text style={styles.locationTitle}>{branch.name}</Text><Text style={styles.locationCopy}>{branch.addressLine}</Text></View><MaterialCommunityIcons name="check-circle" size={21} color={colors.success} /></View> : <View style={styles.warning}><Text style={styles.warningText}>Selecciona un local desde la barra de ubicación.</Text></View> : addresses.length ? <View style={styles.addresses}>{addresses.map((row) => <Pressable key={row.id} style={[styles.address, row.id === addressId && styles.addressActive]} onPress={() => { setAddressId(row.id); invalidate(); }}><MaterialCommunityIcons name={row.id === addressId ? 'radiobox-marked' : 'radiobox-blank'} size={21} color={row.id === addressId ? colors.brand600 : '#a6b0aa'} /><View style={{ flex: 1 }}><Text style={styles.addressLabel}>{row.label}</Text><Text style={styles.addressLine}>{row.line1}</Text></View></Pressable>)}</View> : <View style={styles.noAddress}><Text style={styles.warningText}>Necesitas una dirección con cobertura.</Text><PrimaryButton label="Agregar dirección" variant="secondary" onPress={() => router.push('/addresses/new')} style={{ marginTop: 10 }} /></View>}

    <Text style={styles.sectionTitle}>¿Cuándo lo quieres?</Text><View style={styles.two}>{([['ASAP', 'clock-fast', 'Lo antes posible'], ['SCHEDULED', 'calendar-clock', 'Programar pedido']] as const).map(([value, icon, label]) => <Pressable key={value} onPress={() => { setTiming(value); invalidate(); }} style={[styles.choice, timing === value && styles.choiceActive]}><MaterialCommunityIcons name={icon} size={24} color={timing === value ? colors.brand700 : colors.inkMuted} /><Text style={styles.choiceText}>{label}</Text><MaterialCommunityIcons name={timing === value ? 'check-circle' : 'circle-outline'} size={19} color={timing === value ? colors.brand600 : '#a6b0aa'} /></Pressable>)}</View>
    {timing === 'SCHEDULED' && <View style={styles.slotsBox}>{slotsLoading ? <View style={styles.loadingRow}><MaterialCommunityIcons name="progress-clock" size={20} color={colors.brand600} /><Text style={styles.loadingText}>Buscando cupos reales…</Text></View> : slotsError ? <View style={styles.slotError}><MaterialCommunityIcons name="calendar-remove-outline" size={21} color={colors.warning} /><Text style={styles.slotErrorText}>{slotsError}</Text></View> : <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.slots}>{slots.map((slot) => { const label = slotLabel(slot); const active = slot.id === slotId; return <Pressable key={slot.id} onPress={() => { setSlotId(slot.id); invalidate(); }} style={[styles.slot, active && styles.slotActive]}><Text style={[styles.slotDay, active && styles.slotDayActive]}>{label.day}</Text><Text style={[styles.slotRange, active && styles.slotRangeActive]}>{label.range}</Text><Text style={styles.slotAvailable}>{slot.available} cupos</Text></Pressable>; })}</ScrollView>}</View>}

    <Text style={styles.sectionTitle}>Medio de pago</Text><View style={styles.paymentChoices}>{([
      ['ONLINE', 'credit-card-outline', 'Pago en línea'],
      ['CASH', 'cash', 'Efectivo'],
      ...(settings?.localPayments.yapeEnabled ? [['YAPE', 'cellphone-check', 'Yape']] : []),
      ...(settings?.localPayments.plinEnabled ? [['PLIN', 'cellphone-check', 'Plin']] : []),
    ] as Array<['ONLINE' | 'CASH' | 'YAPE' | 'PLIN', keyof typeof MaterialCommunityIcons.glyphMap, string]>).map(([value, icon, label]) => <Pressable key={value} onPress={() => { setPaymentMethod(value); invalidate(); }} style={[styles.paymentChoice, paymentMethod === value && styles.choiceActive]}><MaterialCommunityIcons name={icon} size={24} color={paymentMethod === value ? colors.brand700 : colors.inkMuted} /><Text style={styles.choiceText}>{label}</Text><MaterialCommunityIcons name={paymentMethod === value ? 'check-circle' : 'circle-outline'} size={19} color={paymentMethod === value ? colors.brand600 : '#a6b0aa'} /></Pressable>)}</View>
    {(paymentMethod === 'YAPE' || paymentMethod === 'PLIN') && quote && settings && (() => {
      const isYape = paymentMethod === 'YAPE';
      const name = isYape ? 'Yape' : 'Plin';
      const phone = isYape ? settings.localPayments.yapePhone : settings.localPayments.plinPhone;
      const recipient = isYape ? settings.localPayments.yapeRecipient : settings.localPayments.plinRecipient;
      const qr = isYape ? settings.localPayments.yapeQrImageUrl : settings.localPayments.plinQrImageUrl;
      return <View style={styles.mobilePayment}><View style={styles.mobilePaymentHeader}><View><Text style={styles.mobilePaymentEyebrow}>PAGA EL IMPORTE EXACTO</Text><Text style={styles.mobilePaymentAmount}>{money(quote.grandTotal)}</Text></View><MaterialCommunityIcons name="shield-check-outline" size={27} color="#6941a5" /></View>{qr ? <Image source={{ uri: qr }} style={styles.paymentQr} resizeMode="contain" /> : null}<Text style={styles.mobilePaymentAccount}>{name} · {phone}</Text><Text style={styles.mobilePaymentRecipient}>{recipient}</Text><Text style={styles.mobilePaymentCopy}>{settings.localPayments.instructions}</Text><FormField label="Código de operación" value={operationCode} onChangeText={(value) => setOperationCode(value.replace(/[^A-Za-z0-9-]/g, '').toUpperCase())} maxLength={24} placeholder="Ej. 12345678" icon="identifier" /><FormField label="Celular desde el que pagaste (opcional)" value={payerPhone} onChangeText={(value) => setPayerPhone(value.replace(/\D/g, '').slice(0, 9))} maxLength={9} keyboardType="number-pad" placeholder="999999999" icon="cellphone" /><View style={styles.validationNotice}><MaterialCommunityIcons name="chef-hat" size={19} color="#6941a5" /><Text style={styles.validationNoticeText}>Caja validará el movimiento. Cocina solo recibirá tu pedido después de la aprobación.</Text></View></View>;
    })()}

    <Text style={styles.sectionTitle}>Comprobante</Text><View style={styles.segment}>{(['BOLETA', 'FACTURA'] as const).map((value) => <Pressable key={value} onPress={() => { setDocumentType(value); invalidate(); }} style={[styles.segmentButton, documentType === value && styles.segmentActive]}><Text style={[styles.segmentText, documentType === value && styles.segmentTextActive]}>{value === 'BOLETA' ? 'Boleta' : 'Factura'}</Text></Pressable>)}</View>
    <FormField label={documentType === 'FACTURA' ? 'RUC' : 'DNI (opcional)'} keyboardType="number-pad" maxLength={documentType === 'FACTURA' ? 11 : 8} value={docNumber} onChangeText={(value) => { setDocNumber(value.replace(/\D/g, '')); invalidate(); }} placeholder={documentType === 'FACTURA' ? '20123456789' : '12345678'} icon="card-account-details-outline" />
    {documentType === 'FACTURA' && <><FormField label="Razón social" value={billingName} onChangeText={(value) => { setBillingName(value); invalidate(); }} placeholder="Empresa SAC" icon="office-building-outline" /><FormField label="Dirección fiscal" value={billingAddress} onChangeText={(value) => { setBillingAddress(value); invalidate(); }} placeholder="Dirección declarada" icon="map-marker-outline" /></>}
    <FormField label="Cupón" autoCapitalize="characters" value={couponCode} onChangeText={(value) => { setCouponCode(value); invalidate(); }} placeholder="VERDE10" icon="ticket-percent-outline" />
    <FormField label="Indicaciones" value={notes} onChangeText={(value) => { setNotes(value); invalidate(); }} placeholder="Tocar el timbre, sin cubiertos…" icon="message-text-outline" multiline />

    {error ? <View style={styles.error}><MaterialCommunityIcons name="alert-circle-outline" size={20} color={colors.danger} /><Text style={styles.errorText}>{error}</Text></View> : null}
    {quote && <><View style={styles.summary}><Text style={styles.summaryTitle}>Resumen validado</Text>{[['Subtotal', quote.subtotal], ['Delivery', quote.deliveryFee], ['Descuentos', -quote.discountTotal]].map(([label, value]) => <View key={String(label)} style={styles.summaryRow}><Text style={styles.summaryLabel}>{label}</Text><Text style={styles.summaryValue}>{money(Number(value))}</Text></View>)}{quote.walletBalance > 0 && <Pressable style={[styles.walletChoice, useWallet && styles.walletChoiceActive]} onPress={() => { setUseWallet((value) => !value); invalidate(); }}><View style={styles.walletIcon}><MaterialCommunityIcons name="wallet-outline" size={21} color={colors.brand700} /></View><View style={{ flex: 1 }}><Text style={styles.walletTitle}>Usar mi saldo ({money(quote.walletBalance)})</Text><Text style={styles.walletCopy}>{useWallet ? `Se aplican ${money(quote.walletAmount)} a este pedido.` : 'Tu saldo se conservará para después.'}</Text></View><MaterialCommunityIcons name={useWallet ? 'checkbox-marked' : 'checkbox-blank-outline'} size={23} color={useWallet ? colors.brand600 : colors.inkMuted} /></Pressable>}{quote.walletAmount > 0 && <View style={styles.summaryRow}><Text style={styles.walletApplied}>Saldo aplicado</Text><Text style={styles.walletApplied}>− {money(quote.walletAmount)}</Text></View>}<View style={styles.totalRow}><View><Text style={styles.totalLabel}>{quote.grandTotal === 0 ? 'Cubierto con saldo' : 'Por pagar'}</Text><Text style={styles.tax}>Incluye IGV {money(quote.taxTotal)}</Text></View><Text style={styles.total}>{money(quote.grandTotal)}</Text></View><View style={styles.eta}><MaterialCommunityIcons name={timing === 'SCHEDULED' ? 'calendar-check' : 'clock-fast'} size={18} color={colors.brand700} /><Text style={styles.etaText}>{timing === 'SCHEDULED' ? `Franja reservada al confirmar · ${quote.branchName}` : `${quote.branchName} · aprox. ${quote.etaMinutes} min`}</Text></View>{!quote.meetsMinimum && <Text style={styles.minimum}>Pedido mínimo: {money(quote.minimumOrder)}</Text>}</View></>}
    <PrimaryButton loading={busy} disabled={!canQuote || Boolean(quote && (!quote.meetsMinimum || (timing === 'ASAP' && !quote.isOpenNow)))} label={quote ? `Confirmar pedido · ${money(quote.grandTotal)}` : 'Calcular total final'} onPress={() => quote ? void place() : void calculate()} style={styles.mainButton} />
    <View style={styles.trust}><MaterialCommunityIcons name="shield-check-outline" size={19} color={colors.brand700} /><Text style={styles.trustText}>El servidor vuelve a validar precios, stock, saldo, franja y cupón. Tocar dos veces no duplica el pedido.</Text></View>
  </ScrollView>;
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surfaceMuted }, content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl }, top: { flexDirection: 'row', alignItems: 'center', gap: 12 }, back: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line }, eyebrow: { color: colors.brand600, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 }, title: { color: colors.ink, fontSize: 25, fontWeight: '900' }, steps: { flexDirection: 'row', alignItems: 'center', marginVertical: spacing.lg, paddingHorizontal: 35 }, stepDone: { width: 25, height: 25, borderRadius: 13, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' }, stepActive: { width: 29, height: 29, borderRadius: 15, backgroundColor: colors.brand700, alignItems: 'center', justifyContent: 'center' }, stepIdle: { width: 25, height: 25, borderRadius: 13, backgroundColor: colors.line, alignItems: 'center', justifyContent: 'center' }, stepNumber: { color: colors.surface, fontSize: 11, fontWeight: '900' }, stepIdleText: { color: colors.inkMuted, fontSize: 10, fontWeight: '900' }, stepLine: { flex: 1, height: 2, backgroundColor: colors.line }, sectionTitle: { color: colors.ink, fontSize: 16, fontWeight: '900', marginTop: spacing.lg, marginBottom: 9 }, locationCard: { flexDirection: 'row', gap: 11, alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 13 }, icon: { width: 43, height: 43, borderRadius: 14, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center' }, locationTitle: { color: colors.ink, fontSize: 13, fontWeight: '900' }, locationCopy: { color: colors.inkMuted, fontSize: 10, marginTop: 4 }, addresses: { gap: 8 }, address: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 13 }, addressActive: { borderColor: '#83b99c', backgroundColor: colors.brand50 }, addressLabel: { color: colors.ink, fontSize: 12, fontWeight: '900' }, addressLine: { color: colors.inkMuted, fontSize: 10, marginTop: 3 }, noAddress: { backgroundColor: '#fff8e8', borderRadius: radius.md, padding: 14 }, warning: { backgroundColor: '#fff8e8', borderRadius: radius.md, padding: 14 }, warningText: { color: '#805000', fontSize: 11 }, two: { flexDirection: 'row', gap: 8 }, choice: { flex: 1, minHeight: 80, justifyContent: 'center', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 12 }, choiceActive: { borderColor: '#83b99c', backgroundColor: colors.brand50 }, choiceText: { flex: 1, color: colors.ink, fontSize: 11, fontWeight: '800', marginTop: 6 }, slotsBox: { marginTop: 9 }, loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.brand50, borderRadius: radius.md, padding: 13 }, loadingText: { color: colors.brand700, fontSize: 10, fontWeight: '800' }, slotError: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff8e8', borderRadius: radius.md, padding: 13 }, slotErrorText: { flex: 1, color: '#805000', fontSize: 10, lineHeight: 15 }, slots: { gap: 8, paddingVertical: 2 }, slot: { minWidth: 142, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: radius.md, padding: 12 }, slotActive: { backgroundColor: colors.brand700, borderColor: colors.brand700 }, slotDay: { color: colors.ink, fontSize: 10, fontWeight: '900', textTransform: 'capitalize' }, slotDayActive: { color: colors.surface }, slotRange: { color: colors.brand700, fontSize: 11, fontWeight: '900', marginTop: 5 }, slotRangeActive: { color: colors.brand100 }, slotAvailable: { color: colors.inkMuted, fontSize: 8, marginTop: 5 }, segment: { flexDirection: 'row', backgroundColor: colors.line, borderRadius: radius.md, padding: 3, marginBottom: 12 }, segmentButton: { flex: 1, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13 }, segmentActive: { backgroundColor: colors.surface }, segmentText: { color: colors.inkMuted, fontSize: 12, fontWeight: '800' }, segmentTextActive: { color: colors.brand700 }, error: { flexDirection: 'row', gap: 9, backgroundColor: '#fff0f0', borderRadius: radius.md, padding: 12, marginTop: 10 }, errorText: { flex: 1, color: colors.danger, fontSize: 10, lineHeight: 15 }, summary: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, marginTop: spacing.lg }, summaryTitle: { color: colors.ink, fontSize: 16, fontWeight: '900', marginBottom: 10 }, summaryRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 }, summaryLabel: { color: colors.inkMuted, fontSize: 11 }, summaryValue: { color: colors.ink, fontSize: 11, fontWeight: '800' }, walletChoice: { flexDirection: 'row', alignItems: 'center', gap: 9, backgroundColor: colors.surfaceMuted, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 12, marginTop: 13 }, walletChoiceActive: { backgroundColor: colors.brand50, borderColor: '#83b99c' }, walletIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' }, walletTitle: { color: colors.ink, fontSize: 10, fontWeight: '900' }, walletCopy: { color: colors.inkMuted, fontSize: 8, marginTop: 3 }, walletApplied: { color: colors.success, fontSize: 11, fontWeight: '900' }, totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 13, marginTop: 13 }, totalLabel: { color: colors.ink, fontSize: 14, fontWeight: '900' }, tax: { color: colors.inkMuted, fontSize: 8, marginTop: 3 }, total: { color: colors.brand700, fontSize: 24, fontWeight: '900' }, eta: { flexDirection: 'row', gap: 7, backgroundColor: colors.brand50, borderRadius: radius.sm, padding: 10, marginTop: 12 }, etaText: { flex: 1, color: colors.brand700, fontSize: 10, fontWeight: '700' }, minimum: { color: colors.danger, fontSize: 10, fontWeight: '800', marginTop: 10 }, mainButton: { marginTop: spacing.lg }, trust: { flexDirection: 'row', gap: 9, padding: 12, marginTop: 10 }, trustText: { flex: 1, color: colors.inkMuted, fontSize: 9, lineHeight: 14 },
  paymentChoices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  paymentChoice: { width: '48.5%', minHeight: 80, justifyContent: 'center', backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 12 },
  mobilePayment: { marginTop: 10, backgroundColor: '#f7f1ff', borderWidth: 1, borderColor: '#dac5f4', borderRadius: radius.lg, padding: spacing.md },
  mobilePaymentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  mobilePaymentEyebrow: { color: '#6941a5', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  mobilePaymentAmount: { color: colors.ink, fontSize: 28, fontWeight: '900', marginTop: 3 },
  paymentQr: { width: 170, height: 170, alignSelf: 'center', backgroundColor: colors.surface, borderRadius: radius.md, marginTop: 12 },
  mobilePaymentAccount: { color: colors.ink, fontSize: 14, fontWeight: '900', textAlign: 'center', marginTop: 12 },
  mobilePaymentRecipient: { color: colors.inkMuted, fontSize: 10, textAlign: 'center', marginTop: 3 },
  mobilePaymentCopy: { color: '#5d4778', fontSize: 10, lineHeight: 16, marginTop: 12 },
  validationNotice: { flexDirection: 'row', gap: 8, backgroundColor: colors.surface, borderRadius: radius.md, padding: 11, marginTop: 12 },
  validationNoticeText: { flex: 1, color: '#5d4778', fontSize: 9, lineHeight: 14 },
});
