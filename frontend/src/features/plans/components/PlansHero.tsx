import {
  ArrowDown,
  CalendarCheck2,
  Check,
  ShieldCheck,
  Sparkles,
  WalletCards,
} from 'lucide-react';
import { Badge } from '@components/ui/Badge';
import { formatCurrency } from '@lib/format';
import type { Plan } from '../types';

interface PlansHeroProps {
  planCount: number;
  featuredPlan?: Plan;
}

/** Presentación compacta con un ejemplo basado en la configuración real. */
export const PlansHero = ({ planCount, featuredPlan }: PlansHeroProps) => {
  const bonus = featuredPlan
    ? Math.max(0, featuredPlan.grantedCredit - featuredPlan.price)
    : 0;

  return (
    <section className="relative isolate overflow-hidden bg-[#103e2b] text-white">
      <div className="pointer-events-none absolute inset-0 opacity-25 [background-image:linear-gradient(rgba(255,255,255,.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.08)_1px,transparent_1px)] [background-size:42px_42px]" />
      <div className="pointer-events-none absolute -left-24 top-1/2 size-72 -translate-y-1/2 rounded-full bg-brand-400/20 blur-3xl" />

      <div className="relative mx-auto grid max-w-7xl gap-9 px-4 py-10 sm:px-6 sm:py-12 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:gap-14 lg:px-8 lg:py-14">
        <div>
          <Badge className="border border-white/15 bg-white/10 px-3 py-1.5 text-white" variant="neutral">
            <Sparkles className="size-3.5 text-brand-200" />
            Recargas sin renovación automática
          </Badge>

          <h1 className="mt-5 max-w-3xl text-4xl font-black leading-[1.03] tracking-[-.04em] sm:text-5xl lg:text-[3.45rem]">
            Haz que tu presupuesto rinda{' '}
            <span className="text-brand-300">más en cada pedido.</span>
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-7 text-brand-100 sm:text-lg">
            Paga una sola vez, recibe saldo adicional y úsalo poco a poco. Sin permanencia ni cargos recurrentes.
          </p>

          <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-brand-100">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="size-4 text-brand-300" /> Pago protegido
            </span>
            <span className="inline-flex items-center gap-2">
              <CalendarCheck2 className="size-4 text-brand-300" /> Vigencias transparentes
            </span>
            <span className="inline-flex items-center gap-2">
              <WalletCards className="size-4 text-brand-300" /> Saldo por lotes
            </span>
          </div>

          <a
            href="#planes-disponibles"
            className="mt-7 inline-flex min-h-12 items-center gap-2 rounded-field bg-accent-400 px-6 font-extrabold text-brand-900 shadow-[0_12px_32px_rgba(245,165,36,.22)] transition hover:-translate-y-0.5 hover:bg-accent-500"
          >
            Comparar {planCount || ''} planes <ArrowDown className="size-4" />
          </a>
        </div>

        <div className="relative mx-auto w-full max-w-xl">
          <div className="absolute -bottom-3 -right-3 h-full w-full rounded-card border border-white/15 bg-brand-700/40" />
          <div className="relative rounded-card border border-white/15 bg-white/[.09] p-5 shadow-e5 backdrop-blur sm:p-6">
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-[.16em] text-brand-200">
                  {featuredPlan ? 'Ejemplo recomendado' : 'Cómo funciona'}
                </p>
                <p className="mt-1 text-xl font-black">
                  {featuredPlan?.name ?? 'Tu saldo, bajo tu control'}
                </p>
              </div>
              <span className="grid size-11 shrink-0 place-items-center rounded-card bg-white/10 text-brand-200">
                <WalletCards className="size-5" />
              </span>
            </div>

            {featuredPlan ? (
              <>
                <div className="mt-5 grid grid-cols-2 gap-3">
                  <HeroMetric label="Pagas una vez" value={formatCurrency(featuredPlan.price)} />
                  <HeroMetric label="Saldo recibido" value={formatCurrency(featuredPlan.grantedCredit)} highlighted />
                </div>
                <div className="mt-3 flex items-center justify-between gap-4 rounded-card border border-accent-400/25 bg-accent-400/10 px-4 py-3">
                  <span className="text-sm font-bold text-white">Bono adicional</span>
                  <strong className="text-lg text-accent-300">+{formatCurrency(bonus)}</strong>
                </div>
                <ul className="mt-5 space-y-2 text-xs leading-5 text-brand-100">
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-brand-300" />
                    Bono y beneficios durante {featuredPlan.validityDays} días.
                  </li>
                  <li className="flex items-start gap-2">
                    <Check className="mt-0.5 size-3.5 shrink-0 text-brand-300" />
                    El dinero pagado conserva 180 días de vigencia.
                  </li>
                </ul>
              </>
            ) : (
              <ol className="mt-5 space-y-3 text-sm text-brand-100">
                <li>1. Elige cuánto quieres recargar.</li>
                <li>2. Completa un único pago seguro.</li>
                <li>3. Usa tu saldo en varios pedidos.</li>
              </ol>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

const HeroMetric = ({
  label,
  value,
  highlighted = false,
}: {
  label: string;
  value: string;
  highlighted?: boolean;
}) => (
  <div className={`rounded-card border p-3.5 ${highlighted ? 'border-brand-300/30 bg-brand-300/10' : 'border-white/10 bg-white/[.06]'}`}>
    <p className="text-[10px] font-bold uppercase tracking-[.1em] text-brand-200">{label}</p>
    <p className={`mt-1 text-xl font-black ${highlighted ? 'text-brand-200' : 'text-white'}`}>{value}</p>
  </div>
);
