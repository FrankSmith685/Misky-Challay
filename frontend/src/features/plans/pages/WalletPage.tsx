import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowDownLeft, ArrowUpRight, CalendarClock, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { SectionHeading } from '@components/common/SectionHeading';
import { PageLoader } from '@components/common/PageLoader';
import { Button } from '@components/ui/Button';
import { Card, CardDescription } from '@components/ui/Card';
import { getApiErrorMessage } from '@services/api/client';
import { formatCurrency, formatDate } from '@lib/format';
import { cn } from '@lib/cn';
import { ROUTES } from '@constants/routes';
import { plansApi } from '../services/plans.service';
import type { WalletSummary, WalletTransaction } from '../types';

const TX_LABEL: Record<WalletTransaction['type'], { label: string; isCredit: boolean }> = {
  CREDIT: { label: 'Saldo recibido', isCredit: true },
  REFUND: { label: 'Devolucion', isCredit: true },
  DEBIT: { label: 'Pedido pagado', isCredit: false },
  EXPIRATION: { label: 'Saldo vencido', isCredit: false },
  ADJUSTMENT: { label: 'Ajuste', isCredit: false },
};

/** "Mi saldo": billetera, vigencia y libro de movimientos (RN-013). */
const WalletPage = () => {
  const [params] = useSearchParams();
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Se vuelve de pagar un plan: el webhook puede tardar un instante en acreditar.
  const justPaid = params.get('plan') !== null;

  useEffect(() => {
    let attempts = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;

    const load = async () => {
      try {
        const [summary, movements] = await Promise.all([
          plansApi.wallet(),
          plansApi.transactions(),
        ]);

        if (cancelled) return;
        setWallet(summary);
        setTransactions(movements);
        setIsLoading(false);

        // Si acaba de pagar y el saldo aun no llega, se reintenta unos segundos.
        attempts += 1;
        if (justPaid && summary.activePlans.length === 0 && attempts < 8) {
          timer = setTimeout(load, 1500);
        }
      } catch (error) {
        if (cancelled) return;
        toast.error(getApiErrorMessage(error));
        setIsLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [justPaid]);

  if (isLoading) return <PageLoader />;
  if (!wallet) return null;

  const hasPlan = wallet.activePlans.length > 0;

  return (
    <div>
      <SectionHeading title="Mi saldo" description="Tu billetera, tus beneficios y tus movimientos." />

      <Card className="bg-gradient-to-br from-brand-50 to-surface">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs uppercase tracking-wide text-ink-muted">Saldo disponible</p>
            <p className="mt-1 text-4xl font-bold text-brand-700">
              {formatCurrency(wallet.balance)}
            </p>
          </div>
          <Wallet className="size-6 text-brand-600" />
        </div>

        {wallet.expiresAt && (
          <p className="mt-3 flex items-center gap-1.5 text-sm text-ink-muted">
            <CalendarClock className="size-4" />
            Vence el {formatDate(wallet.expiresAt)} · lo que no uses se pierde
          </p>
        )}

        {!hasPlan && (
          <div className="mt-4">
            <CardDescription>
              No tienes un plan activo. Con un plan recibes mas saldo del que pagas y beneficios en
              cada pedido.
            </CardDescription>
            <Link to={ROUTES.plans}>
              <Button className="mt-3" size="sm">
                Ver planes
              </Button>
            </Link>
          </div>
        )}
      </Card>

      {hasPlan && (
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          {wallet.activePlans.map((plan) => (
            <Card key={plan.id}>
              <p className="font-semibold text-ink">{plan.name}</p>
              <CardDescription className="mt-0.5">
                {formatCurrency(plan.credit)} de saldo · vence{' '}
                {plan.expiresAt ? formatDate(plan.expiresAt) : 'sin fecha'}
              </CardDescription>

              <ul className="mt-3 space-y-1 text-sm text-brand-700">
                {plan.benefits.map((benefit) => (
                  <li key={benefit.type}>· {benefit.description}</li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}

      <h2 className="mb-3 mt-8 text-lg font-semibold text-ink">Movimientos</h2>

      {transactions.length === 0 ? (
        <Card className="border-dashed py-10 text-center">
          <CardDescription>Todavia no hay movimientos.</CardDescription>
        </Card>
      ) : (
        <ul className="space-y-2">
          {transactions.map((movement) => {
            const meta = TX_LABEL[movement.type];

            return (
              <li key={movement.id}>
                <Card className="flex items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={cn(
                        'flex size-8 shrink-0 items-center justify-center rounded-full',
                        meta.isCredit ? 'bg-brand-50 text-brand-700' : 'bg-surface-muted text-ink-muted',
                      )}
                    >
                      {meta.isCredit ? (
                        <ArrowDownLeft className="size-4" />
                      ) : (
                        <ArrowUpRight className="size-4" />
                      )}
                    </span>

                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{movement.description}</p>
                      <p className="text-xs text-ink-muted">
                        {meta.label} · {formatDate(movement.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="shrink-0 text-right">
                    <p
                      className={cn(
                        'text-sm font-semibold',
                        meta.isCredit ? 'text-brand-700' : 'text-ink',
                      )}
                    >
                      {meta.isCredit ? '+' : '−'}
                      {formatCurrency(movement.amount)}
                    </p>
                    <p className="text-xs text-ink-muted">
                      Saldo: {formatCurrency(movement.balanceAfter)}
                    </p>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};

export default WalletPage;
