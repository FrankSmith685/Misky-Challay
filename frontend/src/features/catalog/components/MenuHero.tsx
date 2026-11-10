import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Clock3, Sparkles, WandSparkles } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { formatCurrency } from '@lib/format';
import { ROUTES } from '@constants/routes';
import { productHref } from '../pastry';
import { productImage } from '../productImage';
import type { Product } from '../types';

type MenuHeroProps = {
  customView?: boolean;
  spotlightProduct?: Product | null;
  availableProductCount?: number;
  minimumCakePrice?: number | null;
};

/** Cabecera de catálogo con una recomendación real del catálogo cargado. */
export const MenuHero = ({
  customView = false,
  spotlightProduct = null,
  availableProductCount = 0,
  minimumCakePrice = null,
}: MenuHeroProps) => {
  const displayImage = (spotlightProduct ? productImage(spotlightProduct) : null) ?? '/images/cakes/vanilla.svg';
  const displayPrice = spotlightProduct
    ? spotlightProduct.cakeSaleMode === 'SEMI_CUSTOM' || spotlightProduct.cakeSaleMode === 'ADVANCED'
      ? spotlightProduct.priceFrom
      : spotlightProduct.defaultVariantPrice || spotlightProduct.priceFrom
    : null;

  return (
    <section className="relative overflow-hidden border-b border-line bg-white" aria-label="Presentación del catálogo">
      <div className="pointer-events-none absolute -right-32 -top-28 size-[26rem] rounded-full bg-accent-100/70 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-40 left-[34%] size-[22rem] rounded-full bg-tertiary-50 blur-3xl" />

      <div className="container-shell relative grid items-center gap-10 py-10 sm:py-14 lg:grid-cols-[1.05fr_.95fr] lg:gap-16 lg:py-16">
        <div className="max-w-2xl">
          <p className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[.18em] text-brand-700">
            <span className="h-px w-8 bg-accent-500" aria-hidden="true" />
            {customView ? 'Diseño acompañado' : 'Catálogo Misky Challay'}
          </p>
          <h1 id="catalog-title" className="mt-4 max-w-3xl text-[clamp(2.35rem,5vw,4.75rem)] font-black leading-[.98] tracking-[-.055em] text-ink">
            {customView ? 'Diseña una torta que se sienta tuya.' : 'Dulces momentos para compartir.'}
          </h1>
          <p className="mt-5 max-w-xl text-base leading-8 text-ink-muted sm:text-lg">
            {customView
              ? 'Elige sabores, rellenos y detalles. Te acompañamos desde la idea hasta la fecha de entrega.'
              : 'Explora tortas, postres, turrones y bocaditos. Elige una familia, compara opciones y reserva con claridad.'}
          </p>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button component="a" href="#catalogo" size="lg" leftIcon={<ArrowRight size={18} />}>
              {customView ? 'Ver opciones' : 'Explorar el menú'}
            </Button>
            <Button
              component={Link}
              to={customView ? ROUTES.menu : ROUTES.menuMode('CUSTOM')}
              size="lg"
              variant="outline"
              leftIcon={<WandSparkles size={18} />}
            >
              {customView ? 'Ver todo el menú' : 'Crea tu torta'}
            </Button>
          </div>

          <div className="mt-8 flex flex-wrap gap-x-6 gap-y-3 border-t border-line pt-5 text-xs font-semibold text-ink-muted">
            <span className="inline-flex items-center gap-2"><CheckCircle2 className="size-4 text-brand-600" />{availableProductCount > 0 ? `${availableProductCount} opciones disponibles` : 'Precios visibles'}</span>
            <span className="inline-flex items-center gap-2"><Clock3 className="size-4 text-tertiary-600" />{minimumCakePrice !== null ? `Tortas desde ${formatCurrency(minimumCakePrice)}` : 'Fechas reales'}</span>
            <span className="inline-flex items-center gap-2"><Sparkles className="size-4 text-accent-700" />Entrega o recojo programado</span>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[30rem] lg:max-w-xl">
          <div className="absolute -right-3 -top-3 h-20 w-20 rounded-full border-[10px] border-accent-300/70 sm:-right-5 sm:-top-5" aria-hidden="true" />
          <div className="absolute -bottom-4 -left-4 h-24 w-24 rounded-full border-[12px] border-tertiary-200/60" aria-hidden="true" />
          <figure className="relative overflow-hidden rounded-[1.5rem] border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-accent-50 p-3 shadow-e3 sm:p-4">
            <div className="relative overflow-hidden rounded-[1.15rem] bg-white">
              <img
                src={displayImage}
                alt={spotlightProduct?.name ?? (customView ? 'Torta personalizada Misky Challay' : 'Torta clásica Misky Challay')}
                width="720"
                height="540"
                onError={(event) => { event.currentTarget.src = '/images/cakes/vanilla.svg'; }}
                className="aspect-[4/3] w-full object-contain p-4 transition duration-700 hover:scale-[1.03] sm:p-8"
              />
              <div className="absolute inset-x-4 bottom-4 flex items-end justify-between gap-3 rounded-xl border border-white/70 bg-white/92 px-4 py-3 shadow-e2 backdrop-blur sm:inset-x-6 sm:bottom-6 sm:px-5">
                <div className="min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-[.16em] text-brand-700">
                    {spotlightProduct ? 'Recomendación de la casa' : 'Hecho para tu celebración'}
                  </p>
                  <p className="mt-1 truncate text-sm font-black text-ink sm:text-base">
                    {spotlightProduct?.name ?? 'Elige una idea y hazla tuya'}
                  </p>
                </div>
                {displayPrice !== null && <span className="shrink-0 text-sm font-black text-brand-800">Desde {formatCurrency(displayPrice)}</span>}
              </div>
            </div>
          </figure>
          {spotlightProduct && (
            <Button
              component={Link}
              to={productHref(spotlightProduct)}
              size="sm"
              variant="outline"
              className="absolute -bottom-5 right-5 bg-white shadow-e2 sm:right-8"
              leftIcon={<ArrowRight size={15} />}
            >
              Ver recomendación
            </Button>
          )}
        </div>
      </div>
    </section>
  );
};
