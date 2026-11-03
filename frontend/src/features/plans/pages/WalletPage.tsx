import { useLiveRefresh } from '@services/realtime';
import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Gift,
  Info,
  ReceiptText,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Wallet,
} from 'lucide-react';
import { PageHeader } from '@components/common/PageHeader';
import { EmptyState } from '@components/common/EmptyState';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { Skeleton } from '@components/ui/Skeleton';
import { getApiErrorMessage } from '@services/api/client';
import { formatCurrency, formatDate } from '@lib/format';
import { cn } from '@lib/cn';
import { ROUTES } from '@constants/routes';
import { AccountLoadError } from '@features/account/components/AccountSectionCard';
import { plansApi } from '../services/plans.service';
import type { WalletCreditLot, WalletLotKind, WalletSummary, WalletTransaction } from '../types';

const TX_LABEL: Record<WalletTransaction['type'], { label: string; isCredit: boolean }> = {
  CREDIT: { label: 'Saldo recibido', isCredit: true },
  REFUND: { label: 'Devolución', isCredit: true },
  DEBIT: { label: 'Pedido pagado', isCredit: false },
  EXPIRATION: { label: 'Saldo vencido', isCredit: false },
  ADJUSTMENT: { label: 'Ajuste', isCredit: false },
};

const LOT_LABEL: Record<WalletLotKind, string> = {
  PAID: 'Dinero pagado',
  BONUS: 'Bono promocional',
  REFUND: 'Devolución',
  LEGACY: 'Saldo anterior',
};

type MovementFilter = 'ALL' | 'IN' | 'OUT';
type PaymentStatus = 'idle' | 'checking' | 'confirmed' | 'pending';

/** Billetera explicable: total, origen, vigencia y libro mayor. */
const WalletPage = () => {
  const [params] = useSearchParams();
  const planParam = params.get('plan');
  const targetPlanId = planParam && /^\d+$/.test(planParam) ? Number(planParam) : null;
  const [wallet, setWallet] = useState<WalletSummary | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  useLiveRefresh(["wallet","subscriptions","orders"], () => setRetryNonce((value) => value + 1));
  const [movementFilter, setMovementFilter] = useState<MovementFilter>('ALL');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>(targetPlanId ? 'checking' : 'idle');

  useEffect(() => {
    let attempts = 0;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = async () => {
      try {
        const [summary, movements] = await Promise.all([
          plansApi.wallet(),
          plansApi.transactions(),
        ]);
        if (cancelled) return;
        setWallet(summary);
        setTransactions(movements);
        setLoadError(null);
        setIsLoading(false);

        attempts += 1;
        const paymentConfirmed = targetPlanId !== null
          && summary.activePlans.some((plan) => plan.id === targetPlanId);
        if (paymentConfirmed) {
          setPaymentStatus('confirmed');
        } else if (targetPlanId !== null && attempts < 8) {
          setPaymentStatus('checking');
          timer = setTimeout(load, 1500);
        } else if (targetPlanId !== null) {
          setPaymentStatus('pending');
        }
      } catch (error) {
        if (cancelled) return;
        /*
         * El fallo se pinta en la pagina, no en un toast: antes `wallet` se quedaba
         * en null, el render devolvia null y el cliente veia la barra lateral de su
         * cuenta con un hueco blanco al lado, sin cabecera ni forma de reintentar.
         */
        setLoadError(getApiErrorMessage(error));
        setPaymentStatus(targetPlanId ? 'pending' : 'idle');
        setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [targetPlanId, retryNonce]);

  const movementCounts = useMemo(() => ({
    ALL: transactions.length,
    IN: transactions.filter((movement) => TX_LABEL[movement.type].isCredit).length,
    OUT: transactions.filter((movement) => !TX_LABEL[movement.type].isCredit).length,
  }), [transactions]);
  const filteredTransactions = useMemo(() => transactions.filter((movement) => {
    if (movementFilter === 'IN') return TX_LABEL[movement.type].isCredit;
    if (movementFilter === 'OUT') return !TX_LABEL[movement.type].isCredit;
    return true;
  }), [movementFilter, transactions]);

  /* La cabecera se declara aparte porque la pagina tiene tres finales posibles y en
   * los tres el cliente tiene que saber donde esta: titulo y migas siempre presentes. */
  const header = (
    <PageHeader
      eyebrow="Actividad"
      title="Mi saldo"
      description="Revisa tu saldo disponible, sus fechas de vigencia y cada movimiento."
      icon={Wallet}
      crumbs={[{ label: 'Inicio', to: '/' }, { label: 'Mi cuenta' }, { label: 'Saldo' }]}
      action={<Button component={Link} to={ROUTES.plans} variant="outline" leftIcon={<Sparkles className="size-4" />}>Cajas mensuales</Button>}
      className="mb-6"
    />
  );

  if (isLoading) {
    return (
      <div>
        {header}
        <WalletSkeleton />
      </div>
    );
  }

  if (!wallet) {
    return (
      <div>
        {header}
        <AccountLoadError
          title="No pudimos cargar tu saldo"
          /* Volviendo de pagar un plan, lo primero que teme el cliente es haber pagado
           * en vano: el fallo es de la consulta, no del cobro. */
          message={`${loadError ?? 'La consulta no devolvió tu saldo.'}${
            targetPlanId
              ? ' Si el pago se completó, tu plan queda registrado igualmente: vuelve a intentarlo en unos segundos.'
              : ' Vuelve a intentarlo en unos segundos.'
          }`}
          onRetry={() => {
            setIsLoading(true);
            setRetryNonce((value) => value + 1);
          }}
        />
      </div>
    );
  }

  const hasPlan = wallet.activePlans.length > 0;
  const paidShare = wallet.balance > 0 ? (wallet.paidBalance / wallet.balance) * 100 : 0;
  const nextExpiryDays = wallet.nextExpiry ? daysUntil(wallet.nextExpiry) : null;
  const filters: Array<{ value: MovementFilter; label: string }> = [
    { value: 'ALL', label: 'Todos' },
    { value: 'IN', label: 'Ingresos' },
    { value: 'OUT', label: 'Usos y vencimientos' },
  ];

  return (
    <div>
      {header}

      {paymentStatus !== 'idle' && (
        <div className={cn('mb-4 flex items-start gap-3 rounded-card border p-4', paymentStatus === 'confirmed' ? 'border-brand-200 bg-brand-50 text-brand-900' : 'border-amber-200 bg-amber-50 text-amber-900')} role="status">
          {paymentStatus === 'confirmed' ? <CheckCircle2 className="mt-0.5 size-5 shrink-0" /> : <Clock3 className={cn('mt-0.5 size-5 shrink-0', paymentStatus === 'checking' && 'animate-pulse')} />}
          <div>
            <p className="text-sm font-extrabold">
              {paymentStatus === 'confirmed' ? 'Tu plan ya está activo' : paymentStatus === 'checking' ? 'Estamos confirmando tu pago' : 'Tu pago continúa en validación'}
            </p>
            <p className="mt-0.5 text-xs leading-5 opacity-85">
              {paymentStatus === 'confirmed' ? 'El saldo y los beneficios ya están disponibles.' : paymentStatus === 'checking' ? 'Esta pantalla se actualizará automáticamente durante unos segundos.' : 'No realizaremos una segunda compra. El saldo aparecerá cuando el proveedor confirme el cobro.'}
            </p>
          </div>
        </div>
      )}

      <section
        className="overflow-hidden rounded-card border border-brand-700 text-white shadow-e3"
        style={{ background: 'linear-gradient(135deg, var(--color-brand-800), var(--color-brand-600))' }}
        aria-labelledby="wallet-balance-title"
      >
        <div className="grid gap-6 p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:p-7">
          <div>
            <p id="wallet-balance-title" className="text-xs font-bold uppercase tracking-[.12em] text-brand-100">Saldo disponible</p>
            <p className="mt-2 text-4xl font-black tracking-tight sm:text-5xl">{formatCurrency(wallet.balance)}</p>
            <p className="mt-2 max-w-xl text-sm leading-6 text-brand-50">Puedes aplicarlo en uno o varios pedidos desde el checkout.</p>
          </div>
          <Button component={Link} to={ROUTES.menu} variant="secondary" leftIcon={<ShoppingBag className="size-4" />} className="w-full sm:w-auto">Usar mi saldo</Button>
        </div>
        <div className="border-t border-white/15 bg-black/10 px-5 py-3 sm:px-7">
          {wallet.nextExpiry ? (
            <p className="flex items-center gap-2 text-xs font-semibold text-brand-50">
              <CalendarClock className="size-4 shrink-0" /> Próximo vencimiento: {formatDate(wallet.nextExpiry)}
              {nextExpiryDays !== null && <span className="rounded-pill bg-white/15 px-2 py-0.5">{expiryDistance(nextExpiryDays)}</span>}
            </p>
          ) : (
            <p className="flex items-center gap-2 text-xs font-semibold text-brand-50"><ShieldCheck className="size-4" /> Tu saldo disponible no tiene un vencimiento próximo.</p>
          )}
        </div>
      </section>

      <section className="mt-4 grid gap-3 sm:grid-cols-2" aria-label="Composición del saldo">
        <BalanceCard
          icon={CircleDollarSign}
          label="Dinero pagado y devoluciones"
          value={wallet.paidBalance}
          description={`Las recargas pagadas conservan ${wallet.paidCreditValidityDays} días de vigencia.`}
        />
        <BalanceCard
          icon={Gift}
          label="Bonos promocionales"
          value={wallet.bonusBalance}
          description="Cada bono vence con el plan que lo otorgó."
          tone="bonus"
        />
      </section>

      {wallet.balance > 0 && (
        <div className="mt-3 rounded-card border border-line bg-white p-4">
          <div className="flex items-center justify-between gap-3 text-xs font-semibold text-ink-muted">
            <span>{Math.round(paidShare)}% saldo pagado</span>
            <span>{Math.round(100 - paidShare)}% bono</span>
          </div>
          <div className="mt-2 flex h-2 overflow-hidden rounded-pill bg-amber-300" aria-label="Composición visual del saldo">
            <span className="h-full bg-brand-600" style={{ width: `${paidShare}%` }} />
          </div>
        </div>
      )}

      <section className="mt-6 rounded-card border border-line bg-surface-muted/45 p-4 sm:p-5" aria-labelledby="wallet-rules-title">
        <div className="flex items-center gap-2">
          <Info className="size-4 text-brand-700" />
          <h2 id="wallet-rules-title" className="text-sm font-extrabold text-ink">Cómo funciona tu saldo</h2>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <WalletRule number="1" title="Vigencias separadas" text="Cada compra y cada bono conserva su propia fecha." />
          <WalletRule number="2" title="Primero el que vence" text="En tus pedidos usamos antes el lote con menor vigencia." />
          <WalletRule number="3" title="Saldo anterior" text="Las recargas compradas antes no se renuevan ni generan nuevos cargos." />
        </div>
      </section>

      {!hasPlan && (
        <div className="mt-6">
        <Card className="rounded-card border-dashed shadow-none">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-extrabold text-ink">No tienes beneficios de un plan activos</p>
              <p className="mt-1 text-sm leading-6 text-ink-muted">El saldo pagado que todavía esté vigente puede seguir utilizándose normalmente.</p>
            </div>
            <Button component={Link} to={ROUTES.plans} size="sm" className="sm:shrink-0">Ver cajas mensuales</Button>
          </div>
        </Card>
        </div>
      )}

      {hasPlan && (
        <section className="mt-8" aria-labelledby="active-plans-title">
          <div className="mb-3">
            <p className="text-xs font-bold uppercase tracking-[.1em] text-brand-700">Beneficios vigentes</p>
            <h2 id="active-plans-title" className="mt-1 text-xl font-black text-ink">Planes activos</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {wallet.activePlans.map((plan) => (
              <Card key={plan.id} className="overflow-hidden rounded-card p-0">
                <div className="flex items-start justify-between gap-3 border-b border-line bg-brand-50/60 p-4 sm:p-5">
                  <div>
                    <p className="font-extrabold text-ink">{plan.name}</p>
                    <p className="mt-1 text-xs text-ink-muted">Beneficios hasta {plan.expiresAt ? formatDate(plan.expiresAt) : 'nuevo aviso'}</p>
                  </div>
                  <span className="grid size-9 shrink-0 place-items-center rounded-card bg-brand-700 text-white"><ShieldCheck className="size-4" /></span>
                </div>
                <div className="p-4 sm:p-5">
                  <div className="grid grid-cols-2 gap-3">
                    <PlanAmount label="Saldo pagado" value={plan.paidRemaining} />
                    <PlanAmount label="Bono" value={plan.bonusRemaining} bonus />
                  </div>
                  {plan.benefits.length > 0 && (
                    <ul className="mt-4 space-y-2 border-t border-line pt-4">
                      {plan.benefits.map((benefit) => <li key={benefit.type} className="flex items-start gap-2 text-xs font-semibold text-brand-800"><CheckCircle2 className="mt-0.5 size-3.5 shrink-0" /> {benefit.description}</li>)}
                    </ul>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {wallet.lots.length > 0 && (
        <section className="mt-8" aria-labelledby="wallet-lots-title">
          <p className="text-xs font-bold uppercase tracking-[.1em] text-brand-700">Orden de consumo</p>
          <h2 id="wallet-lots-title" className="mt-1 text-xl font-black text-ink">Vigencia de cada saldo</h2>
          <p className="mt-1 text-sm text-ink-muted">El primer saldo de esta lista será el primero que intentaremos usar.</p>
          <div className="mt-4 overflow-hidden rounded-card border border-line bg-white">
            {wallet.lots.map((lot, index) => <WalletLotRow key={lot.id} lot={lot} first={index === 0} divided={index > 0} />)}
          </div>
        </section>
      )}

      <section className="mt-8" aria-labelledby="movements-title">
        <p className="text-xs font-bold uppercase tracking-[.1em] text-brand-700">Historial verificable</p>
        <h2 id="movements-title" className="mt-1 text-xl font-black text-ink">Movimientos</h2>

        {transactions.length > 0 && (
          <nav className="mt-4 overflow-x-auto border-b border-line" aria-label="Filtrar movimientos">
            <div className="flex min-w-max gap-1">
              {filters.map((item) => (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setMovementFilter(item.value)}
                  aria-pressed={movementFilter === item.value}
                  className={cn('relative flex min-h-11 items-center gap-2 px-3 text-sm font-bold transition', movementFilter === item.value ? 'text-brand-800' : 'text-ink-muted hover:text-ink')}
                >
                  {item.label}
                  <span className={cn('rounded-pill px-1.5 py-0.5 text-[10px]', movementFilter === item.value ? 'bg-brand-100 text-brand-800' : 'bg-surface-muted')}>{movementCounts[item.value]}</span>
                  {movementFilter === item.value && <span className="absolute inset-x-2 bottom-0 h-0.5 bg-brand-700" />}
                </button>
              ))}
            </div>
          </nav>
        )}

        {transactions.length === 0 ? (
          <EmptyState variant="inset" icon={ReceiptText} title="Todavía no hay movimientos" description="Aquí aparecerán las recargas, usos, devoluciones y vencimientos." />
        ) : filteredTransactions.length === 0 ? (
          <EmptyState variant="inset" icon={ReceiptText} title="No hay movimientos en esta categoría" action={<Button variant="outline" size="sm" onClick={() => setMovementFilter('ALL')}>Ver todos</Button>} />
        ) : (
          <ul className="mt-4 space-y-2">
            {filteredTransactions.map((movement) => {
              const meta = TX_LABEL[movement.type];
              return (
                <li key={movement.id}>
                  <Card className="flex items-center justify-between gap-3 rounded-card py-3 shadow-none">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-card', meta.isCredit ? 'bg-brand-50 text-brand-700' : 'bg-surface-muted text-ink-muted')}>
                        {meta.isCredit ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-ink">{movement.description}</p>
                        <p className="mt-0.5 text-xs text-ink-muted">{meta.label} · {formatDate(movement.createdAt)}</p>
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={cn('text-sm font-extrabold', meta.isCredit ? 'text-brand-700' : 'text-ink')}>
                        {meta.isCredit ? '+' : '−'}{formatCurrency(movement.amount)}
                      </p>
                      <p className="mt-0.5 text-[10px] text-ink-muted">Saldo: {formatCurrency(movement.balanceAfter)}</p>
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
};

/** Silueta real: bloque de saldo, las dos tarjetas de composición y la lista de movimientos. */
const WalletSkeleton = () => (
  <div>
    <Skeleton className="h-47.5 w-full rounded-card sm:h-52.5" />
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <Skeleton className="h-31.5 rounded-card" />
      <Skeleton className="h-31.5 rounded-card" />
    </div>
    <Skeleton className="mt-6 h-33 w-full rounded-card" />
    <div className="mt-8">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="mt-2 h-6 w-44" />
      <div className="mt-4 space-y-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-17 w-full rounded-card" />
        ))}
      </div>
    </div>
  </div>
);

const BalanceCard = ({ icon: Icon, label, value, description, tone = 'paid' }: {
  icon: typeof Wallet;
  label: string;
  value: number;
  description: string;
  tone?: 'paid' | 'bonus';
}) => (
  <Card className={cn('rounded-card shadow-none', tone === 'bonus' ? 'border-amber-200 bg-amber-50/40' : 'border-brand-100')}>
    <div className="flex items-start gap-3">
      <span className={cn('grid size-10 shrink-0 place-items-center rounded-card', tone === 'bonus' ? 'bg-amber-100 text-amber-800' : 'bg-brand-50 text-brand-700')}><Icon className="size-5" /></span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-[.08em] text-ink-muted">{label}</p>
        <p className="mt-1 text-2xl font-black text-ink">{formatCurrency(value)}</p>
        <p className="mt-1 text-xs leading-5 text-ink-muted">{description}</p>
      </div>
    </div>
  </Card>
);

const WalletRule = ({ number, title, text }: { number: string; title: string; text: string }) => (
  <div className="flex items-start gap-3">
    <span className="grid size-7 shrink-0 place-items-center rounded-card bg-brand-700 text-xs font-black text-white">{number}</span>
    <div><p className="text-xs font-extrabold text-ink">{title}</p><p className="mt-1 text-xs leading-5 text-ink-muted">{text}</p></div>
  </div>
);

const PlanAmount = ({ label, value, bonus = false }: { label: string; value: number; bonus?: boolean }) => (
  <div className={cn('rounded-card border p-3', bonus ? 'border-amber-100 bg-amber-50/50' : 'border-brand-100 bg-brand-50/45')}>
    <p className="text-[10px] font-bold uppercase tracking-[.07em] text-ink-muted">{label}</p>
    <p className="mt-1 text-base font-black text-ink">{formatCurrency(value)}</p>
  </div>
);

const WalletLotRow = ({ lot, first, divided }: { lot: WalletCreditLot; first: boolean; divided: boolean }) => {
  const remainingDays = lot.expiresAt ? daysUntil(lot.expiresAt) : null;
  const urgent = remainingDays !== null && remainingDays <= 14;
  return (
    <div className={cn('grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5', divided && 'border-t border-line')}>
      <div className="flex min-w-0 items-start gap-3">
        <span className={cn('grid size-9 shrink-0 place-items-center rounded-card', lot.kind === 'BONUS' ? 'bg-amber-100 text-amber-800' : 'bg-brand-50 text-brand-700')}>
          {lot.kind === 'BONUS' ? <Gift className="size-4" /> : <CircleDollarSign className="size-4" />}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-extrabold text-ink">{LOT_LABEL[lot.kind]}</p>
            {first && <span className="rounded-pill bg-brand-100 px-2 py-0.5 text-[10px] font-extrabold text-brand-800">Se usa primero</span>}
          </div>
          <p className="mt-0.5 truncate text-xs text-ink-muted">{lot.planName ?? 'Saldo de tu billetera'}</p>
        </div>
      </div>
      <div className="pl-12 sm:pl-0 sm:text-right">
        <p className="text-base font-black text-ink">{formatCurrency(lot.remainingAmount)}</p>
        <p className={cn('mt-0.5 text-xs font-semibold', urgent ? 'text-amber-700' : 'text-ink-muted')}>
          {lot.expiresAt ? `Vence ${formatDate(lot.expiresAt)} · ${expiryDistance(remainingDays ?? 0)}` : 'Sin vencimiento'}
        </p>
      </div>
    </div>
  );
};

const daysUntil = (value: string): number => Math.max(0, Math.ceil((new Date(value).getTime() - Date.now()) / 86_400_000));
const expiryDistance = (days: number): string => days === 0 ? 'vence hoy' : days === 1 ? 'falta 1 día' : `faltan ${days} días`;

export default WalletPage;
