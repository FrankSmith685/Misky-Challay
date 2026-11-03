import { Link } from 'react-router-dom';
import { ArrowRight, CalendarCheck2, CheckCircle2, Palette, WalletCards } from 'lucide-react';
import { MarketingHeading, MarketingSection } from '@components/marketing';
import { Button } from '@components/ui/Button';
import { Reveal } from '@components/ui/Reveal';
import { ROUTES } from '@constants/routes';

const TRANSPARENCY_POINTS = [
  { icon: WalletCards, title: 'Precio siempre visible', text: 'Cada tamaño, sabor y extra se refleja antes de agregar la torta al carrito.' },
  { icon: CalendarCheck2, title: 'Fecha con capacidad real', text: 'Las franjas disponibles dependen de la producción y la sucursal elegida.' },
  { icon: Palette, title: 'Diseño acompañado', text: 'Puedes enviar una referencia privada y aceptar la propuesta antes de pagar.' },
];

export const HomeTransparencySection = () => (
  <MarketingSection tone="brand">
    <div className="pointer-events-none absolute inset-y-0 left-0 w-[42%] bg-white/28" />
    <div className="grid items-center gap-14 lg:grid-cols-[1.03fr_.97fr] lg:gap-20">
      <Reveal className="relative">
        <figure className="relative overflow-hidden rounded-card shadow-e3">
          <img src="/images/cakes/custom.svg" alt="Ilustración de una torta para personalizar" loading="lazy" width={960} height={720} className="aspect-[4/3] w-full object-contain" />
          <figcaption className="absolute right-4 top-4 rounded-full bg-white/95 px-3 py-1.5 text-[10px] text-ink-muted">Imagen referencial</figcaption>
        </figure>

        <div className="absolute bottom-5 left-4 right-4 rounded-card border border-line bg-white/96 p-4 shadow-xl backdrop-blur sm:bottom-7 sm:left-7 sm:right-auto sm:w-[310px] sm:p-5">
          <div className="flex items-center justify-between"><p className="text-xs font-black uppercase tracking-[.14em] text-brand-700">Resumen en vivo</p><CheckCircle2 className="size-4 text-brand-600" /></div>
          <div className="mt-4 grid grid-cols-3 divide-x divide-line text-center">
            {['Tamaño', 'Fecha', 'Precio'].map((label) => <span key={label} className="px-1 text-xs font-extrabold text-ink">{label}<small className="mt-1 block font-medium text-ink-muted">Visible</small></span>)}
          </div>
        </div>
      </Reveal>

      <Reveal delay={100}>
        <MarketingHeading eyebrow="Transparencia de verdad" title="Decide con información, no con dudas" description="La experiencia te acompaña mientras eliges. Lo importante aparece en el momento correcto, sin obligarte a calcular nada."
        />
        <ul className="mt-8 border-t border-brand-200">
          {TRANSPARENCY_POINTS.map(({ icon: Icon, title, text }) => (
            <li key={title} className="grid grid-cols-[42px_1fr] gap-4 border-b border-brand-200 py-5">
              <span className="grid size-10 place-items-center rounded-card bg-white text-brand-700 shadow-sm"><Icon className="size-4.5" /></span>
              <div><p className="font-black text-ink">{title}</p><p className="mt-1 text-sm leading-6 text-ink-muted">{text}</p></div>
            </li>
          ))}
        </ul>
        <div className="pt-8">
          <Button component={Link} to={ROUTES.menuMode('CUSTOM')} variant="outline" size="lg" className="bg-white">Crea tu torta <ArrowRight className="size-4" /></Button>
        </div>
      </Reveal>
    </div>
  </MarketingSection>
);
