import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { usePurchase } from '../providers/PurchaseProvider';
import { colors, radius, type } from '../theme/tokens';

const MODE = {
  DELIVERY: { icon: 'bike-fast' as const, label: 'Delivery', empty: 'Configura tu dirección' },
  PICKUP: { icon: 'storefront-outline' as const, label: 'Recojo', empty: 'Elige un local' },
  DINE_IN: { icon: 'silverware-fork-knife' as const, label: 'En salón', empty: 'Elige el restaurante' },
};

export function LocationBar({ inverse = false }: { inverse?: boolean }) {
  const { serviceMode, branch, address } = usePurchase();
  const mode = MODE[serviceMode];

  /*
   * En delivery lo que importa es a DÓNDE llevamos; la cocina que sale de la
   * cobertura queda de respaldo mientras no haya dirección. Antes aquí ponía «La
   * sede se asigna por cobertura», que describía el funcionamiento interno y
   * dejaba al cliente sin saber ni el destino ni el local.
   */
  const detail =
    serviceMode === 'DELIVERY'
      ? (address?.line1 ?? branch?.name ?? mode.empty)
      : (branch?.name ?? mode.empty);

  return (
    <Pressable
      onPress={() => router.push('/location')}
      style={[styles.bar, inverse && styles.barInverse]}
      accessibilityRole="button"
      accessibilityLabel="Cambiar modalidad o local"
    >
      <View style={[styles.icon, inverse && styles.iconInverse]}>
        <MaterialCommunityIcons name={mode.icon} size={19} color={inverse ? colors.surface : colors.brand700} />
      </View>
      <View style={styles.copy}>
        <Text style={[styles.label, inverse && styles.labelInverse]}>{mode.label}</Text>
        <Text numberOfLines={1} style={[styles.detail, inverse && styles.detailInverse]}>{detail}</Text>
      </View>
      <MaterialCommunityIcons name="chevron-down" size={22} color={inverse ? '#d7eaff' : colors.inkMuted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { minHeight: 62, flexDirection: 'row', alignItems: 'center', gap: 11, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, paddingHorizontal: 12 },
  barInverse: { backgroundColor: 'rgba(255,255,255,0.1)', borderColor: 'rgba(255,255,255,0.18)' },
  icon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center' },
  iconInverse: { backgroundColor: 'rgba(255,255,255,0.12)' },
  copy: { flex: 1 },
  label: { ...type.label, color: colors.brand700, fontWeight: '900', textTransform: 'uppercase', letterSpacing: 0.8 },
  labelInverse: { color: colors.brand100 },
  detail: { ...type.bodySm, color: colors.ink, fontWeight: '700', marginTop: 2 },
  detailInverse: { color: colors.surface },
});
