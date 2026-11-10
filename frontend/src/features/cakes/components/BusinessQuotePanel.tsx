import { useMemo, useState } from 'react';
import { BriefcaseBusiness, CalendarDays, FileText, MessageCircle, ShieldCheck, Users } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { Checkbox } from '@components/ui/Checkbox';
import { Input } from '@components/ui/Input';
import { Select, SelectOption } from '@components/ui/Select';
import { useBusinessInfo } from '@services/businessInfo';
import { whatsappLink } from '@lib/whatsapp';

const REQUEST_TYPES = [
  { value: 'EVENTO', label: 'Evento corporativo' },
  { value: 'REGALOS', label: 'Regalos corporativos' },
  { value: 'CELEBRACION', label: 'Celebración interna' },
  { value: 'VOLUMEN', label: 'Pedido por volumen' },
] as const;

const encodeMail = (value: string) => encodeURIComponent(value);

export const BusinessQuotePanel = ({ selectedLocation }: { selectedLocation?: string }) => {
  const business = useBusinessInfo();
  const [requestType, setRequestType] = useState<(typeof REQUEST_TYPES)[number]['value']>('EVENTO');
  const [company, setCompany] = useState('');
  const [ruc, setRuc] = useState('');
  const [contact, setContact] = useState('');
  const [email, setEmail] = useState('');
  const [quantity, setQuantity] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [deliveryAddress, setDeliveryAddress] = useState('');
  const [needsInvoice, setNeedsInvoice] = useState(false);

  const requestLabel = REQUEST_TYPES.find((item) => item.value === requestType)?.label ?? 'Evento corporativo';
  const message = useMemo(() => [
    'Hola, Misky Challay. Quiero solicitar una propuesta empresarial.',
    `Tipo de pedido: ${requestLabel}.`,
    `Empresa: ${company.trim() || 'Pendiente de indicar'}.`,
    `RUC: ${ruc.trim() || 'Pendiente de indicar'}.`,
    `Contacto: ${contact.trim() || 'Pendiente de indicar'}.`,
    `Correo: ${email.trim() || 'Pendiente de indicar'}.`,
    `Cantidad aproximada: ${quantity.trim() || 'Pendiente de indicar'}.`,
    `Fecha del evento: ${eventDate || 'Por confirmar'}.`,
    `Dirección o zona de entrega: ${deliveryAddress.trim() || selectedLocation || 'Por confirmar'}.`,
    `Requiere factura: ${needsInvoice ? 'Sí' : 'Por confirmar'}.`,
  ].join('\n'), [company, contact, deliveryAddress, email, eventDate, needsInvoice, quantity, requestLabel, ruc, selectedLocation]);
  const whatsapp = whatsappLink(business.whatsappPhone ?? business.phone, message);
  const emailHref = `mailto:${business.supportEmail}?subject=${encodeMail(`Propuesta empresarial · ${requestLabel}`)}&body=${encodeMail(message)}`;

  return (
    <section id="solicitar-propuesta" className="scroll-mt-24" aria-labelledby="business-quote-title">
      <Card className="overflow-hidden border-brand-200 bg-gradient-to-br from-brand-50 via-white to-accent-50/50 p-0 shadow-e2">
        <div className="grid gap-7 p-5 sm:p-7 lg:grid-cols-[.8fr_1.2fr] lg:gap-10">
          <div>
            <span className="inline-flex items-center gap-2 rounded-pill bg-brand-700 px-3 py-1.5 text-[11px] font-bold text-white">
              <BriefcaseBusiness className="size-3.5" aria-hidden="true" />
              Atención empresarial
            </span>
            <h2 id="business-quote-title" className="mt-4 text-2xl font-black tracking-tight text-ink sm:text-3xl">
              ¿Tienes un pedido grande o una fecha especial?
            </h2>
            <p className="mt-3 text-sm leading-6 text-ink-muted">
              Cuéntanos lo esencial y te responderemos con una propuesta de productos, cantidad,
              fecha y entrega. El precio final se confirma antes de pagar.
            </p>
            <ul className="mt-5 space-y-3 text-xs leading-5 text-ink-muted">
              <li className="flex items-start gap-2"><Users className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden="true" />Atendemos celebraciones, regalos y pedidos por volumen.</li>
              <li className="flex items-start gap-2"><CalendarDays className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden="true" />Coordinamos anticipación, horario y cobertura antes de confirmar.</li>
              <li className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden="true" />Puedes solicitar factura y compartir referencias de marca.</li>
            </ul>
          </div>

          <div className="rounded-card border border-line bg-white p-4 sm:p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Select label="Necesidad" value={requestType} onChange={(event) => setRequestType(event.target.value as typeof requestType)}>
                {REQUEST_TYPES.map((item) => <SelectOption key={item.value} value={item.value}>{item.label}</SelectOption>)}
              </Select>
              <Input label="Cantidad aproximada" type="number" min={1} placeholder="Ej. 30" value={quantity} onChange={(event) => setQuantity(event.target.value)} />
              <Input label="Empresa" placeholder="Nombre de la empresa" value={company} onChange={(event) => setCompany(event.target.value)} />
              <Input label="RUC" inputMode="numeric" maxLength={11} placeholder="20600000000" value={ruc} onChange={(event) => setRuc(event.target.value.replace(/\D/g, '').slice(0, 11))} />
              <Input label="Persona de contacto" placeholder="Nombre y apellido" value={contact} onChange={(event) => setContact(event.target.value)} />
              <Input label="Correo de contacto" type="email" placeholder="nombre@empresa.com" value={email} onChange={(event) => setEmail(event.target.value)} />
              <Input label="Fecha del evento" type="date" value={eventDate} onChange={(event) => setEventDate(event.target.value)} />
              <Input className="sm:col-span-2" label="Dirección o zona de entrega" placeholder={selectedLocation ?? 'Distrito, local o dirección del evento'} value={deliveryAddress} onChange={(event) => setDeliveryAddress(event.target.value)} />
            </div>
            <Checkbox
              className="mt-4"
              checked={needsInvoice}
              onChange={(event) => setNeedsInvoice(event.target.checked)}
              label="Necesito factura para este pedido"
            />
            <div className="mt-5 grid gap-2 sm:grid-cols-2">
              <Button component="a" href={whatsapp ?? undefined} target="_blank" rel="noopener noreferrer" className="w-full" disabled={!whatsapp} leftIcon={<MessageCircle className="size-4" />}>
                Solicitar por WhatsApp
              </Button>
              <Button component="a" href={emailHref} className="w-full" variant="outline" leftIcon={<FileText className="size-4" />}>
                Enviar por correo
              </Button>
            </div>
            <p className="mt-3 text-[11px] leading-5 text-ink-muted">
              La solicitud es gratuita y no confirma una compra. Nuestro equipo validará disponibilidad,
              cobertura y condiciones antes de enviarte el precio.
            </p>
          </div>
        </div>
      </Card>
    </section>
  );
};
