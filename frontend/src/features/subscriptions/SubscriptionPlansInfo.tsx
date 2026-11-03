import { CalendarDays, ChevronDown, CreditCard, Gift } from 'lucide-react';
import { Link } from 'react-router-dom';
import { ROUTES } from '@constants/routes';

const QUESTIONS = [
  { title: '¿Qué recibo con mi suscripción?', text: 'Una caja con los productos, cantidades y presentaciones que se indican en tu plan. Cada mensualidad confirmada habilita una nueva caja para programar desde tu cuenta.' },
  { title: '¿Cómo funciona el cobro mensual?', text: 'Al contratar autorizas un pago recurrente a través de Mercado Pago por el importe mensual del plan. Revisas el total y aceptas las condiciones antes de continuar al pago.' },
  { title: '¿Dónde y cuándo recojo mi caja?', text: 'Eliges una sucursal habilitada al contratar. Después de cada pago confirmado programas un horario de recojo disponible, respetando la anticipación y vigencia de tu caja.' },
  { title: '¿Puedo cancelar los siguientes cobros?', text: 'Sí. Puedes cancelar los futuros cobros desde Mis suscripciones. Las cajas que ya pagaste siguen disponibles para programar hasta su vencimiento.' },
];

export const SubscriptionPlansInfo = () => <>
  <section id="como-funcionan-las-cajas" className="scroll-mt-28 border-y border-line bg-white/60 py-10 sm:py-14" aria-labelledby="box-steps-title">
    <div className="container-shell grid gap-8 lg:grid-cols-[.8fr_1.6fr] lg:gap-14">
      <div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-brand-700">Así de sencillo</p><h2 id="box-steps-title" className="mt-3 text-3xl leading-tight sm:text-4xl">Un ritual para<br className="hidden lg:block" /> disfrutar sin prisa.</h2></div>
      <ol className="grid gap-6 sm:grid-cols-3">
        {[
          { icon: Gift, title: 'Elige tu caja', text: 'Encuentra la combinación que más te apetece y revisa su contenido.' },
          { icon: CreditCard, title: 'Confirma tu plan', text: 'Elige la sucursal y autoriza el cobro mensual en Mercado Pago.' },
          { icon: CalendarDays, title: 'Reserva tu recojo', text: 'Cada pago confirmado habilita una caja para programar en tu cuenta.' },
        ].map(({ icon: Icon, title, text }, index) => <li key={title} className="border-t border-accent-200 pt-5"><div className="flex items-center justify-between"><span className="text-3xl font-bold text-accent-700">0{index + 1}</span><Icon className="size-5 text-brand-500" aria-hidden="true" /></div><h3 className="mt-4 text-sm font-bold text-ink">{title}</h3><p className="mt-2 text-sm leading-6 text-ink-muted">{text}</p></li>)}
      </ol>
    </div>
  </section>
  <section className="container-shell grid gap-6 py-12 sm:py-16 lg:grid-cols-[.8fr_1.6fr] lg:gap-14" aria-labelledby="box-questions-title">
    <div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-brand-700">Antes de elegir</p><h2 id="box-questions-title" className="mt-3 text-3xl leading-tight sm:text-4xl">Todo claro,<br className="hidden lg:block" /> desde el inicio.</h2><Link to={ROUTES.terms} className="mt-5 inline-flex min-h-10 items-center text-xs font-semibold text-brand-700 underline underline-offset-4">Condiciones de suscripción</Link></div>
    <div className="border-t border-line">{QUESTIONS.map((question) => <details key={question.title} className="group border-b border-line py-1"><summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-5 py-4 text-sm font-semibold text-ink">{question.title}<ChevronDown className="size-4 shrink-0 text-brand-600 transition-transform group-open:rotate-180" aria-hidden="true" /></summary><p className="max-w-2xl pb-5 pr-6 text-sm leading-7 text-ink-muted">{question.text}</p></details>)}</div>
  </section>
</>;
