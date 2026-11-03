import { MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { StaffFormSheet, type StaffFormField, type StaffFormValue } from '../../src/components/staff/StaffFormSheet';
import { useResource } from '../../src/hooks/useResource';
import { useToast } from '../../src/providers/ToastProvider';
import { staffApi, type StaffModulePayload, type StaffRow } from '../../src/services/api/staff.service';
import { colors, radius, shadow, spacing, type } from '../../src/theme/tokens';

const object = (value: unknown): StaffRow => value && typeof value === 'object' && !Array.isArray(value) ? value as StaffRow : {};
const text = (value: unknown, fallback = '') => value === null || value === undefined ? fallback : String(value);
const number = (value: StaffFormValue | undefined) => Number(String(value ?? '').replace(',', '.'));
interface Form { title: string; fields: StaffFormField[]; submit: (values: Record<string, StaffFormValue>) => Promise<void>; }

export default function BusinessEditorScreen() {
  const toast = useToast(); const [form, setForm] = useState<Form | null>(null); const [saving, setSaving] = useState(false);
  const resource = useResource<StaffModulePayload>({ key: 'staff:business:editor', fetcher: () => staffApi.load('business'), cacheMs: 20_000 });
  const summary = resource.data?.summary ?? {}; const business = object(object(summary.business).business); const payments = object(object(summary.payments).localPayments); const receipts = object(object(summary.receipts).receipts); const communication = object(object(summary.communication).communication); const notifications = object(summary.notifications);
  const recent = useMemo(() => Array.isArray(notifications.recent) ? notifications.recent.map(object) : [], [notifications.recent]);
  const run = async (action: () => Promise<unknown>, message: string) => { setSaving(true); try { await action(); setForm(null); toast.show({ tone: 'success', message }); await resource.refresh(); } catch (error) { toast.show({ tone: 'error', message: error instanceof Error ? error.message : 'No pudimos guardar.' }); } finally { setSaving(false); } };
  const businessFields: StaffFormField[] = [{ key: 'legalName', label: 'Razón social', value: text(business.legalName), required: true }, { key: 'commercialName', label: 'Nombre comercial', value: text(business.commercialName), required: true }, { key: 'ruc', label: 'RUC', value: text(business.ruc), required: true }, { key: 'address', label: 'Domicilio fiscal', value: text(business.address), required: true }, { key: 'phone', label: 'Teléfono', value: text(business.phone), required: true }, { key: 'email', label: 'Correo general', kind: 'email', value: text(business.email), required: true }, { key: 'supportEmail', label: 'Correo de soporte', kind: 'email', value: text(business.supportEmail), required: true }, { key: 'complaintResponseDays', label: 'Días para responder reclamos', kind: 'number', value: text(business.complaintResponseDays, '15'), required: true }];
  const paymentFields: StaffFormField[] = [{ key: 'yapeEnabled', label: 'Aceptar Yape', kind: 'boolean', value: Boolean(payments.yapeEnabled) }, { key: 'yapePhone', label: 'Teléfono Yape', value: text(payments.yapePhone) }, { key: 'yapeRecipient', label: 'Titular Yape', value: text(payments.yapeRecipient) }, { key: 'yapeQrImageUrl', label: 'Imagen QR Yape', value: text(payments.yapeQrImageUrl) }, { key: 'plinEnabled', label: 'Aceptar Plin', kind: 'boolean', value: Boolean(payments.plinEnabled) }, { key: 'plinPhone', label: 'Teléfono Plin', value: text(payments.plinPhone) }, { key: 'plinRecipient', label: 'Titular Plin', value: text(payments.plinRecipient) }, { key: 'plinQrImageUrl', label: 'Imagen QR Plin', value: text(payments.plinQrImageUrl) }, { key: 'instructions', label: 'Instrucciones', kind: 'multiline', value: text(payments.instructions), required: true }];
  const receiptFields: StaffFormField[] = [{ key: 'mode', label: 'Modo de documentos', kind: 'choice', value: text(receipts.mode, 'INTERNAL_ONLY'), choices: [{ label: 'Solo ticket interno', value: 'INTERNAL_ONLY' }, { label: 'CPE externo manual', value: 'EXTERNAL_MANUAL' }, { label: 'Integración fiscal', value: 'INTEGRATED' }] }, { key: 'autoPrintKitchenTicket', label: 'Imprimir comanda al entrar a Cocina', kind: 'boolean', value: Boolean(receipts.autoPrintKitchenTicket) }, { key: 'autoPrintCustomerTicket', label: 'Imprimir ticket al marcar Listo', kind: 'boolean', value: Boolean(receipts.autoPrintCustomerTicket) }, { key: 'paperWidth', label: 'Ancho de papel', kind: 'choice', value: text(receipts.paperWidth, '80'), choices: [{ label: '58 mm', value: '58' }, { label: '80 mm', value: '80' }] }];
  const communicationFields: StaffFormField[] = [{ key: 'emailNotificationsEnabled', label: 'Notificaciones por correo', kind: 'boolean', value: Boolean(communication.emailNotificationsEnabled) }, { key: 'inAppNotificationsEnabled', label: 'Notificaciones en app', kind: 'boolean', value: Boolean(communication.inAppNotificationsEnabled) }, { key: 'orderUpdatesEnabled', label: 'Cambios de pedidos', kind: 'boolean', value: Boolean(communication.orderUpdatesEnabled) }, { key: 'planUpdatesEnabled', label: 'Cambios de planes', kind: 'boolean', value: Boolean(communication.planUpdatesEnabled) }, { key: 'staffAccessEnabled', label: 'Avisos de acceso del personal', kind: 'boolean', value: Boolean(communication.staffAccessEnabled) }, { key: 'availabilityAlertsEnabled', label: 'Alertas de disponibilidad', kind: 'boolean', value: Boolean(communication.availabilityAlertsEnabled) }, { key: 'availabilityEmailSubject', label: 'Asunto de disponibilidad', value: text(communication.availabilityEmailSubject), required: true }, { key: 'availabilityEmailBody', label: 'Mensaje de disponibilidad', kind: 'multiline', value: text(communication.availabilityEmailBody), required: true }, { key: 'smtpHost', label: 'Servidor SMTP', value: text(communication.smtpHost) }, { key: 'smtpPort', label: 'Puerto SMTP', kind: 'number', value: text(communication.smtpPort, '587'), required: true }, { key: 'smtpSecure', label: 'Conexión segura', kind: 'boolean', value: Boolean(communication.smtpSecure) }, { key: 'smtpUser', label: 'Usuario SMTP', value: text(communication.smtpUser) }, { key: 'smtpPassword', label: communication.smtpPasswordConfigured ? 'Nueva contraseña SMTP (opcional)' : 'Contraseña SMTP' }, { key: 'fromEmail', label: 'Correo remitente', kind: 'email', value: text(communication.fromEmail), required: true }, { key: 'fromName', label: 'Nombre remitente', value: text(communication.fromName), required: true }, { key: 'replyToEmail', label: 'Responder a', kind: 'email', value: text(communication.replyToEmail) }];
  const communicationInput = (values: Record<string, StaffFormValue>) => ({ ...values, smtpPort: number(values.smtpPort), smtpPassword: values.smtpPassword || undefined });
  const communicationFieldsWithWhatsapp: StaffFormField[] = [
    ...communicationFields.slice(0, 3),
    { key: 'whatsappUpdatesEnabled', label: 'Avisos por WhatsApp', kind: 'boolean', value: Boolean(communication.whatsappUpdatesEnabled) },
    ...communicationFields.slice(3),
  ];
  if (resource.loading) return <ScreenScaffold title="Datos del negocio" subtitle="Configuración global" showBack><View style={styles.center}><ActivityIndicator size="large" color={colors.brand600} /><Text style={styles.loadingText}>Organizando la configuración…</Text></View></ScreenScaffold>;
  if (resource.error && !resource.data) return <ScreenScaffold title="Datos del negocio" subtitle="Configuración global" showBack><View style={styles.center}><MaterialCommunityIcons name="cloud-alert-outline" size={48} color={colors.danger} /><Text style={styles.errorTitle}>No pudimos cargar la configuración</Text><Text style={styles.loadingText}>{resource.error.message}</Text><PrimaryButton label="Volver a intentar" onPress={() => void resource.refetch()} style={styles.retry} /></View></ScreenScaffold>;

  return (
    <ScreenScaffold title="Datos del negocio" subtitle="Configuración global y comunicaciones" showBack>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={resource.refreshing} onRefresh={() => void resource.refresh()} tintColor={colors.brand600} />}
      >
        <View style={styles.hero}>
          <View style={styles.heroIcon}><MaterialCommunityIcons name="store-cog-outline" size={30} color={colors.onDark} /></View>
          <View style={styles.heroCopy}><Text style={styles.heroEyebrow}>CONFIGURACIÓN COMPARTIDA</Text><Text style={styles.heroTitle}>Una sola fuente para todo el negocio</Text><Text style={styles.heroText}>Los cambios se reflejan en todos los locales, la web y la aplicación.</Text></View>
        </View>
        <Text style={styles.sectionLabel}>Información y operación</Text>
        <ConfigCard icon="office-building-outline" title="Identidad legal" copy={`${text(business.legalName, 'Sin configurar')} · RUC ${text(business.ruc, '—')}`} action="Editar datos legales" onPress={() => setForm({ title: 'Identidad legal', fields: businessFields, submit: (values) => run(() => staffApi.updateBusiness({ ...values, complaintResponseDays: number(values.complaintResponseDays) }), 'Datos legales actualizados.') })} />
        <ConfigCard icon="cellphone-check" title="Yape y Plin" copy={`${payments.yapeEnabled ? 'Yape activo' : 'Yape inactivo'} · ${payments.plinEnabled ? 'Plin activo' : 'Plin inactivo'}`} action="Configurar pagos locales" onPress={() => setForm({ title: 'Pagos locales', fields: paymentFields, submit: (values) => run(() => staffApi.updateLocalPayments(values), 'Medios de pago actualizados.') })} />
        <ConfigCard icon="receipt-text-outline" title="Tickets internos" copy={`${text(receipts.mode, 'INTERNAL_ONLY').replaceAll('_', ' ')} · papel ${text(receipts.paperWidth, '80')} mm`} action="Configurar impresión" onPress={() => setForm({ title: 'Tickets internos', fields: receiptFields, submit: (values) => run(() => staffApi.updateReceipts({ ...values, paperWidth: number(values.paperWidth) }), 'Configuración de tickets actualizada.') })} />
        <ConfigCard icon="email-fast-outline" title="Correo y notificaciones" copy={`${text(communication.deliveryMode, 'Sin proveedor')} · ${text(communication.fromEmail, 'Sin remitente')}`} action="Configurar comunicaciones" onPress={() => setForm({ title: 'Comunicaciones', fields: communicationFieldsWithWhatsapp, submit: (values) => run(() => staffApi.updateCommunication(communicationInput(values)), 'Comunicaciones actualizadas.') })} />
        <View style={[styles.card, shadow.sm]}>
          <View style={styles.cardHeader}><View style={styles.cardIcon}><MaterialCommunityIcons name="bell-badge-outline" size={24} color={colors.brand700} /></View><View style={styles.cardCopy}><Text style={styles.title}>Actividad de notificaciones</Text><Text style={styles.muted}>{text(object(notifications.totals).sent, '0')} enviadas · {text(object(notifications.totals).failed, '0')} fallidas</Text></View></View>
          {recent.length ? recent.slice(0, 5).map((item) => <View key={String(item.id)} style={styles.history}><View style={styles.historyDot} /><View style={styles.cardCopy}><Text style={styles.historyTitle}>{text(item.subject, text(item.template))}</Text><Text style={styles.muted}>{text(item.status) === 'SENT' ? 'Enviada' : text(item.status)} · {text(item.recipient)}</Text></View></View>) : <Text style={styles.emptyHistory}>Aún no hay envíos recientes.</Text>}
        </View>
      </ScrollView>
      {form ? <StaffFormSheet visible title={form.title} fields={form.fields} loading={saving} onClose={() => setForm(null)} onSubmit={form.submit} /> : null}
    </ScreenScaffold>
  );
}

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
function ConfigCard({ icon, title, copy, action, onPress }: { icon: IconName; title: string; copy: string; action: string; onPress: () => void }) {
  return <View style={[styles.card, shadow.sm]}><View style={styles.cardHeader}><View style={styles.cardIcon}><MaterialCommunityIcons name={icon} size={25} color={colors.brand700} /></View><View style={styles.cardCopy}><Text style={styles.title}>{title}</Text><Text style={styles.muted}>{copy}</Text></View></View><PrimaryButton label={action} variant="secondary" onPress={onPress} style={styles.action} /></View>;
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  loadingText: { ...type.bodySm, color: colors.inkMuted, marginTop: spacing.sm, textAlign: 'center' },
  errorTitle: { ...type.heading, color: colors.ink, marginTop: spacing.md, textAlign: 'center' },
  retry: { minWidth: 190, marginTop: spacing.lg },
  hero: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.xl, backgroundColor: colors.surfaceDark, padding: spacing.lg },
  heroIcon: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, backgroundColor: colors.brand600 },
  heroCopy: { flex: 1 },
  heroEyebrow: { ...type.label, color: colors.brand100, letterSpacing: 1 },
  heroTitle: { ...type.heading, color: colors.onDark, marginTop: 4 },
  heroText: { ...type.bodySm, color: colors.onDarkMuted, marginTop: 4 },
  sectionLabel: { ...type.label, color: colors.brand700, letterSpacing: 1, marginTop: spacing.sm, textTransform: 'uppercase' },
  card: { borderRadius: radius.xl, borderWidth: 1, borderColor: colors.lineSoft, backgroundColor: colors.surface, padding: spacing.md },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  cardIcon: { width: 50, height: 50, alignItems: 'center', justifyContent: 'center', borderRadius: radius.lg, backgroundColor: colors.brand50 },
  cardCopy: { flex: 1 },
  title: { ...type.heading, color: colors.ink },
  muted: { ...type.bodySm, color: colors.inkMuted, marginTop: 4 },
  action: { marginTop: spacing.md },
  history: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm, borderTopWidth: 1, borderTopColor: colors.lineSoft, paddingTop: spacing.sm, marginTop: spacing.sm },
  historyDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.brand600, marginTop: 6 },
  historyTitle: { ...type.bodySm, color: colors.ink, fontWeight: '800' },
  emptyHistory: { ...type.bodySm, color: colors.inkMuted, borderTopWidth: 1, borderTopColor: colors.lineSoft, paddingTop: spacing.md, marginTop: spacing.md },
});
