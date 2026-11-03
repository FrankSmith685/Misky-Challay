import { useLiveRefresh } from '@services/realtime';
import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Check, CreditCard, Gift, MapPin, RefreshCw, ShieldCheck } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { getApiErrorMessage } from '@services/api/client';
import { useAppSelector } from '@app/hooks';
import { formatCurrency } from '@lib/format';
import { ROUTES } from '@constants/routes';
import { subscriptionsApi, type SubscriptionPlan } from './subscriptionsApi';
import { SubscriptionPlanCard } from './SubscriptionPlanCard';
import { SubscriptionPlansHero } from './SubscriptionPlansHero';
import { SubscriptionPlansInfo } from './SubscriptionPlansInfo';
import { planSavings } from './planPresentation';
import './subscription-plans.css';

type PickupBranch = Awaited<ReturnType<typeof subscriptionsApi.branches>>[number];

export default function SubscriptionPlansPage() {
  const navigate = useNavigate();
  const loggedIn = useAppSelector((state) => state.auth.isAuthenticated);
  const selectionRef = useRef<HTMLDivElement>(null);
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [branches, setBranches] = useState<PickupBranch[]>([]);
  const [termsVersion, setTermsVersion] = useState('');
  useEffect(() => { setAccepted(false); }, [termsVersion]);
  const [available, setAvailable] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [branchId, setBranchId] = useState(0);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async (background = false) => {
    if (!background) setLoading(true);
    try {
      const [catalog, locations, config] = await Promise.all([subscriptionsApi.plans(), subscriptionsApi.branches(), subscriptionsApi.config()]);
      setPlans(catalog); setBranches(locations); setTermsVersion(config.termsVersion); setAvailable(config.available); setError(null);
    } catch (cause) { setError(getApiErrorMessage(cause)); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, []);
  useLiveRefresh(['catalog', 'subscriptions', 'coverage', 'availability', 'settings'], () => load(true));

  const selectedPlan = plans.find((plan) => plan.id === selected);
  const allowedBranches = selectedPlan ? branches.filter((branch) => branch.acceptsPickup && selectedPlan.branchIds.includes(branch.id)) : [];
  const priceFrom = plans.length && !loading && !error ? Math.min(...plans.map((plan) => plan.monthlyPrice)) : undefined;
  const planGridClass = plans.length === 1 ? 'mx-auto max-w-xl' : plans.length === 2 ? 'mx-auto max-w-5xl md:grid-cols-2' : 'md:grid-cols-2 xl:grid-cols-3';
  const highlightedPlan = plans.filter((plan) => plan.remainingSubscriptions > 0 && branches.some((branch) => branch.acceptsPickup && plan.branchIds.includes(branch.id)))
    .reduce<SubscriptionPlan | null>((best, plan) => planSavings(plan) > (best ? planSavings(best) : 0) ? plan : best, null);
  const selectPlan = (plan: SubscriptionPlan) => {
    setSelected(plan.id);
    setBranchId(branches.find((branch) => branch.acceptsPickup && plan.branchIds.includes(branch.id))?.id ?? 0);
    setAccepted(false);
    requestAnimationFrame(() => selectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const subscribe = async () => {
    if (!selectedPlan || !available || loading || error) return;
    if (!loggedIn) { navigate(ROUTES.login, { state: { from: ROUTES.plans } }); return; }
    if (!branchId || !allowedBranches.some((branch) => branch.id === branchId) || !accepted) {
      toast.error('Elige una sucursal y acepta el cobro mensual'); return;
    }
    setBusy(true);
    try {
      const result = await subscriptionsApi.subscribe(selectedPlan.id, branchId, termsVersion);
      window.location.assign(result.checkoutUrl);
    } catch (cause) { toast.error(getApiErrorMessage(cause)); }
    finally { setBusy(false); }
  };

  return <div className="bg-surface-muted">
    <SubscriptionPlansHero priceFrom={priceFrom} loggedIn={loggedIn} />
    <section id="cajas-mensuales" className="container-shell scroll-mt-28 py-10 sm:py-14" aria-labelledby="available-boxes-title">
      <div className="mb-7 grid gap-3 border-b border-line pb-6 sm:mb-8 md:grid-cols-[1fr_auto] md:items-end">
        <div><p className="text-[10px] font-semibold uppercase tracking-[.2em] text-brand-700">Encuentra tu favorita</p><h2 id="available-boxes-title" className="mt-3 text-3xl leading-tight sm:text-4xl">Pequeños placeres, bien elegidos.</h2></div>
        <p className="max-w-xs text-xs leading-6 text-ink-muted">Compara el contenido y el precio mensual.<br className="hidden md:block" /> Elige tu sucursal antes de contratar.</p>
      </div>
      {error && !loading && <Card className="p-6" role="alert"><p className="text-sm text-ink">{error}</p><Button variant="outline" className="mt-4" onClick={() => void load()} leftIcon={<RefreshCw className="size-4" />}>Reintentar</Button></Card>}
      {!loading && !error && !available && plans.length > 0 && <div role="status" className="mb-6 flex items-start gap-3 rounded-2xl border border-accent-200 bg-accent-50 p-4 text-sm leading-6 text-accent-900"><Gift className="mt-1 size-5 shrink-0" aria-hidden="true" /><p>Puedes descubrir nuestras cajas. La contratación estará disponible cuando se active el cobro recurrente.</p></div>}
      {!loading && !error && !plans.length && <Card className="px-5 py-12 text-center"><span className="mx-auto grid size-16 place-items-center rounded-full border border-accent-200 bg-accent-50"><Gift className="size-7 text-brand-600" aria-hidden="true" /></span><h3 className="mt-5 text-2xl font-bold text-ink">Estamos preparando nuestra colección</h3><p className="mx-auto mt-3 max-w-md text-sm leading-6 text-ink-muted">Pronto podrás elegir una caja mensual. Mientras tanto, puedes descubrir lo que ya tenemos en el catálogo.</p><Button component={Link} to={ROUTES.menu} variant="outline" className="mt-5">Explorar la pastelería <ArrowRight className="ml-2 size-4" /></Button></Card>}
      {loading ? <div role="status" aria-label="Cargando las cajas mensuales" className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((index) => <div key={index} className="h-[650px] animate-pulse rounded-card border border-line bg-white p-7"><div className="h-4 w-24 rounded bg-surface-muted" /><div className="mt-6 h-9 w-2/3 rounded bg-surface-muted" /><div className="mt-4 h-16 rounded bg-surface-muted" /><div className="mt-8 h-12 w-1/2 rounded bg-surface-muted" /><div className="mt-10 h-48 rounded bg-surface-muted" /></div>)}</div> : !error && <div className={`grid w-full items-stretch gap-5 xl:gap-6 ${planGridClass}`}>{plans.map((plan, index) => <SubscriptionPlanCard key={plan.id} plan={plan} index={index} branches={branches} highlighted={highlightedPlan?.id === plan.id} selected={selected === plan.id} available={available} onSelect={() => selectPlan(plan)} />)}</div>}

      {selectedPlan && available && !loading && !error && <section ref={selectionRef} className="mt-10 scroll-mt-28 overflow-hidden rounded-card border border-brand-200 bg-white shadow-e2" aria-labelledby="confirm-box-title">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-line bg-brand-50/50 p-5 sm:p-7">
          <div><p className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.18em] text-brand-700"><Check className="size-3.5" aria-hidden="true" />Tu caja está elegida</p><h2 id="confirm-box-title" className="mt-3 text-3xl text-ink">Completa tu suscripción.</h2><p className="mt-2 text-sm leading-6 text-ink-muted">Elige dónde recogerla y revisa el cobro de {selectedPlan.name}.</p></div>
          <button type="button" className="inline-flex min-h-10 items-center rounded-lg px-3 text-xs font-semibold text-brand-700 underline underline-offset-4" onClick={() => { setSelected(null); setAccepted(false); }}>Cambiar de caja</button>
        </div>
        <div className="grid gap-7 p-5 sm:p-7 lg:grid-cols-[1fr_320px] lg:gap-10">
          <div>
            <fieldset className="min-w-0"><legend className="flex items-center gap-2 text-sm font-semibold text-ink"><span className="grid size-7 place-items-center rounded-full bg-surface-muted text-xs text-brand-700">01</span>Sucursal de recojo</legend>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">{allowedBranches.map((branch) => <label key={branch.id} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm transition-colors ${branchId === branch.id ? 'border-brand-600 bg-brand-50/60 ring-1 ring-brand-100' : 'border-line hover:border-brand-200'}`}><input type="radio" name="subscription-branch" className="mt-1 size-4 shrink-0 accent-brand-700" checked={branchId === branch.id} onChange={() => setBranchId(branch.id)} /><span className="min-w-0 flex-1"><strong className="block break-words text-ink">{branch.name}</strong><span className="mt-1 block text-xs leading-5 text-ink-muted">{branch.addressLine}</span></span></label>)}</div>
            </fieldset>
            <div className="mt-7"><p className="flex items-center gap-2 text-sm font-semibold text-ink"><span className="grid size-7 place-items-center rounded-full bg-surface-muted text-xs text-brand-700">02</span>Revisa el cobro mensual</p>
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-line p-4 text-sm leading-6 text-ink"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} className="mt-1.5 size-4 shrink-0 accent-brand-700" /><span>Autorizo un cobro recurrente de <strong>{formatCurrency(selectedPlan.monthlyPrice)} al mes</strong> y acepto las <Link className="font-semibold text-brand-700 underline underline-offset-2" to="/terminos?documento=suscripcion" target="_blank" rel="noreferrer">condiciones de suscripción</Link>.</span></label>
            </div>
          </div>
          <aside className="rounded-2xl border border-line bg-surface-muted p-5" aria-label="Resumen mensual de tu caja">
            <p className="text-[10px] font-semibold uppercase tracking-[.18em] text-brand-700">Tu elección</p><h3 className="mt-3 text-2xl font-bold text-ink">{selectedPlan.name}</h3><p className="mt-2 flex items-start gap-1.5 text-xs leading-5 text-ink-muted"><MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />{allowedBranches.find((branch) => branch.id === branchId)?.name ?? 'Elige una sucursal'}</p>
            <div className="mt-5 flex flex-wrap items-baseline justify-between gap-3 border-t border-line pt-5"><span className="text-sm text-ink-muted">Total mensual</span><strong className="text-2xl font-semibold tracking-tight text-ink">{formatCurrency(selectedPlan.monthlyPrice)}</strong></div>
            <p className="mt-3 text-[11px] leading-5 text-ink-muted">Una caja por pago confirmado. Programa su recojo desde tu cuenta durante su vigencia.</p>
            <Button className="mt-5 w-full" disabled={!accepted || !branchId || selectedPlan.remainingSubscriptions <= 0 || !allowedBranches.some((branch) => branch.id === branchId)} isLoading={busy} onClick={() => void subscribe()} sx={{ whiteSpace: 'normal', py: 1.5, fontSize: 13 }}>Continuar a Mercado Pago <ArrowRight className="ml-2 size-4 shrink-0" /></Button>
            <p className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-ink-muted"><CreditCard className="size-3.5" aria-hidden="true" />El pago se completa en Mercado Pago</p>
          </aside>
        </div>
        <p className="flex items-start gap-2 border-t border-line px-5 py-4 text-[11px] leading-5 text-ink-muted sm:px-7"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-brand-600" aria-hidden="true" />Puedes cancelar futuros cobros desde Mis suscripciones. Cada caja pagada conserva su vigencia.</p>
      </section>}
      {loggedIn && <p className="mt-8 text-center text-xs leading-5 text-ink-muted">¿Tienes saldo de compras anteriores? <Link className="font-semibold text-brand-700 underline" to={ROUTES.accountWallet}>Consúltalo en tu cuenta</Link>.</p>}
    </section>
    <SubscriptionPlansInfo />
  </div>;
}
