import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import {
  StaffFormSheet,
  type StaffFormField,
  type StaffFormValue,
} from '../../src/components/staff/StaffFormSheet';
import { useResource } from '../../src/hooks/useResource';
import { useSession } from '../../src/providers/SessionProvider';
import { useToast } from '../../src/providers/ToastProvider';
import { staffApi, type StaffRow } from '../../src/services/api/staff.service';
import { printInternalReceipt, shareInternalReceiptPdf } from '../../src/lib/internalReceipt';
import { colors, radius, shadow, spacing, type } from '../../src/theme/tokens';

const object = (value: unknown): StaffRow =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as StaffRow) : {};
const text = (value: unknown, fallback = '—') =>
  value === null || value === undefined || value === '' ? fallback : String(value);
const money = (value: unknown) => `S/ ${Number(value ?? 0).toFixed(2)}`;
const toNumber = (value: StaffFormValue | undefined) =>
  Number(String(value ?? '').replace(',', '.'));
const dateTime = (value: unknown) => {
  const date = new Date(String(value ?? ''));
  if (Number.isNaN(date.getTime())) return 'hora pendiente';
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

interface FormState {
  title: string;
  subtitle?: string;
  submitLabel?: string;
  fields: StaffFormField[];
  submit: (values: Record<string, StaffFormValue>) => Promise<void>;
}

export default function StaffOrderDetailScreen() {
  const params = useLocalSearchParams<{ orderNumber?: string }>();
  const orderNumber = String(params.orderNumber ?? '');
  const { user } = useSession();
  const toast = useToast();
  const [form, setForm] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const resource = useResource<StaffRow>({
    key: orderNumber ? `staff:order:${orderNumber}` : null,
    fetcher: () => staffApi.orderDetail(orderNumber),
    cacheMs: 15_000,
  });
  const order = resource.data ?? {};
  const can = (permission: string) =>
    Boolean(user?.isSuperAdmin || user?.permissions.includes(permission));
  const items = useMemo(
    () => (Array.isArray(order.detailItems) ? order.detailItems.map(object) : []),
    [order.detailItems],
  );
  const payments = useMemo(
    () => (Array.isArray(order.payments) ? order.payments.map(object) : []),
    [order.payments],
  );
  const history = useMemo(
    () => (Array.isArray(order.statusHistory) ? order.statusHistory.map(object) : []),
    [order.statusHistory],
  );
  const kitchenTicket = object(order.kitchenTicket);
  const scheduledAt = order.scheduledAt ? new Date(String(order.scheduledAt)) : null;
  const prepMinutes = Number(object(order.branch).prepMinutes ?? 20);
  const releaseAt = scheduledAt && !Number.isNaN(scheduledAt.getTime())
    ? new Date(scheduledAt.getTime() - prepMinutes * 60_000)
    : null;
  const kitchenState = kitchenTicket.id
    ? `Comanda ${text(kitchenTicket.status)}. La cocina ya puede gestionarla.`
    : order.serviceMode === 'SCHEDULED' && scheduledAt
      ? `Visible en Cocina como Programado. Entrará automáticamente a En cola ${releaseAt ? dateTime(releaseAt) : 'cuando inicie su margen de preparación'} para entregarse ${dateTime(scheduledAt)}.`
      : String(order.status) === 'CONFIRMED'
        ? 'Pago confirmado. La comanda debe estar visible en la cola activa de Cocina.'
        : 'Todavía no existe una comanda activa para este pedido.';

  const run = async (action: () => Promise<unknown>, success: string) => {
    setSaving(true);
    try {
      await action();
      setForm(null);
      toast.show({ tone: 'success', message: success });
      await resource.refresh();
    } catch (error) {
      toast.show({
        tone: 'error',
        message: error instanceof Error ? error.message : 'No pudimos guardar el cambio.',
      });
    } finally {
      setSaving(false);
    }
  };

  const externalInvoice = () =>
    setForm({
      title: 'Contingencia: CPE externo',
      subtitle:
        'Úsalo solo cuando la boleta o factura ya fue emitida fuera del sistema. No crea un comprobante en SUNAT.',
      submitLabel: 'Registrar CPE existente',
      fields: [
        {
          key: 'series',
          label: 'Serie asignada por el emisor',
          required: true,
          placeholder: 'B001',
        },
        { key: 'number', label: 'Correlativo asignado', required: true, placeholder: '00001234' },
        { key: 'providerReference', label: 'Referencia del proveedor' },
        { key: 'pdfUrl', label: 'URL del PDF' },
        { key: 'xmlUrl', label: 'URL del XML' },
      ],
      submit: (values) =>
        run(
          () =>
            staffApi.registerInvoice(orderNumber, {
              series: String(values.series).trim().toUpperCase(),
              number: String(values.number).trim(),
              providerReference: String(values.providerReference || '') || undefined,
              pdfUrl: String(values.pdfUrl || '') || undefined,
              xmlUrl: String(values.xmlUrl || '') || undefined,
            }),
          'Comprobante externo vinculado al pedido.',
        ),
    });

  const printTicket = async () => {
    setSaving(true);
    try {
      await staffApi.recordInternalReceiptPrint(orderNumber);
      await printInternalReceipt(order);
      toast.show({ tone: 'success', message: 'Solicitud de impresión registrada.' });
      await resource.refresh();
    } catch (error) {
      toast.show({ tone: 'error', message: error instanceof Error ? error.message : 'No pudimos imprimir el ticket.' });
    } finally {
      setSaving(false);
    }
  };

  const saveTicketPdf = async () => {
    setSaving(true);
    try {
      await shareInternalReceiptPdf(order);
    } catch (error) {
      toast.show({ tone: 'error', message: error instanceof Error ? error.message : 'No pudimos generar el PDF.' });
    } finally {
      setSaving(false);
    }
  };

  const refund = (payment: StaffRow) =>
    setForm({
      title: 'Registrar devolución',
      fields: [
        {
          key: 'amount',
          label: 'Importe',
          kind: 'number',
          value: text(payment.amount, ''),
          required: true,
        },
        {
          key: 'reason',
          label: 'Motivo de la devolución',
          kind: 'multiline',
          required: true,
        },
      ],
      submit: (values) =>
        run(
          () =>
            staffApi.refundPayment(
              Number(payment.id),
              toNumber(values.amount),
              String(values.reason),
            ),
          'Devolución enviada al proveedor de pagos.',
        ),
    });

  if (resource.loading) {
    return (
      <ScreenScaffold title={`Pedido ${orderNumber}`} showBack>
        <View style={styles.center}>
          <Text style={styles.muted}>Cargando ficha completa…</Text>
        </View>
      </ScreenScaffold>
    );
  }

  if (resource.error) {
    return (
      <ScreenScaffold title={`Pedido ${orderNumber}`} showBack>
        <View style={styles.error}>
          <Text style={styles.errorTitle}>No pudimos cargar el pedido</Text>
          <Text style={styles.muted}>{resource.error.message}</Text>
          <PrimaryButton label="Reintentar" onPress={() => void resource.refetch()} />
        </View>
      </ScreenScaffold>
    );
  }

  return (
    <ScreenScaffold
      title={`Pedido ${orderNumber}`}
      subtitle={`${text(order.deliveryType)} · ${text(order.status)}`}
      showBack
    >
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, shadow.md]}>
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>SALDO PENDIENTE</Text>
            <Text style={styles.total}>{money(order.grandTotal)}</Text>
            <Text style={styles.onDark}>
              {Number(order.walletAmount ?? 0) > 0 ? `Cubierto con saldo: ${money(order.walletAmount)} · ` : ''}{text(order.contactName, 'Cliente')} · {text(order.contactPhone, 'sin teléfono')}
            </Text>
          </View>
          <MaterialCommunityIcons
            name="receipt-text-check-outline"
            size={42}
            color={colors.brand100}
          />
        </View>

        <View style={[styles.operationalCard, shadow.sm]}>
          <View style={styles.operationalIcon}>
            <MaterialCommunityIcons name={kitchenTicket.id ? 'chef-hat' : 'calendar-clock'} size={25} color={colors.warning} />
          </View>
          <View style={styles.invoiceCopy}>
            <Text style={styles.operationalLabel}>ESTADO OPERATIVO DE COCINA</Text>
            <Text style={styles.invoiceTitle}>{kitchenTicket.id ? 'En producción' : order.serviceMode === 'SCHEDULED' ? 'Pedido programado confirmado' : 'Pendiente de comanda'}</Text>
            <Text style={styles.muted}>{kitchenState}</Text>
          </View>
        </View>

        <View style={[styles.invoiceCard, { backgroundColor: colors.brand50 }]}> 
          <View style={[styles.invoiceIcon, { backgroundColor: colors.brand100 }]}> 
            <MaterialCommunityIcons name="receipt-text-outline" size={25} color={colors.brand700} />
          </View>
          <View style={styles.invoiceCopy}>
            <Text style={[styles.invoiceLabel, { color: colors.brand700 }]}>TICKET INTERNO DISPONIBLE</Text>
            <Text style={styles.invoiceTitle}>Pedido {orderNumber}</Text>
            <Text style={styles.muted}>Resumen para entrega y control. No es un comprobante de pago y no usa serie ni correlativo.</Text>
            <Text style={styles.printMeta}>{Number(order.internalReceiptPrintCount ?? 0) > 0 ? `${text(order.internalReceiptPrintCount)} impresión(es) registrada(s)` : 'Todavía no impreso'}</Text>
          </View>
        </View>

        {String(order.status) !== 'PENDING_PAYMENT' ? (
          <View style={styles.ticketActions}>
            <PrimaryButton label={Number(order.internalReceiptPrintCount ?? 0) > 0 ? 'Reimprimir ticket' : 'Imprimir ticket'} icon="printer-outline" loading={saving} onPress={() => void printTicket()} style={styles.ticketAction} />
            <PrimaryButton label="Guardar / compartir PDF" variant="secondary" icon="file-pdf-box" loading={saving} onPress={() => void saveTicketPdf()} style={styles.ticketAction} />
          </View>
        ) : null}

        {can('invoice.manage') && order.invoiceStatus !== 'ISSUED' && !['PENDING_PAYMENT', 'CANCELLED', 'REFUNDED'].includes(String(order.status)) ? (
          <PrimaryButton
            label="Registrar CPE externo (opcional)"
            variant="secondary"
            icon="receipt-text-edit-outline"
            onPress={externalInvoice}
          />
        ) : null}

        <Section title="Atención y entrega">
          <Line label="Local" value={text(object(order.branch).name)} />
          <Line label="Canal" value={text(order.deliveryType)} />
          <Line label="Estado" value={text(order.status)} />
          <Line label="Documento operativo" value="Ticket interno · no fiscal" />
          {order.invoiceStatus === 'ISSUED' ? <Line label="CPE externo" value={`${text(order.invoiceSeries)}-${text(order.invoiceNumber)}`} /> : null}
          {object(order.addressSnapshotJson).line1 ? (
            <Line
              label="Dirección"
              value={`${text(object(order.addressSnapshotJson).line1)} · ${text(
                object(order.addressSnapshotJson).reference,
                'sin referencia',
              )}`}
            />
          ) : null}
          {order.notes ? <Line label="Comentario" value={text(order.notes)} /> : null}
        </Section>

        <Section title={`Productos (${items.length})`}>
          {items.map((item) => (
            <View key={String(item.id)} style={styles.item}>
              <View style={styles.itemCopy}>
                <Text style={styles.itemTitle}>
                  {text(item.quantity)} × {text(item.productNameSnapshot)}
                </Text>
                <Text style={styles.muted}>
                  {text(item.variantNameSnapshot, 'Presentación estándar')}
                  {item.specialInstructions ? ` · ${text(item.specialInstructions)}` : ''}
                </Text>
              </View>
              <Text style={styles.itemPrice}>{money(item.lineTotal)}</Text>
            </View>
          ))}
        </Section>

        <Section title="Pagos y devoluciones">
          {payments.length ? (
            payments.map((payment) => (
              <View key={String(payment.id)} style={styles.payment}>
                <View style={styles.itemCopy}>
                  <Text style={styles.itemTitle}>
                    {text(payment.provider).toUpperCase()} · {text(payment.status)}
                  </Text>
                  <Text style={styles.muted}>
                    {money(payment.amount)} · {text(payment.providerReference, 'sin referencia')}
                  </Text>
                </View>
                {can('payment.refund') && payment.status === 'SUCCEEDED' && Number(payment.amount ?? 0) > 0 ? (
                  <PrimaryButton
                    label="Devolver"
                    variant="danger"
                    onPress={() => refund(payment)}
                    style={styles.smallAction}
                  />
                ) : null}
              </View>
            ))
          ) : (
            <Text style={styles.muted}>No hay pagos registrados.</Text>
          )}
        </Section>

        <Section title="Historial">
          {history.map((entry) => (
            <View key={String(entry.id)} style={styles.timeline}>
              <View style={styles.dot} />
              <View style={styles.itemCopy}>
                <Text style={styles.itemTitle}>{text(entry.toStatus)}</Text>
                <Text style={styles.muted}>
                  {text(entry.comment, 'Sin comentario')} · {text(entry.createdAt)}
                </Text>
              </View>
            </View>
          ))}
        </Section>

        {order.invoicePdfUrl ? (
          <PrimaryButton
            label="Abrir comprobante PDF"
            variant="secondary"
            icon="file-pdf-box"
            onPress={() => void Linking.openURL(String(order.invoicePdfUrl))}
          />
        ) : null}
      </ScrollView>

      {form ? (
        <StaffFormSheet
          visible
          title={form.title}
          subtitle={form.subtitle}
          fields={form.fields}
          submitLabel={form.submitLabel}
          loading={saving}
          onClose={() => setForm(null)}
          onSubmit={form.submit}
        />
      ) : null}
    </ScreenScaffold>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={[styles.section, shadow.sm]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.line}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xxl },
  center: { padding: spacing.xl, alignItems: 'center' },
  hero: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceDark,
    padding: spacing.lg,
  },
  heroCopy: { flex: 1 },
  eyebrow: { ...type.caption, color: colors.brand100, fontWeight: '900', letterSpacing: 1 },
  total: { ...type.display, color: colors.onDark, marginVertical: 4 },
  onDark: { ...type.bodySm, color: colors.onDarkMuted },
  invoiceCard: {
    flexDirection: 'row',
    gap: spacing.md,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  invoiceIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  invoiceCopy: { flex: 1, gap: 2 },
  invoiceLabel: { ...type.label, fontWeight: '900', textTransform: 'uppercase' },
  invoiceTitle: { ...type.heading, color: colors.ink },
  printMeta: { ...type.caption, color: colors.brand700, fontWeight: '800', marginTop: 5 },
  ticketActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  ticketAction: { flexGrow: 1, minWidth: 220 },
  operationalCard: {
    flexDirection: 'row',
    gap: spacing.md,
    borderWidth: 1,
    borderColor: colors.accent100,
    borderRadius: radius.lg,
    backgroundColor: colors.accent50,
    padding: spacing.md,
  },
  operationalIcon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: colors.accent100,
  },
  operationalLabel: { ...type.label, color: colors.warning, fontWeight: '900' },
  section: {
    gap: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  sectionTitle: { ...type.heading, color: colors.ink, marginBottom: spacing.xs },
  line: {
    flexDirection: 'row',
    gap: spacing.md,
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  label: { ...type.bodySm, color: colors.inkMuted },
  value: { ...type.bodySm, flex: 1, color: colors.ink, fontWeight: '700', textAlign: 'right' },
  item: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineSoft,
    paddingVertical: spacing.sm,
  },
  itemCopy: { flex: 1 },
  itemTitle: { ...type.bodySm, color: colors.ink, fontWeight: '900' },
  itemPrice: { ...type.bodySm, color: colors.brand700, fontWeight: '900' },
  muted: { ...type.bodySm, color: colors.inkMuted, marginTop: 2 },
  payment: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  smallAction: { minHeight: 44, paddingHorizontal: 14 },
  timeline: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.brand600, marginTop: 6 },
  error: {
    gap: spacing.md,
    margin: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: colors.danger50,
    padding: spacing.lg,
  },
  errorTitle: { ...type.heading, color: colors.danger },
});
