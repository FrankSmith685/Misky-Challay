import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarClock, Check, CreditCard, Gift, Lock, ShieldCheck, WalletCards } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { Checkbox } from '@components/ui/Checkbox';
import { Modal } from '@components/ui/Modal';
import { PriceBreakdown } from '@components/ui/PriceBreakdown';
import { TrustBadges } from '@components/ui/TrustBadges';
import { formatCurrency } from '@lib/format';
import { ROUTES } from '@constants/routes';
import type { Plan } from '../types';

interface PlanPurchaseModalProps {
  plan: Plan | null;
  isBuying: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

/** Confirmación informada de la compra y de las vigencias de cada tipo de saldo. */
export const PlanPurchaseModal = ({
  plan,
  isBuying,
  onClose,
  onConfirm,
}: PlanPurchaseModalProps) => {
  const [accepted, setAccepted] = useState(false);

  useEffect(() => setAccepted(false), [plan?.id]);

  if (!plan) return null;
  const bonus = Math.max(0, plan.grantedCredit - plan.price);

  return (
    <Modal
      isOpen
      onClose={isBuying ? () => undefined : onClose}
      title={`Confirma ${plan.name}`}
      description="Revisa qué vence y cuándo antes de continuar al pago seguro."
      eyebrow="Resumen de compra"
      icon={CreditCard}
      maxWidth="sm"
    >
      <div className="grid gap-5">
      <div className="rounded-card border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.12em] text-brand-700">Saldo total acreditado</p>
            <p className="mt-1 text-3xl font-black text-brand-800">{formatCurrency(plan.grantedCredit)}</p>
          </div>
          <span className="grid size-11 shrink-0 place-items-center rounded-card bg-brand-700 text-white">
            <WalletCards className="size-5" />
          </span>
        </div>
        {bonus > 0 && (
          <p className="mt-3 inline-flex items-center gap-1.5 rounded-pill bg-accent-400/15 px-3 py-1.5 text-xs font-extrabold text-amber-900">
            <Gift className="size-3.5" /> Incluye {formatCurrency(bonus)} de bono
          </p>
        )}
      </div>

      <PriceBreakdown
        density="relaxed"
        prominentTotal
        lines={[
          { label: 'Dinero pagado', value: `${formatCurrency(plan.price)} · 180 días` },
          { label: 'Bono promocional', value: `${formatCurrency(bonus)} · ${plan.validityDays} días` },
          { label: 'Beneficios del plan', value: `${plan.validityDays} días` },
        ]}
        totalLabel="Pagarás ahora"
        totalValue={formatCurrency(plan.price)}
        note="No es una suscripción y no se renovará automáticamente."
      />

      <div className="rounded-card border border-line bg-surface-muted/55 p-4">
        <p className="flex items-center gap-2 text-xs font-extrabold text-ink">
          <CalendarClock className="size-4 text-brand-700" />
          Antes de continuar
        </p>
        <ul className="mt-3 space-y-2 text-xs leading-5 text-ink-muted">
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0 text-brand-600" />
            El saldo se acredita únicamente cuando el proveedor confirma el pago.
          </li>
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0 text-brand-600" />
            Tus pedidos usarán primero el saldo que tenga el vencimiento más cercano.
          </li>
          <li className="flex items-start gap-2">
            <Check className="mt-0.5 size-3.5 shrink-0 text-brand-600" />
            El bono y los beneficios vencen con el plan; el dinero pagado conserva 180 días.
          </li>
        </ul>
      </div>

      <Checkbox
        checked={accepted}
        onChange={(event) => setAccepted(event.target.checked)}
        label={
          <span className="text-xs leading-5 text-ink-muted">
            He leído y acepto las condiciones de saldo descritas en los{' '}
            <Link className="font-bold text-brand-700 underline" to={ROUTES.terms} target="_blank">
              Términos y Condiciones
            </Link>
            .
          </span>
        }
      />

      <TrustBadges
        variant="compact"
        items={[
          { icon: Lock, label: 'Checkout protegido' },
          { icon: ShieldCheck, label: 'Datos de tarjeta fuera de Verde Bowl' },
        ]}
      />

      <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row">
        <Button className="sm:flex-1" variant="ghost" disabled={isBuying} onClick={onClose}>
          Seguir comparando
        </Button>
        <Button
          className="sm:flex-[1.4]"
          size="lg"
          disabled={!accepted}
          isLoading={isBuying}
          onClick={onConfirm}
        >
          Ir al pago seguro
        </Button>
      </div>
      </div>
    </Modal>
  );
};
