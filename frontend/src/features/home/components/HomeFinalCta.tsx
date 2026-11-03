import { Link } from 'react-router-dom';
import { ArrowRight, CakeSlice, MapPin } from 'lucide-react';
import { MarketingSection } from '@components/marketing';
import { Button } from '@components/ui/Button';
import { Reveal } from '@components/ui/Reveal';
import { ROUTES } from '@constants/routes';

export const HomeFinalCta = () => (
  <MarketingSection tone="white" contentClassName="py-16 lg:py-20">
    <Reveal>
      <div className="grid overflow-hidden rounded-card border border-brand-200 bg-brand-50 shadow-e3 lg:grid-cols-[1.08fr_.92fr]">
        <div className="relative px-6 py-12 sm:px-10 sm:py-16 lg:px-14 lg:py-20">
          <span className="absolute left-0 top-0 h-full w-1.5 bg-brand-700" />
          <p className="text-xs font-black uppercase tracking-[.2em] text-brand-700">Tu próxima celebración</p>
          <h2 className="mt-4 max-w-xl text-3xl font-black tracking-[-.04em] text-ink sm:text-4xl lg:text-5xl">Una torta especial puede empezar ahora</h2>
          <p className="mt-4 max-w-lg text-base leading-7 text-ink-muted">Confirma dónde estás, descubre qué podemos preparar para ti y elige la experiencia que mejor encaje con tu fecha.</p>
          <div className="mt-7 flex flex-col gap-3 sm:flex-row">
            <Button component={Link} to={ROUTES.menu} size="lg">Ver tortas disponibles <ArrowRight className="size-4" /></Button>
            <Button component={Link} to={ROUTES.coverage} size="lg" variant="outline" leftIcon={<MapPin className="size-4" />} className="bg-white">Ver zonas de entrega</Button>
          </div>
        </div>
        <div className="relative min-h-[300px] overflow-hidden border-t border-brand-200 lg:min-h-0 lg:border-l lg:border-t-0">
          <img src="/images/cakes/special.svg" alt="Ilustración de una torta para celebrar" loading="lazy" width={960} height={720} className="absolute inset-0 size-full object-cover" />
          <span className="absolute right-4 top-4 rounded-full bg-white/95 px-3 py-1.5 text-[10px] text-ink-muted">Imagen referencial</span>
          <div className="absolute inset-0 bg-gradient-to-t from-ink/60 via-transparent to-transparent" />
          <div className="absolute bottom-5 left-5 right-5 flex items-center justify-between border-l-2 border-accent-400 bg-black/35 px-4 py-3 text-xs font-bold text-white backdrop-blur">
            <span className="inline-flex items-center gap-2"><CakeSlice className="size-3.5" /> Elige con claridad</span><span>Recibe con confianza</span>
          </div>
        </div>
      </div>
    </Reveal>
  </MarketingSection>
);
