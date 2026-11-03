import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, CalendarDays, Check, Sparkles } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { ROUTES } from '@constants/routes';
import type { StorefrontContent } from '../content/storefront.schema';
import { useStorefront } from '../content/StorefrontContext';

export const HomeHero = ({ hero: supplied }: { hero?: StorefrontContent['hero'] }) => {
  const { content } = useStorefront();
  const hero = supplied ?? content.hero;
  return (
    <section className="relative overflow-hidden border-b border-brand-100 bg-brand-50/60">
      <div className="container-shell grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1.05fr_.95fr] lg:gap-16 lg:py-20">
        <div className="min-w-0 max-w-2xl">
          <p className="flex items-center gap-3 text-[11px] font-bold uppercase tracking-[.2em] text-brand-700">
            <span className="h-px w-9 shrink-0 bg-accent-500" aria-hidden="true" />
            {hero.eyebrow}
          </p>
          <h1 className="mt-5 text-[clamp(2.25rem,4.4vw,4.3rem)] font-black leading-[1.08] tracking-[-.04em] text-ink [overflow-wrap:anywhere]">
            {hero.title}
          </h1>
          <p className="mt-6 max-w-xl text-base leading-8 text-ink-muted sm:text-lg">
            {hero.description}
          </p>
          <div className="mt-8 flex flex-col gap-3 xl:flex-row">
            <Button
              component={Link}
              to={ROUTES.customCake}
              size="lg"
              className="w-full xl:w-auto"
              leftIcon={<Sparkles className="size-4 shrink-0" aria-hidden="true" />}
            >
              <span className="whitespace-normal">{hero.primaryLabel}</span>
              <ArrowRight className="ml-2 size-4 shrink-0" aria-hidden="true" />
            </Button>
            <Button
              component={Link}
              to={ROUTES.menu}
              size="lg"
              variant="outline"
              className="w-full xl:w-auto"
            >
              <span className="whitespace-normal">{hero.secondaryLabel}</span>
            </Button>
          </div>
          <Link
            to={ROUTES.howToOrder}
            className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-700 underline-offset-4 hover:underline"
          >
            <BookOpen className="size-4 shrink-0" aria-hidden="true" />
            ¿Primera vez? Aprende cómo pedir
            <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
          </Link>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-3 border-t border-brand-200/60 pt-5 text-xs text-ink-muted">
            <li className="flex items-center gap-2">
              <Check className="size-4 text-brand-600" aria-hidden="true" />
              Precio visible al personalizar
            </li>
            <li className="flex items-center gap-2">
              <CalendarDays className="size-4 text-brand-600" aria-hidden="true" />
              Entrega o recojo programado
            </li>
          </ul>
        </div>
        <figure className="relative min-w-0 border border-white bg-white p-3 shadow-e2 sm:p-4">
          <div className="relative aspect-[5/4] overflow-hidden bg-surface-muted">
            <img
              src={hero.imageUrl}
              alt={hero.imageAlt}
              fetchPriority="high"
              width="800"
              height="640"
              className="h-full w-full object-cover"
            />
            <span className="absolute left-4 top-4 inline-flex items-center gap-2 rounded-card border border-white/70 bg-white/95 px-3 py-2 text-xs font-semibold text-brand-800">
              <Sparkles className="size-3.5" aria-hidden="true" />
              Tu combinación, paso a paso
            </span>
          </div>
          <figcaption className="flex items-center justify-between gap-4 px-2 py-4 text-xs text-ink-muted">
            <span>Una idea para tu próxima celebración</span>
            <span className="shrink-0 font-semibold text-brand-700">Imagen referencial</span>
          </figcaption>
        </figure>
      </div>
    </section>
  );
};
