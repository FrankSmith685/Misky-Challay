import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ErrorState, LoadingState } from '../../src/components/ScreenState';
import { useSession } from '../../src/providers/SessionProvider';
import { ordersApi } from '../../src/services/api/orders.service';
import { colors, radius, spacing } from '../../src/theme/tokens';
import type { OrderStatus, OrderSummary } from '../../src/types/domain';

const STATUS: Record<OrderStatus, { label: string; color: string; bg: string }> = {
  PENDING_PAYMENT: { label: 'Pago pendiente', color: '#8a5b00', bg: '#fff5dc' },
  CONFIRMED: { label: 'Confirmado', color: colors.brand700, bg: colors.brand50 },
  PREPARING: { label: 'En preparación', color: '#9b5e00', bg: '#fff4dc' },
  READY: { label: 'Listo', color: '#136a4a', bg: '#dff5e9' },
  OUT_FOR_DELIVERY: { label: 'En camino', color: '#285f9b', bg: '#e9f3ff' },
  DELIVERED: { label: 'Entregado', color: '#136a4a', bg: '#dff5e9' },
  CANCELLED: { label: 'Cancelado', color: '#a43a3a', bg: '#fff0f0' },
  REFUNDED: { label: 'Reembolsado', color: '#6d518d', bg: '#f4edff' },
};

export default function OrdersScreen() {
  const insets = useSafeAreaInsets();
  const { status } = useSession();
  const [orders, setOrders] = useState<OrderSummary[]>([]);
  const [loading, setLoading] = useState(status === 'authenticated');
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (refresh = false) => {
    if (status !== 'authenticated') return;
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try { setOrders(await ordersApi.list()); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'No pudimos cargar tus pedidos.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  if (status !== 'authenticated') {
    return (
      <View style={[styles.guestPage, { paddingTop: insets.top + 30 }]}>
        <View style={styles.guestIcon}><MaterialCommunityIcons name="receipt-text-outline" size={42} color={colors.brand700} /></View>
        <Text style={styles.guestTitle}>Tus pedidos, en un solo lugar</Text>
        <Text style={styles.guestCopy}>Inicia sesión para seguir la preparación, revisar entregas anteriores y volver a pedir.</Text>
        <PrimaryButton label="Iniciar sesión" onPress={() => router.push('/(auth)/login')} style={styles.guestButton} />
        <PrimaryButton label="Crear cuenta" variant="secondary" onPress={() => router.push('/(auth)/register')} style={styles.secondaryButton} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.page} contentContainerStyle={[styles.content, { paddingTop: insets.top + 18 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.brand600} />}>
      <Text style={styles.eyebrow}>TU HISTORIAL</Text><Text style={styles.title}>Mis pedidos</Text><Text style={styles.subtitle}>Sigue el estado y conserva el detalle de cada compra.</Text>
      {loading ? <LoadingState label="Buscando tus pedidos…" /> : error ? <ErrorState message={error} onRetry={() => void load()} /> : orders.length === 0 ? (
        <View style={styles.empty}><MaterialCommunityIcons name="shopping-outline" size={40} color={colors.brand600} /><Text style={styles.emptyTitle}>Todavía no tienes pedidos</Text><Text style={styles.emptyCopy}>Explora el menú y encuentra tu primer bowl.</Text><PrimaryButton label="Ver menú" onPress={() => router.push('/(tabs)/menu')} style={styles.emptyButton} /></View>
      ) : orders.map((order) => {
        const statusView = STATUS[order.status] ?? STATUS.CONFIRMED;
        return (
          <Pressable key={order.id} onPress={() => router.push({ pathname: '/order/[orderNumber]', params: { orderNumber: order.orderNumber } } as Href)} style={styles.orderCard}>
            <View style={styles.orderTop}><View><Text style={styles.orderNumber}>Pedido {order.orderNumber}</Text><Text style={styles.orderDate}>{new Date(order.placedAt).toLocaleDateString('es-PE', { day: '2-digit', month: 'short', year: 'numeric' })}</Text></View><View style={[styles.badge, { backgroundColor: statusView.bg }]}><Text style={[styles.badgeText, { color: statusView.color }]}>{statusView.label}</Text></View></View>
            <View style={styles.divider} />
            <View style={styles.orderBottom}><View style={styles.branchRow}><MaterialCommunityIcons name="storefront-outline" size={17} color={colors.brand700} /><Text numberOfLines={1} style={styles.branchName}>{order.branch?.name ?? 'Verde Bowl'}</Text></View><Text style={styles.total}>S/ {Number(order.grandTotal).toFixed(2)}</Text></View>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surfaceMuted },
  content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  eyebrow: { color: colors.brand600, fontSize: 10, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: colors.ink, fontSize: 30, fontWeight: '900', letterSpacing: -0.8, marginTop: 4 },
  subtitle: { color: colors.inkMuted, fontSize: 13, lineHeight: 20, marginTop: 6, marginBottom: spacing.lg },
  guestPage: { flex: 1, backgroundColor: colors.surfaceMuted, paddingHorizontal: spacing.xl, alignItems: 'center', justifyContent: 'center' },
  guestIcon: { width: 76, height: 76, borderRadius: 25, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand50 },
  guestTitle: { color: colors.ink, fontSize: 24, fontWeight: '900', textAlign: 'center', marginTop: spacing.lg },
  guestCopy: { color: colors.inkMuted, fontSize: 14, lineHeight: 22, textAlign: 'center', marginTop: 9 },
  guestButton: { width: '100%', marginTop: spacing.xl },
  secondaryButton: { width: '100%', marginTop: 10 },
  empty: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, alignItems: 'center', padding: spacing.xl, marginTop: spacing.lg },
  emptyTitle: { color: colors.ink, fontSize: 17, fontWeight: '900', marginTop: 12 },
  emptyCopy: { color: colors.inkMuted, fontSize: 12, marginTop: 5 },
  emptyButton: { marginTop: spacing.lg, minWidth: 180 },
  orderCard: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 15, marginBottom: 10 },
  orderTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 },
  orderNumber: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  orderDate: { color: colors.inkMuted, fontSize: 10, marginTop: 4 },
  badge: { borderRadius: radius.pill, paddingHorizontal: 10, paddingVertical: 6 },
  badgeText: { fontSize: 9, fontWeight: '900' },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 13 },
  orderBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  branchRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7 },
  branchName: { flex: 1, color: colors.inkMuted, fontSize: 11, fontWeight: '700' },
  total: { color: colors.brand700, fontSize: 15, fontWeight: '900' },
});
