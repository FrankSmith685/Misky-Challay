import { useLiveRefresh } from '@services/realtime';
import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Clock3, Gift, MapPin, RefreshCw, XCircle } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { PageLoader } from '@components/common/PageLoader';
import { getApiErrorMessage } from '@services/api/client';
import { formatCurrency } from '@lib/format';
import { ROUTES } from '@constants/routes';
import { subscriptionsApi, type CustomerSubscription, type Slot, type SubscriptionCycle } from './subscriptionsApi';

const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Por confirmar';
const statusLabel: Record<CustomerSubscription['status'], string> = {
  PENDING: 'Esperando autorización', ACTIVE: 'Activa', PAST_DUE: 'Cobro pendiente', CANCELED: 'Renovación cancelada',
};
const statusStyle: Record<CustomerSubscription['status'], string> = {
  PENDING: 'bg-amber-50 text-amber-800', ACTIVE: 'bg-emerald-50 text-emerald-800', PAST_DUE: 'bg-orange-50 text-orange-800', CANCELED: 'bg-slate-100 text-slate-700',
};
const eligibleSlots = (slots: Slot[], row: CustomerSubscription, cycle: SubscriptionCycle) => slots.filter((slot) =>
  slot.available > 0 && new Date(slot.startsAt).getTime() >= Date.now() + row.leadDays * 86_400_000 && new Date(slot.startsAt).getTime() <= new Date(cycle.expiresAt).getTime(),
);

export default function AccountSubscriptionsPage() {
  const [params] = useSearchParams();
  const linkedSubscription = Number(params.get('suscripcion'));
  const appliedSubscription = useRef<number>();
  const recoveryAttempted = useRef(false);
  const [rows, setRows] = useState<CustomerSubscription[]>([]);
  const [branches, setBranches] = useState<Array<{ id: number; name: string }>>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [choosingCycle, setChoosingCycle] = useState<number | null>(null);
  const [slotId, setSlotId] = useState(0);
  const [confirmCancel, setConfirmCancel] = useState<number | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!linkedSubscription || appliedSubscription.current === linkedSubscription || !rows.some((row) => row.id === linkedSubscription)) return;
    appliedSubscription.current = linkedSubscription;
    const timer = window.setTimeout(() => document.getElementById(`subscription-${linkedSubscription}`)?.scrollIntoView({ block: 'center' }), 100);
    return () => clearTimeout(timer);
  }, [linkedSubscription, rows]);

  const load = async () => {
    try {
      const [subscriptions, locations] = await Promise.all([subscriptionsApi.mine(), subscriptionsApi.branches()]);
      setRows(subscriptions); setBranches(locations); setError(null);
    } catch (cause) { setError(getApiErrorMessage(cause)); }
    finally { setLoading(false); }
  };
  useLiveRefresh(['subscriptions', 'orders', 'payments'], load);
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    if (loading || recoveryAttempted.current) return;
    recoveryAttempted.current = true;
    const pending = rows.filter((row) => row.status === 'PENDING');
    if (pending.length) void Promise.allSettled(pending.map((row) => subscriptionsApi.sync(row.id))).then(() => load());
  }, [loading, rows]);

  const run = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusy(key);
    try { await action(); toast.success(success); await load(); }
    catch (cause) { toast.error(getApiErrorMessage(cause)); }
    finally { setBusy(null); }
  };
  const openSlots = async (row: CustomerSubscription, cycle: SubscriptionCycle) => {
    setBusy(`slots-${cycle.id}`);
    try {
      const available = await subscriptionsApi.slots(row.branchId);
      const valid = eligibleSlots(available, row, cycle);
      setSlots(valid); setChoosingCycle(cycle.id); setSlotId(valid[0]?.id ?? 0);
    } catch (cause) { toast.error(getApiErrorMessage(cause)); }
    finally { setBusy(null); }
  };

  if (loading) return <PageLoader />;
  const active = rows.filter((row) => row.status === 'ACTIVE').length;
  const pendingBoxes = rows.flatMap((row) => row.cycles).filter((cycle) => !cycle.orderId && new Date(cycle.expiresAt).getTime() > Date.now()).length;
  return <div className="space-y-5">
    <header className="relative overflow-hidden rounded-[24px] border border-brand-100 bg-gradient-to-br from-white to-brand-50 p-6 shadow-e2 sm:p-8">
      <div aria-hidden="true" className="pointer-events-none absolute -right-12 -top-16 size-52 rounded-full border-[34px] border-brand-100/50" />
      <div className="relative flex flex-wrap items-start justify-between gap-4"><div><span className="text-xs font-extrabold uppercase tracking-[.15em] text-brand-700">Tu espacio dulce</span><h1 className="mt-2 text-3xl font-black text-ink">Mis suscripciones</h1><p className="mt-2 max-w-xl text-sm leading-6 text-ink-muted">Consulta tus cobros y programa el recojo de cada caja pagada.</p></div><Button component={Link} to={ROUTES.plans}>Explorar cajas <ArrowRight className="ml-2 size-4" /></Button></div>
    </header>
    {error && <Card className="p-5"><p className="text-sm text-ink">{error}</p><Button className="mt-3" variant="outline" onClick={() => void load()}>Reintentar</Button></Card>}
    {!error && rows.length > 0 && <div className="grid gap-3 sm:grid-cols-3"><Card className="p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Suscripciones activas</p><p className="mt-2 text-2xl font-black text-ink">{active}</p></Card><Card className="p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Cajas por programar</p><p className="mt-2 text-2xl font-black text-brand-700">{pendingBoxes}</p></Card><Card className="p-4"><p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">Planes contratados</p><p className="mt-2 text-2xl font-black text-ink">{rows.length}</p></Card></div>}
    {!error && rows.length === 0 && <Card className="p-10 text-center"><Gift className="mx-auto size-10 text-brand-700" /><h2 className="mt-3 text-lg font-bold text-ink">Aún no tienes suscripciones</h2><p className="mt-1 text-sm text-ink-muted">Elige una caja mensual y programa tu primer recojo cuando se confirme el pago.</p><Button component={Link} to={ROUTES.plans} className="mt-5">Ver cajas mensuales</Button></Card>}

    {!error && rows.map((row) => <article id={`subscription-${row.id}`} key={row.id} className="overflow-hidden rounded-[22px] border border-line bg-white shadow-e2">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5 sm:p-6"><div><span className="text-xs font-extrabold uppercase tracking-wide text-brand-700">Caja mensual</span><h2 className="mt-1 text-xl font-black text-ink">{row.name}</h2><p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-ink-muted"><span>{formatCurrency(row.price)} / mes</span><span className="inline-flex items-center gap-1"><MapPin className="size-4" />{branches.find((branch) => branch.id === row.branchId)?.name ?? 'Sucursal de recojo'}</span></p></div><span className={`rounded-pill px-3 py-1.5 text-xs font-bold ${statusStyle[row.status]}`}>{statusLabel[row.status]}</span></div>
      <div className="grid gap-5 border-y border-line bg-surface-muted/60 p-5 sm:grid-cols-[1fr_250px] sm:p-6"><div><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Tu caja incluye</p><ul className="mt-3 grid gap-2 sm:grid-cols-2">{row.items.map((item) => <li key={item.variantId} className="flex items-start gap-2 text-sm text-ink"><CheckCircle2 className="mt-0.5 size-4 shrink-0 text-brand-700" /><span>{item.quantity} × {item.productName}</span></li>)}</ul></div><div className="rounded-card border border-line bg-white p-4"><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">{row.status === 'CANCELED' ? 'Renovación' : 'Próximo cobro'}</p><p className="mt-2 text-sm font-semibold text-ink">{row.status === 'CANCELED' ? 'Cancelada' : row.status === 'PENDING' ? 'Esperando autorización' : dateTime(row.nextChargeAt)}</p><p className="mt-2 text-xs leading-5 text-ink-muted">{row.status === 'CANCELED' ? 'Tus cajas pagadas siguen disponibles hasta su vencimiento.' : 'El cobro confirmado habilita una nueva caja.'}</p></div></div>
      <div className="p-5 sm:p-6">{row.termsAcceptance && <details className="mb-4 text-sm"><summary className="cursor-pointer font-semibold">Condiciones aceptadas · Versión {row.termsAcceptance.version}</summary><p>{new Date(row.termsAcceptance.acceptedAt).toLocaleString('es-PE')}</p><p className="mt-3 whitespace-pre-wrap">{row.termsAcceptance.content}</p></details>}<h3 className="text-base font-bold text-ink">Cajas de tus mensualidades</h3>
        {row.cycles.length === 0 && <p className="mt-3 rounded-card border border-dashed border-line p-4 text-sm text-ink-muted">La primera caja aparecerá cuando Mercado Pago confirme el cobro.</p>}
        <div className="mt-3 space-y-3">{row.cycles.map((cycle) => {
          const expired = !cycle.orderId && new Date(cycle.expiresAt).getTime() <= Date.now();
          const validSlots = choosingCycle === cycle.id ? eligibleSlots(slots, row, cycle) : [];
          return <div key={cycle.id} className="rounded-card border border-line p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex flex-wrap items-center gap-2"><span className={`rounded-pill px-2.5 py-1 text-xs font-bold ${cycle.orderId ? 'bg-emerald-50 text-emerald-800' : expired ? 'bg-slate-100 text-slate-700' : 'bg-brand-50 text-brand-800'}`}>{cycle.orderId ? 'Recojo programado' : expired ? 'Plazo vencido' : 'Lista para programar'}</span><strong className="text-sm text-ink">{formatCurrency(cycle.amount)}</strong></div><p className="mt-2 text-xs text-ink-muted">Pago confirmado: {dateTime(cycle.paidAt)}</p><p className="mt-1 flex items-center gap-1 text-xs text-ink-muted"><Clock3 className="size-3.5" />{cycle.orderId ? `Recojo: ${dateTime(cycle.scheduledAt)}` : `Programa antes del ${dateTime(cycle.expiresAt)}`}</p></div>
            {cycle.orderId ? <Button component={Link} to={ROUTES.accountOrderDetail(`BOX-${cycle.id}`)} size="sm" variant="outline">Ver pedido</Button> : !expired && <Button size="sm" variant="outline" isLoading={busy === `slots-${cycle.id}`} onClick={() => void openSlots(row, cycle)}>Elegir horario</Button>}</div>
            {choosingCycle === cycle.id && !cycle.orderId && !expired && <div className="mt-4 border-t border-line pt-4">{validSlots.length === 0 ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-field bg-surface-muted p-3"><p className="text-xs leading-5 text-ink-muted">Aún no hay horarios disponibles dentro de la vigencia de esta caja y con {row.leadDays} días de anticipación.</p><Button size="sm" variant="outline" onClick={() => void openSlots(row, cycle)}>Actualizar horarios</Button></div> : <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end"><label className="text-xs font-bold text-ink">Fecha y horario disponibles<select className="mt-2 w-full rounded-field border border-line bg-white p-3 text-sm font-normal" value={slotId} onChange={(event) => setSlotId(Number(event.target.value))}><option value={0}>Selecciona un horario</option>{validSlots.map((slot) => <option key={slot.id} value={slot.id}>{dateTime(slot.startsAt)} · {slot.available} cupos</option>)}</select></label><Button disabled={!validSlots.some((slot) => slot.id === slotId)} isLoading={busy === `redeem-${cycle.id}`} onClick={() => void run(`redeem-${cycle.id}`, () => subscriptionsApi.redeem(cycle.id, slotId), 'Caja programada y enviada a pedidos')}>Confirmar recojo</Button></div>}</div>}
          </div>;
        })}</div>
        {row.status !== 'CANCELED' && <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">{row.status === 'PENDING' && <Button size="sm" onClick={() => void run(`checkout-${row.id}`, async () => { const link = await subscriptionsApi.checkout(row.id); window.location.assign(link.checkoutUrl); }, 'Abriendo autorización')}>Continuar autorización</Button>}<Button size="sm" variant="outline" leftIcon={<RefreshCw className="size-4" />} isLoading={busy === `sync-${row.id}`} onClick={() => void run(`sync-${row.id}`, () => subscriptionsApi.sync(row.id), 'Estado actualizado')}>Actualizar pagos</Button>
          {confirmCancel === row.id ? <div className="flex flex-wrap items-center gap-2 rounded-card border border-orange-200 bg-orange-50 p-3"><span className="text-xs text-orange-900">Se detendrán los próximos cobros.</span><Button size="sm" variant="danger" isLoading={busy === `cancel-${row.id}`} onClick={() => void run(`cancel-${row.id}`, () => subscriptionsApi.cancel(row.id), 'Renovación cancelada')}>Confirmar cancelación</Button><Button size="sm" variant="ghost" onClick={() => setConfirmCancel(null)}>Volver</Button></div> : <Button size="sm" variant="ghost" leftIcon={<XCircle className="size-4" />} onClick={() => setConfirmCancel(row.id)}>Cancelar renovación</Button>}</div>}
      </div>
    </article>)}
    <div className="pt-2 text-center"><Button component={Link} to={ROUTES.accountWallet} variant="ghost">Ver saldo de compras anteriores</Button></div>
  </div>;
}
