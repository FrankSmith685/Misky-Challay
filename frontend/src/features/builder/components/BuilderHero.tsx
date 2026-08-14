import { ArrowDown, CheckCircle2, Scale, ShieldCheck, Sparkles } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { formatCurrency } from '@lib/format';
import type { BuilderConfig } from '../types';

interface BuilderHeroProps {
  product: BuilderConfig['product'];
  variants: BuilderConfig['variants'];
}

const BENEFITS = [
  { icon: Scale, title: 'Precio en vivo' },
  { icon: ShieldCheck, title: 'Selección validada' },
  { icon: CheckCircle2, title: 'Nutrición visible' },
];

/** Entrada del constructor: explica el valor y lleva al primer paso. */
export const BuilderHero = ({ product, variants }: BuilderHeroProps) => {
  const priceFrom = Math.min(...variants.map((entry) => entry.basePrice));

  return (
    <section className="relative isolate overflow-hidden bg-[#103e2b] text-white">
      <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:42px_42px]" />
      <div className="pointer-events-none absolute -left-24 top-1/2 size-72 -translate-y-1/2 rounded-full bg-brand-400/20 blur-3xl" />
      <div className="relative mx-auto grid max-w-7xl items-center gap-9 px-4 py-10 sm:px-6 sm:py-12 lg:grid-cols-[1.08fr_.92fr] lg:gap-14 lg:px-8 lg:py-14">
        <div className="relative z-10 max-w-2xl">
          <span className="inline-flex items-center gap-2 rounded-pill border border-white/12 bg-white/8 px-3.5 py-2 text-xs font-extrabold text-brand-200 backdrop-blur">
            <Sparkles className="size-3.5" aria-hidden="true" />
            Constructor guiado
          </span>
          <h1 className="mt-5 text-4xl font-black leading-[1.02] tracking-[-0.045em] sm:text-5xl lg:text-[3.45rem]">
            Arma un bowl que se sienta
            <span className="text-brand-300"> realmente tuyo.</span>
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-brand-100 sm:text-lg">
            Elige el tamaño, combina tus ingredientes y revisa el precio y la nutrición antes de agregarlo al carrito.
          </p>

          <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2" aria-label="Ventajas del constructor">
            {BENEFITS.map(({ icon: Icon, title }) => (
              <li key={title} className="inline-flex items-center gap-2 text-xs font-bold text-brand-100 sm:text-sm">
                <Icon className="size-4 text-brand-300" aria-hidden="true" />
                <span>{title}</span>
              </li>
            ))}
          </ul>

          <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Button
              component="a"
              href="#constructor"
              variant="secondary"
              size="lg"
              className="w-full shadow-xl shadow-black/15 sm:w-auto"
              leftIcon={<ArrowDown className="size-4" />}
            >
              Empezar a crear
            </Button>
            <p className="text-center text-sm text-brand-200 sm:text-left">
              Desde <strong className="text-base text-white">{formatCurrency(priceFrom)}</strong>
            </p>
          </div>
        </div>

        <div className="relative mx-auto hidden w-full max-w-[520px] sm:block">
          <div className="absolute -bottom-3 -right-3 h-full w-full rounded-card border border-white/15 bg-brand-700/40" />
          <div className="relative overflow-hidden rounded-card border border-white/20 shadow-e5">
            <img
              src={product.imageUrl ?? '/images/builder/bowl-signature.jpg'}
              alt={product.imageAlt ?? 'Bowl fresco personalizable'}
              width={940}
              height={705}
              loading="eager"
              decoding="async"
              className="aspect-[16/10] w-full object-cover"
              style={{ objectPosition: product.imagePosition }}
            />
            <div className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-brand-900/75 to-transparent" />
            <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[.17em] text-white/70">Vista en tiempo real</p>
                <p className="mt-1 text-sm font-extrabold text-white">Tu combinación, paso a paso</p>
              </div>
              <span className="rounded-pill bg-accent-500 px-3 py-1.5 text-xs font-extrabold text-white">
                A tu manera
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
