import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '../src/components/PrimaryButton';
import { usePurchase } from '../src/providers/PurchaseProvider';
import { colors, radius, spacing } from '../src/theme/tokens';
import type { ServiceMode } from '../src/types/domain';

const MODES = [
  { value: 'DELIVERY' as const, icon: 'bike-fast' as const, title: 'Delivery', copy: 'Envío según cobertura' },
  { value: 'PICKUP' as const, icon: 'shopping-outline' as const, title: 'Recojo', copy: 'Retira en el local' },
  { value: 'DINE_IN' as const, icon: 'silverware-fork-knife' as const, title: 'En salón', copy: 'Come en el restaurante' },
];

export default function LocationScreen() {
  const insets = useSafeAreaInsets();
  const purchase = usePurchase();
  const [mode, setMode] = useState<ServiceMode>(purchase.serviceMode);
  const [selectedBranchId, setSelectedBranchId] = useState<number | null>(purchase.branch?.id ?? null);
  const [error, setError] = useState('');
  const branches = useMemo(() => mode === 'PICKUP' ? purchase.branches.filter((branch) => branch.acceptsPickup) : purchase.branches, [mode, purchase.branches]);

  const save = () => {
    if (mode === 'PICKUP' && !selectedBranchId) {
      setError('Selecciona el local donde recogerás o comerás.');
      return;
    }
    purchase.setServiceMode(mode);
    if (selectedBranchId && mode !== 'DELIVERY') purchase.selectBranch(selectedBranchId);
    if (mode === 'DINE_IN') router.replace('/scan-table' as Href);
    else router.back();
  };

  return (
    <View style={[styles.page, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View><Text style={styles.eyebrow}>CONTEXTO DEL PEDIDO</Text><Text style={styles.title}>¿Cómo comerás hoy?</Text></View>
        <Pressable onPress={() => router.back()} style={styles.close} accessibilityLabel="Cerrar"><MaterialCommunityIcons name="close" size={24} color={colors.ink} /></Pressable>
      </View>
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 110 }]}>
        <View style={styles.modeGrid}>
          {MODES.map((item) => {
            const active = mode === item.value;
            return (
              <Pressable key={item.value} onPress={() => { setMode(item.value); setError(''); }} style={[styles.mode, active && styles.modeActive]}>
                <View style={[styles.modeIcon, active && styles.modeIconActive]}><MaterialCommunityIcons name={item.icon} size={23} color={active ? colors.surface : colors.brand700} /></View>
                <Text style={[styles.modeTitle, active && styles.modeTitleActive]}>{item.title}</Text>
                <Text style={[styles.modeCopy, active && styles.modeCopyActive]}>{item.copy}</Text>
                {active && <View style={styles.check}><MaterialCommunityIcons name="check" size={14} color={colors.surface} /></View>}
              </Pressable>
            );
          })}
        </View>

        {mode === 'DELIVERY' ? (
          <View style={styles.infoCard}>
            <MaterialCommunityIcons name="map-marker-radius-outline" size={27} color={colors.brand700} />
            <View style={styles.infoCopy}><Text style={styles.infoTitle}>Asignación inteligente del local</Text><Text style={styles.infoText}>No elegimos una sede todavía. Cuando ingreses tu dirección validaremos cobertura, tarifa y tiempo para asignar la cocina correcta.</Text></View>
          </View>
        ) : (
          <>
            <View style={styles.sectionHeader}><Text style={styles.sectionTitle}>{mode === 'PICKUP' ? 'Elige dónde recoger' : 'Elige el restaurante'}</Text><Text style={styles.sectionCopy}>{branches.length} locales disponibles</Text></View>
            {purchase.error && <View style={styles.errorBox}><Text style={styles.errorText}>{purchase.error}</Text><Text onPress={() => void purchase.reloadBranches()} style={styles.retry}>Reintentar</Text></View>}
            {branches.map((branch) => {
              const active = selectedBranchId === branch.id;
              return (
                <Pressable key={branch.id} onPress={() => { setSelectedBranchId(branch.id); setError(''); }} style={[styles.branch, active && styles.branchActive]}>
                  <View style={[styles.branchIcon, active && styles.branchIconActive]}><MaterialCommunityIcons name="storefront-outline" size={22} color={active ? colors.surface : colors.brand700} /></View>
                  <View style={styles.branchCopy}><Text style={styles.branchName}>{branch.name}</Text><Text style={styles.branchAddress}>{branch.addressLine}</Text><Text style={styles.branchTime}>Preparación aproximada: {branch.prepMinutes} min</Text></View>
                  <MaterialCommunityIcons name={active ? 'radiobox-marked' : 'radiobox-blank'} size={22} color={active ? colors.brand600 : '#9aa59f'} />
                </Pressable>
              );
            })}
            {mode === 'DINE_IN' && <View style={styles.qrNote}><MaterialCommunityIcons name="qrcode-scan" size={24} color={colors.accent500} /><Text style={styles.qrText}>Al llegar, escanearás el QR de tu mesa para abrir una comanda asociada al local correcto.</Text></View>}
          </>
        )}
        {error && <Text style={styles.validation}>{error}</Text>}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 12) }]}><PrimaryButton label={mode === 'DINE_IN' ? 'Escanear QR de mi mesa' : 'Guardar selección'} onPress={save} /></View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surfaceMuted },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: spacing.lg, paddingVertical: spacing.md, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  eyebrow: { color: colors.brand600, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 },
  title: { color: colors.ink, fontSize: 24, fontWeight: '900', letterSpacing: -0.6, marginTop: 3 },
  close: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surfaceMuted, alignItems: 'center', justifyContent: 'center' },
  content: { padding: spacing.md },
  modeGrid: { flexDirection: 'row', gap: 8 },
  mode: { flex: 1, minHeight: 134, alignItems: 'center', borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: 10 },
  modeActive: { backgroundColor: colors.brand800, borderColor: colors.brand800 },
  modeIcon: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center' },
  modeIconActive: { backgroundColor: colors.brand600 },
  modeTitle: { color: colors.ink, fontSize: 13, fontWeight: '900', marginTop: 9 },
  modeTitleActive: { color: colors.surface },
  modeCopy: { color: colors.inkMuted, fontSize: 9, lineHeight: 13, textAlign: 'center', marginTop: 3 },
  modeCopyActive: { color: '#c5ddd0' },
  check: { position: 'absolute', top: 7, right: 7, width: 20, height: 20, borderRadius: 10, backgroundColor: colors.accent500, alignItems: 'center', justifyContent: 'center' },
  infoCard: { marginTop: spacing.lg, flexDirection: 'row', gap: 13, backgroundColor: colors.brand50, borderRadius: radius.lg, borderWidth: 1, borderColor: '#cbe6d7', padding: spacing.lg },
  infoCopy: { flex: 1 },
  infoTitle: { color: colors.brand900, fontSize: 16, fontWeight: '900' },
  infoText: { color: colors.brand700, fontSize: 12, lineHeight: 19, marginTop: 5 },
  sectionHeader: { marginTop: spacing.xl, marginBottom: 12 },
  sectionTitle: { color: colors.ink, fontSize: 20, fontWeight: '900' },
  sectionCopy: { color: colors.inkMuted, fontSize: 11, marginTop: 3 },
  branch: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 14, marginBottom: 10 },
  branchActive: { borderColor: colors.brand600, backgroundColor: colors.brand50 },
  branchIcon: { width: 43, height: 43, borderRadius: 14, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center' },
  branchIconActive: { backgroundColor: colors.brand600 },
  branchCopy: { flex: 1 },
  branchName: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  branchAddress: { color: colors.inkMuted, fontSize: 11, marginTop: 3 },
  branchTime: { color: colors.brand700, fontSize: 10, fontWeight: '700', marginTop: 5 },
  qrNote: { flexDirection: 'row', gap: 11, backgroundColor: '#fff8e8', borderRadius: radius.md, padding: 14, marginTop: 4 },
  qrText: { flex: 1, color: '#795214', fontSize: 11, lineHeight: 18 },
  errorBox: { backgroundColor: '#fff2f2', borderRadius: radius.md, padding: 12, marginBottom: 10 },
  errorText: { color: colors.danger, fontSize: 12 },
  retry: { color: colors.brand700, fontSize: 12, fontWeight: '900', marginTop: 6 },
  validation: { color: colors.danger, fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 12 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingHorizontal: spacing.md, paddingTop: 12, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
});
