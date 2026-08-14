import { ArrowRight } from 'lucide-react';
import { MarketingHeading, MarketingSection } from '@components/marketing';
import { Reveal, RevealGroup } from '@components/ui/Reveal';
import { HOME_STEPS } from '../homeContent';

/** Secuencia editorial conectada: comunica progreso sin repetir tres tarjetas iguales. */
export const HomeStepsSection = () => (
  <MarketingSection id="como-funciona" tone="white">
    <div className="grid gap-10 lg:grid-cols-[.72fr_1.28fr] lg:gap-16">
      <Reveal className="lg:sticky lg:top-28 lg:self-start">
        <MarketingHeading
          eyebrow="Así de fácil"
          title="De tu antojo a tu puerta"
          description="Una experiencia guiada que resuelve primero lo importante: dónde estás, qué quieres y cuándo lo recibirás."
        />
        <div className="mt-7 hidden border-l-2 border-brand-500 pl-4 text-sm leading-6 text-ink-muted lg:block">
          Sin precios ocultos.<br />Sin perder tu selección.<br />Sin adivinar el estado.
        </div>
      </Reveal>

      <RevealGroup className="relative" stagger={100}>
        <span className="absolute bottom-12 left-6 top-12 hidden w-px bg-brand-200 sm:block" aria-hidden="true" />
        {HOME_STEPS.map(({ number, icon: Icon, title, description }, index) => (
          <article key={number} className="group relative grid gap-5 border-t border-line py-7 first:border-t-2 first:border-brand-600 sm:grid-cols-[72px_1fr_auto] sm:items-center sm:gap-7 sm:py-9">
            <div className="relative z-10 flex items-center gap-3 sm:block">
              <span className="grid size-12 place-items-center rounded-card bg-brand-800 text-white shadow-lg shadow-brand-900/15">
                <Icon className="size-5" aria-hidden="true" />
              </span>
              <span className="text-xs font-black tracking-[.18em] text-brand-600 sm:mt-2 sm:block">PASO {number}</span>
            </div>
            <div>
              <h3 className="text-xl font-black tracking-tight text-ink sm:text-2xl">{title}</h3>
              <p className="mt-2 max-w-xl text-sm leading-6 text-ink-muted sm:text-base">{description}</p>
            </div>
            {index < HOME_STEPS.length - 1 && <ArrowRight className="hidden size-5 text-brand-300 transition-transform group-hover:translate-x-1 sm:block" aria-hidden="true" />}
          </article>
        ))}
      </RevealGroup>
    </div>
  </MarketingSection>
);
