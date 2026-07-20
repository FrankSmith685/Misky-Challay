import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, Check, ChefHat, Clock3, Flame, Leaf, MapPin, Salad, ShieldCheck, Sparkles, Star, Truck, Wallet } from 'lucide-react';
import { ROUTES } from '@constants/routes';
import { Button } from '@components/ui/Button';

const FEATURES = [
  { icon: Salad, title: 'A tu manera', text: 'Combina bases, proteinas y toppings con reglas claras.' },
  { icon: Flame, title: 'Nutricion visible', text: 'Calorias y macronutrientes se actualizan con cada eleccion.' },
  { icon: CalendarDays, title: 'Cuando quieras', text: 'Pide ahora o programa una franja que encaje con tu semana.' },
];

const STEPS = [
  { number: '01', title: 'Confirma tu zona', text: 'Validamos cobertura y encontramos la cocina mas cercana.', icon: MapPin },
  { number: '02', title: 'Elige o crea', text: 'Explora el menu o construye un bowl totalmente tuyo.', icon: ChefHat },
  { number: '03', title: 'Disfrutalo fresco', text: 'Sigue tu pedido desde cocina hasta tu puerta.', icon: Truck },
];

const HomePage = () => (
  <>
    <section className="relative overflow-hidden bg-[#f3f8f4]">
      <div className="absolute -left-32 top-16 size-80 rounded-full bg-brand-200/50 blur-3xl" />
      <div className="absolute -right-24 bottom-0 size-96 rounded-full bg-accent-400/15 blur-3xl" />
      <div className="relative mx-auto grid min-h-[680px] max-w-7xl items-center gap-12 px-4 py-16 lg:grid-cols-[1.05fr_.95fr] lg:px-6 lg:py-20">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-white/80 px-3 py-1.5 text-xs font-semibold text-brand-700 shadow-sm"><Leaf className="size-3.5" /> Comida real, hecha para ti</span>
          <h1 className="mt-6 text-4xl font-extrabold leading-[1.08] tracking-[-0.045em] text-ink sm:text-6xl lg:text-7xl">Come rico.<br /><span className="text-brand-600">Sientete increible.</span></h1>
          <p className="mt-6 max-w-xl text-base leading-7 text-ink-muted sm:text-lg">Bowls frescos y personalizables, con nutricion transparente y entrega flexible. Tu decides que comer y cuando recibirlo.</p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <Link to={ROUTES.menu}><Button size="lg" className="w-full px-7 shadow-lg shadow-brand-700/20 sm:w-auto">Explorar el menu <ArrowRight className="size-4" /></Button></Link>
            <Link to={ROUTES.builder}><Button size="lg" variant="outline" className="w-full border-brand-200 bg-white/70 px-7 sm:w-auto"><Sparkles className="size-4 text-accent-500" /> Arma tu bowl</Button></Link>
          </div>
          <div className="mt-8 flex flex-wrap gap-x-5 gap-y-2 text-xs font-medium text-ink-muted"><span className="flex items-center gap-1.5"><Check className="size-4 text-brand-600" /> Sin permanencia</span><span className="flex items-center gap-1.5"><Check className="size-4 text-brand-600" /> Pago seguro</span><span className="flex items-center gap-1.5"><Check className="size-4 text-brand-600" /> Ingredientes frescos</span></div>
        </div>

        <div className="relative mx-auto w-full max-w-[540px]">
          <div className="aspect-square rounded-[3rem] bg-gradient-to-br from-brand-600 to-brand-800 p-6 shadow-2xl shadow-brand-900/20 sm:p-10">
            <div className="relative flex size-full items-center justify-center overflow-hidden rounded-full border-[14px] border-white/90 bg-[#e7d2b2] shadow-2xl">
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,#8ed1ac_0_15%,transparent_16%),radial-gradient(circle_at_68%_28%,#f5a524_0_13%,transparent_14%),radial-gradient(circle_at_65%_70%,#369a68_0_17%,transparent_18%),radial-gradient(circle_at_28%_68%,#f8eee0_0_18%,transparent_19%)]" />
              <Salad className="relative size-28 text-brand-800/80 sm:size-36" strokeWidth={1.2} />
            </div>
          </div>
          <div className="absolute -left-3 top-12 rounded-2xl bg-white p-3 shadow-xl sm:-left-10"><p className="flex items-center gap-2 text-xs font-semibold text-ink"><span className="grid size-8 place-items-center rounded-xl bg-accent-400/15"><Flame className="size-4 text-accent-500" /></span> Nutricion<br />en tiempo real</p></div>
          <div className="absolute -bottom-4 right-3 rounded-2xl bg-white p-3 shadow-xl sm:-right-6"><p className="flex items-center gap-2 text-xs font-semibold text-ink"><span className="grid size-8 place-items-center rounded-xl bg-brand-50"><Clock3 className="size-4 text-brand-600" /></span> Entrega desde<br />30 minutos</p></div>
        </div>
      </div>
    </section>

    <section className="border-y border-line bg-white">
      <div className="mx-auto grid max-w-7xl divide-y divide-line px-4 sm:grid-cols-3 sm:divide-x sm:divide-y-0 lg:px-6">
        {FEATURES.map(({ icon: Icon, title, text }) => <div key={title} className="flex gap-4 px-2 py-7 sm:px-6"><span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600"><Icon className="size-5" /></span><div><h2 className="font-bold text-ink">{title}</h2><p className="mt-1 text-sm leading-5 text-ink-muted">{text}</p></div></div>)}
      </div>
    </section>

    <section className="mx-auto max-w-7xl px-4 py-20 lg:px-6 lg:py-28">
      <div className="mx-auto max-w-2xl text-center"><p className="text-xs font-bold uppercase tracking-[.18em] text-brand-600">Tan facil como delicioso</p><h2 className="mt-3 text-3xl font-bold tracking-tight text-ink sm:text-4xl">De tu antojo a tu puerta</h2><p className="mt-3 text-ink-muted">Una experiencia simple, transparente y pensada alrededor de tu tiempo.</p></div>
      <div className="mt-12 grid gap-5 md:grid-cols-3">{STEPS.map(({ number, title, text, icon: Icon }) => <article key={number} className="group relative overflow-hidden rounded-[1.5rem] border border-line bg-surface p-6 transition-all hover:-translate-y-1 hover:border-brand-200 hover:shadow-xl"><span className="absolute right-5 top-3 text-6xl font-black text-brand-50">{number}</span><span className="relative grid size-12 place-items-center rounded-2xl bg-brand-600 text-white shadow-lg shadow-brand-800/15"><Icon className="size-5" /></span><h3 className="relative mt-6 text-lg font-bold text-ink">{title}</h3><p className="relative mt-2 text-sm leading-6 text-ink-muted">{text}</p></article>)}</div>
    </section>

    <section className="bg-brand-900 text-white">
      <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-16 lg:grid-cols-2 lg:px-6 lg:py-20">
        <div><span className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-brand-300"><Wallet className="size-4" /> Planes Verde</span><h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">Organiza tu semana y haz rendir mas tu saldo.</h2><p className="mt-4 max-w-xl leading-7 text-brand-100">Recarga una vez, recibe saldo extra y desbloquea beneficios. Sin renovaciones automaticas ni letras pequeñas.</p><Link to={ROUTES.plans} className="mt-7 inline-flex items-center gap-2 font-semibold text-accent-400 hover:text-accent-500">Conocer los planes <ArrowRight className="size-4" /></Link></div>
        <div className="grid grid-cols-2 gap-3"><div className="rounded-3xl border border-white/10 bg-white/10 p-5"><ShieldCheck className="size-6 text-brand-300" /><p className="mt-8 text-2xl font-bold">100%</p><p className="mt-1 text-sm text-brand-100">control de tu saldo</p></div><div className="mt-8 rounded-3xl bg-accent-500 p-5 text-white"><Star className="size-6" /><p className="mt-8 text-2xl font-bold">+ beneficios</p><p className="mt-1 text-sm text-orange-50">en cada pedido</p></div></div>
      </div>
    </section>

    <section className="mx-auto max-w-7xl px-4 py-20 lg:px-6"><div className="relative overflow-hidden rounded-[2rem] bg-brand-50 px-6 py-12 text-center sm:px-10"><div className="absolute left-0 top-0 size-40 rounded-full bg-brand-200/40 blur-3xl" /><h2 className="relative text-3xl font-bold tracking-tight text-ink">Tu proximo bowl empieza aqui</h2><p className="relative mx-auto mt-3 max-w-lg text-ink-muted">Elige uno de nuestros favoritos o crea una combinacion tan unica como tu.</p><Link to={ROUTES.menu} className="relative mt-7 inline-block"><Button size="lg">Ver platos disponibles <ArrowRight className="size-4" /></Button></Link></div></section>
  </>
);

export default HomePage;
