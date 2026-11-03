import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { usePurchase } from '../../src/providers/PurchaseProvider';
import { useSession } from '../../src/providers/SessionProvider';
import { useToast } from '../../src/providers/ToastProvider';
import { cakesApi } from '../../src/services/api/cakes.service';
import { whatsappNumber } from '../../src/lib/whatsapp';
import { colors, radius, spacing, type } from '../../src/theme/tokens';

const field = (value: string, onChangeText: (value: string) => void, placeholder: string, multiline = false) => (
  <TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor={colors.inkMuted} multiline={multiline} style={[styles.input, multiline && styles.multiline]} />
);

export default function CakeDesignScreen() {
  const params = useLocalSearchParams<{ productId?: string; variantId?: string; kind?: string }>();
  const freeform = params.kind === 'FREEFORM';
  const { branch } = usePurchase();
  const { status, user } = useSession();
  const toast = useToast();
  const [occasion, setOccasion] = useState('');
  const [theme, setTheme] = useState('');
  const [style, setStyle] = useState('');
  const [colorsText, setColorsText] = useState('');
  const [servings, setServings] = useState('');
  const [message, setMessage] = useState('');
  const [flavor, setFlavor] = useState('');
  const [filling, setFilling] = useState('');
  const [budget, setBudget] = useState('');
  const [notes, setNotes] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [reference, setReference] = useState<{ dataUrl: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);
  const whatsappAvailable = Boolean(whatsappNumber(user?.phone));

  const chooseReference = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.8, base64: true });
    if (result.canceled || !result.assets[0]?.base64) return;
    const asset = result.assets[0];
    const mime = asset.mimeType === 'image/png' ? 'image/png' : asset.mimeType === 'image/webp' ? 'image/webp' : 'image/jpeg';
    setReference({ dataUrl: `data:${mime};base64,${asset.base64}`, name: asset.fileName ?? 'referencia.jpg' });
  };

  const submit = async () => {
    if (status !== 'authenticated') { router.push({ pathname: '/(auth)/login', params: { returnTo: '/cakes/design' } } as never); return; }
    if (!branch) { toast.show({ tone: 'warning', message: 'Elige primero el local donde recogerás tu torta.' }); router.push('/location'); return; }
    if (!params.productId || !params.variantId || occasion.trim().length < 2 || description.trim().length < 10 || !date || !time || (!freeform && !reference)) {
      toast.show({ tone: 'warning', message: freeform ? 'Completa ocasión, idea y fecha para tu torta a medida.' : 'Completa ocasión, idea, fecha, hora y una referencia visual.' });
      return;
    }
    if (freeform && (!Number.isSafeInteger(Number(servings)) || Number(servings) < 1 || Number(servings) > 500)) {
      toast.show({ tone: 'warning', message: 'Indica entre 1 y 500 porciones.' }); return;
    }
    if (freeform && (flavor.trim().length < 2 || filling.trim().length < 2)) {
      toast.show({ tone: 'warning', message: 'Indica sabor de bizcocho y relleno para tu diseño.' }); return;
    }
    const desired = new Date(`${date}T${time}:00`);
    if (Number.isNaN(desired.getTime()) || desired.getTime() < Date.now()) { toast.show({ tone: 'warning', message: 'La fecha de entrega no es válida.' }); return; }
    setSaving(true);
    try {
      await cakesApi.submitDesign({
        branchId: branch.id, productId: Number(params.productId), variantId: Number(params.variantId), desiredAt: desired.toISOString(), description: description.trim(), requestKind: freeform ? 'FREEFORM' : 'ADVANCED',
        ...(reference ? { referenceDataUrl: reference.dataUrl } : {}),
        whatsappOptIn: whatsappOptIn && whatsappAvailable,
        brief: { occasion: occasion.trim(), theme: theme.trim(), style: style.trim(), colors: colorsText.split(',').map((value) => value.trim()).filter(Boolean).slice(0, 6), servings: servings ? Number(servings) : null, message: message.trim(), budget: budget.trim(), notes: notes.trim(), flavor: flavor.trim(), filling: filling.trim() },
      });
      toast.show({ tone: 'success', message: 'Solicitud enviada. Te avisaremos cuando haya una cotización.' });
      router.replace('/cakes' as never);
    } catch (error) { Alert.alert('No pudimos enviar la solicitud', error instanceof Error ? error.message : 'Inténtalo nuevamente.'); }
    finally { setSaving(false); }
  };

  return <ScreenScaffold title={freeform ? 'Torta a medida' : 'Diseño especial'} subtitle={branch?.name ?? 'Elige un local'} showBack>
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.hero}><MaterialCommunityIcons name="cake-variant-outline" size={34} color={colors.brand700} /><View style={styles.heroCopy}><Text style={styles.heroTitle}>{freeform ? 'Pide las porciones que quieras' : 'Dale forma a tu idea'}</Text><Text style={styles.heroText}>Cuéntanos la ocasión y nuestro equipo te enviará precio, fecha y condiciones antes de cobrarte.</Text></View></View>
      <Text style={styles.section}>1 · La ocasión</Text>
      {field(occasion, setOccasion, 'Ej. cumpleaños, bautizo o aniversario')}
      <View style={styles.row}>{field(theme, setTheme, 'Tema o personaje')}{field(style, setStyle, 'Estilo')}{field(servings, setServings, 'Personas')}</View>
      {field(colorsText, setColorsText, 'Colores (separados por coma)')}
      <Text style={styles.section}>2 · La idea</Text>
      {freeform && <View style={styles.row}>{field(flavor, setFlavor, 'Sabor del bizcocho')}{field(filling, setFilling, 'Relleno')}</View>}
      {field(description, setDescription, 'Describe cómo imaginas la torta, decoración, forma y acabados', true)}
      {field(message, setMessage, 'Texto que llevará la torta (opcional)')}
      {field(budget, setBudget, 'Presupuesto aproximado (opcional)')}
      {field(notes, setNotes, 'Alergias, restricciones o indicaciones adicionales', true)}
      <Text style={styles.section}>3 · Entrega y referencia {freeform ? '(opcional)' : ''}</Text>
      <View style={styles.row}>{field(date, setDate, 'Fecha AAAA-MM-DD')}{field(time, setTime, 'Hora HH:MM')}</View>
      <Pressable onPress={() => void chooseReference()} style={styles.upload}><MaterialCommunityIcons name="image-plus-outline" size={28} color={colors.brand700} /><View style={styles.uploadCopy}><Text style={styles.uploadTitle}>{reference ? reference.name : `Subir referencia visual${freeform ? ' (opcional)' : ''}`}</Text><Text style={styles.uploadText}>JPG, PNG o WebP · máximo una imagen principal</Text></View><MaterialCommunityIcons name="chevron-right" size={23} color={colors.inkMuted} /></Pressable>
      {reference ? <Image source={{ uri: reference.dataUrl }} style={styles.preview} /> : null}
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: whatsappOptIn, disabled: !whatsappAvailable }} disabled={!whatsappAvailable} onPress={() => setWhatsappOptIn((current) => !current)} style={[styles.consent, whatsappOptIn && styles.consentActive]}>
        <MaterialCommunityIcons name={whatsappOptIn ? 'checkbox-marked' : 'checkbox-blank-outline'} size={24} color={whatsappOptIn ? colors.brand700 : colors.inkMuted} />
        <Text style={styles.consentText}>Acepto recibir por WhatsApp de Misky Challay la cotización de esta solicitud en el celular de mi cuenta. Es opcional.</Text>
      </Pressable>
      {!whatsappAvailable ? <Pressable onPress={() => router.push('/profile')}><Text style={styles.consentHint}>Agrega un celular válido en Mi perfil para recibir este aviso.</Text></Pressable> : null}
      <View style={styles.steps}><Text style={styles.stepsTitle}>Así funciona</Text><Text style={styles.stepsText}>1. Revisamos tu brief · 2. Te enviamos una cotización · 3. Aceptas y coordinamos la producción.</Text></View>
      <PrimaryButton label="Enviar solicitud de diseño" loading={saving} onPress={() => void submit()} style={styles.submit} />
    </ScrollView>
  </ScreenScaffold>;
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, paddingBottom: spacing.xxxl, backgroundColor: '#f3f7f4' },
  hero: { flexDirection: 'row', gap: spacing.md, borderRadius: radius.xl, backgroundColor: colors.brand50, padding: spacing.lg }, heroCopy: { flex: 1 }, heroTitle: { ...type.heading, color: colors.brand900 }, heroText: { ...type.bodySm, color: colors.brand700, marginTop: 4 },
  section: { ...type.label, color: colors.brand700, marginTop: spacing.xl, marginBottom: spacing.sm, letterSpacing: 1 },
  input: { flex: 1, minHeight: 52, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: spacing.md, color: colors.ink, marginBottom: spacing.sm }, multiline: { minHeight: 104, paddingTop: spacing.md, textAlignVertical: 'top' }, row: { flexDirection: 'row', gap: spacing.sm },
  upload: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderStyle: 'dashed', borderColor: colors.brand100, backgroundColor: colors.brand50, padding: spacing.md }, uploadCopy: { flex: 1 }, uploadTitle: { ...type.body, color: colors.brand800, fontWeight: '800' }, uploadText: { ...type.caption, color: colors.inkMuted, marginTop: 2 }, preview: { width: '100%', height: 220, borderRadius: radius.md, marginTop: spacing.sm }, steps: { borderRadius: radius.md, backgroundColor: colors.accent50, padding: spacing.md, marginTop: spacing.lg }, stepsTitle: { ...type.body, color: colors.warning, fontWeight: '900' }, stepsText: { ...type.bodySm, color: '#7a5b22', marginTop: 4, lineHeight: 20 }, submit: { marginTop: spacing.lg },
  consent: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderRadius: radius.md, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, padding: spacing.md, marginTop: spacing.lg },
  consentActive: { borderColor: colors.brand700, backgroundColor: colors.brand50 },
  consentText: { ...type.bodySm, flex: 1, color: colors.ink },
  consentHint: { ...type.caption, color: colors.brand700, marginTop: spacing.xs },
});
