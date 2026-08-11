import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { useSession } from '../../src/providers/SessionProvider';
import { businessApi } from '../../src/services/api/business.service';
import { complaintsApi, type ComplaintReceipt } from '../../src/services/api/complaints.service';
import { env } from '../../src/config/env';
import { colors, radius, spacing } from '../../src/theme/tokens';
import type { PublicSettings } from '../../src/types/domain';

export default function SupportScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useSession();
  const [settings, setSettings] = useState<PublicSettings | null>(null);
  const [type, setType] = useState<'RECLAMO' | 'QUEJA'>('RECLAMO');
  const [name, setName] = useState([user?.firstName, user?.lastName].filter(Boolean).join(' '));
  const [dni, setDni] = useState('');
  const [email, setEmail] = useState(user?.email ?? '');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [orderNumber, setOrderNumber] = useState('');
  const [detail, setDetail] = useState('');
  const [request, setRequest] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [receipt, setReceipt] = useState<ComplaintReceipt | null>(null);

  useEffect(() => { void businessApi.publicSettings().then(setSettings).catch(() => undefined); }, []);

  const openWhatsApp = async () => {
    const digits = (settings?.business.phone ?? '').replace(/\D/g, '');
    if (!digits) { setError('El negocio todavía no configuró su número de atención.'); return; }
    const text = encodeURIComponent(orderNumber.trim()
      ? `Hola Verde Bowl, necesito ayuda con el pedido ${orderNumber.trim()}.`
      : 'Hola Verde Bowl, necesito ayuda con mi compra.');
    await Linking.openURL(`https://wa.me/${digits}?text=${text}`);
  };

  const submit = async () => {
    if (name.trim().length < 3 || !/^\d{8}$/.test(dni) || !email.includes('@') || detail.trim().length < 10 || request.trim().length < 5) {
      setError('Completa tu nombre, DNI, correo, detalle y la solución que esperas.'); return;
    }
    setBusy(true); setError('');
    try {
      setReceipt(await complaintsApi.submit({
        type, itemType: 'SERVICIO', consumerName: name.trim(), docType: 'DNI', docNumber: dni,
        email: email.trim(), phone: phone.trim() || undefined, detail: detail.trim(), request: request.trim(),
        orderNumber: orderNumber.trim() || undefined,
      }));
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'No pudimos registrar la solicitud.'); }
    finally { setBusy(false); }
  };

  if (receipt) return (
    <ScrollView style={styles.page} contentContainerStyle={[styles.content, { paddingTop: insets.top + 24 }]}>
      <View style={styles.successIcon}><MaterialCommunityIcons name="file-check-outline" size={46} color={colors.surface} /></View>
      <Text style={styles.successEyebrow}>LIBRO DE RECLAMACIONES</Text><Text style={styles.successTitle}>Registro recibido</Text>
      <Text style={styles.successCopy}>Guarda este código para consultar la respuesta. El plazo máximo configurado vence el {new Date(receipt.dueAt).toLocaleDateString('es-PE')}.</Text>
      <View style={styles.codeCard}><Text style={styles.codeLabel}>CÓDIGO DE SEGUIMIENTO</Text><Text style={styles.code}>{receipt.code}</Text><Text style={styles.codeStatus}>{receipt.status}</Text></View>
      <PrimaryButton label="Volver a mi cuenta" onPress={() => router.replace('/(tabs)/account')} style={styles.action} />
    </ScrollView>
  );

  return (
    <ScrollView keyboardShouldPersistTaps="handled" style={styles.page} contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}><Pressable style={styles.back} onPress={() => router.back()}><MaterialCommunityIcons name="arrow-left" size={22} color={colors.ink} /></Pressable><View><Text style={styles.eyebrow}>AYUDA Y DERECHOS</Text><Text style={styles.title}>Estamos para ayudarte</Text></View></View>
      <Pressable style={styles.whatsapp} onPress={() => void openWhatsApp()}><View style={styles.whatsappIcon}><MaterialCommunityIcons name="whatsapp" size={27} color={colors.surface} /></View><View style={{ flex: 1 }}><Text style={styles.whatsappTitle}>Atención rápida por WhatsApp</Text><Text style={styles.whatsappCopy}>Consulta operativa sobre un pedido. Si tienes el número, escríbelo abajo antes de abrir WhatsApp.</Text></View><MaterialCommunityIcons name="open-in-new" size={20} color={colors.brand700} /></Pressable>

      <View style={styles.legalLinks}>{[
        ['shield-lock-outline', 'Privacidad', `${env.webUrl}/privacidad`],
        ['file-document-outline', 'Términos', `${env.webUrl}/terminos`],
        ['help-circle-outline', 'Preguntas frecuentes', `${env.webUrl}/preguntas-frecuentes`],
      ].map(([icon, label, url]) => <Pressable key={label} style={styles.legalLink} onPress={() => void Linking.openURL(url)}><MaterialCommunityIcons name={icon as keyof typeof MaterialCommunityIcons.glyphMap} size={20} color={colors.brand700} /><Text style={styles.legalText}>{label}</Text></Pressable>)}</View>

      <View style={styles.formCard}><Text style={styles.formEyebrow}>LIBRO DE RECLAMACIONES VIRTUAL</Text><Text style={styles.formTitle}>Presentar una solicitud formal</Text><Text style={styles.formCopy}>Reclamo: disconformidad con un producto o servicio. Queja: disconformidad con la atención recibida.</Text>
        <View style={styles.segment}>{(['RECLAMO', 'QUEJA'] as const).map((value) => <Pressable key={value} onPress={() => setType(value)} style={[styles.segmentButton, type === value && styles.segmentActive]}><Text style={[styles.segmentText, type === value && styles.segmentTextActive]}>{value === 'RECLAMO' ? 'Reclamo' : 'Queja'}</Text></Pressable>)}</View>
        <FormField label="Nombre completo" value={name} onChangeText={setName} icon="account-outline" />
        <FormField label="DNI" value={dni} onChangeText={(value) => setDni(value.replace(/\D/g, '').slice(0, 8))} keyboardType="number-pad" maxLength={8} icon="card-account-details-outline" />
        <FormField label="Correo" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" icon="email-outline" />
        <FormField label="Teléfono (opcional)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" icon="phone-outline" />
        <FormField label="Número de pedido (opcional)" value={orderNumber} onChangeText={(value) => setOrderNumber(value.toUpperCase())} autoCapitalize="characters" icon="receipt-text-outline" />
        <FormField label="¿Qué ocurrió?" value={detail} onChangeText={setDetail} multiline maxLength={3000} icon="text-box-outline" />
        <FormField label="¿Qué solución esperas?" value={request} onChangeText={setRequest} multiline maxLength={2000} icon="hand-heart-outline" />
        {error ? <View style={styles.error}><MaterialCommunityIcons name="alert-circle-outline" size={19} color={colors.danger} /><Text style={styles.errorText}>{error}</Text></View> : null}
        <PrimaryButton label="Registrar en el Libro" loading={busy} onPress={() => void submit()} style={styles.submit} />
        <Text style={styles.legalNotice}>Presentar un reclamo no impide acudir a INDECOPI ni a otros mecanismos de solución.</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.surfaceMuted }, content: { paddingHorizontal: spacing.md, paddingBottom: spacing.xl },
  header: { flexDirection: 'row', alignItems: 'center', gap: 12 }, back: { width: 42, height: 42, borderRadius: 14, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  eyebrow: { color: colors.brand600, fontSize: 9, fontWeight: '900', letterSpacing: 1.1 }, title: { color: colors.ink, fontSize: 25, fontWeight: '900' },
  whatsapp: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#eaf9ef', borderWidth: 1, borderColor: '#bce7ca', borderRadius: radius.lg, padding: 15, marginTop: spacing.lg }, whatsappIcon: { width: 48, height: 48, borderRadius: 16, backgroundColor: '#168c4b', alignItems: 'center', justifyContent: 'center' }, whatsappTitle: { color: '#105c35', fontSize: 13, fontWeight: '900' }, whatsappCopy: { color: '#417158', fontSize: 9, lineHeight: 14, marginTop: 3 },
  legalLinks: { flexDirection: 'row', gap: 7, marginTop: 10 }, legalLink: { flex: 1, minHeight: 70, alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, padding: 8 }, legalText: { color: colors.ink, fontSize: 8, fontWeight: '800', textAlign: 'center' },
  formCard: { backgroundColor: colors.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.line, padding: spacing.md, marginTop: spacing.lg }, formEyebrow: { color: colors.brand600, fontSize: 9, fontWeight: '900', letterSpacing: 1 }, formTitle: { color: colors.ink, fontSize: 20, fontWeight: '900', marginTop: 4 }, formCopy: { color: colors.inkMuted, fontSize: 10, lineHeight: 16, marginTop: 7 },
  segment: { flexDirection: 'row', backgroundColor: colors.line, borderRadius: radius.md, padding: 3, marginTop: 15 }, segmentButton: { flex: 1, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 13 }, segmentActive: { backgroundColor: colors.surface }, segmentText: { color: colors.inkMuted, fontSize: 11, fontWeight: '800' }, segmentTextActive: { color: colors.brand700 },
  error: { flexDirection: 'row', gap: 8, backgroundColor: '#fff0f0', borderRadius: radius.md, padding: 11, marginTop: 10 }, errorText: { flex: 1, color: colors.danger, fontSize: 9, lineHeight: 14 }, submit: { marginTop: 14 }, legalNotice: { color: colors.inkMuted, fontSize: 8, lineHeight: 13, textAlign: 'center', marginTop: 10 },
  successIcon: { width: 90, height: 90, borderRadius: 30, alignSelf: 'center', backgroundColor: colors.brand600, alignItems: 'center', justifyContent: 'center', marginTop: 50 }, successEyebrow: { color: colors.brand600, fontSize: 9, fontWeight: '900', letterSpacing: 1.1, textAlign: 'center', marginTop: spacing.lg }, successTitle: { color: colors.ink, fontSize: 29, fontWeight: '900', textAlign: 'center', marginTop: 4 }, successCopy: { color: colors.inkMuted, fontSize: 12, lineHeight: 19, textAlign: 'center', marginTop: 8 }, codeCard: { backgroundColor: colors.brand900, borderRadius: radius.lg, padding: spacing.lg, marginTop: spacing.xl, alignItems: 'center' }, codeLabel: { color: '#98beaa', fontSize: 9, fontWeight: '900', letterSpacing: 1 }, code: { color: colors.surface, fontSize: 28, fontWeight: '900', letterSpacing: 1, marginTop: 8 }, codeStatus: { color: '#bcd8ca', fontSize: 10, marginTop: 6 }, action: { marginTop: spacing.lg },
});
