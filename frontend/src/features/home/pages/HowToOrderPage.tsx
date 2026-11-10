import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BadgeCheck,
  BookOpen,
  CalendarDays,
  CakeSlice,
  Check,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  ExternalLink,
  ListChecks,
  MapPin,
  MessageCircle,
  PackageCheck,
  Search,
  Sparkles,
  Truck,
  UserRound,
} from 'lucide-react';
import { Button } from '@components/ui/Button';
import { Breadcrumbs } from '@components/ui/Breadcrumbs';
import { ROUTES } from '@constants/routes';
import { useBusinessInfo } from '@services/businessInfo';
import { whatsappLink } from '@lib/whatsapp';
import { useStorefront } from '../content/StorefrontContext';
import { OrderFaq } from '../components/HomeLearningContent';
import { guideActions } from '../content/storefrontLinks';

type GuideStep = ReturnType<typeof useStorefront>['content']['guide']['steps'][number];

type Phase = {
  number: string;
  title: string;
  description: string;
  icon: typeof Search;
  anchors: string[];
};

const PHASES: Phase[] = [
  {
    number: '01',
    title: 'Descubre',
    description: 'Encuentra una receta o empieza desde cero.',
    icon: Search,
    anchors: ['paso-1'],
  },
  {
    number: '02',
    title: 'Personaliza',
    description: 'Elige tamaño, sabores y detalles.',
    icon: CakeSlice,
    anchors: ['paso-2', 'paso-3'],
  },
  {
    number: '03',
    title: 'Programa',
    description: 'Define cómo y cuándo recibirlo.',
    icon: CalendarDays,
    anchors: ['paso-4'],
  },
  {
    number: '04',
    title: 'Paga y sigue',
    description: 'Completa el pago y revisa el avance.',
    icon: ClipboardCheck,
    anchors: ['paso-5', 'paso-6'],
  },
];

const STEP_ICONS = [Search, CakeSlice, ListChecks, CalendarDays, CreditCard, ClipboardCheck];
const STEP_VISUALS: Array<number | null> = [null, 0, 2, 3, null, null];

const StepVisual = ({
  step,
  visual,
}: {
  step: GuideStep;
  visual: ReturnType<typeof useStorefront>['content']['walkthrough'][number];
}) => (
  <figure className="overflow-hidden rounded-card border border-line bg-surface-muted">
    <div className="border-b border-line bg-white p-2.5 sm:p-3">
      <img
        src={visual.imageUrl}
        alt={visual.imageAlt}
        width="640"
        height="420"
        loading="lazy"
        className="max-h-80 w-full rounded-field border border-line bg-white object-contain object-top"
      />
    </div>
    <figcaption className="p-4">
      <p className="text-[10px] font-black uppercase tracking-[.16em] text-brand-700">En esta etapa</p>
      <p className="mt-1 text-sm font-bold leading-6 text-ink">{step.title}</p>
      <p className="mt-1 text-xs leading-5 text-ink-muted">{visual.title}</p>
    </figcaption>
  </figure>
);

const HowToOrderPage = () => {
  const { content } = useStorefront();
  const business = useBusinessInfo();
  const whatsapp = whatsappLink(
    business.whatsappPhone ?? business.phone,
    'Hola, necesito orientación para hacer un pedido en Misky Challay.',
  );

  const faqPrimary = content.faqs.slice(0, 3);
  const faqSecondary = content.faqs.slice(3);

  return (
    <>
      <header className="relative overflow-hidden border-b border-brand-100 bg-brand-50/60">
        <div className="pointer-events-none absolute -right-32 -top-28 size-[26rem] rounded-full bg-accent-100/70 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-40 left-[28%] size-[22rem] rounded-full bg-tertiary-50 blur-3xl" aria-hidden="true" />
        <div className="container-shell relative py-8 sm:py-12 lg:py-16">
          <Breadcrumbs items={[{ label: 'Inicio', to: ROUTES.home }, { label: 'Cómo hacer tu pedido' }]} />

          <div className="mt-8 grid items-center gap-10 lg:grid-cols-2 lg:gap-16">
            <div className="min-w-0 max-w-3xl">
              <p className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[.2em] text-brand-700">
                <span className="h-px w-8 bg-accent-500" aria-hidden="true" />
                <BookOpen className="size-4" aria-hidden="true" />
                Guía de compra
              </p>
              <h1 className="mt-5 max-w-3xl text-[clamp(2.35rem,5vw,4.65rem)] font-black leading-[1.03] tracking-[-.055em] text-ink">
                {content.guide.title}
              </h1>
              <p className="mt-5 max-w-2xl text-base leading-8 text-ink-muted sm:text-lg">
                {content.guide.description}
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Button
                  component={Link}
                  to={ROUTES.customCake}
                  size="lg"
                  leftIcon={<Sparkles className="size-4" aria-hidden="true" />}
                >
                  Personalizar mi torta
                  <ArrowRight className="ml-2 size-4" aria-hidden="true" />
                </Button>
                <Button component={Link} to={ROUTES.menu} size="lg" variant="outline">
                  Explorar el catálogo
                </Button>
              </div>
              <ul className="mt-7 flex flex-wrap gap-x-6 gap-y-3 border-t border-brand-200/70 pt-5 text-xs font-semibold text-ink-muted">
                <li className="flex items-center gap-2"><BadgeCheck className="size-4 text-brand-600" aria-hidden="true" />Precio visible antes de pagar</li>
                <li className="flex items-center gap-2"><CalendarDays className="size-4 text-tertiary-600" aria-hidden="true" />Fecha según capacidad real</li>
                <li className="flex items-center gap-2"><PackageCheck className="size-4 text-accent-700" aria-hidden="true" />Delivery o recojo programado</li>
              </ul>
            </div>

            <aside className="relative overflow-hidden rounded-[1.25rem] border border-white/90 bg-white p-5 shadow-e3 sm:p-7" aria-label="Resumen del proceso">
              <div className="absolute right-0 top-0 h-24 w-24 rounded-bl-[2.5rem] bg-accent-100/70" aria-hidden="true" />
              <div className="relative">
                <p className="text-xs font-black uppercase tracking-[.18em] text-brand-700">Tu recorrido</p>
                <h2 className="mt-3 text-2xl font-black tracking-tight text-ink">Cuatro momentos, una celebración</h2>
                <p className="mt-3 text-sm leading-6 text-ink-muted">Avanza a tu ritmo. La web guarda tus selecciones y te muestra el precio antes de confirmar.</p>
                <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
                  {PHASES.map((phase) => {
                    const Icon = phase.icon;
                    return (
                      <li key={phase.number}>
                        <a href={`#${phase.anchors[0]}`} className="group flex min-h-14 items-center gap-3 rounded-field border border-line bg-surface-muted/65 px-3 py-2.5 transition hover:border-brand-300 hover:bg-brand-50">
                          <span className="grid size-9 shrink-0 place-items-center rounded-field bg-brand-800 text-white"><Icon className="size-4" aria-hidden="true" /></span>
                          <span className="min-w-0">
                            <span className="block text-[10px] font-black uppercase tracking-[.15em] text-brand-700">{phase.number}</span>
                            <span className="block truncate text-sm font-bold text-ink">{phase.title}</span>
                          </span>
                          <ChevronRight className="ml-auto size-4 shrink-0 text-brand-400 transition-transform group-hover:translate-x-1" aria-hidden="true" />
                        </a>
                      </li>
                    );
                  })}
                </ol>
              </div>
            </aside>
          </div>
        </div>
      </header>

      <section className="border-b border-line bg-white" aria-labelledby="process-title">
        <div className="container-shell py-10 sm:py-14">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-black uppercase tracking-[.18em] text-brand-700">Vista rápida</p>
              <h2 id="process-title" className="mt-2 text-2xl font-black tracking-tight sm:text-3xl">Así funciona tu pedido</h2>
            </div>
            <p className="max-w-md text-sm leading-6 text-ink-muted">Los pasos detallados están debajo. Puedes saltar directamente a la etapa que necesitas.</p>
          </div>
          <ol className="mt-7 grid gap-3 md:grid-cols-4">
            {PHASES.map((phase, index) => {
              const Icon = phase.icon;
              return (
                <li key={phase.number} className="relative">
                  <a href={`#${phase.anchors[0]}`} className="group flex h-full min-w-0 items-start gap-3 rounded-card border border-line bg-surface-muted/55 p-4 transition hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50 hover:shadow-e2">
                    <span className="grid size-10 shrink-0 place-items-center rounded-field bg-brand-700 text-white shadow-e1"><Icon className="size-4" aria-hidden="true" /></span>
                    <span className="min-w-0">
                      <span className="block text-[10px] font-black uppercase tracking-[.15em] text-brand-700">{phase.number}</span>
                      <span className="mt-1 block text-base font-black text-ink">{phase.title}</span>
                      <span className="mt-1 block text-xs leading-5 text-ink-muted">{phase.description}</span>
                    </span>
                  </a>
                  {index < PHASES.length - 1 && <ArrowRight className="absolute -right-2.5 top-8 z-10 hidden size-5 text-brand-300 md:block" aria-hidden="true" />}
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <div className="container-shell grid items-start gap-10 py-12 pb-28 sm:py-16 sm:pb-16 lg:grid-cols-3 lg:gap-14 lg:py-20">
        <div className="min-w-0 lg:col-span-2">
          <section id="pasos" aria-labelledby="steps-title">
            <div className="flex flex-col justify-between gap-4 border-b border-line pb-7 sm:flex-row sm:items-end">
              <div>
                <p className="text-xs font-black uppercase tracking-[.18em] text-brand-700">Paso a paso</p>
                <h2 id="steps-title" className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">De la idea al seguimiento</h2>
              </div>
              <p className="max-w-sm text-sm leading-6 text-ink-muted">Lee solo lo que necesitas y usa cada acción para continuar tu compra.</p>
            </div>

            <ol className="relative mt-8 space-y-5">
              <span className="absolute bottom-12 left-6 top-12 hidden w-px bg-brand-200 sm:block" aria-hidden="true" />
              {content.guide.steps.map((step, index) => {
                const Icon = STEP_ICONS[index] ?? ClipboardCheck;
                const visualIndex = STEP_VISUALS[index];
                const visual = visualIndex === null ? null : content.walkthrough[visualIndex];
                return (
                  <li id={`paso-${index + 1}`} key={index} className="scroll-mt-28">
                    <article className="relative overflow-hidden rounded-card border border-line bg-white p-5 shadow-e1 transition hover:border-brand-200 hover:shadow-e2 sm:p-7">
                      <div className="flex items-start gap-4 sm:gap-5">
                        <div className="relative z-10 flex shrink-0 flex-col items-center gap-2">
                          <span className="grid size-12 place-items-center rounded-card bg-brand-800 text-white shadow-e2"><Icon className="size-5" aria-hidden="true" /></span>
                          <span className="text-[10px] font-black uppercase tracking-[.16em] text-brand-700">0{index + 1}</span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-black uppercase tracking-[.18em] text-brand-700">Paso 0{index + 1}</p>
                          <h3 className="mt-2 text-xl font-black leading-7 text-ink sm:text-2xl">{step.title}</h3>
                          <p className="mt-3 max-w-2xl text-sm leading-7 text-ink-muted sm:text-base">{step.description}</p>
                          <Link to={guideActions[step.action]} className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-black text-brand-700 underline-offset-4 hover:underline">
                            {step.label}
                            <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
                          </Link>
                        </div>
                      </div>
                      {visual && (
                        <div className="mt-6 border-t border-line pt-5 sm:ml-[4.25rem] sm:grid sm:grid-cols-2 sm:items-center sm:gap-6">
                          <div className="flex items-start gap-3 rounded-field bg-brand-50/70 p-4">
                            <Check className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden="true" />
                            <p className="text-xs leading-5 text-brand-900">Revisa tus opciones y el precio de esta etapa antes de continuar.</p>
                          </div>
                          <StepVisual step={step} visual={visual} />
                        </div>
                      )}
                    </article>
                  </li>
                );
              })}
            </ol>
          </section>

          {content.guide.videoUrl && (
            <a className="mt-8 flex min-h-16 items-center justify-between gap-4 rounded-card border border-brand-200 bg-brand-50 p-5 font-bold text-brand-800 transition hover:border-brand-400 hover:bg-brand-100" href={content.guide.videoUrl} target="_blank" rel="noopener noreferrer">
              <span className="flex items-center gap-3"><BookOpen className="size-5 shrink-0" aria-hidden="true" />Ver el video de la guía</span>
              <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
            </a>
          )}

          <section className="mt-12 rounded-[1.25rem] border border-brand-200 bg-gradient-to-br from-brand-800 via-brand-800 to-brand-900 p-6 text-white shadow-e3 sm:mt-16 sm:p-9" aria-labelledby="start-title">
            <div className="flex flex-col justify-between gap-7 lg:flex-row lg:items-center">
              <div className="max-w-2xl">
                <p className="text-xs font-black uppercase tracking-[.18em] text-brand-200">Tu próximo paso</p>
                <h2 id="start-title" className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">¿Listo para comenzar?</h2>
                <p className="mt-3 text-sm leading-7 text-brand-100 sm:text-base">Elige una receta de la casa o arma una combinación propia. Verás las opciones, el precio y la disponibilidad antes de pagar.</p>
              </div>
              <div className="flex shrink-0 flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
                <Button component={Link} to={ROUTES.customCake} size="lg" leftIcon={<Sparkles className="size-4" aria-hidden="true" />}>Crear mi torta</Button>
                <Button component={Link} to={ROUTES.menu} size="lg" variant="outline">Ver catálogo</Button>
              </div>
            </div>
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex min-h-11 items-center gap-2 text-sm font-bold text-white underline-offset-4 hover:underline">
                <MessageCircle className="size-4" aria-hidden="true" />¿Prefieres orientación? Escríbenos por WhatsApp<ArrowRight className="size-4" aria-hidden="true" />
              </a>
            )}
          </section>

          <section className="mt-14 border-t border-line pt-12 sm:mt-20 sm:pt-16" aria-labelledby="faq-title">
            <div className="grid gap-8 lg:grid-cols-2 lg:gap-14">
              <div>
                <p className="text-xs font-black uppercase tracking-[.18em] text-brand-700">Respuestas rápidas</p>
                <h2 id="faq-title" className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Antes de hacer tu pedido</h2>
                <p className="mt-4 text-sm leading-7 text-ink-muted">Aquí resolvemos las dudas más frecuentes sobre personalización, entrega, pagos y seguimiento.</p>
              </div>
              <div className="min-w-0 space-y-8">
                {faqPrimary.length > 0 && (
                  <div>
                    <h3 className="mb-3 text-sm font-black uppercase tracking-[.16em] text-brand-700">Personalización y entrega</h3>
                    <OrderFaq faqs={faqPrimary} />
                  </div>
                )}
                {faqSecondary.length > 0 && (
                  <div>
                    <h3 className="mb-3 text-sm font-black uppercase tracking-[.16em] text-brand-700">Pago y seguimiento</h3>
                    <OrderFaq faqs={faqSecondary} />
                  </div>
                )}
              </div>
            </div>
          </section>
        </div>

        <aside className="lg:col-span-1 lg:sticky lg:top-24" aria-label="Información para preparar tu pedido">
          <div className="rounded-card border border-line bg-white p-5 shadow-e1 sm:p-6">
            <p className="text-xs font-black uppercase tracking-[.18em] text-brand-700">Antes de empezar</p>
            <h2 className="mt-3 text-xl font-black leading-7 text-ink">Ten a la mano</h2>
            <ul className="mt-5 space-y-4">
              <li className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-field bg-brand-50 text-brand-700"><UserRound className="size-4" aria-hidden="true" /></span><span className="text-sm leading-6 text-ink-muted"><strong className="block text-ink">Tu cuenta</strong>La necesitarás para confirmar y seguir el pedido.</span></li>
              <li className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-field bg-accent-50 text-accent-700"><CalendarDays className="size-4" aria-hidden="true" /></span><span className="text-sm leading-6 text-ink-muted"><strong className="block text-ink">Una fecha objetivo</strong>La web solo muestra horarios disponibles.</span></li>
              <li className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-field bg-tertiary-50 text-tertiary-700"><MapPin className="size-4" aria-hidden="true" /></span><span className="text-sm leading-6 text-ink-muted"><strong className="block text-ink">Dirección o sede</strong>Elige delivery o recojo en el checkout.</span></li>
              <li className="flex items-start gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-field bg-brand-50 text-brand-700"><CreditCard className="size-4" aria-hidden="true" /></span><span className="text-sm leading-6 text-ink-muted"><strong className="block text-ink">Medio de pago</strong>Verás las instrucciones disponibles para tu pedido.</span></li>
            </ul>
            <div className="mt-6 border-t border-line pt-5">
              <p className="flex items-start gap-2 text-xs leading-5 text-ink-muted"><Truck className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden="true" />La fecha y el costo final se confirman antes de pagar.</p>
              {whatsapp && <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex min-h-10 items-center gap-2 text-xs font-bold text-brand-700 hover:underline"><MessageCircle className="size-4" aria-hidden="true" />Consultar por WhatsApp</a>}
            </div>
          </div>

          <nav className="mt-5 hidden rounded-card border border-line bg-white p-5 lg:block" aria-label="Navegar por la guía">
            <p className="text-xs font-black uppercase tracking-[.18em] text-brand-700">En esta guía</p>
            <ol className="mt-3 space-y-1">
              {PHASES.map((phase) => (
                <li key={phase.number}>
                  <a href={`#${phase.anchors[0]}`} className="flex min-h-10 items-center gap-3 rounded-field px-2 text-sm font-bold text-ink-muted transition hover:bg-brand-50 hover:text-brand-700"><span className="text-xs font-black text-brand-700">{phase.number}</span>{phase.title}<ChevronRight className="ml-auto size-3.5" aria-hidden="true" /></a>
                </li>
              ))}
            </ol>
          </nav>
        </aside>
      </div>
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-white/95 p-3 shadow-e4 backdrop-blur sm:hidden">
        <div className="container-shell flex gap-2">
          <Button component={Link} to={ROUTES.customCake} size="sm" className="min-w-0 flex-1" leftIcon={<Sparkles className="size-4" aria-hidden="true" />}>
            Personalizar
          </Button>
          <Button component={Link} to={ROUTES.menu} size="sm" variant="outline" className="min-w-0 flex-1">
            Catálogo
          </Button>
        </div>
      </div>
    </>
  );
};

export default HowToOrderPage;
