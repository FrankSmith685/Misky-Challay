import { Link } from 'react-router-dom';
import { ArrowDown, ArrowRight, Check, Flame, Leaf, Sparkles } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { ROUTES } from '@constants/routes';

const PROMISES = ['Ingredientes reales', 'Nutrición visible', 'Preparado al momento'];

/** Hero compacto: abre el apetito y mantiene el catálogo cerca del primer viewport. */
export const MenuHero = () => (
  <section className="relative isolate overflow-hidden border-b border-brand-800 bg-brand-900 text-white">
    <div className="pointer-events-none absolute inset-0 opacity-15 [background-image:linear-gradient(rgba(255,255,255,.18)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.18)_1px,transparent_1px)] [background-size:52px_52px]" />
    <div className="pointer-events-none absolute -left-20 top-0 size-64 bg-brand-500/25 blur-[90px]" />
    <div className="pointer-events-none absolute right-0 top-0 h-full w-1.5 bg-accent-500" />

    <div className="relative mx-auto grid max-w-7xl items-center gap-9 px-4 py-12 sm:px-6 sm:py-14 lg:min-h-[470px] lg:grid-cols-[1.03fr_.97fr] lg:gap-14 lg:px-8 lg:py-16">
      <div className="relative z-10 max-w-2xl">
        <div className="flex items-center gap-3"><span className="h-px w-9 bg-brand-300" /><p className="text-xs font-black uppercase tracking-[.2em] text-brand-200">Menú Verde Bowl</p></div>
        <h1 className="mt-5 text-[clamp(2.6rem,5vw,4.5rem)] font-black leading-[.98] tracking-[-.055em]">
          Encuentra el bowl que
          <span className="block text-brand-300">encaja contigo.</span>
        </h1>
        <p className="mt-5 max-w-xl text-base leading-7 text-brand-100 sm:text-lg">Recetas listas y bowls creados por ti, con disponibilidad, precio y nutrición claros desde el inicio.</p>

        <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2.5" aria-label="Características del menú">
          {PROMISES.map((label) => <li key={label} className="inline-flex items-center gap-2 text-xs font-bold text-brand-100"><span className="grid size-5 place-items-center rounded-[3px] bg-brand-700"><Check className="size-3" /></span>{label}</li>)}
        </ul>

        <div className="mt-7 flex flex-col gap-3 sm:flex-row">
          <Button component="a" href="#catalogo" size="lg" className="w-full bg-white text-brand-900 hover:bg-brand-50 sm:w-auto" leftIcon={<ArrowDown className="size-4" />}>Ver platos disponibles</Button>
          <Button component={Link} to={ROUTES.builder} variant="ghost" size="lg" className="w-full sm:w-auto" leftIcon={<Sparkles className="size-4 text-accent-400" />} sx={{ color: 'rgba(255,255,255,.9)', '&:hover': { color: '#fff', backgroundColor: 'rgba(255,255,255,.08)' } }}>Crear mi bowl <ArrowRight className="size-4" /></Button>
        </div>
      </div>

      <div className="relative mx-auto hidden h-[350px] w-full max-w-[560px] lg:block">
        <div className="absolute inset-y-0 right-0 w-[82%] overflow-hidden rounded-card border border-white/15 bg-white/5 p-2 shadow-2xl">
          <img src="/images/builder/bowl-signature.jpg" alt="Bowl signature de Verde Bowl" width={900} height={760} loading="eager" decoding="async" className="size-full rounded-[3px] object-cover" />
          <div className="absolute inset-x-2 bottom-2 h-28 bg-gradient-to-t from-ink/70 to-transparent" />
          <p className="absolute bottom-6 left-6 text-sm font-black">Recetas que entran por los ojos</p>
        </div>
        <div className="absolute -left-2 bottom-7 w-44 rounded-card border border-white/15 bg-brand-800/95 p-3 shadow-xl backdrop-blur">
          <div className="flex items-center gap-2"><span className="grid size-9 place-items-center rounded-card bg-accent-500"><Flame className="size-4" /></span><div><p className="text-xs font-black">Información útil</p><p className="text-[10px] text-brand-200">Calorías y proteína</p></div></div>
        </div>
        <div className="absolute -top-3 left-8 grid size-11 place-items-center rounded-card border border-white/15 bg-brand-700 shadow-xl"><Leaf className="size-5 text-brand-100" /></div>
      </div>
    </div>
  </section>
);
