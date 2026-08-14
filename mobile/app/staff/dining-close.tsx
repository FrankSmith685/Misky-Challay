import { MaterialCommunityIcons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Chip } from '../../src/components/Chip';
import { FormField } from '../../src/components/FormField';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { isValidDni, isValidRuc } from '../../src/lib/peruDocs';
import { printInternalReceipt } from '../../src/lib/internalReceipt';
import { money } from '../../src/lib/format';
import { useResource } from '../../src/hooks/useResource';
import { useToast } from '../../src/providers/ToastProvider';
import { businessApi } from '../../src/services/api/business.service';
import { staffApi } from '../../src/services/api/staff.service';
import { colors, radius, spacing, type } from '../../src/theme/tokens';
import type { PublicSettings } from '../../src/types/domain';

type Method = 'cash' | 'card' | 'yape' | 'plin';
type DocumentType = 'BOLETA' | 'FACTURA';

interface PaymentPart {
  id: number;
  method: Method;
  amount: string;
}

const methods: Array<{ value: Method; label: string }> = [
  { value: 'cash', label: 'Efectivo' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'yape', label: 'Yape' },
  { value: 'plin', label: 'Plin' },
];

const parseAmount = (value: string) => Number(value.replace(',', '.'));

export default function DiningCloseScreen() {
  const params = useLocalSearchParams<{
    orderNumber?: string;
    branchId?: string;
    total?: string;
  }>();
  const orderNumber = String(params.orderNumber ?? '');
  const branchId = Number(params.branchId);
  const expectedTotal = Number(params.total);
  const hasExpectedTotal = Number.isFinite(expectedTotal) && expectedTotal > 0;
  const toast = useToast();
  const settings = useResource<PublicSettings>({
    key: 'settings:public',
    fetcher: () => businessApi.publicSettings(),
    cacheMs: 300_000,
  });
  const receiptSettings = settings.data?.receipts ?? {
    mode: 'INTERNAL_ONLY' as const,
    autoPrintKitchenTicket: true,
    autoPrintCustomerTicket: false,
    paperWidth: 80 as const,
  };
  const fiscalEnabled = receiptSettings.mode !== 'INTERNAL_ONLY';

  const [parts, setParts] = useState<PaymentPart[]>([
    { id: 1, method: 'cash', amount: hasExpectedTotal ? expectedTotal.toFixed(2) : '' },
  ]);
  const [nextId, setNextId] = useState(2);
  const [documentType, setDocumentType] = useState<DocumentType>('BOLETA');
  const [dni, setDni] = useState('');
  const [ruc, setRuc] = useState('');
  const [billingName, setBillingName] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [saving, setSaving] = useState(false);

  const paidTotal = useMemo(
    () =>
      parts.reduce((sum, part) => {
        const amount = parseAmount(part.amount);
        return sum + (Number.isFinite(amount) ? amount : 0);
      }, 0),
    [parts],
  );
  const difference = hasExpectedTotal ? expectedTotal - paidTotal : 0;

  const updatePart = (id: number, change: Partial<PaymentPart>) => {
    setParts((current) => current.map((part) => (part.id === id ? { ...part, ...change } : part)));
  };

  const addPart = () => {
    if (parts.length >= 4) return;
    setParts((current) => [...current, { id: nextId, method: 'card', amount: '' }]);
    setNextId((current) => current + 1);
  };

  const close = async () => {
    if (!orderNumber || !Number.isInteger(branchId) || branchId <= 0) {
      toast.show({ tone: 'error', message: 'No encontramos la comanda o el local.' });
      return;
    }

    const payments = parts.map((part) => ({
      method: part.method,
      amount: parseAmount(part.amount),
    }));
    if (payments.some((payment) => !Number.isFinite(payment.amount) || payment.amount <= 0)) {
      toast.show({
        tone: 'error',
        message: 'Cada medio de pago debe tener un importe mayor a cero.',
      });
      return;
    }
    if (hasExpectedTotal && Math.abs(difference) > 0.01) {
      toast.show({
        tone: 'error',
        message: `Los pagos deben sumar exactamente ${money(expectedTotal)}.`,
      });
      return;
    }
    if (fiscalEnabled && documentType === 'FACTURA') {
      if (!isValidRuc(ruc)) {
        toast.show({ tone: 'error', message: 'Ingresa un RUC válido antes de emitir la factura.' });
        return;
      }
      if (billingName.trim().length < 3 || billingAddress.trim().length < 5) {
        toast.show({ tone: 'error', message: 'Completa la razón social y el domicilio fiscal.' });
        return;
      }
    } else if (fiscalEnabled && dni.trim() && !isValidDni(dni)) {
      toast.show({ tone: 'error', message: 'El DNI de la boleta debe tener 8 dígitos.' });
      return;
    }

    setSaving(true);
    try {
      await staffApi.closeDiningCommand(orderNumber, {
        branchId,
        payments,
        documentType: fiscalEnabled ? documentType : 'BOLETA',
        billingDocType: fiscalEnabled ? documentType === 'FACTURA' ? 'RUC' : dni.trim() ? 'DNI' : null : null,
        billingDocNumber: fiscalEnabled ? documentType === 'FACTURA' ? ruc.trim() : dni.trim() || null : null,
        billingName: fiscalEnabled && documentType === 'FACTURA' ? billingName.trim() : null,
        billingAddress: fiscalEnabled && documentType === 'FACTURA' ? billingAddress.trim() : null,
      });
      if (!fiscalEnabled && receiptSettings.autoPrintCustomerTicket) {
        const order = await staffApi.orderDetail(orderNumber);
        await staffApi.recordInternalReceiptPrint(orderNumber);
        await printInternalReceipt(order);
      }
      toast.show({
        tone: 'success',
        message: fiscalEnabled
          ? 'Mesa cobrada y liberada. El comprobante quedó solicitado para emisión.'
          : 'Mesa cobrada y liberada. El ticket interno quedó disponible.',
      });
      router.back();
    } catch (error) {
      toast.show({
        tone: 'error',
        message: error instanceof Error ? error.message : 'No pudimos cerrar la mesa.',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScreenScaffold
      title="Cobrar mesa"
      subtitle={`Comanda ${orderNumber}`}
      showBack
      footer={
        <PrimaryButton
          label="Confirmar cobro y liberar mesa"
          icon="check-circle-outline"
          loading={saving}
          onPress={() => void close()}
        />
      }
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
      >
        <View style={styles.guide}>
          <MaterialCommunityIcons name="receipt-text-outline" size={24} color={colors.brand700} />
          <View style={styles.guideCopy}>
            <Text style={styles.title}>
              {fiscalEnabled ? 'Cobro y comprobante en un solo paso' : 'Cobro y ticket interno en un solo paso'}
            </Text>
            <Text style={styles.muted}>
              {fiscalEnabled
                ? 'La serie y el correlativo los asigna el emisor electrónico. El personal no debe escribirlos.'
                : 'El ticket usa el número del pedido, no requiere serie ni correlativo y no tiene valor tributario.'}
            </Text>
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.sectionTitle}>Medios de pago</Text>
            <Text style={styles.muted}>Puedes dividir el total hasta en cuatro medios.</Text>
          </View>
          {parts.length < 4 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Agregar otro medio de pago"
              onPress={addPart}
              style={styles.addButton}
            >
              <MaterialCommunityIcons name="plus" size={19} color={colors.brand700} />
              <Text style={styles.addLabel}>Dividir</Text>
            </Pressable>
          ) : null}
        </View>

        {parts.map((part, index) => (
          <View key={part.id} style={styles.paymentCard}>
            <View style={styles.paymentHeader}>
              <Text style={styles.paymentTitle}>Pago {index + 1}</Text>
              {parts.length > 1 ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Eliminar pago ${index + 1}`}
                  hitSlop={10}
                  onPress={() =>
                    setParts((current) => current.filter((entry) => entry.id !== part.id))
                  }
                >
                  <MaterialCommunityIcons name="close" size={22} color={colors.inkMuted} />
                </Pressable>
              ) : null}
            </View>
            <View style={styles.choices}>
              {methods.map((method) => (
                <Chip
                  key={method.value}
                  label={method.label}
                  selected={part.method === method.value}
                  onPress={() => updatePart(part.id, { method: method.value })}
                />
              ))}
            </View>
            <FormField
              label="Importe"
              value={part.amount}
              onChangeText={(amount) => updatePart(part.id, { amount })}
              keyboardType="decimal-pad"
              placeholder="0.00"
              icon="cash"
            />
          </View>
        ))}

        <View style={styles.totalCard}>
          {hasExpectedTotal ? (
            <SummaryLine label="Total de la comanda" value={money(expectedTotal)} />
          ) : null}
          <SummaryLine label="Pagos registrados" value={money(paidTotal)} strong />
          {hasExpectedTotal ? (
            <SummaryLine
              label={
                Math.abs(difference) <= 0.01
                  ? 'Cuadre correcto'
                  : difference > 0
                    ? 'Falta cobrar'
                    : 'Exceso'
              }
              value={money(Math.abs(difference))}
              tone={Math.abs(difference) <= 0.01 ? 'success' : 'danger'}
            />
          ) : null}
        </View>

        {fiscalEnabled ? <>
        <View style={styles.sectionHeading}>
          <View>
            <Text style={styles.sectionTitle}>Comprobante</Text>
            <Text style={styles.muted}>
              Boleta por defecto; factura solo con datos fiscales completos.
            </Text>
          </View>
        </View>
        <View style={styles.choices}>
          <Chip
            label="Boleta"
            selected={documentType === 'BOLETA'}
            onPress={() => setDocumentType('BOLETA')}
          />
          <Chip
            label="Factura"
            selected={documentType === 'FACTURA'}
            onPress={() => setDocumentType('FACTURA')}
          />
        </View>

        {documentType === 'FACTURA' ? (
          <View style={styles.fiscalFields}>
            <FormField
              label="RUC"
              value={ruc}
              onChangeText={(value) => setRuc(value.replace(/\D/g, '').slice(0, 11))}
              keyboardType="number-pad"
              maxLength={11}
              placeholder="20123456789"
              icon="card-account-details-outline"
            />
            <FormField
              label="Razón social"
              value={billingName}
              onChangeText={setBillingName}
              maxLength={200}
              placeholder="Empresa S.A.C."
              icon="office-building-outline"
            />
            <FormField
              label="Domicilio fiscal"
              value={billingAddress}
              onChangeText={setBillingAddress}
              maxLength={200}
              placeholder="Av. Ejemplo 123, Lima"
              icon="map-marker-outline"
            />
          </View>
        ) : (
          <FormField
            label="DNI del cliente (opcional)"
            value={dni}
            onChangeText={(value) => setDni(value.replace(/\D/g, '').slice(0, 8))}
            keyboardType="number-pad"
            maxLength={8}
            placeholder="12345678"
            icon="card-account-details-outline"
            hint="Déjalo vacío cuando la boleta no requiera identificación."
          />
        )}
        </> : (
          <View style={styles.internalTicketCard}>
            <MaterialCommunityIcons name="receipt-text-outline" size={28} color={colors.brand700} />
            <View style={styles.internalTicketCopy}>
              <Text style={styles.sectionTitle}>Ticket interno</Text>
              <Text style={styles.muted}>
                Se genera con el número del pedido. No requiere serie ni correlativo y no es un comprobante de pago.
              </Text>
            </View>
          </View>
        )}
      </ScrollView>
    </ScreenScaffold>
  );
}

function SummaryLine({
  label,
  value,
  strong = false,
  tone = 'default',
}: {
  label: string;
  value: string;
  strong?: boolean;
  tone?: 'default' | 'success' | 'danger';
}) {
  return (
    <View style={styles.summaryLine}>
      <Text style={[styles.summaryLabel, strong && styles.strong]}>{label}</Text>
      <Text
        style={[
          styles.summaryValue,
          strong && styles.strong,
          tone === 'success' && styles.success,
          tone === 'danger' && styles.danger,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, padding: spacing.md, paddingBottom: spacing.xl },
  guide: {
    flexDirection: 'row',
    gap: spacing.sm + 2,
    borderRadius: radius.lg,
    backgroundColor: colors.brand50,
    padding: spacing.md,
  },
  guideCopy: { flex: 1, gap: spacing.xs },
  title: { ...type.heading, color: colors.ink },
  muted: { ...type.bodySm, color: colors.inkMuted },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  sectionTitle: { ...type.heading, color: colors.ink },
  addButton: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.brand50,
    paddingHorizontal: spacing.sm + 4,
  },
  addLabel: { ...type.bodySm, color: colors.brand700, fontWeight: '900' },
  paymentCard: {
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.lineSoft,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    padding: spacing.md,
  },
  paymentHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  paymentTitle: { ...type.body, color: colors.ink, fontWeight: '900' },
  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  totalCard: {
    gap: spacing.sm,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceDark,
    padding: spacing.md,
  },
  summaryLine: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.md },
  summaryLabel: { ...type.bodySm, color: colors.onDarkMuted },
  summaryValue: { ...type.bodySm, color: colors.onDark },
  strong: { fontWeight: '900' },
  success: { color: '#8ce0b4' },
  danger: { color: '#ffb1b1' },
  fiscalFields: { gap: spacing.xs },
  internalTicketCard: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderWidth: 1,
    borderColor: colors.brand100,
    borderRadius: radius.lg,
    backgroundColor: colors.brand50,
    padding: spacing.md,
  },
  internalTicketCopy: { flex: 1, gap: spacing.xs },
});
