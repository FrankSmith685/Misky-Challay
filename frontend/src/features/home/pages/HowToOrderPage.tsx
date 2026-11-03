import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, ExternalLink, Sparkles } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { Breadcrumbs } from '@components/ui/Breadcrumbs';
import { ROUTES } from '@constants/routes';
import { useStorefront } from '../content/StorefrontContext';
import { OrderFaq, WalkthroughCards } from '../components/HomeLearningContent';
import { guideActions } from '../content/storefrontLinks';

const HowToOrderPage = () => {
  const { content } = useStorefront();
  return (
    <>
      <header className="border-b border-line bg-brand-50/60">
        <div className="container-shell py-10 sm:py-16">
          <Breadcrumbs
            items={[{ label: 'Inicio', to: ROUTES.home }, { label: 'Cómo hacer tu pedido' }]}
          />
          <p className="mt-8 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-brand-700">
            <BookOpen className="size-4" aria-hidden="true" />
            Guía de compra
          </p>
          <h1 className="mt-4 max-w-3xl text-3xl font-black leading-tight tracking-tight sm:text-5xl">
            {content.guide.title}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-8 text-ink-muted sm:text-lg">
            {content.guide.description}
          </p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button
              component={Link}
              to={ROUTES.customCake}
              leftIcon={<Sparkles className="size-4" aria-hidden="true" />}
            >
              Personalizar mi torta
            </Button>
            <Button component={Link} to={ROUTES.menu} variant="outline">
              Explorar el catálogo
              <ArrowRight className="ml-2 size-4" aria-hidden="true" />
            </Button>
          </div>
        </div>
      </header>
      <div className="container-shell grid items-start gap-10 py-12 lg:grid-cols-[260px_1fr] lg:gap-14 lg:py-16">
        <nav
          aria-label="Pasos de la guía"
          className="rounded-card border border-line bg-white p-5 lg:sticky lg:top-24"
        >
          <p className="text-xs font-bold uppercase tracking-widest text-brand-700">En esta guía</p>
          <ol className="mt-4 space-y-1">
            {content.guide.steps.map((step, i) => (
              <li key={i}>
                <a
                  href={`#paso-${i + 1}`}
                  className="flex min-h-11 items-start gap-3 py-2 text-sm leading-6 text-ink-muted hover:text-brand-700"
                >
                  <span className="font-bold text-brand-700">0{i + 1}</span>
                  {step.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <div className="min-w-0">
          <ol className="space-y-6">
            {content.guide.steps.map((step, i) => (
              <li
                id={`paso-${i + 1}`}
                key={i}
                className="scroll-mt-28 rounded-card border border-line bg-white p-6 sm:p-8"
              >
                <span className="text-xs font-extrabold uppercase tracking-widest text-brand-700">
                  Paso 0{i + 1}
                </span>
                <h2 className="mt-3 text-2xl font-bold leading-8">{step.title}</h2>
                <p className="mt-4 text-base leading-8 text-ink-muted">{step.description}</p>
                <Link
                  to={guideActions[step.action]}
                  className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-700"
                >
                  {step.label}
                  <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ol>
          {content.guide.videoUrl && (
            <a
              className="mt-7 flex min-h-14 items-center justify-between gap-4 rounded-card border border-brand-200 bg-brand-50 p-5 font-semibold text-brand-700"
              href={content.guide.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Ver el video de la guía
              <ExternalLink className="size-4 shrink-0" aria-hidden="true" />
            </a>
          )}
        </div>
      </div>
      <section className="border-y border-line bg-surface-muted">
        <div className="container-shell py-12 sm:py-16">
          <h2 className="text-3xl font-black tracking-tight">Un vistazo al personalizador</h2>
          <p className="mb-8 mt-4 max-w-2xl text-sm leading-7 text-ink-muted">
            Capturas de la herramienta. Consulta las opciones y los precios actuales cuando crees tu
            combinación.
          </p>
          <WalkthroughCards steps={content.walkthrough} />
        </div>
      </section>
      <section className="container-shell py-12 sm:py-16">
        <h2 className="mb-8 text-3xl font-black tracking-tight">Preguntas frecuentes</h2>
        <OrderFaq faqs={content.faqs} />
      </section>
    </>
  );
};
export default HowToOrderPage;
