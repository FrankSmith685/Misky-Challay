import { useCallback, useEffect, useState } from 'react';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Textarea } from '@components/ui/Textarea';
import { useLiveRefresh } from '@services/realtime';
import { customerJourneyApi, type JourneyData, type CustomerCase } from '@services/customerJourney';
import { getApiErrorMessage } from '@services/api/client';
import { formatCurrency } from '@lib/format';
import { accountApi } from '@features/account/services/account.service';
import type { DeliverySlot, Address } from '@features/geo/types';

const statusLabels: Record<string, string> = {
  OPEN: 'Abierta',
  AWAITING_CUSTOMER: 'Esperando tu confirmación',
  ACCEPTED: 'Aceptada',
  REJECTED: 'Rechazada',
  CLOSED: 'Atendida',
};
export function OrderCustomerJourney({
  order,
  staff = false,
  onChanged,
}: {
  order: {
    orderNumber: string;
    branch?: { id: number } | null;
    deliveryType: 'DELIVERY' | 'PICKUP' | 'DINE_IN';
    addressSnapshotJson?: { line1: string } | null;
    items: Array<{
      productId?: number | null;
      variantId?: number | null;
      quantity: number;
      customizations?: Array<{ optionId: number | null; quantity: number }>;
    }>;
  };
  staff?: boolean;
  onChanged?: () => void;
}) {
  const [data, setData] = useState<JourneyData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState<'SUPPORT' | 'CHANGE'>('SUPPORT');
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [slot, setSlot] = useState('');
  const [address, setAddress] = useState('');
  const [slots, setSlots] = useState<DeliverySlot[]>([]);
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const load = useCallback(async () => {
    try {
      setData(await customerJourneyApi.get(order.orderNumber, staff));
      setError('');
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    }
  }, [order.orderNumber, staff]);
  useEffect(() => {
    void load();
  }, [load]);
  useLiveRefresh(['orders', 'settings'], load);
  useEffect(() => {
    if(staff || kind !== 'CHANGE') return; let active=true;
    void accountApi.listAddresses().then(rows=>{if(active)setAddresses(rows)}).catch(cause=>{if(active)setError(getApiErrorMessage(cause))});
    return()=>{active=false};
  },[kind,staff]);
  useEffect(() => {
    if(staff || kind !== 'CHANGE') return; let active=true;
    const chosen=addresses.find(row=>row.id===Number(address));
    const destination=chosen?{label:chosen.label,line1:chosen.line1,reference:chosen.reference??undefined,districtId:chosen.districtId??undefined,latitude:Number(chosen.latitude),longitude:Number(chosen.longitude)}:undefined;
    void customerJourneyApi.options(order.orderNumber,destination).then(result=>{if(active){setSlots(result.slots);setError('')}}).catch(cause=>{if(active)setError(getApiErrorMessage(cause))});
    return()=>{active=false};
  },[kind,staff,order.orderNumber,address,addresses]);
  const run = async (action: () => Promise<unknown>) => {
    if (busy) return;
    setBusy(true);
    try {
      await action();
      setError('');
      await load();
      onChanged?.();
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const create = () =>
    run(async () => {
      const selected = addresses.find((entry) => entry.id === Number(address));
      const changes = {
        ...(name.trim() ? { contactName: name.trim() } : {}),
        ...(phone.trim() ? { contactPhone: phone.trim() } : {}),
        ...(slot ? { deliverySlotId: Number(slot) } : {}),
        ...(selected
          ? {
              address: {
                label: selected.label,
                line1: selected.line1,
                reference: selected.reference ?? undefined,
                districtId: selected.districtId ?? undefined,
                latitude: Number(selected.latitude),
                longitude: Number(selected.longitude),
              },
            }
          : {}),
      };
      await customerJourneyApi.create(order.orderNumber, { kind, text, changes, requestKey });
      setText('');
      setRequestKey(crypto.randomUUID());
    });
  return (
    <section
      className="space-y-4 rounded-card border border-line bg-white p-4"
      aria-label="Atención y acuerdos del pedido"
    >
      <h2 className="text-lg font-bold">Atención y acuerdos del pedido</h2>
      {error && (
        <div role="alert">
          <p className="text-sm text-red-700">{error}</p>
          <Button variant="ghost" onClick={() => void load()}>
            Actualizar
          </Button>
        </div>
      )}
      {data?.cases?.map((entry) => (
        <CaseThread
          key={entry.id}
          entry={entry}
          staff={staff}
          busy={busy}
          onAction={(action, response) =>
            void run(() =>
              customerJourneyApi.act(
                order.orderNumber,
                entry.id,
                { version: entry.version, action, text: response },
                staff,
              ),
            )
          }
        />
      ))}
      {staff ? (
        <div className="space-y-3">
          <Textarea
            label="Ficha final del diseño o nueva versión del acuerdo"
            value={text}
            maxLength={2000}
            onChange={(event) => setText(event.target.value)}
          />
          <Button
            disabled={text.trim().length < 5}
            isLoading={busy}
            onClick={() =>
              void run(async () => {
                await customerJourneyApi.design(order.orderNumber, text);
                setText('');
              })
            }
          >
            Enviar diseño para aprobación
          </Button>
          <p className="text-xs text-ink-muted">
            Describe el texto exacto, las porciones y el acabado. La propuesta requiere aceptación
            del cliente.
          </p>
        </div>
      ) : (
        <div className="space-y-3 border-t border-line pt-4">
          <label className="grid gap-2 text-sm">
            Tipo de solicitud
            <select
              className="rounded-field border border-line p-2"
              value={kind}
              onChange={(event) => setKind(event.target.value as 'SUPPORT' | 'CHANGE')}
            >
              <option value="SUPPORT">Consulta o problema con el pedido</option>
              <option value="CHANGE">Solicitar cambio antes de preparación</option>
            </select>
          </label>
          {kind === 'CHANGE' && (
            <div className="grid gap-3">
              <Input
                label="Nuevo nombre de contacto (opcional)"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
              <Input
                label="Nuevo teléfono (opcional)"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
              />
              <label className="grid gap-1 text-sm">
                Nueva franja (opcional)
                <select
                  value={slot}
                  onChange={(event) => setSlot(event.target.value)}
                  className="rounded-field border border-line p-2"
                >
                  <option value="">Conservar fecha y horario</option>
                  {slots.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {new Date(entry.startsAt).toLocaleString('es-PE')}
                    </option>
                  ))}
                </select>
              </label>
              {order.deliveryType === 'DELIVERY' && (
                <label className="grid gap-1 text-sm">
                  Nueva dirección guardada (opcional)
                  <select
                    value={address}
                    onChange={(event) => setAddress(event.target.value)}
                    className="rounded-field border border-line p-2"
                  >
                    <option value="">Conservar dirección</option>
                    {addresses
                      .filter((entry) => entry.latitude != null && entry.longitude != null)
                      .map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.label} · {entry.line1}
                        </option>
                      ))}
                  </select>
                </label>
              )}
              <p className="text-xs text-ink-muted">
                El equipo revisará el precio y la capacidad. El cambio se aplica cuando aceptes la
                propuesta vigente; un costo adicional quedará como saldo por pagar antes de la
                entrega.
              </p>
            </div>
          )}
          <Textarea
            label="Cuéntanos qué necesitas"
            maxLength={2000}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <Button disabled={text.trim().length < 5} isLoading={busy} onClick={() => void create()}>
            Enviar solicitud
          </Button>
        </div>
      )}
      {!staff && data?.care && (
        <details className="border-t border-line pt-3">
          <summary className="cursor-pointer font-semibold">Conservación y posventa</summary>
          <p className="mt-3 whitespace-pre-wrap text-sm">{data.care.content}</p>
          {data.care.products.map((item) => (
            <p key={item.name} className="mt-3 whitespace-pre-wrap text-sm">
              <strong>{item.name}:</strong> {item.instructions}
            </p>
          ))}
          <a className="mt-3 inline-block text-sm underline" href="/cuenta/opiniones">
            Opinar sobre una compra entregada
          </a>
        </details>
      )}
      {data?.gift && (
        <div className="border-t border-line pt-3 text-sm">
          <p>Regalo para {data.gift.recipientName}</p><p>{data.gift.hidePrices ? 'La ficha del destinatario oculta precios.' : 'El comprador permite mostrar el importe en la ficha.'}</p><p className="whitespace-pre-wrap">{data.gift.message}</p>
          <a
            className="underline"
            href={`/regalos/${data.gift.token}`}
            target="_blank"
            rel="noreferrer"
          >
            Abrir ficha para compartir con el destinatario
          </a>
        </div>
      )}
    </section>
  );
}
function CaseThread({
  entry,
  staff,
  busy,
  onAction,
}: {
  entry: CustomerCase;
  staff: boolean;
  busy: boolean;
  onAction: (action: string, text: string) => void;
}) {
  const [text, setText] = useState('');
  const closed = ['CLOSED', 'REJECTED'].includes(entry.status);
  return (
    <article className="space-y-3 rounded-xl border border-line p-3">
      <h3 className="font-semibold">
        {entry.kind === 'DESIGN'
          ? 'Diseño final'
          : entry.kind === 'CHANGE'
            ? 'Cambio solicitado'
            : 'Consulta'}{' '}
        #{entry.id} · {statusLabels[entry.status] ?? entry.status} · Versión {entry.version}
      </h3>
      {entry.payloadJson.changeSummary && <dl className="space-y-1 rounded-lg bg-brand-50 p-3 text-sm"><dt className="font-bold">Detalles del cambio</dt>{entry.payloadJson.changeSummary.scheduledAt && <dd>Fecha y hora: {new Date(entry.payloadJson.changeSummary.scheduledAt).toLocaleString('es-PE', { timeZone: 'America/Lima' })}</dd>}<dd>Contacto: {entry.payloadJson.changeSummary.contactName} {entry.payloadJson.changeSummary.contactPhone}</dd>{entry.payloadJson.changeSummary.addressLine && <dd>Dirección: {entry.payloadJson.changeSummary.addressLine}</dd>}<dd>Entrega: {formatCurrency(entry.payloadJson.changeSummary.deliveryFee ?? 0)}</dd></dl>}
      {entry.payloadJson.agreements?.length ? <details><summary className="cursor-pointer text-sm font-semibold">Acuerdos aceptados</summary>{entry.payloadJson.agreements.map((agreement, index) => <div key={index} className="mt-2 border-t border-line pt-2 text-xs"><p>Versión {agreement.proposalVersion} · {new Date(agreement.acceptedAt).toLocaleString('es-PE')}</p><p className="whitespace-pre-wrap">{agreement.proposal}</p><p>Ajuste: {formatCurrency(agreement.priceDifference ?? 0)}</p></div>)}</details> : null}
      {entry.messagesJson.map((message) => (
        <div
          key={message.id}
          className={`rounded-lg p-3 text-sm ${message.author === 'STAFF' ? 'bg-brand-50' : 'bg-surface-muted'}`}
        >
          <p className="mb-1 text-xs font-bold">
            {message.author === 'STAFF' ? 'Equipo' : 'Cliente'} ·{' '}
            {new Date(message.createdAt).toLocaleString('es-PE')}
          </p>
          <p className="whitespace-pre-wrap break-words">{message.text}</p>
        </div>
      ))}
      {entry.status === 'AWAITING_CUSTOMER' && (
        <p className="text-sm font-semibold">
          Ajuste de precio: {formatCurrency(entry.payloadJson.priceDifference ?? 0)}.{' '}
          {Number(entry.payloadJson.priceDifference) > 0 ? 'Se añadirá al saldo pendiente.' : ''}
        </p>
      )}
      {!closed && (
        <>
          <Textarea
            label={`Respuesta a la solicitud ${entry.id}`}
            maxLength={2000}
            value={text}
            onChange={(event) => setText(event.target.value)}
          />
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              disabled={!text.trim() || busy}
              onClick={() => {
                onAction('MESSAGE', text);
                setText('');
              }}
            >
              Responder
            </Button>
            {staff && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={text.trim().length < 5 || busy}
                  onClick={() => onAction('PROPOSE', text)}
                >
                  Publicar propuesta
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => onAction('CLOSE', text)}
                >
                  Cerrar atención
                </Button>
              </>
            )}
            {!staff && entry.status === 'AWAITING_CUSTOMER' && (
              <>
                <Button size="sm" disabled={busy} onClick={() => onAction('ACCEPT', text)}>
                  Aceptar propuesta vigente
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => onAction('REJECT', text)}
                >
                  Rechazar propuesta
                </Button>
              </>
            )}
          </div>
        </>
      )}
    </article>
  );
}
