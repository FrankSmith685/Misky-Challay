import { CalendarCheck2, ChevronDown, CreditCard, MousePointerClick, WalletCards } from 'lucide-react';
import { Card } from '@components/ui/Card';

const STEPS = [
  {
    icon: MousePointerClick,
    title: 'Elige tu plan',
    text: 'Compara inversión, saldo recibido, vigencia y beneficios.',
  },
  {
    icon: CreditCard,
    title: 'Paga de forma segura',
    text: 'Completa el pago en el Checkout alojado del proveedor.',
  },
  {
    icon: WalletCards,
    title: 'Usa tu saldo',
    text: 'Al confirmarse el cobro, el saldo aparece en tu billetera.',
  },
];

const FAQS = [
  {
    question: '¿Es una suscripción mensual?',
    answer: 'No. Cada plan se compra una sola vez y no existe renovación automática.',
  },
  {
    question: '¿Puedo usar el saldo en varios pedidos?',
    answer: 'Sí. Puedes consumirlo poco a poco. El sistema usa primero el lote que vence antes.',
  },
  {
    question: '¿Cuándo aparece el saldo?',
    answer: 'Después de que el proveedor de pago confirme el cobro mediante su notificación segura.',
  },
  {
    question: '¿Qué pasa si compro otro plan antes de que venza el actual?',
    answer: 'La nueva compra crea saldos y vigencias independientes. No borra ni extiende automáticamente los lotes anteriores; al pagar pedidos se usa primero el saldo que vence antes.',
  },
  {
    question: '¿Qué sucede con el saldo que no utilicé?',
    answer: 'Al terminar el plan vencen el bono restante y sus beneficios. El saldo proveniente de tu dinero pagado puede seguir utilizándose hasta cumplir 180 días desde la activación.',
  },
];

/** Explica el flujo y resuelve objeciones frecuentes después del comparador. */
export const PlansGuide = () => (
  <>
    <section className="mt-16 sm:mt-20">
      <div className="mx-auto max-w-2xl text-center">
        <p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand-700">Simple y transparente</p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-ink sm:text-3xl">
          Del plan a tu próximo bowl en tres pasos
        </h2>
      </div>
      <ol className="mt-8 grid gap-4 md:grid-cols-3">
        {STEPS.map(({ icon: Icon, title, text }, index) => (
          <li key={title}>
            <Card className="relative h-full rounded-card p-5">
              <span className="absolute right-4 top-3 text-4xl font-black text-brand-50">0{index + 1}</span>
              <span className="grid size-10 place-items-center rounded-card bg-brand-50 text-brand-700">
                <Icon className="size-5" />
              </span>
              <h3 className="mt-4 font-extrabold text-ink">{title}</h3>
              <p className="mt-1.5 text-sm leading-6 text-ink-muted">{text}</p>
            </Card>
          </li>
        ))}
      </ol>
    </section>

    <section className="mt-16 grid gap-8 rounded-card border border-line bg-white p-5 shadow-e2 sm:p-8 lg:grid-cols-[.8fr_1.2fr] lg:items-start">
      <div>
        <span className="grid size-11 place-items-center rounded-card bg-brand-700 text-white">
          <CalendarCheck2 className="size-5" />
        </span>
        <p className="mt-5 text-xs font-extrabold uppercase tracking-[.16em] text-brand-700">Preguntas frecuentes</p>
        <h2 className="mt-2 text-2xl font-black tracking-tight text-ink">Todo claro antes de elegir</h2>
        <p className="mt-3 text-sm leading-6 text-ink-muted">
          Los planes son recargas con beneficios, no membresías con cargos recurrentes.
        </p>
      </div>

      <div className="divide-y divide-line overflow-hidden rounded-card border border-line">
        {FAQS.map((faq) => (
          <details key={faq.question} className="group bg-white open:bg-brand-50/35">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-4 text-sm font-extrabold text-ink marker:hidden sm:px-5">
              {faq.question}
              <ChevronDown className="size-4 shrink-0 text-brand-700 transition-transform group-open:rotate-180" />
            </summary>
            <p className="px-4 pb-4 text-sm leading-6 text-ink-muted sm:px-5">{faq.answer}</p>
          </details>
        ))}
      </div>
    </section>
  </>
);
