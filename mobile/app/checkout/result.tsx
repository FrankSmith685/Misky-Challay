import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ordersApi } from '../../src/services/api/orders.service';
import { colors, radius, spacing } from '../../src/theme/tokens';
import type { OrderWithPayment } from '../../src/types/domain';

export default function CheckoutResultScreen() {
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{
    orderNumber: string; status?: string; total?: string; checkoutUrl?: string;
    payment?: string; provider?: string;
  }>();
  const [data, setData] = useState<OrderWithPayment | null>(null);
  const [checking, setChecking] = useState(Boolean(params.payment));
  const [gaveUp, setGaveUp] = useState(false);

  useEffect(() => {
    if (!params.orderNumber || !params.payment) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    let attempts = 0;
    const poll = async () => {
      try {
        const result = await ordersApi.detail(params.orderNumber);
        if (!active) return;
        setData(result);
        attempts += 1;
        if (result.order.status !== 'PENDING_PAYMENT') { setChecking(false); return; }
        if (attempts < 10 && params.payment !== 'cancelado') timer = setTimeout(poll, 1500);
        else { setChecking(false); setGaveUp(true); }
      } catch { if (active) { setChecking(false); setGaveUp(true); } }
    };
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [params.orderNumber, params.payment]);

  const orderStatus = data?.order.status ?? params.status ?? 'PENDING_PAYMENT';
  const total = Number(data?.order.grandTotal ?? params.total ?? 0);
  const checkoutUrl = data?.payment?.checkoutUrl ?? params.checkoutUrl;
  const confirmed = orderStatus !== 'PENDING_PAYMENT' && orderStatus !== 'CANCELLED' && orderStatus !== 'REFUNDED';
  const cancelled = params.payment === 'cancelado' || orderStatus === 'CANCELLED';
  const provider = data?.payment?.provider ?? params.provider;
  const isMobilePayment = provider === 'yape' || provider === 'plin';
  const openPayment = async () => {
    if (checkoutUrl && await Linking.canOpenURL(checkoutUrl)) await Linking.openURL(checkoutUrl);
  };
  const icon = checking ? 'progress-clock' : confirmed ? 'check-bold' : cancelled
    ? 'credit-card-remove-outline' : isMobilePayment ? 'cellphone-check' : 'credit-card-clock-outline';

  const eyebrow = checking ? 'VERIFICANDO CON EL BANCO' : confirmed ? 'PEDIDO CONFIRMADO'
    : cancelled ? 'PAGO NO COMPLETADO' : isMobilePayment ? 'VALIDACIÓN DE CAJA' : 'PEDIDO CREADO';
  const title = checking ? 'Un momento…' : confirmed ? '¡Todo listo!' : cancelled
    ? 'Tu pedido sigue reservado' : isMobilePayment ? 'Recibimos tu código' : 'Completa tu pago';
  const copy = checking
    ? 'Consultamos el estado real del pedido; no confiamos solamente en la pantalla del proveedor.'
    : confirmed ? 'Cocina recibió la confirmación y podrás seguir cada cambio desde la app.'
      : cancelled ? 'Puedes retomar el pago o cancelar el pedido desde su detalle para liberar la reserva.'
        : isMobilePayment ? 'Caja verificará el movimiento real. Cocina solo recibirá el pedido cuando el pago sea aprobado.'
          : gaveUp ? 'La confirmación está tardando. Revisa el pedido nuevamente en unos segundos.'
            : 'Cocina esperará la confirmación del proveedor.';

  return (
    <ScrollView style={styles.page} contentContainerStyle={[styles.content, { paddingTop: insets.top + 40 }]}>
      <View style={styles.icon}><MaterialCommunityIcons name={icon} size={48} color={colors.surface} /></View>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.copy}>{copy}</Text>
      <View style={styles.receipt}>
        <View style={styles.row}><Text style={styles.label}>Pedido</Text><Text style={styles.value}>{params.orderNumber}</Text></View>
        <View style={styles.row}><Text style={styles.label}>Estado</Text><Text style={styles.value}>{isMobilePayment && orderStatus === 'PENDING_PAYMENT' ? 'VALIDANDO PAGO' : orderStatus}</Text></View>
        <View style={styles.divider} />
        <View style={styles.row}><Text style={styles.totalLabel}>Total</Text><Text style={styles.total}>S/ {total.toFixed(2)}</Text></View>
      </View>
      {!confirmed && checkoutUrl && <PrimaryButton label="Retomar pago seguro" onPress={() => void openPayment()} style={styles.button} />}
      <PrimaryButton label="Ver seguimiento" variant={!confirmed && checkoutUrl ? 'secondary' : 'primary'} onPress={() => router.replace({ pathname: '/order/[orderNumber]', params: { orderNumber: params.orderNumber } } as Href)} style={styles.secondary} />
      <View style={styles.note}><MaterialCommunityIcons name="shield-check-outline" size={19} color={colors.brand700} /><Text style={styles.noteText}>{isMobilePayment ? 'Un código escrito no basta para cocinar: Caja debe encontrar el movimiento en la cuenta real.' : 'La app exige tu sesión y consulta el estado real al backend.'}</Text></View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.brand900 },
  content: { flexGrow: 1, alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.xl },
  icon: { width: 90, height: 90, borderRadius: 30, backgroundColor: colors.brand600, alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#94c5aa', fontSize: 10, fontWeight: '900', letterSpacing: 1.3, marginTop: spacing.lg },
  title: { color: colors.surface, fontSize: 32, fontWeight: '900', textAlign: 'center', marginTop: 6 },
  copy: { color: '#bdd5c8', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 9 },
  receipt: { width: '100%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.xl },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 3 },
  label: { color: colors.inkMuted, fontSize: 11 }, value: { color: colors.ink, fontSize: 12, fontWeight: '900' },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 15 },
  totalLabel: { color: colors.ink, fontSize: 14, fontWeight: '900' }, total: { color: colors.brand700, fontSize: 24, fontWeight: '900' },
  button: { width: '100%', marginTop: spacing.lg, backgroundColor: colors.accent500, borderColor: colors.accent500 },
  secondary: { width: '100%', marginTop: 10 },
  note: { flexDirection: 'row', gap: 9, width: '100%', backgroundColor: 'rgba(255,255,255,.08)', borderRadius: radius.md, padding: 13, marginTop: spacing.lg },
  noteText: { flex: 1, color: '#b9d1c5', fontSize: 10, lineHeight: 15 },
});
