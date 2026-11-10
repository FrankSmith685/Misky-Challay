import { Link } from 'react-router-dom';
import { ArrowDown, ArrowRight, CalendarDays, CreditCard, Gift, MapPin } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { ROUTES } from '@constants/routes';
import { formatCurrency } from '@lib/format';
import { BoxCollectionPreview } from './BoxCollectionPreview';

export const SubscriptionPlansHero = ({ priceFrom, loggedIn }: { priceFrom?: number; loggedIn: boolean }) => <header className="subscription-plans-hero overflow-hidden border-b border-line">
  <div className="container-shell grid items-center gap-8 py-9 sm:py-12 lg:grid-cols-[1fr_1fr] lg:gap-14 lg:py-14">
    <div className="max-w-xl">
      <p className="flex items-center gap-3 text-[10px] font-semibold uppercase tracking-[.24em] text-brand-700"><span className="h-px w-8 bg-accent-500" aria-hidden="true" />La colección mensual</p>
      <h1 className="mt-5 text-[clamp(2.25rem,4.5vw,3.75rem)] font-extrabold leading-[1.08] text-ink">Tu pequeño lujo de <span className="text-brand-600">cada mes.</span></h1>
      <p className="mt-5 max-w-lg text-base leading-7 text-ink-muted">Una caja de pastelería para saborear despacio, regalar o compartir. Elige tu combinación y hazle un lugar a ese momento dulce.</p>
      {priceFrom !== undefined && <p className="mt-5 flex flex-wrap items-baseline gap-2 text-sm text-ink-muted">Cajas desde <strong className="text-3xl font-extrabold text-ink">{formatCurrency(priceFrom)}</strong><span>al mes</span></p>}
      <div className="mt-5 flex items-start gap-3 rounded-2xl border border-brand-200 bg-white/75 px-4 py-3 text-xs leading-5 text-ink-muted shadow-sm">
        <CreditCard className="mt-0.5 size-4 shrink-0 text-brand-700" aria-hidden="true" />
        <span><strong className="text-ink">Suscripción mensual automática.</strong> Se cobra cada mes hasta que canceles los próximos cobros desde tu cuenta.</span>
      </div>
      <div className="mt-7 flex flex-col gap-3 sm:flex-row">
        <Button component="a" href="#cajas-mensuales" size="lg">Explorar las cajas <ArrowDown className="ml-2 size-4" /></Button>
        {loggedIn ? <Button component={Link} to={ROUTES.accountSubscriptions} variant="outline" size="lg">Mis suscripciones <ArrowRight className="ml-2 size-4" /></Button> : <a href="#como-funcionan-las-cajas" className="inline-flex min-h-12 items-center justify-center gap-2 px-3 text-sm font-semibold text-brand-700">Cómo funciona <ArrowRight className="size-4" /></a>}
      </div>
      <p className="mt-5 text-[11px] leading-5 text-ink-muted">Suscripción con cobro mensual automático. Puedes cancelar los futuros cobros desde tu cuenta.</p>
    </div>
    <BoxCollectionPreview />
  </div>
  <div className="border-t border-line bg-white/60"><div className="container-shell grid gap-3 py-4 text-xs text-ink-muted sm:grid-cols-3 sm:gap-6">
    {[{ icon: Gift, title: 'Una caja por mensualidad', text: 'Con cada pago confirmado.' }, { icon: MapPin, title: 'Recojo en sucursal', text: 'Actualmente no incluye delivery.' }, { icon: CalendarDays, title: 'Tu fecha, coordinada', text: 'Programa cada caja desde tu cuenta.' }].map(({ icon: Icon, title, text }) => <div key={title} className="flex items-center gap-3"><Icon className="size-5 shrink-0 text-brand-600" aria-hidden="true" /><div><strong className="block font-semibold text-ink">{title}</strong><span className="mt-0.5 block text-[11px]">{text}</span></div></div>)}
  </div></div>
</header>;
