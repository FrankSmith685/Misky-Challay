import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { CakeSlice, ChevronLeft, ChevronRight } from 'lucide-react';
import { MarketingSection } from '@components/marketing';
import { ROUTES } from '@constants/routes';
import { catalogApi } from '@features/catalog/services/catalog.service';
import { CATEGORY_IMAGES, categoryImage } from '@features/catalog/categoryImage';
import type { Category } from '@features/catalog/types';

const FALLBACK_CATEGORIES = [
  { key: 'tortas', label: 'Tortas', route: ROUTES.menu, icon: CakeSlice },
  { key: 'tortas-24-horas', label: 'Tortas 24 horas', route: ROUTES.menu, icon: CakeSlice },
  { key: 'postres', label: 'Postres', route: ROUTES.menu, icon: CakeSlice },
  { key: 'turrones', label: 'Turrones', route: ROUTES.menu, icon: CakeSlice },
  { key: 'bocaditos', label: 'Bocaditos', route: ROUTES.menu, icon: CakeSlice },
] as const;

type HomeCategoryCard = {
  key: string;
  label: string;
  route: string;
  imageUrl: string | null;
  icon: typeof CakeSlice;
};

export const HomeCategoryShowcase = () => {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [canScrollPrevious, setCanScrollPrevious] = useState(false);
  const [canScrollNext, setCanScrollNext] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const measureOverflow = useCallback(() => {
    const element = scrollRef.current;
    if (!element) {
      setHasOverflow(false);
      setCanScrollPrevious(false);
      setCanScrollNext(false);
      return;
    }
    const overflow = element.scrollWidth > element.clientWidth + 2;
    setHasOverflow(overflow);
    setCanScrollPrevious(overflow && element.scrollLeft > 2);
    setCanScrollNext(overflow && element.scrollLeft + element.clientWidth < element.scrollWidth - 2);
  }, []);

  useEffect(() => {
    let active = true;
    void catalogApi.getCategories()
      .then((rows) => {
        if (active) setCategories(rows.filter((category) => category.parentId === null).sort((a, b) => a.sortOrder - b.sortOrder));
      })
      .catch(() => {
        if (active) setCategories([]);
      })
      .finally(() => {
        if (active) setLoaded(true);
      });
    return () => { active = false; };
  }, []);

  const visibleCategories = useMemo<HomeCategoryCard[]>(
    () => categories.length > 0
      ? categories.map((category) => ({
        key: String(category.id),
        label: category.name,
        route: `${ROUTES.menu}?categoria=${category.id}`,
        imageUrl: categoryImage(category),
        icon: CakeSlice,
      }))
      : FALLBACK_CATEGORIES.map((category) => ({
        key: category.key,
        label: category.label,
        route: category.route,
        imageUrl: CATEGORY_IMAGES[category.key] ?? null,
        icon: category.icon,
      })),
    [categories],
  );

  useEffect(() => {
    if (!loaded) return undefined;
    measureOverflow();
    const element = scrollRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measureOverflow);
    observer.observe(element);
    if (element.parentElement) observer.observe(element.parentElement);
    element.addEventListener('scroll', measureOverflow, { passive: true });
    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', measureOverflow);
    };
  }, [loaded, measureOverflow, visibleCategories.length]);

  return (
    <MarketingSection tone="white" className="overflow-visible" contentClassName="relative z-20 mt-0 !pt-0 !pb-8 px-0 sm:-mt-6 md:-mt-4 lg:mt-0 2xl:-mt-16">
      <div className={`mx-auto w-full max-w-[92rem] rounded-[1.5rem] border border-brand-100 bg-white/95 p-3 shadow-e3 backdrop-blur sm:rounded-[1.75rem] sm:p-3 ${hasOverflow ? '' : 'sm:w-fit'}`} aria-label="Categorías del catálogo">
        {!loaded && categories.length === 0 ? (
          <div className="flex gap-3 overflow-hidden">
            {[0, 1, 2, 3, 4].map((item) => <div key={item} className="h-24 min-w-[6.5rem] animate-pulse rounded-2xl bg-surface-muted sm:h-28 sm:min-w-[7.5rem]" />)}
          </div>
        ) : (
          <div className="relative">
            {hasOverflow && (
              <button
                type="button"
                onClick={() => scrollRef.current?.scrollBy({ left: -280, behavior: 'smooth' })}
                disabled={!canScrollPrevious}
                className="absolute left-1 top-1/2 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-full border border-brand-200 bg-white/95 text-brand-800 shadow-e2 transition hover:bg-brand-50 disabled:pointer-events-none disabled:opacity-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:left-2 sm:size-9"
                aria-label="Ver categorías anteriores"
              >
                <ChevronLeft className="size-5" aria-hidden="true" />
              </button>
            )}
            <div ref={scrollRef} className={`flex snap-x gap-2.5 pb-1 sm:gap-3 ${hasOverflow ? 'justify-start overflow-x-auto px-8 sm:px-10' : 'justify-center overflow-visible px-0'}`}>
              {visibleCategories.map((category) => {
                const Icon = category.icon;
                return (
                  <Link
                    key={category.key}
                    to={category.route}
                    className="group flex min-h-[6.5rem] min-w-[8rem] snap-start flex-col items-center justify-center gap-2 rounded-xl bg-brand-50/70 px-3 py-3 text-center transition hover:-translate-y-0.5 hover:bg-brand-50 hover:text-brand-800 sm:min-h-[6.75rem] sm:py-2.5 lg:w-[9rem] lg:flex-none"
                  >
                    <span className="grid size-11 place-items-center overflow-hidden rounded-full bg-white text-brand-700 shadow-sm sm:size-10">
                      {category.imageUrl
                        ? <img src={category.imageUrl} alt="" loading="lazy" width="88" height="88" className="size-full object-cover transition duration-500 group-hover:scale-110" />
                        : <Icon className="size-5" aria-hidden="true" />}
                    </span>
                    <span className="line-clamp-2 text-[13px] font-extrabold leading-[1.15] text-ink sm:text-xs">{category.label}</span>
                  </Link>
                );
              })}
            </div>
            {hasOverflow && (
              <button
                type="button"
                onClick={() => scrollRef.current?.scrollBy({ left: 280, behavior: 'smooth' })}
                disabled={!canScrollNext}
                className="absolute right-1 top-1/2 z-10 grid size-8 -translate-y-1/2 place-items-center rounded-full border border-brand-200 bg-white/95 text-brand-800 shadow-e2 transition hover:bg-brand-50 disabled:pointer-events-none disabled:opacity-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:right-2 sm:size-9"
                aria-label="Ver más categorías"
              >
                <ChevronRight className="size-5" aria-hidden="true" />
              </button>
            )}
          </div>
        )}
      </div>
    </MarketingSection>
  );
};

