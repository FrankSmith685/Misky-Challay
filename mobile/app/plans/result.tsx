import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { plansApi } from '../../src/services/api/plans.service';
import { colors, radius, spacing } from '../../src/theme/tokens';
import type { WalletSummary } from '../../src/types/domain';

type State = 'checking' | 'confirmed' | 'cancelled' | 'pending';

export default function PlanResultScreen() {
  const insets = useSafeAreaInsets();
  const { planId = '', payment = '' } = useLocalSearchParams<{ planId: string; payment: string }>();
  const target = /^\d+$/.test(planId) ? Number(planId) : null;
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [state, setState] = useState<State>(payment === 'cancelado' ? 'cancelled' : 'checking');

  useEffect(() => {
    if (payment === 'cancelado' || target === null) return;
    let active = true; let attempts = 0; let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const summary = await plansApi.wallet();
        if (!active) return;
        setWallet(summary); attempts += 1;
        if (summary.activePlans.some((plan) => plan.id === target)) setState('confirmed');
        else if (attempts < 10) timer = setTimeout(poll, 1500);
        else setState('pending');
      } catch { if (active) setState('pending'); }
    };
    void poll();
    return () => { active = false; clearTimeout(timer); };
  }, [payment, target]);

  const confirmed = state === 'confirmed'; const checking = state === 'checking'; const cancelled = state === 'cancelled';
  const icon = checking ? 'progress-clock' : confirmed ? 'wallet-outline' : cancelled ? 'credit-card-remove-outline' : 'clock-alert-outline';
  return <ScrollView style={styles.page} contentContainerStyle={[styles.content, { paddingTop: insets.top + 45 }]}><View style={[styles.icon, (cancelled || state === 'pending') && styles.iconWarning]}><MaterialCommunityIcons name={icon} size={48} color={colors.surface} /></View><Text style={styles.eyebrow}>{checking ? 'VALIDANDO CON EL PROVEEDOR' : confirmed ? 'PLAN ACTIVADO' : cancelled ? 'PAGO NO COMPLETADO' : 'PAGO EN VALIDACIÓN'}</Text><Text style={styles.title}>{checking ? 'Estamos confirmando…' : confirmed ? 'Tu saldo ya está listo' : cancelled ? 'No activamos el plan' : 'Puede tardar unos segundos'}</Text><Text style={styles.copy}>{checking ? 'La app consulta tu billetera real; no acredita saldo solamente por volver de la pasarela.' : confirmed ? 'El saldo y los beneficios ya pueden utilizarse en tus pedidos.' : cancelled ? 'No se realizó una segunda compra ni se acreditó saldo.' : 'Si el proveedor aprobó el cobro, el webhook activará el plan sin que tengas que pagar nuevamente.'}</Text>
    <View style={styles.receipt}><View style={styles.row}><Text style={styles.label}>Activación</Text><Text style={styles.value}>{target ?? '—'}</Text></View><View style={styles.row}><Text style={styles.label}>Estado</Text><Text style={styles.value}>{confirmed ? 'Activa' : checking ? 'Comprobando' : cancelled ? 'Cancelada' : 'Pendiente'}</Text></View>{confirmed && <><View style={styles.divider} /><View style={styles.row}><Text style={styles.totalLabel}>Saldo disponible</Text><Text style={styles.total}>S/ {Number(wallet?.balance ?? 0).toFixed(2)}</Text></View></>}</View>
    <PrimaryButton label={confirmed ? 'Ver mi billetera' : 'Revisar mi saldo'} onPress={() => router.replace('/wallet' as Href)} style={styles.button} /><PrimaryButton label="Volver a los planes" variant="secondary" onPress={() => router.replace('/plans' as Href)} style={styles.secondary} /><View style={styles.note}><MaterialCommunityIcons name="shield-check-outline" size={19} color={colors.brand100} /><Text style={styles.noteText}>La activación y cada movimiento quedan registrados por el backend con una clave idempotente.</Text></View>
  </ScrollView>;
}

const styles = StyleSheet.create({ page: { flex: 1, backgroundColor: colors.brand900 }, content: { flexGrow: 1, alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.xl }, icon: { width: 90, height: 90, borderRadius: 30, backgroundColor: colors.brand600, alignItems: 'center', justifyContent: 'center' }, iconWarning: { backgroundColor: colors.warning }, eyebrow: { color: '#94c5aa', fontSize: 10, fontWeight: '900', letterSpacing: 1.3, marginTop: spacing.lg }, title: { color: colors.surface, fontSize: 30, fontWeight: '900', textAlign: 'center', marginTop: 6 }, copy: { color: '#bdd5c8', fontSize: 13, lineHeight: 20, textAlign: 'center', marginTop: 9 }, receipt: { width: '100%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.xl }, row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginVertical: 4 }, label: { color: colors.inkMuted, fontSize: 11 }, value: { color: colors.ink, fontSize: 12, fontWeight: '900' }, divider: { height: 1, backgroundColor: colors.line, marginVertical: 14 }, totalLabel: { color: colors.ink, fontSize: 14, fontWeight: '900' }, total: { color: colors.brand700, fontSize: 22, fontWeight: '900' }, button: { width: '100%', marginTop: spacing.lg }, secondary: { width: '100%', marginTop: 10 }, note: { flexDirection: 'row', gap: 9, width: '100%', backgroundColor: 'rgba(255,255,255,.08)', borderRadius: radius.md, padding: 13, marginTop: spacing.lg }, noteText: { flex: 1, color: '#b9d1c5', fontSize: 10, lineHeight: 15 } });
