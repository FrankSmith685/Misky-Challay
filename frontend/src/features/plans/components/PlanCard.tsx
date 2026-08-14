import { CalendarDays, Check, Crown, Gift, Sparkles, WalletCards } from 'lucide-react';
import { Badge } from '@components/ui/Badge';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { formatCurrency } from '@lib/format';
import { cn } from '@lib/cn';
import type { Plan } from '../types';

interface PlanCardProps {
  plan: Plan;
  isAuthenticated: boolean;
  onSelect: (plan: Plan) => void;
}

/** Tarjeta comparable: separa inversión, saldo, bono, vigencia y beneficios. */
export const PlanCard = ({
  plan,
  isAuthenticated,
  onSelect,
}: PlanCardProps) => {
  const bonus = Math.max(0, plan.grantedCredit - plan.price);
  const bonusPercent = plan.price > 0 ? Math.round((bonus / plan.price) * 100) : 0;

  return (
    <Card
      className={cn(
        'group relative flex min-h-full flex-col overflow-hidden rounded-card p-0 transition duration-300 hover:-translate-y-1 hover:shadow-e3',
        plan.isFeatured
          ? 'border-brand-600 shadow-e3 ring-1 ring-brand-600'
          : 'hover:border-brand-200',
      )}
    >
      <div
        className={cn(
          'h-1.5',
          plan.isFeatured
            ? 'bg-gradient-to-r from-brand-500 via-brand-700 to-accent-400'
            : 'bg-gradient-to-r from-brand-100 to-brand-300',
        )}
      />

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <span
            className={cn(
              'grid size-11 place-items-center rounded-card',
              plan.isFeatured ? 'bg-brand-700 text-white' : 'bg-brand-50 text-brand-700',
            )}
          >
            {plan.isFeatured ? <Crown className="size-5" /> : <WalletCards className="size-5" />}
          </span>
          {plan.isFeatured ? (
            <Badge variant="solid" className="px-3 py-1">
              <Sparkles className="size-3" /> Recomendado
            </Badge>
          ) : (
            <Badge variant="neutral">Disponible</Badge>
          )}
        </div>

        <h2 className="mt-5 text-xl font-black tracking-tight text-ink">{plan.name}</h2>
        <p className="mt-2 min-h-12 text-sm leading-6 text-ink-muted">
          {plan.description ?? 'Saldo y beneficios para disfrutar Verde Bowl con mayor libertad.'}
        </p>

        <div className="mt-5 grid grid-cols-2 gap-2.5" aria-label={`Resumen económico de ${plan.name}`}>
          <div className="rounded-card border border-line bg-surface-muted/65 p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-[.1em] text-ink-muted">Pagas</p>
            <p className="mt-1 text-xl font-black text-ink">{formatCurrency(plan.price)}</p>
          </div>
          <div className="rounded-card border border-brand-100 bg-brand-50 p-3.5">
            <p className="text-[10px] font-bold uppercase tracking-[.1em] text-brand-700">Recibes</p>
            <p className="mt-1 text-xl font-black text-brand-700">{formatCurrency(plan.grantedCredit)}</p>
          </div>
        </div>

        {bonus > 0 && (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-card bg-accent-400/12 px-3 py-2.5 text-xs">
            <span className="inline-flex items-center gap-1.5 font-bold text-amber-900">
              <Gift className="size-3.5" /> Bono incluido
            </span>
            {/* accent-700, no accent-500: a 11px sobre blanco el 500 se queda en ~2.3:1. */}
            <strong className="text-accent-700">
              +{formatCurrency(bonus)} · {bonusPercent}%
            </strong>
          </div>
        )}

        <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-5">
          <p className="text-xs font-extrabold uppercase tracking-[.12em] text-ink">Qué incluye</p>
          <span className="text-[11px] font-semibold text-ink-muted">
            {plan.benefits.length} {plan.benefits.length === 1 ? 'beneficio' : 'beneficios'}
          </span>
        </div>

        <ul className="mt-3 flex-1 space-y-3 text-sm">
          <li className="flex items-start gap-2.5">
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-card bg-brand-50 text-brand-700">
              <CalendarDays className="size-3" />
            </span>
            <span className="text-ink-muted">
              Bono y beneficios por <strong className="text-ink">{plan.validityDays} días</strong>
            </span>
          </li>
          <li className="flex items-start gap-2.5">
            <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-card bg-brand-50 text-brand-700">
              <WalletCards className="size-3" />
            </span>
            <span className="text-ink-muted">
              El dinero pagado conserva <strong className="text-ink">180 días</strong>
            </span>
          </li>
          {plan.benefits.map((benefit) => (
            <li key={benefit.id} className="flex items-start gap-2.5">
              <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-card bg-brand-600 text-white">
                <Check className="size-3" strokeWidth={3} />
              </span>
              <span className="leading-5 text-ink-muted">{benefit.description}</span>
            </li>
          ))}
        </ul>

        <div className="mt-6 border-t border-line pt-5">
          <Button
            className="w-full"
            size="lg"
            variant={plan.isFeatured ? 'primary' : 'outline'}
            onClick={() => onSelect(plan)}
            aria-label={isAuthenticated ? `Elegir ${plan.name}` : `Iniciar sesión para elegir ${plan.name}`}
          >
            {isAuthenticated ? `Elegir ${plan.name}` : 'Inicia sesión para elegir'}
          </Button>
          <p className="mt-2.5 text-center text-[11px] text-ink-muted">
            Pago único · no se renovará automáticamente
          </p>
        </div>
      </div>
    </Card>
  );
};
