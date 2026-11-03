import { useState } from 'react';
import { Image, Linking, Modal, Pressable, Text, View } from 'react-native';
import { useResource } from '../hooks/useResource';
import { apiRequest } from '../services/api/client';
import { FormField } from './FormField';
import { PrimaryButton } from './PrimaryButton';
import type { OrderWithPayment, Address, DeliverySlot } from '../types/domain';
import { env } from '../config/env';

interface Thread {
  id: number;
  kind: string;
  status: string;
  version: number;
  payloadJson: {
    priceDifference?: number;
    changeSummary?: {
      scheduledAt?: string;
      contactName?: string;
      contactPhone?: string;
      addressLine?: string;
    };
    agreements?: Array<{ proposalVersion: number; acceptedAt: string; proposal: string }>;
  };
  messagesJson: Array<{ id: string; author: string; text: string }>;
}
interface Journey {
  cases: Thread[];
  care: { content: string; products: Array<{ name: string; instructions: string }> };
  gift?: { recipientName: string; token: string };
}
export function OrderCustomerExtras({
  data,
  onChanged,
}: {
  data: OrderWithPayment;
  onChanged: () => void;
}) {
  const order = data.order;
  const [image, setImage] = useState('');
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<'SUPPORT' | 'CHANGE'>('SUPPORT');
  const [contact, setContact] = useState('');
  const [phone, setPhone] = useState('');
  const [termsOpen, setTermsOpen] = useState(false);
  const [slotId, setSlotId] = useState<number | null>(null);
  const [addressId, setAddressId] = useState<number | null>(null);
  const [slotLimit, setSlotLimit] = useState(8);
  const addresses = useResource<Address[]>({
    key: kind === 'CHANGE' ? 'account:addresses:order-change' : null,
    fetcher: () => apiRequest('/account/addresses', { auth: true }),
    cacheMs: 0,
  });
  const selectedAddress = addresses.data?.find((entry) => entry.id === addressId);
  const destination = selectedAddress
    ? {
        label: selectedAddress.label,
        line1: selectedAddress.line1,
        reference: selectedAddress.reference ?? undefined,
        districtId: selectedAddress.districtId ?? undefined,
        latitude: Number(selectedAddress.latitude),
        longitude: Number(selectedAddress.longitude),
      }
    : undefined;
  const options = useResource<{ slots: DeliverySlot[]; priceDifference: number }>({
    key: kind === 'CHANGE' ? `orders:change-options:${order.orderNumber}:${addressId ?? ''}` : null,
    fetcher: () =>
      apiRequest(`/customer/orders/${order.orderNumber}/change-options`, {
        method: 'POST',
        auth: true,
        body: { address: destination },
      }),
    cacheMs: 0,
  });
  const [requestKey, setRequestKey] = useState(() =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.floor(Math.random() * 16);
      return (c === 'x' ? r : (r & 3) | 8).toString(16);
    }),
  );
  const journey = useResource<Journey>({
    key: `orders:journey:${order.orderNumber}`,
    fetcher: () =>
      apiRequest(`/customer/orders/${encodeURIComponent(order.orderNumber)}`, { auth: true }),
    cacheMs: 0,
    pollIntervalMs: 15000,
  });
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      setText('');
      setError('');
      await journey.refetch();
      onChanged();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No pudimos guardar la solicitud.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <View style={{ gap: 15, padding: 16, backgroundColor: '#fff', borderRadius: 14 }}>
      <Text style={{ fontSize: 19, fontWeight: '700' }}>Tu diseño y acuerdos</Text>
      {order.items.map((item) => (
        <View key={item.id} style={{ gap: 8 }}>
          <Text style={{ fontWeight: '700' }}>{item.productNameSnapshot}</Text>
          {item.specialInstructions ? <Text>{item.specialInstructions}</Text> : null}
          {item.designQuoteId ? (
            <PrimaryButton
              label="Solicitar nueva cotización con este diseño"
              variant="secondary"
              onPress={() =>
                void Linking.openURL(
                  `${env.webUrl}/cuenta/pedidos/${encodeURIComponent(order.orderNumber)}`,
                ).catch(() => setError('No pudimos abrir la ficha web del pedido.'))
              }
            />
          ) : null}
          {item.designImages?.map((entry) => (
            <PrimaryButton
              key={entry.id}
              label={
                entry.kind === 'AI_PROPOSAL'
                  ? 'Ver propuesta con IA (ilustrativa)'
                  : 'Ver imagen de referencia'
              }
              variant="secondary"
              onPress={() =>
                void apiRequest<{ dataUrl: string }>(
                  `/customer/orders/${encodeURIComponent(order.orderNumber)}/images/${item.id}/${entry.id}`,
                  { auth: true },
                )
                  .then((result) => setImage(result.dataUrl))
                  .catch((cause) => setError(cause.message))
              }
            />
          ))}
        </View>
      ))}
      <Modal visible={Boolean(image)} animationType="fade" onRequestClose={() => setImage('')}>
        <View style={{ flex: 1, padding: 20, backgroundColor: '#fff' }}>
          <PrimaryButton label="Cerrar imagen" variant="secondary" onPress={() => setImage('')} />
          <Image source={{ uri: image }} style={{ flex: 1 }} resizeMode="contain" />
        </View>
      </Modal>
      {order.termsAcceptanceJson && (
        <View style={{ gap: 6 }}>
          <Text style={{ fontWeight: '700' }}>
            {order.termsAcceptanceJson.title} · Versión {order.termsAcceptanceJson.version}
          </Text>
          <Text>
            Aceptados el {new Date(order.termsAcceptanceJson.acceptedAt).toLocaleString('es-PE')}
          </Text>
          <PrimaryButton
            label={termsOpen ? 'Ocultar condiciones' : 'Leer condiciones aceptadas'}
            variant="ghost"
            onPress={() => setTermsOpen(!termsOpen)}
          />
          {termsOpen && <Text>{order.termsAcceptanceJson.content}</Text>}
        </View>
      )}
      {data.customerSummary && (
        <View>
          <Text style={{ fontWeight: '700' }}>Pagos y devoluciones</Text>
          <Text>
            Pagado: S/ {data.customerSummary.financial.paid.toFixed(2)} · Devuelto: S/{' '}
            {data.customerSummary.financial.refunded.toFixed(2)}
          </Text>
          {data.customerSummary.financial.refundPending > 0 && (
            <Text>
              Devolución pendiente de coordinación: S/{' '}
              {data.customerSummary.financial.refundPending.toFixed(2)}
            </Text>
          )}
          {data.customerSummary.cancellation.reason && (
            <Text>{data.customerSummary.cancellation.reason}</Text>
          )}
        </View>
      )}
      <Text style={{ fontSize: 18, fontWeight: '700' }}>Atención del pedido</Text>
      {journey.data?.cases?.map((entry) => (
        <View
          key={entry.id}
          style={{ borderWidth: 1, borderColor: '#e7dcd5', padding: 12, gap: 8 }}
        >
          <Text>
            Solicitud #{entry.id} ·{' '}
            {(
              {
                OPEN: 'Abierta',
                AWAITING_CUSTOMER: 'Esperando tu confirmación',
                ACCEPTED: 'Aceptada',
                REJECTED: 'Rechazada',
                CLOSED: 'Atendida',
              } as Record<string, string>
            )[entry.status] ?? entry.status}{' '}
            · Versión {entry.version}
          </Text>
          {entry.payloadJson.changeSummary && (
            <Text>
              Fecha:{' '}
              {entry.payloadJson.changeSummary.scheduledAt
                ? new Date(entry.payloadJson.changeSummary.scheduledAt).toLocaleString('es-PE')
                : 'Sin cambio'}{' '}
              · Contacto: {entry.payloadJson.changeSummary.contactName}{' '}
              {entry.payloadJson.changeSummary.contactPhone} ·{' '}
              {entry.payloadJson.changeSummary.addressLine}
            </Text>
          )}
          {entry.payloadJson.agreements?.map((agreement, index) => (
            <Text key={index}>
              Acuerdo aceptado · Versión {agreement.proposalVersion}: {agreement.proposal}
            </Text>
          ))}
          {entry.messagesJson.map((message) => (
            <Text key={message.id}>
              {message.author === 'STAFF' ? 'Equipo' : 'Cliente'}: {message.text}
            </Text>
          ))}
          {entry.status === 'AWAITING_CUSTOMER' && (
            <>
              <Text>Ajuste: S/ {Number(entry.payloadJson.priceDifference ?? 0).toFixed(2)}</Text>
              <PrimaryButton
                label="Aceptar propuesta vigente"
                loading={busy}
                onPress={() =>
                  void run(() =>
                    apiRequest(`/customer/orders/${order.orderNumber}/cases/${entry.id}`, {
                      method: 'POST',
                      auth: true,
                      body: { version: entry.version, action: 'ACCEPT', text: '' },
                    }),
                  )
                }
              />
              <PrimaryButton
                label="Rechazar propuesta"
                variant="secondary"
                loading={busy}
                onPress={() =>
                  void run(() =>
                    apiRequest(`/customer/orders/${order.orderNumber}/cases/${entry.id}`, {
                      method: 'POST',
                      auth: true,
                      body: { version: entry.version, action: 'REJECT', text: '' },
                    }),
                  )
                }
              />
            </>
          )}
          {!['CLOSED', 'REJECTED'].includes(entry.status) && (
            <PrimaryButton
              label="Enviar el texto escrito como respuesta"
              variant="secondary"
              disabled={!text.trim()}
              onPress={() =>
                void run(() =>
                  apiRequest(`/customer/orders/${order.orderNumber}/cases/${entry.id}`, {
                    method: 'POST',
                    auth: true,
                    body: { version: entry.version, action: 'MESSAGE', text },
                  }),
                )
              }
            />
          )}
        </View>
      ))}
      <Pressable
        accessibilityRole="checkbox"
        accessibilityState={{ checked: kind === 'CHANGE' }}
        onPress={() => setKind(kind === 'CHANGE' ? 'SUPPORT' : 'CHANGE')}
        style={{ paddingVertical: 12 }}
      >
        <Text>
          {kind === 'CHANGE'
            ? '☑ Solicitar cambio antes de preparación'
            : '☐ Solicitar cambio de contacto antes de preparación'}
        </Text>
      </Pressable>
      {kind === 'CHANGE' && (
        <>
          <FormField
            label="Nuevo nombre de contacto (opcional)"
            value={contact}
            onChangeText={setContact}
          />
          <FormField label="Nuevo teléfono (opcional)" value={phone} onChangeText={setPhone} />
          <Text>Fecha y horario solicitado</Text>
          <PrimaryButton
            label="Conservar fecha y horario"
            variant="ghost"
            onPress={() => setSlotId(null)}
          />
          {options.data?.slots.slice(0, slotLimit).map((slot) => (
            <PrimaryButton
              key={slot.id}
              variant={slotId === slot.id ? 'primary' : 'secondary'}
              label={new Date(slot.startsAt).toLocaleString('es-PE')}
              onPress={() => setSlotId(slot.id)}
            />
          ))}
          {(options.data?.slots.length ?? 0) > slotLimit && (
            <PrimaryButton
              label="Ver más horarios"
              variant="ghost"
              onPress={() => setSlotLimit(slotLimit + 8)}
            />
          )}
          {order.deliveryType === 'DELIVERY' && (
            <>
              <Text>Dirección de entrega</Text>
              <PrimaryButton
                label="Conservar dirección"
                variant="ghost"
                onPress={() => setAddressId(null)}
              />
              {addresses.data
                ?.filter((entry) => entry.latitude != null && entry.longitude != null)
                .map((entry) => (
                  <PrimaryButton
                    key={entry.id}
                    label={`${entry.label} · ${entry.line1}`}
                    variant={entry.id === addressId ? 'primary' : 'secondary'}
                    onPress={() => {
                      setAddressId(entry.id);
                      setSlotId(null);
                    }}
                  />
                ))}
            </>
          )}
          {options.data && (
            <Text>
              Ajuste estimado: S/ {Number(options.data.priceDifference).toFixed(2)}. El equipo
              publicará una propuesta antes de aplicar el cambio.
            </Text>
          )}
          {options.error && <Text>{options.error.message}</Text>}
        </>
      )}
      <FormField
        label="Consulta, problema o respuesta"
        value={text}
        onChangeText={setText}
        maxLength={2000}
        multiline
      />
      <PrimaryButton
        label="Abrir nueva solicitud"
        disabled={text.trim().length < 5}
        loading={busy}
        onPress={() =>
          void run(() =>
            apiRequest(`/customer/orders/${order.orderNumber}/cases`, {
              method: 'POST',
              auth: true,
              body: {
                kind,
                text,
                requestKey,
                changes: {
                  ...(contact.trim() ? { contactName: contact.trim() } : {}),
                  ...(phone.trim() ? { contactPhone: phone.trim() } : {}),
                  ...(slotId ? { deliverySlotId: slotId } : {}),
                  ...(destination ? { address: destination } : {}),
                },
              },
            }).then((result) => {
              setRequestKey(
                'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
                  const r = Math.floor(Math.random() * 16);
                  return (c === 'x' ? r : (r & 3) | 8).toString(16);
                }),
              );
              return result;
            }),
          )
        }
      />
      {(error || journey.error) && (
        <Text accessibilityLiveRegion="polite">{error || journey.error?.message}</Text>
      )}
      {journey.data?.care && (
        <View style={{ gap: 8 }}>
          <Text style={{ fontWeight: '700' }}>Conservación y posventa</Text>
          <Text>{journey.data.care.content}</Text>
          {journey.data.care.products.map((product) => (
            <Text key={product.name}>
              {product.name}: {product.instructions}
            </Text>
          ))}
        </View>
      )}
      {journey.data?.gift && (
        <PrimaryButton
          label={`Ficha del regalo para ${journey.data.gift.recipientName}`}
          variant="secondary"
          onPress={() => void Linking.openURL(`${env.webUrl}/regalos/${journey.data!.gift!.token}`)}
        />
      )}
    </View>
  );
}
