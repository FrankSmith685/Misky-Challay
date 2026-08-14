import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarClock,
  Check,
  ChevronDown,
  Flame,
  Leaf,
  MapPin,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { Button } from '@components/ui/Button';
import { ROUTES } from '@constants/routes';

const TRUST_POINTS = [
  { icon: Leaf, label: 'Ingredientes frescos' },
  { icon: ShieldCheck, label: 'Pago protegido' },
  { icon: CalendarClock, label: 'Entrega programable' },
];

const INGREDIENTS = [
  { image: '/images/builder/ingredients/palta.jpg', label: 'Palta' },
  { image: '/images/builder/ingredients/salmon-fresco.jpg', label: 'Salmón' },
  { image: '/images/builder/ingredients/mango.jpg', label: 'Mango' },
];

/** Primera impresión editorial: explica el producto y lleva a comprar sin pasos ambiguos. */
export const HomeHero = () => (
  <section className="relative isolate overflow-hidden border-b border-brand-200 bg-[#edf5ef]">
    <div className="pointer-events-none absolute inset-0 opacity-55 [background-image:linear-gradient(rgba(35,124,82,.055)_1px,transparent_1px),linear-gradient(90deg,rgba(35,124,82,.055)_1px,transparent_1px)] [background-size:48px_48px]" />
    <div className="pointer-events-none absolute -left-24 top-20 size-72 bg-brand-200/55 blur-[90px]" />
    <div className="pointer-events-none absolute -right-24 bottom-0 size-80 bg-accent-400/15 blur-[100px]" />

    <div className="relative mx-auto grid min-h-[680px] max-w-7xl items-center gap-12 px-4 py-14 sm:px-6 sm:py-16 lg:grid-cols-[1.02fr_.98fr] lg:gap-16 lg:px-8 lg:py-20">
      <div className="relative z-10 max-w-2xl">
        <div className="flex items-center gap-3">
          <span className="h-px w-10 bg-brand-600" />
          <p className="text-xs font-black uppercase tracking-[.2em] text-brand-800">Comida saludable, hecha para ti</p>
        </div>

        <h1 className="mt-6 max-w-[760px] text-[clamp(2.75rem,5.8vw,5.25rem)] font-black leading-[.97] tracking-[-0.06em] text-ink">
          Comer bien puede ser
          <span className="relative ml-[.18em] inline-block text-brand-700">
            simple.
            <svg className="absolute -bottom-2 left-0 h-3 w-full text-accent-400" viewBox="0 0 240 14" fill="none" aria-hidden="true">
              <path d="M3 10C67 2 166 2 237 7" stroke="currentColor" strokeWidth="5" strokeLinecap="square" />
            </svg>
          </span>
        </h1>

        <p className="mt-7 max-w-xl text-base leading-7 text-ink-muted sm:text-lg sm:leading-8">
          Elige una receta equilibrada o construye tu propio bowl. Ves ingredientes, nutrición y precio antes de confirmar.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button component={Link} to={ROUTES.menu} size="lg" className="w-full px-7 shadow-xl shadow-brand-900/15 sm:w-auto">
            Explorar el menú <ArrowRight className="size-4" aria-hidden="true" />
          </Button>
          <Button component={Link} to={ROUTES.builder} size="lg" variant="outline" leftIcon={<Sparkles className="size-4 text-accent-500" />} className="w-full border-brand-300 bg-white/75 px-7 sm:w-auto">
            Crear mi bowl
          </Button>
        </div>

        <ul className="mt-8 grid max-w-xl gap-2.5 sm:grid-cols-3" aria-label="Garantías de compra">
          {TRUST_POINTS.map(({ icon: Icon, label }) => (
            <li key={label} className="flex items-center gap-2 border-l-2 border-brand-200 pl-3 text-xs font-bold text-ink-muted">
              <Icon className="size-4 shrink-0 text-brand-700" aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>

        <a href="#como-funciona" className="mt-10 inline-flex items-center gap-2 text-xs font-extrabold text-brand-800 transition-colors hover:text-brand-600">
          Descubre cómo funciona <ChevronDown className="size-4" aria-hidden="true" />
        </a>
      </div>

      <div className="relative mx-auto w-full max-w-[620px] pb-6 lg:pb-0">
        <div className="absolute -left-4 -top-4 h-28 w-28 border-l-2 border-t-2 border-brand-500 sm:-left-6 sm:-top-6" />
        <div className="absolute -bottom-2 -right-4 h-28 w-28 border-b-2 border-r-2 border-accent-400 sm:-right-6" />

        <figure className="relative overflow-hidden rounded-card border border-white/80 bg-white p-2 shadow-e5 sm:p-3">
          <div className="relative overflow-hidden rounded-[3px]">
            <img
              src="/images/builder/bowl-signature.jpg"
              alt="Bowl fresco con salmón, pollo, palta, mango, edamame y vegetales"
              width={900}
              height={900}
              loading="eager"
              decoding="async"
              className="aspect-[1.04/1] size-full object-cover"
            />
            <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-ink/75 via-ink/20 to-transparent" />
            <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-5 text-white sm:p-6">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[.2em] text-brand-100">Preparado al momento</p>
                <p className="mt-1 text-xl font-black">Signature Verde</p>
              </div>
              <span className="hidden items-center gap-1.5 rounded-pill border border-white/30 bg-black/20 px-3 py-2 text-xs font-bold backdrop-blur sm:flex">
                <Check className="size-3.5" /> Nutrición visible
              </span>
            </figcaption>
          </div>
        </figure>

        <div className="absolute -left-3 top-[42%] hidden w-44 rounded-card border border-line bg-white p-3 shadow-xl sm:block lg:-left-16">
          <div className="flex items-center gap-2">
            <span className="grid size-9 place-items-center rounded-card bg-accent-400/15 text-accent-500"><Flame className="size-4" /></span>
            <div><p className="text-xs font-black text-ink">Decide informado</p><p className="text-[10px] text-ink-muted">Calorías y macros</p></div>
          </div>
        </div>

        <div className="absolute -bottom-3 right-5 hidden w-[250px] rounded-card border border-line bg-white p-3 shadow-xl sm:block">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-wider text-brand-800">Ingredientes reales</p>
            <MapPin className="size-3.5 text-brand-600" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {INGREDIENTS.map((ingredient) => (
              <div key={ingredient.label} className="relative overflow-hidden rounded-[3px]">
                <img src={ingredient.image} alt="" width={120} height={90} loading="eager" className="aspect-[4/3] size-full object-cover" />
                <span className="absolute inset-x-0 bottom-0 bg-ink/70 px-1 py-0.5 text-center text-[9px] font-bold text-white">{ingredient.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  </section>
);
