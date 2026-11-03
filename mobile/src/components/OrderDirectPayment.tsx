import { useState } from 'react';
import { Image, Text, View } from 'react-native';
import { apiRequest } from '../services/api/client';
import { FormField } from './FormField';
import { PrimaryButton } from './PrimaryButton';
import type { OrderWithPayment } from '../types/domain';
import { env } from '../config/env';
type Direct = NonNullable<NonNullable<OrderWithPayment['payment']>['directPayment']>;
export function OrderDirectPayment({
  payment,
  onChanged,
}: {
  payment?: Direct;
  onChanged: () => void;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [paidAt, setPaidAt] = useState(() => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16));
  if (!payment) return null;
  const report = async () => {
    setBusy(true);
    try {
      await apiRequest(`/payments/${payment.paymentId}/mobile/report`, {
        method: 'POST',
        auth: true,
        body: {
          operationCode: code.trim(),
          payerName: name.trim(),
          payerPhone: phone.trim() || undefined,
          paidAt: new Date(paidAt).toISOString(),
          amount: payment.amount,
        },
      });
      setMessage('Reporte recibido. El equipo revisará la operación.');
      onChanged();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No pudimos enviar el reporte.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View
      style={{
        padding: 18,
        gap: 12,
        borderWidth: 1,
        borderColor: '#e7dcd5',
        borderRadius: 14,
        backgroundColor: '#fff',
      }}
    >
      <Text style={{ fontSize: 18, fontWeight: '700' }}>
        {payment.provider === 'yape' ? 'Yape' : 'Plin'} · S/ {Number(payment.amount).toFixed(2)}
      </Text>
      <Text>
        Estado:{' '}
        {(
          {
            AWAITING_PAYMENT: 'Pendiente de pago',
            REVIEW: 'Por verificar',
            OBSERVED: 'Requiere corrección',
            CONFIRMED: 'Confirmado',
            EXPIRED: 'Plazo vencido',
            REFUND_PENDING: 'Devolución pendiente',
            REFUNDED: 'Devuelto',
          } as Record<string, string>
        )[payment.state] ?? payment.state}
      </Text>
      <Text>{payment.recipient.instructions}</Text>
      <Text>
        {payment.recipient.phone} · {payment.recipient.recipient}
      </Text>
      {payment.recipient.expiresAt && (
        <Text>
          Plazo para pagar: {new Date(payment.recipient.expiresAt).toLocaleString('es-PE')}
        </Text>
      )}
      {payment.canReport && (
        <>
          {payment.recipient.qrImageUrl ? (
            <Image
              source={{ uri: payment.recipient.qrImageUrl.startsWith('/') ? `${env.webUrl}${payment.recipient.qrImageUrl}` : payment.recipient.qrImageUrl }}
              style={{ width: '100%', height: 220 }}
              resizeMode="contain"
            />
          ) : null}
          <Text>
            Paga el importe indicado para esta etapa del pedido y luego reporta la operación.
          </Text>
          <FormField label="Fecha y hora del pago (AAAA-MM-DDTHH:mm)" value={paidAt} onChangeText={setPaidAt} />
          <FormField
            label="Código de operación"
            value={code}
            onChangeText={setCode}
            maxLength={24}
          />
          <FormField
            label="Nombre de quien pagó"
            value={name}
            onChangeText={setName}
            maxLength={120}
          />
          <FormField
            label="Celular de quien pagó (opcional)"
            value={phone}
            onChangeText={setPhone}
            maxLength={9}
            keyboardType="phone-pad"
          />
          <PrimaryButton
            label="Enviar reporte de pago"
            loading={busy}
            disabled={code.trim().length < 3 || name.trim().length < 2}
            onPress={() => void report()}
          />
        </>
      )}
      {message ? <Text accessibilityLiveRegion="polite">{message}</Text> : null}
    </View>
  );
}
