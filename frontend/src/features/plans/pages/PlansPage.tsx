import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarClock, RefreshCw, WalletCards } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { EmptyState } from '@components/common/EmptyState';
import { PageLoader } from '@components/common/PageLoader';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { useAppSelector } from '@app/hooks';
import { getApiErrorMessage } from '@services/api/client';
import { formatCurrency, formatDate } from '@lib/format';
import { ROUTES } from '@constants/routes';
import { PlanCard } from '../components/PlanCard';
import { PlanPurchaseModal } from '../components/PlanPurchaseModal';
import { PlansGuide } from '../components/PlansGuide';
import { PlansHero } from '../components/PlansHero';
import { plansApi } from '../services/plans.service';
import type { Plan, WalletSummary } from '../types';

/** Comparador de recargas con beneficios y confirmación previa al proveedor de pago. */
const PlansPage = () => {
  const navigate = useNavigate();
  const isAuthenticated = useAppSelector((state) => state.auth.isAuthenticated);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedPlan, setSelectedPlan] = useState<Plan | null>(null);
  const [buyingCode, setBuyingCode] = useState<string | null>(null);
  const purchaseKey = useRef<string | null>(null);

  const loadPlans = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const [availablePlans, currentWallet] = await Promise.all([
        plansApi.list(),
        isAuthenticated ? plansApi.wallet().catch(() => null) : Promise.resolve(null),
      ]);
      setPlans(availablePlans);
      setWallet(currentWallet);
    } catch (error) {
      setLoadError(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [isAuthenticated]);

  useEffect(() => {
    void loadPlans();
  }, [loadPlans]);

  const selectPlan = (plan: Plan) => {
    if (!isAuthenticated) {
      toast('Inicia sesión para elegir un plan');
      navigate(ROUTES.login, { state: { from: ROUTES.plans } });
      return;
    }

    purchaseKey.current = crypto.randomUUID();
    setSelectedPlan(plan);
  };

  const closePurchase = () => {
    if (buyingCode) return;
    purchaseKey.current = null;
    setSelectedPlan(null);
  };

  const confirmPurchase = async () => {
    if (!selectedPlan) return;
    const idempotencyKey = purchaseKey.current ?? crypto.randomUUID();
    purchaseKey.current = idempotencyKey;
    setBuyingCode(selectedPlan.code);

    try {
      const purchase = await plansApi.purchase(selectedPlan.code, idempotencyKey);
      if (!purchase.checkoutUrl) {
        toast.error('No pudimos abrir el entorno de pago. Intenta nuevamente.');
        return;
      }
      window.location.assign(purchase.checkoutUrl);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setBuyingCode(null);
    }
  };

  if (isLoading) return <PageLoader />;

  return (
    <div className="bg-surface-muted">
      <PlansHero
        planCount={plans.length}
        featuredPlan={plans.find((plan) => plan.isFeatured) ?? plans[0]}
      />

      <main className="pb-20 sm:pb-24">
        <section id="planes-disponibles" className="scroll-mt-24">
          <div className="mx-auto max-w-8xl px-4 pt-12 sm:px-6 sm:pt-16 lg:px-8">
            {wallet && wallet.activePlans.length > 0 && (
              <div className="mb-8">
              <Card className="flex flex-col justify-between gap-4 rounded-card border-brand-200 bg-brand-50 p-5 shadow-none sm:flex-row sm:items-center">
                <div>
                  <p className="text-xs font-extrabold uppercase tracking-[.14em] text-brand-700">
                    Ya tienes {wallet.activePlans.length === 1 ? 'un plan activo' : 'planes activos'}
                  </p>
                  <p className="mt-1 font-bold text-ink">
                    {formatCurrency(wallet.balance)} disponibles: {formatCurrency(wallet.paidBalance)} pagados y{' '}
                    {formatCurrency(wallet.bonusBalance)} de bono.
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Próximo vencimiento: {wallet.nextExpiry ? formatDate(wallet.nextExpiry) : 'sin vencimiento'}.
                    Una nueva compra crea lotes independientes; no elimina ni mezcla los anteriores.
                  </p>
                </div>
                <Button component={Link} to={ROUTES.accountWallet} variant="outline">
                  Revisar mi saldo
                </Button>
              </Card>
              </div>
            )}

            <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
              <div className="max-w-2xl">
                <p className="text-xs font-extrabold uppercase tracking-[.18em] text-brand-700">
                  Compara con tranquilidad
                </p>
                <h2 className="mt-2 text-3xl font-black tracking-[-.03em] text-ink sm:text-4xl">
                  Elige cuánto quieres recargar
                </h2>
                <p className="mt-3 text-sm leading-6 text-ink-muted sm:text-base">
                  La diferencia entre lo que pagas y lo que recibes es tu bono. También conservas
                  los beneficios del plan durante toda su vigencia.
                </p>
              </div>

              {isAuthenticated && (
                <Button
                  component={Link}
                  to={ROUTES.accountWallet}
                  variant="outline"
                  leftIcon={<WalletCards className="size-4" />}
                >
                  Ver mi saldo
                </Button>
              )}
            </div>

            {loadError ? (
              <EmptyState
                className="mt-8"
                icon={RefreshCw}
                title="No pudimos cargar los planes"
                description={loadError}
                action={
                  <Button onClick={() => void loadPlans()} leftIcon={<RefreshCw className="size-4" />}>
                    Intentar nuevamente
                  </Button>
                }
              />
            ) : plans.length === 0 ? (
              <EmptyState
                className="mt-8"
                icon={CalendarClock}
                title="No hay planes disponibles por el momento"
                description="Estamos preparando nuevas opciones. Puedes seguir comprando desde el menú."
                action={
                  <Button component={Link} to={ROUTES.menu}>
                    Explorar el menú
                  </Button>
                }
              />
            ) : (
              <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3 xl:gap-6">
                {plans.map((plan) => (
                  <PlanCard
                    key={plan.id}
                    plan={plan}
                    isAuthenticated={isAuthenticated}
                    onSelect={selectPlan}
                  />
                ))}
              </div>
            )}

            <PlansGuide />

            <div className="mt-8">
            <Card className="flex items-start gap-3 rounded-card border-dashed bg-transparent p-4 shadow-none sm:p-5">
              <CalendarClock className="mt-0.5 size-5 shrink-0 text-brand-700" />
              <p className="text-xs leading-5 text-ink-muted sm:text-sm sm:leading-6">
                <strong className="text-ink">Importante:</strong> el bono y los beneficios vencen
                junto con el plan. El dinero que pagaste tiene 180 días de vigencia. Cada fecha y
                remanente se muestra por separado en “Mi saldo”.
              </p>
            </Card>
            </div>
          </div>
        </section>
      </main>

      <PlanPurchaseModal
        plan={selectedPlan}
        isBuying={buyingCode === selectedPlan?.code}
        onClose={closePurchase}
        onConfirm={() => void confirmPurchase()}
      />
    </div>
  );
};

export default PlansPage;
