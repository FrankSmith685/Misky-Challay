import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, type Href } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ErrorState, LoadingState } from '../../src/components/ScreenState';
import { useSession } from '../../src/providers/SessionProvider';
import { plansApi } from '../../src/services/api/plans.service';
import { colors, radius, spacing } from '../../src/theme/tokens';
import type { Plan, WalletSummary } from '../../src/types/domain';

const money = (value: number | string) => `S/ ${Number(value).toFixed(2)}`;
const purchaseKey = () => `mobile-plan-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;

export default function PlansScreen() {
  const insets = useSafeAreaInsets();
  const { status } = useSession();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [selected, setSelected] = useState<Plan | null>(null);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [buying, setBuying] = useState(false);
  const [error, setError] = useState('');
  const idempotency = useRef('');

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError('');
    try {
      const [available, summary] = await Promise.all([
        plansApi.list(),
        status === 'authenticated' ? plansApi.wallet().catch(() => null) : Promise.resolve(null),
      ]);
      setPlans(available);
      setWallet(summary);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos cargar los planes.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [status]);

  useEffect(() => { void load(); }, [load]);

  const choose = (plan: Plan) => {
    if (status !== 'authenticated') {
      router.push({ pathname: '/(auth)/login', params: { returnTo: '/plans' } });
      return;
    }
    idempotency.current = purchaseKey();
    setAccepted(false);
    setError('');
    setSelected(plan);
  };

  const confirm = async () => {
    if (!selected || !accepted || buying) return;
    setBuying(true);
    setError('');
    try {
      const purchase = await plansApi.purchase(selected.code, idempotency.current || purchaseKey());
      if (!purchase.checkoutUrl) throw new Error('La pasarela no devolvió un enlace de pago.');
      setSelected(null);
      await Linking.openURL(purchase.checkoutUrl);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'No pudimos iniciar la compra.');
    } finally {
      setBuying(false);
    }
  };

  if (loading) return <View style={[styles.page, { paddingTop: insets.top }]}><LoadingState label="Buscando los mejores planes…" /></View>;

  return (
    <>
      <ScrollView style={styles.page} contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void load(true)} tintColor={colors.brand600} />}>
        <View style={styles.top}><Pressable style={styles.back} onPress={() => router.back()}><MaterialCommunityIcons name="arrow-left" size={22} color={colors.ink} /></Pressable><View><Text style={styles.eyebrow}>PLANES VERDE BOWL</Text><Text style={styles.title}>Más saldo, mejores pedidos</Text></View></View>
        <View style={styles.hero}><View style={styles.heroIcon}><MaterialCommunityIcons name="wallet-giftcard" size={32} color={colors.surface} /></View><Text style={styles.heroTitle}>Recarga con beneficio</Text><Text style={styles.heroCopy}>Pagas una vez, recibes saldo y disfrutas beneficios durante la vigencia del plan. No es una suscripción automática.</Text></View>

        {wallet && wallet.balance > 0 && <Pressable style={styles.walletBanner} onPress={() => router.push('/wallet' as Href)}><View><Text style={styles.walletLabel}>MI SALDO DISPONIBLE</Text><Text style={styles.walletAmount}>{money(wallet.balance)}</Text><Text style={styles.walletDetail}>{money(wallet.paidBalance)} pagados · {money(wallet.bonusBalance)} de bono</Text></View><MaterialCommunityIcons name="chevron-right" size={25} color={colors.brand700} /></Pressable>}

        {error && !selected ? <ErrorState message={error} onRetry={() => void load()} /> : plans.length === 0 ? <View style={styles.empty}><MaterialCommunityIcons name="calendar-clock" size={38} color={colors.brand600} /><Text style={styles.emptyTitle}>No hay planes disponibles</Text><Text style={styles.emptyCopy}>Puedes seguir comprando desde el menú mientras preparamos nuevas opciones.</Text></View> : <View style={styles.list}>{plans.map((plan) => {
          const price = Number(plan.price); const credit = Number(plan.grantedCredit); const bonus = Math.max(0, credit - price); const percent = price > 0 ? Math.round((bonus / price) * 100) : 0;
          return <View key={plan.id} style={[styles.plan, plan.isFeatured && styles.planFeatured]}>{plan.isFeatured && <View style={styles.badge}><Text style={styles.badgeText}>MÁS ELEGIDO</Text></View>}<View style={styles.planTop}><View style={styles.planMark}><MaterialCommunityIcons name="sprout" size={22} color={colors.brand700} /></View><View style={{ flex: 1 }}><Text style={styles.planName}>{plan.name}</Text><Text style={styles.planDescription}>{plan.description || `Beneficios por ${plan.validityDays} días`}</Text></View></View><View style={styles.amounts}><View><Text style={styles.amountLabel}>PAGAS</Text><Text style={styles.price}>{money(price)}</Text></View><MaterialCommunityIcons name="arrow-right" size={20} color={colors.inkMuted} /><View><Text style={styles.amountLabel}>RECIBES</Text><Text style={styles.credit}>{money(credit)}</Text></View></View>{bonus > 0 && <View style={styles.bonus}><MaterialCommunityIcons name="gift-outline" size={17} color={colors.accent500} /><Text style={styles.bonusText}>Ganas {money(bonus)} extra{percent ? ` (${percent}%)` : ''}</Text></View>}<View style={styles.benefits}>{plan.benefits.map((benefit) => <View key={benefit.id} style={styles.benefit}><MaterialCommunityIcons name="check-circle" size={17} color={colors.success} /><Text style={styles.benefitText}>{benefit.description}</Text></View>)}</View><Text style={styles.validity}>Beneficios vigentes por {plan.validityDays} días</Text><PrimaryButton label={status === 'authenticated' ? `Elegir ${plan.name}` : 'Ingresar para elegir'} onPress={() => choose(plan)} style={styles.planButton} /></View>;
        })}</View>}
        <View style={styles.info}><MaterialCommunityIcons name="information-outline" size={21} color={colors.brand700} /><Text style={styles.infoText}>El dinero pagado y el bono conservan fechas separadas. Al pedir se usa primero el lote que vence antes.</Text></View>
      </ScrollView>

      <Modal visible={Boolean(selected)} transparent animationType="slide" onRequestClose={() => !buying && setSelected(null)}>
        <View style={styles.overlay}><View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 18) }]}><View style={styles.handle} /><View style={styles.sheetIcon}><MaterialCommunityIcons name="shield-check-outline" size={27} color={colors.brand700} /></View><Text style={styles.sheetTitle}>Confirma tu plan</Text><Text style={styles.sheetPlan}>{selected?.name}</Text><Text style={styles.sheetCopy}>Pagarás {money(selected?.price ?? 0)} y, cuando el proveedor confirme el cobro, recibirás {money(selected?.grantedCredit ?? 0)} de saldo.</Text><Pressable style={styles.terms} onPress={() => setAccepted((value) => !value)}><MaterialCommunityIcons name={accepted ? 'checkbox-marked' : 'checkbox-blank-outline'} size={24} color={accepted ? colors.brand600 : colors.inkMuted} /><Text style={styles.termsText}>Acepto las condiciones, vigencias y beneficios mostrados para este plan.</Text></Pressable>{error ? <Text style={styles.sheetError}>{error}</Text> : null}<PrimaryButton label="Continuar al pago seguro" loading={buying} disabled={!accepted} onPress={() => void confirm()} style={styles.confirm} /><PrimaryButton label="Ahora no" variant="ghost" disabled={buying} onPress={() => setSelected(null)} /></View></View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surfaceMuted }, content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl }, top: { flexDirection: 'row', alignItems: 'center', gap: 12 }, back: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center' }, eyebrow: { color: colors.brand600, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 }, title: { color: colors.ink, fontSize: 22, fontWeight: '900', marginTop: 2 }, hero: { backgroundColor: colors.brand900, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.lg }, heroIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: colors.brand600, alignItems: 'center', justifyContent: 'center' }, heroTitle: { color: colors.surface, fontSize: 25, fontWeight: '900', marginTop: 16 }, heroCopy: { color: '#bfd7ca', fontSize: 12, lineHeight: 19, marginTop: 7 }, walletBanner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.brand50, borderRadius: radius.md, borderWidth: 1, borderColor: '#badcc9', padding: 15, marginTop: 12 }, walletLabel: { color: colors.brand700, fontSize: 8, fontWeight: '900', letterSpacing: 1 }, walletAmount: { color: colors.brand900, fontSize: 22, fontWeight: '900', marginTop: 3 }, walletDetail: { color: colors.inkMuted, fontSize: 9, marginTop: 3 }, list: { gap: 14, marginTop: spacing.lg }, plan: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.lg, overflow: 'hidden' }, planFeatured: { borderColor: '#e9b04e', borderWidth: 2 }, badge: { position: 'absolute', top: 0, right: 0, backgroundColor: colors.accent500, paddingHorizontal: 11, paddingVertical: 6, borderBottomLeftRadius: 14 }, badgeText: { color: colors.surface, fontSize: 8, fontWeight: '900', letterSpacing: .8 }, planTop: { flexDirection: 'row', alignItems: 'center', gap: 11, paddingRight: 55 }, planMark: { width: 43, height: 43, borderRadius: 14, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center' }, planName: { color: colors.ink, fontSize: 18, fontWeight: '900' }, planDescription: { color: colors.inkMuted, fontSize: 10, lineHeight: 15, marginTop: 3 }, amounts: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: 14, marginTop: spacing.md }, amountLabel: { color: colors.inkMuted, fontSize: 8, fontWeight: '900' }, price: { color: colors.ink, fontSize: 18, fontWeight: '900', marginTop: 3 }, credit: { color: colors.brand700, fontSize: 20, fontWeight: '900', marginTop: 3 }, bonus: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#fff8e8', borderRadius: radius.sm, padding: 10, marginTop: 10 }, bonusText: { color: '#7d5400', fontSize: 10, fontWeight: '900' }, benefits: { gap: 8, marginTop: 14 }, benefit: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 }, benefitText: { flex: 1, color: colors.ink, fontSize: 11, lineHeight: 16, fontWeight: '700' }, validity: { color: colors.inkMuted, fontSize: 9, marginTop: 13 }, planButton: { marginTop: 13 }, empty: { alignItems: 'center', backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.xl, marginTop: spacing.lg }, emptyTitle: { color: colors.ink, fontSize: 16, fontWeight: '900', marginTop: 10 }, emptyCopy: { color: colors.inkMuted, fontSize: 11, lineHeight: 17, textAlign: 'center', marginTop: 5 }, info: { flexDirection: 'row', gap: 9, backgroundColor: colors.brand50, borderRadius: radius.md, padding: 13, marginTop: spacing.lg }, infoText: { flex: 1, color: colors.brand700, fontSize: 10, lineHeight: 15 }, overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,25,17,.55)' }, sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 30, borderTopRightRadius: 30, paddingHorizontal: spacing.lg, paddingTop: 12 }, handle: { alignSelf: 'center', width: 42, height: 4, borderRadius: 2, backgroundColor: colors.line }, sheetIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: colors.brand50, alignItems: 'center', justifyContent: 'center', marginTop: spacing.lg }, sheetTitle: { color: colors.ink, fontSize: 23, fontWeight: '900', marginTop: 14 }, sheetPlan: { color: colors.brand700, fontSize: 15, fontWeight: '900', marginTop: 3 }, sheetCopy: { color: colors.inkMuted, fontSize: 12, lineHeight: 19, marginTop: 10 }, terms: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, backgroundColor: colors.surfaceMuted, borderRadius: radius.md, padding: 13, marginTop: 15 }, termsText: { flex: 1, color: colors.ink, fontSize: 11, lineHeight: 17 }, sheetError: { color: colors.danger, fontSize: 10, lineHeight: 15, marginTop: 10 }, confirm: { marginTop: spacing.md },
});
