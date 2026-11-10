import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  ChevronRight,
  MessageCircle,
  Pause,
  Play,
  Sparkles,
} from 'lucide-react';
import { Button } from '@components/ui/Button';
import { ROUTES } from '@constants/routes';
import { formatCurrency } from '@lib/format';
import { catalogApi } from '@features/catalog/services/catalog.service';
import { useBusinessInfo } from '@services/businessInfo';
import { whatsappLink } from '@lib/whatsapp';
import type { StorefrontContent } from '../content/storefront.schema';
import { useStorefront } from '../content/StorefrontContext';

type HeroSlide = {
  imageUrl: string;
  imageAlt: string;
  eyebrow: string;
  title: string;
  description: string;
};

const buildHeroSlides = (hero: StorefrontContent['hero']): HeroSlide[] => [
  {
    imageUrl: hero.imageUrl,
    imageAlt: hero.imageAlt,
    eyebrow: hero.eyebrow,
    title: hero.title,
    description: hero.description,
  },
  ...(hero.slides ?? []),
];

const actionRoute = (action: StorefrontContent['quickLinks'][number]['action']): string | null => ({
  catalog: ROUTES.menu, custom: ROUTES.customCake, business: ROUTES.business, plans: ROUTES.plans,
  experiences: ROUTES.cakeAr, cart: ROUTES.cart, coverage: ROUTES.coverage, orders: ROUTES.accountOrders,
  guide: ROUTES.howToOrder, whatsapp: null,
}[action]);

const HeroGallery = ({ hero }: { hero: StorefrontContent['hero'] }) => {
  const slides = useMemo(() => buildHeroSlides(hero), [hero]);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const current = slides[active] ?? slides[0];

  useEffect(() => {
    setActive(0);
  }, [hero.imageUrl]);

  useEffect(() => {
    if (paused || hovered || focused || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = window.setInterval(() => {
      setActive((value) => (value + 1) % slides.length);
    }, 5200);
    return () => window.clearInterval(timer);
  }, [focused, hovered, paused, slides.length]);

  const selectSlide = (index: number) => setActive((index + slides.length) % slides.length);

  return (
    <figure
      className="relative min-w-0"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <div className="relative overflow-hidden rounded-[1.25rem] border border-white/90 bg-white p-2 shadow-e5 sm:p-3">
        <div id="hero-slide-panel" role="tabpanel" tabIndex={-1} className="relative aspect-[5/4] overflow-hidden rounded-[.8rem] bg-surface-muted">
          {slides.map((slide, index) => (
            <img
              key={slide.imageUrl}
              src={slide.imageUrl}
              alt={slide.imageAlt}
              loading={index === 0 ? 'eager' : 'lazy'}
              width="800"
              height="640"
              className={`absolute inset-0 h-full w-full object-cover transition-[opacity,transform] duration-700 ease-out ${index === active ? 'scale-100 opacity-100' : 'scale-105 opacity-0'}`}
            />
          ))}
          <div className="absolute inset-0 bg-gradient-to-t from-ink/75 via-ink/10 to-transparent" />
          <div className="absolute inset-x-4 top-4 flex items-center justify-between gap-3 sm:inset-x-5 sm:top-5">
            <span className="inline-flex min-w-0 items-center gap-2 rounded-full border border-white/70 bg-white/95 px-3 py-2 text-[11px] font-extrabold text-brand-800 shadow-e1">
              <Sparkles className="size-3.5 shrink-0 text-accent-600" aria-hidden="true" />
              <span className="truncate">{current.eyebrow}</span>
            </span>
            <span className="rounded-full border border-white/25 bg-ink/25 px-2.5 py-1.5 text-[10px] font-bold text-white backdrop-blur">
              0{active + 1} / 0{slides.length}
            </span>
          </div>
          <div aria-live="polite" className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3 text-white sm:inset-x-5 sm:bottom-5 sm:gap-4">
            <div className="min-w-0 max-w-sm">
              <p className="text-lg font-black leading-tight sm:text-2xl">{current.title}</p>
              <p className="mt-1 text-xs leading-5 text-white/80 sm:text-sm">{current.description}</p>
            </div>
            <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
              <button
                type="button"
                onClick={() => selectSlide(active - 1)}
                className="grid size-9 place-items-center rounded-full border border-white/30 bg-ink/25 text-white backdrop-blur transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                aria-label="Imagen anterior"
              >
                <ArrowLeft className="size-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setPaused((value) => !value)}
                className="grid size-9 place-items-center rounded-full border border-white/30 bg-ink/25 text-white backdrop-blur transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                aria-label={paused ? 'Reproducir carrusel' : 'Pausar carrusel'}
              >
                {paused ? <Play className="size-4" aria-hidden="true" /> : <Pause className="size-4" aria-hidden="true" />}
              </button>
              <button
                type="button"
                onClick={() => selectSlide(active + 1)}
                className="grid size-9 place-items-center rounded-full border border-white/30 bg-ink/25 text-white backdrop-blur transition hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
                aria-label="Imagen siguiente"
              >
                <ChevronRight className="size-4" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </div>
      <figcaption className="flex items-center justify-between gap-4 px-2 pt-4 text-xs text-ink-muted">
        <span className="min-w-0">
          <strong className="block truncate text-ink">{current.eyebrow}</strong>
          <span className="mt-0.5 block truncate">Cambia de idea cuando quieras</span>
        </span>
        <div className="flex shrink-0 items-center gap-1.5" role="tablist" aria-label="Galería de inspiración">
          {slides.map((slide, index) => (
            <button
              key={slide.imageUrl}
              type="button"
              role="tab"
              aria-selected={index === active}
              aria-controls="hero-slide-panel"
              aria-label={`Ver inspiración ${index + 1}`}
              onClick={() => selectSlide(index)}
              className={`h-2 rounded-full transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${index === active ? 'w-7 bg-accent-500' : 'w-2 bg-brand-200 hover:bg-brand-400'}`}
            />
          ))}
        </div>
      </figcaption>
    </figure>
  );
};

export const HomeHero = ({ hero: supplied, content: suppliedContent }: { hero?: StorefrontContent['hero']; content?: StorefrontContent }) => {
  const { content: contextContent } = useStorefront();
  const content = suppliedContent ?? contextContent;
  const hero = supplied ?? content.hero;
  const primaryRoute = actionRoute(hero.primaryAction);
  const secondaryRoute = actionRoute(hero.secondaryAction);
  const business = useBusinessInfo();
  const whatsapp = whatsappLink(
    business.whatsappPhone ?? business.phone,
    'Hola, necesito orientación para hacer un pedido en Misky Challay.',
  );
  const [minimumPrice, setMinimumPrice] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    void catalogApi
      .getProducts({ sort: 'RECOMMENDED' })
      .then((products) => {
        const prices = products
          .filter((product) => product.family === 'CAKE' && product.isAvailable && Number.isFinite(product.priceFrom) && product.priceFrom > 0)
          .map((product) => product.priceFrom);
        if (active && prices.length > 0) setMinimumPrice(Math.min(...prices));
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

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
              to={primaryRoute ?? ROUTES.customCake}
              size="lg"
              className="w-full xl:w-auto"
              leftIcon={<Sparkles className="size-4 shrink-0" aria-hidden="true" />}
            >
              <span className="whitespace-normal">{hero.primaryLabel}</span>
              <ArrowRight className="ml-2 size-4 shrink-0" aria-hidden="true" />
            </Button>
            <Button component={Link} to={secondaryRoute ?? ROUTES.menu} size="lg" variant="outline" className="w-full xl:w-auto">
              <span className="whitespace-normal">{hero.secondaryLabel}</span>
            </Button>
          </div>
          <div className="mt-5 flex flex-wrap gap-2" aria-label="Accesos rápidos">
            {content.quickLinks.map((quickLink, index) => {
              const route = actionRoute(quickLink.action);
              const icon = quickLink.action === 'guide' ? <BookOpen className="size-3.5" aria-hidden="true" />
                : quickLink.action === 'whatsapp' ? <MessageCircle className="size-3.5" aria-hidden="true" />
                  : <ChevronRight className="size-3.5" aria-hidden="true" />;
              const className = `inline-flex min-h-10 items-center gap-2 rounded-full border px-3.5 text-xs font-bold transition hover:bg-white ${index % 3 === 0 ? 'border-brand-200 bg-white/80 text-brand-800 hover:border-brand-400' : index % 3 === 1 ? 'border-accent-200 bg-accent-50/70 text-accent-800 hover:border-accent-400' : 'border-tertiary-200 bg-tertiary-50/70 text-tertiary-800 hover:border-tertiary-400'}`;
              if (quickLink.action === 'whatsapp' && whatsapp) return <a key={quickLink.id} href={whatsapp} target="_blank" rel="noopener noreferrer" className={className}>{quickLink.label} {icon}</a>;
              if (!route) return null;
              return <Link key={quickLink.id} to={route} className={className}>{quickLink.label} {icon}</Link>;
            })}
          </div>
          <Link to={ROUTES.howToOrder} className="mt-5 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-brand-700 underline-offset-4 hover:underline">
            <BookOpen className="size-4 shrink-0" aria-hidden="true" />
            ¿Primera vez? Aprende cómo pedir
            <ArrowRight className="size-3.5 shrink-0" aria-hidden="true" />
          </Link>
          <ul className="mt-6 flex flex-wrap gap-x-6 gap-y-3 border-t border-brand-200/60 pt-5 text-xs text-ink-muted">
            <li className="flex items-center gap-2"><Check className="size-4 text-brand-600" aria-hidden="true" />{minimumPrice !== null ? `Opciones desde ${formatCurrency(minimumPrice)}` : 'Precio visible al personalizar'}</li>
            <li className="flex items-center gap-2"><CalendarDays className="size-4 text-tertiary-600" aria-hidden="true" />Fecha según capacidad real</li>
            <li className="flex items-center gap-2"><Check className="size-4 text-accent-600" aria-hidden="true" />Entrega o recojo programado</li>
          </ul>
        </div>
        <HeroGallery hero={hero} />
      </div>
    </section>
  );
};
