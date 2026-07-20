import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Sparkles, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { SectionHeading } from '@components/common/SectionHeading';
import { PageLoader } from '@components/common/PageLoader';
import { Button } from '@components/ui/Button';
import { Card, CardDescription } from '@components/ui/Card';
import { useAppSelector } from '@app/hooks';
import { getApiErrorMessage } from '@services/api/client';
import { formatCurrency } from '@lib/format';
import { cn } from '@lib/cn';
import { ROUTES } from '@constants/routes';
import { plansApi } from '../services/plans.service';
import type { Plan } from '../types';

/** Comparador de planes (seccion 9.3). El plan es una recarga con beneficios. */
const PlansPage = () => {
  const navigate = useNavigate();
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [buyingCode, setBuyingCode] = useState<string | null>(null);

  useEffect(() => {
    plansApi
      .list()
      .then(setPlans)
      .catch((error) => toast.error(getApiErrorMessage(error)))
      .finally(() => setIsLoading(false));
  }, []);

  const handleBuy = async (plan: Plan) => {
    if (!isAuthenticated) {
      toast('Inicia sesion para comprar un plan');
      navigate(ROUTES.login, { state: { from: ROUTES.plans } });
      return;
    }

    setBuyingCode(plan.code);
    try {
      // Una clave por intento: si el cliente pulsa dos veces, no compra dos planes.
      const purchase = await plansApi.purchase(plan.code, crypto.randomUUID());

      if (!purchase.checkoutUrl) {
        toast.error('No pudimos abrir la pagina de pago');
        return;
      }

      window.location.href = purchase.checkoutUrl;
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setBuyingCode(null);
    }
  };

  if (isLoading) return <PageLoader />;

  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <SectionHeading
        eyebrow="Planes"
        title="Recarga saldo y come mejor cada semana"
        description="Pagas una vez, recibes mas saldo del que pones y desbloqueas beneficios en cada pedido. Sin renovacion automatica."
      />

      <div className="grid gap-5 md:grid-cols-3">
        {plans.map((plan) => {
          const bonus = plan.grantedCredit - plan.price;

          return (
            <Card
              key={plan.id}
              className={cn(
                'flex flex-col',
                plan.isFeatured && 'border-brand-600 ring-1 ring-brand-600',
              )}
            >
              {plan.isFeatured && (
                <span className="mb-3 inline-flex w-fit items-center gap-1 rounded-full bg-brand-600 px-2.5 py-1 text-xs font-medium text-white">
                  <Sparkles className="size-3" /> El mas elegido
                </span>
              )}

              <h3 className="text-lg font-bold text-ink">{plan.name}</h3>
              <CardDescription className="mt-1">{plan.description}</CardDescription>

              <div className="mt-5">
                <p className="text-3xl font-bold text-brand-700">{formatCurrency(plan.price)}</p>
                <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-ink">
                  <Wallet className="size-4 text-brand-600" />
                  Recibes {formatCurrency(plan.grantedCredit)} de saldo
                </p>
                {bonus > 0 && (
                  <p className="mt-0.5 text-xs text-accent-500">
                    Te regalamos {formatCurrency(bonus)}
                  </p>
                )}
              </div>

              <ul className="mt-5 flex-1 space-y-2 border-t border-line pt-4 text-sm">
                <li className="flex items-start gap-2 text-ink-muted">
                  <Check className="mt-0.5 size-4 shrink-0 text-brand-600" />
                  Vigencia de {plan.validityDays} dias
                </li>
                {plan.benefits.map((benefit) => (
                  <li key={benefit.id} className="flex items-start gap-2 text-ink-muted">
                    <Check className="mt-0.5 size-4 shrink-0 text-brand-600" />
                    {benefit.description}
                  </li>
                ))}
              </ul>

              <Button
                className="mt-5 w-full"
                variant={plan.isFeatured ? 'primary' : 'outline'}
                isLoading={buyingCode === plan.code}
                onClick={() => handleBuy(plan)}
              >
                Comprar plan
              </Button>
            </Card>
          );
        })}
      </div>

      <Card className="mt-8 border-dashed">
        <CardDescription>
          El saldo vence junto con el plan: al terminar la vigencia, el saldo que no hayas usado se
          pierde. Te avisamos antes de que eso pase.
        </CardDescription>
      </Card>
    </div>
  );
};

export default PlansPage;
