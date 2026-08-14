import { Link } from 'react-router-dom';
import { ArrowRight, CalendarCheck2, Check, ShieldCheck, Sparkles, Wallet } from 'lucide-react';
import { MarketingHeading, MarketingSection } from '@components/marketing';
import { Button } from '@components/ui/Button';
import { Reveal } from '@components/ui/Reveal';
import { ROUTES } from '@constants/routes';

const PLAN_POINTS = ['Compra única, sin renovación automática', 'Saldo y vigencias separados por compra', 'Beneficios explicados antes de pagar'];

export const HomePlansSection = () => (
  <MarketingSection tone="dark" contentClassName="py-18 lg:py-24">
    <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(120deg,transparent_0%,transparent_48%,rgba(255,255,255,.12)_48%,rgba(255,255,255,.12)_49%,transparent_49%)]" />
    <div className="pointer-events-none absolute right-0 top-0 h-full w-2 bg-accent-500" />
    <div className="grid items-center gap-12 lg:grid-cols-[1fr_.9fr] lg:gap-20">
      <Reveal>
        <MarketingHeading eyebrow="Planes Verde" title="Organiza tus comidas sin perder el control" description="Compra saldo una vez, recibe beneficios y revisa cada vigencia desde tu cuenta. No es una suscripción y no existen cargos automáticos." inverse />
        <ul className="mt-7 space-y-3">
          {PLAN_POINTS.map((point) => <li key={point} className="flex items-center gap-3 text-sm font-semibold text-brand-100"><span className="grid size-5 place-items-center rounded-[3px] bg-brand-600 text-white"><Check className="size-3.5" /></span>{point}</li>)}
        </ul>
        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <Button component={Link} to={ROUTES.plans} size="lg" variant="secondary">Comparar planes <ArrowRight className="size-4" /></Button>
          <Button component={Link} to={ROUTES.menu} size="lg" variant="ghost" sx={{ color: 'rgba(255,255,255,.84)', '&:hover': { color: '#fff', backgroundColor: 'rgba(255,255,255,.1)' } }}>Ver el menú</Button>
        </div>
      </Reveal>

      <Reveal delay={120} className="relative">
        <div className="rounded-card border border-white/15 bg-white/[.07] p-5 shadow-2xl backdrop-blur sm:p-7">
          <div className="flex items-center justify-between border-b border-white/12 pb-5">
            <div><p className="text-[10px] font-black uppercase tracking-[.2em] text-brand-300">Tu cuenta Verde</p><p className="mt-1 text-xl font-black text-white">Saldo fácil de entender</p></div>
            <span className="grid size-11 place-items-center rounded-card bg-brand-700 text-brand-100"><Wallet className="size-5" /></span>
          </div>
          <div className="grid gap-3 py-5 sm:grid-cols-2">
            <InfoBlock icon={CalendarCheck2} title="Vigencia visible" text="Cada lote conserva su propia fecha." />
            <InfoBlock icon={Sparkles} title="Beneficios claros" text="Sabes qué aplica y hasta cuándo." accent />
          </div>
          <div className="flex flex-col gap-3 border-t border-white/12 pt-5 text-xs text-brand-100 sm:flex-row sm:items-center sm:justify-between">
            <span className="inline-flex items-center gap-2"><ShieldCheck className="size-4 text-brand-300" /> Sin débitos automáticos</span>
            <span>Movimientos disponibles en tu cuenta</span>
          </div>
        </div>
        <div className="absolute -bottom-3 -left-3 h-16 w-16 border-b-2 border-l-2 border-accent-500" aria-hidden="true" />
      </Reveal>
    </div>
  </MarketingSection>
);

const InfoBlock = ({ icon: Icon, title, text, accent = false }: { icon: typeof Wallet; title: string; text: string; accent?: boolean }) => (
  <div className={accent ? 'rounded-card bg-accent-500 p-4 text-white' : 'rounded-card bg-white/[.07] p-4 text-white'}>
    <Icon className="size-5" />
    <p className="mt-7 font-black">{title}</p>
    <p className={accent ? 'mt-1 text-xs leading-5 text-orange-50' : 'mt-1 text-xs leading-5 text-brand-100'}>{text}</p>
  </div>
);
