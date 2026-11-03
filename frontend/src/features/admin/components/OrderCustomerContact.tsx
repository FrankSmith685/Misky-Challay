import { useState } from 'react';
import { Mail, MessageCircle, Phone } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { Textarea } from '@components/ui/Textarea';
import { Select, SelectOption } from '@components/ui/Select';
import { whatsappLink } from '@lib/whatsapp';
import { formatDate } from '@lib/format';
import { getApiErrorMessage } from '@services/api/client';
import { usePermissions } from '@hooks/usePermissions';
import { PERM } from '@constants/permissions';
import { adminApi } from '../services/admin.service';
import type { AdminOrderDetail, CustomerContactRecord } from '../types';

const labels = { WHATSAPP: 'WhatsApp', EMAIL: 'Correo', PHONE: 'Llamada', IN_PERSON: 'En persona' };
export function OrderCustomerContact({ order, onRecorded }: { order: AdminOrderDetail; onRecorded: () => Promise<void> }) {
  const { can } = usePermissions();
  const [editing, setEditing] = useState(false);
  const [channel, setChannel] = useState<CustomerContactRecord['channel']>('WHATSAPP');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const contact = order.customerContactJson;
  const pending = order.status === 'PENDING_PAYMENT';
  const delivered = order.status === 'DELIVERED';
  const closed = ['DELIVERED', 'CANCELLED', 'REFUNDED'].includes(order.status);
  const message = delivered ? `Hola ${order.contactName ?? ''}, somos Misky Challay. Tu pedido ${order.orderNumber} fue entregado. Gracias por confiar en nosotros. Esperamos que disfrutes tu celebración.` : `Hola ${order.contactName ?? ''}, somos Misky Challay. Recibimos tu pedido ${order.orderNumber}.${pending ? ' El pago está pendiente de confirmación.' : ''} Quisiéramos coordinar contigo el diseño, las imágenes de referencia y la entrega o el recojo.`;
  const whatsapp = whatsappLink(order.contactPhone, message);
  const record = async () => {
    if (saving) return;
    setSaving(true); setError('');
    try { await adminApi.recordCustomerContact(order.orderNumber, { channel, note: note.trim() }); await onRecorded(); setEditing(false); }
    catch (caught) { setError(getApiErrorMessage(caught)); }
    finally { setSaving(false); }
  };
  return <section className="grid gap-3 rounded-card border border-brand-200 bg-brand-50/40 p-3" aria-label="Coordinación con el cliente">
    <div><h4 className="font-bold">{contact ? 'Contacto inicial registrado' : closed ? 'Atención al cliente' : 'Contacto inicial pendiente'}</h4><p className="mt-1 text-xs leading-5 text-ink-muted">{contact ? `${labels[contact.channel]} · ${formatDate(contact.contactedAt)}` : closed ? 'Mantén el contacto para atender cualquier consulta sobre este pedido.' : 'Contacta al cliente desde el inicio para revisar el diseño, las referencias y la entrega o el recojo.'}</p>{contact?.note && <p className="mt-2 whitespace-pre-wrap text-xs">{contact.note}</p>}</div>
    <div className="flex flex-wrap gap-2">
      {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-field border border-line bg-white px-3 text-xs font-semibold text-brand-700"><MessageCircle className="size-4" /> Contactar por WhatsApp</a>}
      {order.customerEmail && <a href={`mailto:${order.customerEmail}?subject=${encodeURIComponent(`Coordinación del pedido ${order.orderNumber}`)}&body=${encodeURIComponent(message)}`} className="inline-flex min-h-11 items-center gap-2 rounded-field border border-line bg-white px-3 text-xs font-semibold text-brand-700"><Mail className="size-4" /> Escribir correo</a>}
      {order.contactPhone && <a href={`tel:${order.contactPhone.replace(/\s/g, '')}`} className="inline-flex min-h-11 items-center gap-2 rounded-field border border-line bg-white px-3 text-xs font-semibold text-brand-700"><Phone className="size-4" /> {order.contactPhone}</a>}
    </div>
    {!contact && !closed && (can(PERM.ORDER_UPDATE_STATUS) || can(PERM.COMMUNICATION_REPLY)) && <>
      {!editing ? <Button size="sm" variant="outline" onClick={() => setEditing(true)}>Registrar contacto realizado</Button> : <div className="grid gap-3">
        <p className="text-xs text-ink-muted">Registra el contacto después de hablar o escribir al cliente.</p>
        <Select label="Canal utilizado" value={channel} onChange={(event) => setChannel(event.target.value as CustomerContactRecord['channel'])}>{Object.entries(labels).map(([value, label]) => <SelectOption key={value} value={value}>{label}</SelectOption>)}</Select>
        <Textarea label="Acuerdos de coordinación (opcional)" maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
        <div className="flex gap-2"><Button size="sm" isLoading={saving} onClick={() => void record()}>Guardar contacto</Button><Button size="sm" variant="ghost" disabled={saving} onClick={() => setEditing(false)}>Cancelar</Button></div>
        {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
      </div>}
    </>}
  </section>;
}
