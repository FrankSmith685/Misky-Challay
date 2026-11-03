import { Link } from 'react-router-dom';
import { ArrowRight, CakeSlice, MapPin, Sparkles } from 'lucide-react';
import { MarketingHeading, MarketingSection } from '@components/marketing';
import { Button } from '@components/ui/Button';
import { Reveal, RevealGroup } from '@components/ui/Reveal';
import { ROUTES } from '@constants/routes';

/** Tres caminos de compra con jerarquías distintas para facilitar una decisión rápida. */
export const HomeChoiceSection = () => (
  <MarketingSection tone="soft">
    <Reveal className="grid gap-5 lg:grid-cols-[1fr_.62fr] lg:items-end">
      <MarketingHeading
        eyebrow="Elige tu experiencia"
        title="Hoy tú decides cuánto quieres diseñar"
        description="Ve directo a una receta lista o personaliza cada detalle. En ambos caminos conoces ingredientes, precio y fecha antes de pedir."
      />
      <p className="border-l-2 border-accent-400 pl-4 text-sm leading-6 text-ink-muted lg:mb-1">
        La disponibilidad se valida con tu ubicación para mostrarte únicamente fechas que sí podemos preparar.
      </p>
    </Reveal>

    <RevealGroup className="mt-10 grid gap-5 lg:grid-cols-[1.12fr_.88fr]" stagger={100}>
      <article className="group relative min-h-[540px] overflow-hidden rounded-card bg-ink text-white shadow-e4">
        <img src="/images/cakes/special.svg" alt="Ilustración de una torta de celebración de tres pisos" loading="lazy" width={960} height={720} className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-[1.035]" />
        <span className="absolute right-4 top-5 rounded-full bg-white/95 px-3 py-2 text-[10px] text-ink-muted">Imagen referencial</span>
        <div className="absolute inset-0 bg-gradient-to-t from-ink via-ink/25 to-transparent" />
        <div className="absolute left-5 top-5 flex items-center gap-2 rounded-pill border border-white/20 bg-black/25 px-3 py-2 text-xs font-bold backdrop-blur">
          <CakeSlice className="size-3.5" /> Recetas seleccionadas
        </div>
        <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8 lg:p-10">
          <p className="text-xs font-black uppercase tracking-[.18em] text-brand-200">Cuando quieres ir a lo seguro</p>
          <h3 className="mt-3 text-3xl font-black tracking-[-.04em] sm:text-4xl">Elige, reserva y celebra</h3>
          <p className="mt-3 max-w-md text-sm leading-6 text-white/80 sm:text-base">Combinaciones listas, claras y pensadas para que tu celebración empiece sin vueltas.</p>
          <div className="pt-6">
            <Button component={Link} to={ROUTES.menu} size="lg" className="bg-white text-brand-900 hover:bg-brand-50">
              Explorar recetas <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
      </article>

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-1">
        <article className="group relative min-h-[355px] overflow-hidden rounded-card border border-brand-700 bg-brand-900 text-white shadow-e3">
          <div className="absolute inset-0 opacity-70">
            <img src="/images/cakes/custom.svg" alt="" loading="lazy" width={960} height={720} className="size-full object-cover transition-transform duration-700 group-hover:scale-[1.04]" />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-brand-900 via-brand-900/70 to-brand-900/10" />
          <div className="absolute inset-x-0 bottom-0 p-6 sm:p-7">
            <span className="inline-flex items-center gap-2 rounded-pill bg-accent-500 px-3 py-1.5 text-[11px] font-black uppercase tracking-wider text-ink"><Sparkles className="size-3.5" /> Crea tu diseño</span>
            <h3 className="mt-4 text-2xl font-black tracking-tight sm:text-3xl">Hazla realmente tuya</h3>
            <p className="mt-2 text-sm leading-6 text-brand-100">Tamaño, sabores y decoración con el total actualizado en cada paso.</p>
            <div className="pt-5">
              <Button component={Link} to={ROUTES.menuMode('CUSTOM')} size="lg" variant="secondary">Crear mi torta <ArrowRight className="size-4" /></Button>
            </div>
          </div>
        </article>

        <article className="relative overflow-hidden rounded-card border border-brand-200 bg-white p-6 shadow-e2 sm:p-7">
          <div className="absolute right-0 top-0 h-full w-1.5 bg-brand-600" />
          <span className="grid size-10 place-items-center rounded-card bg-brand-50 text-brand-700"><MapPin className="size-4.5" /></span>
          <h3 className="mt-5 text-xl font-black text-ink">Primero, confirma tu zona</h3>
          <p className="mt-2 text-sm leading-6 text-ink-muted">Así ves disponibilidad, la sucursal que te atenderá y fechas reales de entrega.</p>
          <Link to={ROUTES.coverage} className="mt-5 inline-flex items-center gap-2 text-sm font-extrabold text-brand-700 hover:text-brand-600">Ver zonas de entrega <ArrowRight className="size-4" /></Link>
        </article>
      </div>
    </RevealGroup>
  </MarketingSection>
);
