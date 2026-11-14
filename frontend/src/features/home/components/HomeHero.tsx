import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ArrowRight, ChevronRight, Pause, Play, Sparkles } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { ROUTES } from '@constants/routes';
import type { StorefrontContent } from '../content/storefront.schema';

type HeroSlide = {
  imageUrl: string;
  imageAlt: string;
  eyebrow: string;
  title: string;
  description: string;
  embeddedCopy: boolean;
};

const hasEmbeddedCopy = (imageUrl: string) => /promo-(turrones-15-descuento|segunda-torta-35)\.jpg$/i.test(imageUrl);

const buildHeroSlides = (hero: StorefrontContent['hero']): HeroSlide[] => [
  {
    imageUrl: hero.imageUrl,
    imageAlt: hero.imageAlt,
    eyebrow: hero.eyebrow,
    title: hero.title,
    description: hero.description,
    embeddedCopy: hasEmbeddedCopy(hero.imageUrl),
  },
  ...(hero.slides ?? [])
    .filter((slide) => slide.enabled !== false)
    .map((slide) => ({ ...slide, embeddedCopy: hasEmbeddedCopy(slide.imageUrl) })),
];

const actionRoute = (action: StorefrontContent['hero']['primaryAction']): string => ({
  catalog: ROUTES.menu,
  custom: ROUTES.customCake,
  business: ROUTES.business,
  plans: ROUTES.plans,
  experiences: ROUTES.experienceDemo,
  cart: ROUTES.cart,
  coverage: ROUTES.coverage,
  orders: ROUTES.accountOrders,
  guide: ROUTES.howToOrder,
  whatsapp: ROUTES.howToOrder,
}[action] ?? ROUTES.menu);

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
    if (paused || hovered || focused || slides.length < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = window.setInterval(() => {
      setActive((value) => (value + 1) % slides.length);
    }, 5600);
    return () => window.clearInterval(timer);
  }, [focused, hovered, paused, slides.length]);

  const selectSlide = (index: number) => setActive((index + slides.length) % slides.length);
  const embeddedCopy = current.embeddedCopy;
  const controlClass = embeddedCopy
    ? 'border-brand-300 bg-white/75 text-brand-900 hover:bg-white'
    : 'border-white/35 bg-ink/25 text-white hover:bg-white/20';
  const frameClass = embeddedCopy
    ? 'aspect-[16/9] min-h-0 md:aspect-[2.4/1] md:min-h-[24rem] lg:aspect-[2.8/1] lg:min-h-[28rem]'
    : 'min-h-[24rem] sm:min-h-[26rem] md:min-h-[24rem] lg:min-h-[28rem] xl:aspect-[2.8/1] xl:min-h-[28rem]';

  return (
    <figure
      className="relative"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setFocused(false);
      }}
    >
      <div id="home-promo-slide" role="tabpanel" tabIndex={-1} className={`relative isolate w-full overflow-hidden bg-brand-900 ${frameClass}`}>
        <div className="absolute inset-0 bg-surface-muted">
          {slides.map((slide, index) => {
            const image = (
              <img
                src={slide.imageUrl}
                alt={slide.imageAlt}
                loading={index === 0 ? 'eager' : 'lazy'}
                fetchPriority={index === 0 ? 'high' : 'auto'}
                decoding={index === 0 ? 'sync' : 'async'}
                width="1600"
                height="900"
                className={'absolute inset-0 size-full object-cover transition-[opacity,transform] duration-700 ease-out ' + (slide.embeddedCopy ? 'object-left sm:object-center ' : 'object-[42%_center] sm:object-center ') + (index === active ? 'scale-100 opacity-100' : 'scale-105 opacity-0')}
              />
            );
            return slide.embeddedCopy
              ? <Link key={slide.imageUrl + '-' + index} to={ROUTES.menu} className="absolute inset-0 block" aria-label={slide.title}>{image}</Link>
              : <span key={slide.imageUrl + '-' + index}>{image}</span>;
          })}
        </div>
        <div className={embeddedCopy ? 'pointer-events-none absolute inset-0' : 'pointer-events-none absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/30 to-transparent sm:from-ink/85 sm:via-ink/10 md:bg-gradient-to-l md:from-ink/80 md:via-ink/35 md:to-transparent'} />
        {!embeddedCopy && <div aria-live="polite" className="absolute inset-x-0 bottom-0 z-10 px-5 pb-10 pt-24 text-white sm:px-10 sm:pb-12 lg:inset-y-0 lg:ml-auto lg:flex lg:w-[48%] lg:items-center lg:px-12 lg:pb-0 lg:pt-0 lg:pr-44">
          <div className="max-w-2xl">
            <span className="mb-4 inline-flex max-w-full items-center gap-2 rounded-full border border-white/45 bg-ink/20 px-3 py-2 text-[11px] font-extrabold text-white shadow-e1 backdrop-blur sm:mb-5 sm:px-4">
              <Sparkles className="size-3.5 shrink-0 text-accent-400" aria-hidden="true" />
              <span className="truncate">{current.eyebrow}</span>
            </span>
            <h1 className="max-w-2xl text-[clamp(1.8rem,8vw,3.25rem)] font-black leading-[1.02] tracking-[-.045em] [overflow-wrap:anywhere] sm:text-[clamp(2rem,5vw,3.6rem)] lg:text-[clamp(2.35rem,3.4vw,3.75rem)] xl:text-[clamp(2.75rem,3.75vw,4.25rem)]">
              {current.title}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-white/90 sm:mt-4 sm:text-base sm:leading-7">
              {current.description}
            </p>
            <div className="mt-5 flex flex-col gap-3 sm:mt-6 sm:flex-row sm:flex-wrap">
              <Button
                component={Link}
                to={actionRoute(hero.primaryAction)}
                size="lg"
                className="w-full sm:w-auto"
                sx={{ bgcolor: 'white', color: 'var(--color-brand-900)', '&:hover': { bgcolor: 'var(--color-brand-50)' } }}
              >
                {hero.primaryLabel}
                <ArrowRight className="ml-2 size-4" aria-hidden="true" />
              </Button>
              <Button
                component={Link}
                to={actionRoute(hero.secondaryAction)}
                size="lg"
                variant="outline"
                className="w-full sm:w-auto"
                sx={{ bgcolor: 'rgba(10,35,58,.24)', borderColor: 'rgba(255,255,255,.72)', color: 'white', '&:hover': { bgcolor: 'white', borderColor: 'white', color: 'var(--color-brand-900)' } }}
              >
                {hero.secondaryLabel}
                <ChevronRight className="ml-2 size-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
        </div>}
        <span className={`absolute right-5 top-5 z-20 rounded-full border px-3 py-2 text-[10px] font-bold backdrop-blur sm:right-8 sm:top-8 ${embeddedCopy ? 'border-brand-200 bg-white/80 text-brand-900' : 'border-white/25 bg-ink/30 text-white'}`}>
          {String(active + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
        </span>
        <div className="absolute bottom-5 right-5 z-20 hidden items-center gap-1.5 sm:flex lg:bottom-auto lg:right-8 lg:top-1/2 lg:-translate-y-1/2">
          <button type="button" onClick={() => selectSlide(active - 1)} className={`grid size-11 place-items-center rounded-full border backdrop-blur transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${controlClass}`} aria-label="Imagen anterior">
            <ArrowLeft className="size-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setPaused((value) => !value)} className={`grid size-11 place-items-center rounded-full border backdrop-blur transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${controlClass}`} aria-label={paused ? 'Reproducir carrusel' : 'Pausar carrusel'}>
            {paused ? <Play className="size-4" aria-hidden="true" /> : <Pause className="size-4" aria-hidden="true" />}
          </button>
          <button type="button" onClick={() => selectSlide(active + 1)} className={`grid size-11 place-items-center rounded-full border backdrop-blur transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ${controlClass}`} aria-label="Imagen siguiente">
            <ArrowRight className="size-4" aria-hidden="true" />
          </button>
        </div>
      </div>
      <figcaption className={`absolute bottom-4 right-5 z-10 flex items-center gap-1.5 text-xs md:hidden ${embeddedCopy ? 'text-brand-900' : 'text-white'}`}>
        <span className="sr-only">{current.eyebrow}</span>
        <div className="flex shrink-0 items-center gap-1.5" role="tablist" aria-label="Promociones destacadas">
          {slides.map((slide, index) => (
            <button
              key={slide.imageUrl + '-tab'}
              type="button"
              role="tab"
              aria-selected={index === active}
              aria-controls="home-promo-slide"
              aria-label={'Ver promoción ' + (index + 1)}
              onClick={() => selectSlide(index)}
              className={'h-2 rounded-full transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 ' + (index === active ? 'w-8 bg-accent-500' : embeddedCopy ? 'w-2 bg-brand-700/45 hover:bg-brand-900/70' : 'w-2 bg-white/60 hover:bg-white')}
            />
          ))}
        </div>
      </figcaption>
    </figure>
  );
};

export const HomeHero = ({ hero: supplied }: { hero?: StorefrontContent['hero']; content?: StorefrontContent }) => {
  // The content prop remains accepted for the admin preview API. The provider is
  // the single source of truth for the public storefront.
  const hero = supplied;
  if (!hero) return null;
  return (
    <section className="border-b border-brand-100 bg-brand-50/60">
      <HeroGallery hero={hero} />
    </section>
  );
};
