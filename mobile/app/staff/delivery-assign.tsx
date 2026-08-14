import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { useResource } from '../../src/hooks/useResource';
import { useToast } from '../../src/providers/ToastProvider';
import { staffApi, type StaffRow } from '../../src/services/api/staff.service';
import { colors, radius, shadow, spacing, type } from '../../src/theme/tokens';

const text = (value: unknown, fallback = '—') => value === null || value === undefined || value === '' ? fallback : String(value);

export default function DeliveryAssignScreen() {
  const params = useLocalSearchParams<{ deliveryId?: string; branchId?: string }>();
  const deliveryId = Number(params.deliveryId);
  const branchId = Number(params.branchId);
  const toast = useToast();
  const resource = useResource<StaffRow[]>({ key: branchId ? `staff:drivers:${branchId}` : null, fetcher: () => staffApi.drivers(branchId), cacheMs: 20_000 });
  const assign = async (driver: StaffRow) => {
    try {
      await staffApi.assignDriver(deliveryId, Number(driver.id), 'Asignado desde la app móvil');
      toast.show({ tone: 'success', message: `${text(driver.fullName)} quedó asignado al reparto.` });
      router.back();
    } catch (error) { toast.show({ tone: 'error', message: error instanceof Error ? error.message : 'No pudimos asignar el reparto.' }); }
  };
  return <ScreenScaffold title="Asignar repartidor" subtitle={`Entrega #${deliveryId} · Local #${branchId}`} showBack>
    <FlatList data={resource.data ?? []} keyExtractor={(item) => String(item.id)} contentContainerStyle={styles.content} ListHeaderComponent={<View style={styles.guide}><MaterialCommunityIcons name="bike-fast" size={30} color={colors.brand700} /><View style={styles.copy}><Text style={styles.title}>Personal disponible</Text><Text style={styles.muted}>El cambio se reflejará de inmediato en web, cocina y seguimiento.</Text></View></View>} ListEmptyComponent={!resource.loading ? <View style={styles.empty}><Text style={styles.title}>No hay repartidores disponibles</Text><Text style={styles.muted}>Revisa el estado de la flota o utiliza un proveedor externo desde el panel web.</Text><PrimaryButton label="Reintentar" variant="secondary" onPress={() => void resource.refetch()} /></View> : null} renderItem={({ item }) => <Pressable onPress={() => void assign(item)} style={({ pressed }) => [styles.card, shadow.sm, pressed && styles.pressed]}><View style={styles.avatar}><MaterialCommunityIcons name="account" size={24} color={colors.brand700} /></View><View style={styles.copy}><Text style={styles.title}>{text(item.fullName)}</Text><Text style={styles.muted}>{text(item.vehicle, 'Vehículo no informado')} · {text(item.phone, 'sin teléfono')}</Text></View><View style={styles.status}><Text style={styles.statusText}>{text(item.status)}</Text></View></Pressable>} />
  </ScreenScaffold>;
}
const styles = StyleSheet.create({ content: { gap: spacing.sm, padding: spacing.md, paddingBottom: spacing.xxl }, guide: { flexDirection: 'row', gap: spacing.md, alignItems: 'center', borderRadius: radius.lg, backgroundColor: colors.brand50, padding: spacing.md, marginBottom: spacing.sm }, card: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.lineSoft, backgroundColor: colors.surface, padding: spacing.md }, avatar: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand50 }, copy: { flex: 1 }, title: { ...type.heading, color: colors.ink }, muted: { ...type.bodySm, color: colors.inkMuted, marginTop: 3 }, status: { borderRadius: radius.pill, backgroundColor: colors.brand50, paddingHorizontal: 9, paddingVertical: 5 }, statusText: { ...type.caption, color: colors.brand700 }, empty: { gap: spacing.md, padding: spacing.xl }, pressed: { opacity: .75 } });
