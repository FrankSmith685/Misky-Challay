import { useState } from 'react';
import { ArrowRight, CalendarDays, Check, ChevronDown, Gift, MapPin, Users } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { formatCurrency } from '@lib/format';
import type { BoxItem, SubscriptionPlan, subscriptionsApi } from './subscriptionsApi';
import { boxImageFallbacks, planSavings, retailTotal } from './planPresentation';

type Branch = Awaited<ReturnType<typeof subscriptionsApi.branches>>[number];

const BoxItemImage = ({ item }: { item: BoxItem }) => {
  const [failed, setFailed] = useState<string[]>([]);
  const src = [item.imageUrl, boxImageFallbacks[item.productSlug ?? '']].find((url) => url && !failed.includes(url));
  return <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-line bg-surface-muted">
    {src ? <img src={src} alt="" width={48} height={48} loading="lazy" onError={() => setFailed((current) => [...current, src])} className="size-full object-cover" /> : <Gift className="size-5 text-brand-400" aria-hidden="true" />}
  </span>;
};

export const SubscriptionPlanCard = ({ plan, index, branches, highlighted, selected, available, onSelect }: {
  plan: SubscriptionPlan;
  index: number;
  branches: Branch[];
  highlighted: boolean;
  selected: boolean;
  available: boolean;
  onSelect: () => void;
}) => {
  const savings = planSavings(plan);
  const locations = branches.filter((branch) => branch.acceptsPickup && plan.branchIds.includes(branch.id));
  const soldOut = plan.remainingSubscriptions <= 0;
  const disabled = !available || soldOut || !locations.length;
  const titleId = `subscription-plan-${plan.id}`;
  const audience = plan.code === 'CAJA_DULCE' ? 'Para disfrutar a solas' : plan.code === 'CAJA_COMPARTIR' ? 'Para compartir' : plan.code === 'CAJA_CELEBRACION' ? 'Para celebrar' : 'Para tu momento dulce';
  return <article aria-labelledby={titleId} data-selected={selected} className={`subscription-plan-card relative flex h-full min-w-0 flex-col overflow-hidden rounded-card border p-6 sm:p-7 ${highlighted ? 'subscription-plan-card--featured border-brand-800 bg-brand-900 text-white' : 'border-line bg-white text-ink'}`}>
    <div className="flex min-h-7 flex-wrap items-center justify-between gap-2">
      <p className={`text-[10px] font-semibold uppercase tracking-[.2em] ${highlighted ? 'text-brand-200' : 'text-ink-muted'}`}>La colección · {String(index + 1).padStart(2, '0')}</p>
      {highlighted && <span className="inline-flex items-center gap-1.5 rounded-full border border-accent-300/40 bg-accent-100 px-2.5 py-1 text-[10px] font-semibold text-accent-900"><Gift className="size-3" aria-hidden="true" />Mayor ahorro por caja</span>}
    </div>
    <h3 id={titleId} className="mt-5 text-2xl font-extrabold leading-tight tracking-tight">{plan.name}</h3>
    <p className={`mt-1 text-xs font-semibold ${highlighted ? 'text-accent-200' : 'text-brand-700'}`}>{audience}</p>
    <p className={`mt-3 min-h-18 text-sm leading-6 ${highlighted ? 'text-brand-100' : 'text-ink-muted'}`}>{plan.description}</p>
    <div className={`mt-6 border-b pb-6 ${highlighted ? 'border-white/15' : 'border-line'}`}>
      <p className="flex flex-wrap items-baseline gap-x-2 gap-y-1"><strong className="text-[clamp(1.8rem,3.4vw,2.6rem)] font-extrabold leading-none tracking-[-.045em] tabular-nums">{formatCurrency(plan.monthlyPrice)}</strong><span className={`text-sm ${highlighted ? 'text-brand-200' : 'text-ink-muted'}`}>/ mes</span></p>
      <p className={`mt-3 text-xs ${highlighted ? 'text-brand-200' : 'text-ink-muted'}`}>Cobro mensual automático · una caja por pago confirmado</p>
      {savings > 0 && <div className={`mt-4 flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2.5 ${highlighted ? 'bg-white/10' : 'bg-tertiary-50'}`}>
        <span className={`text-[11px] ${highlighted ? 'text-brand-100' : 'text-ink-muted'}`}>Por separado: {formatCurrency(retailTotal(plan))}</span><strong className={`text-xs font-semibold ${highlighted ? 'text-accent-200' : 'text-tertiary-800'}`}>Ahorras {formatCurrency(savings)}</strong>
      </div>}
    </div>
    <div className="pt-6">
      <p className={`text-[10px] font-semibold uppercase tracking-[.18em] ${highlighted ? 'text-brand-200' : 'text-ink-muted'}`}>Dentro de tu caja</p>
      <ul className="mt-4 space-y-3.5">{plan.items.map((item) => <li key={item.variantId} className="flex items-center gap-3">
        <BoxItemImage item={item} />
        <div className="min-w-0 flex-1"><p className="text-sm font-semibold leading-5">{item.productName}</p><p className={`mt-1 text-[11px] leading-4 ${highlighted ? 'text-brand-200' : 'text-ink-muted'}`}>{item.variantName}</p></div>
        <span className={`shrink-0 rounded-md px-2 py-1 text-xs font-semibold tabular-nums ${highlighted ? 'bg-white/10 text-brand-100' : 'bg-surface-muted text-ink-muted'}`}>×{item.quantity}</span>
      </li>)}</ul>
    </div>
    <div className="mt-auto pt-7">
      <div className={`space-y-2.5 border-t pt-5 text-xs ${highlighted ? 'border-white/15 text-brand-100' : 'border-line text-ink-muted'}`}>
        <p className="flex items-center gap-2"><CalendarDays className="size-4 shrink-0" aria-hidden="true" />{plan.leadDays} {plan.leadDays === 1 ? 'día' : 'días'} de anticipación para el recojo</p>
        <p className="flex items-center gap-2"><Users className="size-4 shrink-0" aria-hidden="true" />{soldOut ? 'Cupos agotados por ahora' : `${plan.remainingSubscriptions} ${plan.remainingSubscriptions === 1 ? 'cupo disponible' : 'cupos disponibles'}`}</p>
        <details className="group">
          <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2"><MapPin className="size-4 shrink-0" aria-hidden="true" /><span className="flex-1">{locations.length} {locations.length === 1 ? 'sucursal de recojo' : 'sucursales de recojo'}</span><ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden="true" /></summary>
          <ul className={`mt-1 space-y-3 rounded-xl p-3 ${highlighted ? 'bg-white/5' : 'bg-surface-muted'}`}>{locations.length ? locations.map((branch) => <li key={branch.id}><p className="font-semibold">{branch.name}</p><p className="mt-1 text-[11px] leading-5 opacity-80">{branch.addressLine}</p></li>) : <li>Sin sucursal disponible actualmente.</li>}</ul>
        </details>
      </div>
      <Button variant={highlighted ? 'secondary' : 'primary'} className="mt-5 w-full" size="lg" aria-label={`Elegir ${plan.name}`} aria-pressed={selected} disabled={disabled} onClick={onSelect} sx={highlighted ? { '&.Mui-disabled': { backgroundImage: 'none', backgroundColor: 'rgba(255,255,255,.12)', color: 'rgba(255,255,255,.65)' } } : undefined}>
        {selected ? <><Check className="mr-2 size-4" />Caja seleccionada</> : <>Elegir esta caja <ArrowRight className="ml-2 size-4" /></>}
      </Button>
      <p className={`mt-3 min-h-4 text-center text-[11px] leading-4 ${highlighted ? 'text-brand-200' : 'text-ink-muted'}`}>{soldOut ? 'Cupos agotados por ahora' : !locations.length ? 'Sin sucursal de recojo disponible' : !available ? 'Contratación disponible próximamente' : 'Revisa el resumen antes de contratar'}</p>
    </div>
  </article>;
};
