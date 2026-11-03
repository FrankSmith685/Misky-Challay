import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, Gift, MapPin } from 'lucide-react';
import { MarketingSection } from '@components/marketing';
import { Button } from '@components/ui/Button';
import { Reveal } from '@components/ui/Reveal';
import { ROUTES } from '@constants/routes';
import { BoxCollectionPreview } from '@features/subscriptions/BoxCollectionPreview';

export const HomePlansSection = () => <MarketingSection tone="dark" contentClassName="py-12 sm:py-16 lg:py-20">
  <div className="grid items-center gap-9 lg:grid-cols-[1fr_1fr] lg:gap-16">
    <Reveal>
      <p className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[.23em] text-accent-200"><span className="h-px w-8 bg-accent-400" aria-hidden="true" />La colección mensual</p>
      <h2 className="mt-5 max-w-xl text-3xl font-extrabold leading-[1.1] text-white sm:text-4xl">Un momento dulce.<br /><span className="text-accent-200">Un lugar en tu mes.</span></h2>
      <p className="mt-5 max-w-lg text-sm leading-7 text-brand-100 sm:text-base">Una caja de pastelería para hacer una pausa, sorprender a alguien o compartir la sobremesa. Descubre las combinaciones y encuentra tu favorita.</p>
      <ul className="mt-7 grid gap-3 border-t border-white/15 pt-5 text-xs text-brand-100">
        {[
          { icon: Gift, text: 'Una caja por cada mensualidad confirmada' },
          { icon: MapPin, text: 'Recojo en una sucursal disponible' },
          { icon: CalendarDays, text: 'Programa cada caja desde tu cuenta' },
        ].map(({ icon: Icon, text }) => <li key={text} className="flex items-center gap-2.5"><Icon className="size-4 shrink-0 text-accent-200" aria-hidden="true" />{text}</li>)}
      </ul>
      <Button component={Link} to={ROUTES.plans} size="lg" variant="secondary" className="mt-7 w-full sm:w-auto">Descubrir las cajas mensuales <ArrowRight className="ml-2 size-4" /></Button>
      <p className="mt-4 max-w-md text-[11px] leading-5 text-brand-200">Cobro mensual automático. Puedes cancelar futuros cobros desde tu cuenta.</p>
    </Reveal>
    <Reveal delay={100}>
      <BoxCollectionPreview />
    </Reveal>
  </div>
</MarketingSection>;
