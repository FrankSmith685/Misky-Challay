import { useLiveRefresh } from '@services/realtime';
import { useEffect, useRef, useState } from 'react';
import { CalendarClock, CheckCircle2, Clock3, Gift, MapPin, PackageCheck, Plus, RefreshCw, Search, Users, XCircle } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { PageHeader } from '@components/common/PageHeader';
import { PageLoader } from '@components/common/PageLoader';
import { getApiErrorMessage } from '@services/api/client';
import { usePermissions } from '@hooks/usePermissions';
import { PERM } from '@constants/permissions';
import { formatCurrency } from '@lib/format';
import { subscriptionsApi, type PlanInput, type SubscriptionPlan } from './subscriptionsApi';

type Subscriber = Awaited<ReturnType<typeof subscriptionsApi.adminSubscribers>>[number];
type Options = Awaited<ReturnType<typeof subscriptionsApi.adminOptions>>;
type Tab = 'plans' | 'subscribers';

const blank = (branchId?: number, sortOrder = 0): PlanInput => ({ code: '', name: '', description: '', monthlyPrice: 0, items: [], branchIds: branchId ? [branchId] : [], leadDays: 2, maxActiveSubscribers: 30, maxDailyPickups: 5, isActive: false, sortOrder });
const fromPlan = (plan: SubscriptionPlan): PlanInput => ({ code: plan.code, name: plan.name, description: plan.description, monthlyPrice: plan.monthlyPrice,
  items: plan.items.map((item) => ({ variantId: item.variantId, quantity: item.quantity })), branchIds: plan.branchIds,
  leadDays: plan.leadDays, maxActiveSubscribers: plan.maxActiveSubscribers, maxDailyPickups: plan.maxDailyPickups,
  isActive: plan.isActive, sortOrder: plan.sortOrder });
const statusLabel: Record<Subscriber['status'], string> = { PENDING: 'Pendiente', ACTIVE: 'Activa', PAST_DUE: 'Cobro pendiente', CANCELED: 'Cancelada' };
const statusStyle: Record<Subscriber['status'], string> = { PENDING: 'bg-amber-50 text-amber-800', ACTIVE: 'bg-emerald-50 text-emerald-800', PAST_DUE: 'bg-orange-50 text-orange-800', CANCELED: 'bg-slate-100 text-slate-700' };
const field = 'mt-2 w-full rounded-field border border-line bg-white p-3 text-sm font-normal text-ink outline-none focus:border-brand-600 focus:ring-2 focus:ring-brand-100';

const validatePlan = (form: PlanInput, options: Options): string | null => {
  if (!/^[A-Z0-9_-]{3,40}$/.test(form.code.trim().toUpperCase())) return 'Escribe un código interno de 3 a 40 caracteres.';
  if (form.name.trim().length < 3) return 'El nombre visible debe tener al menos 3 caracteres.';
  if (form.description.trim().length < 10) return 'La descripción debe tener al menos 10 caracteres.';
  if (!Number.isFinite(form.monthlyPrice) || form.monthlyPrice <= 0) return 'Indica un precio mensual mayor que cero.';
  if (!form.items.length || form.items.some((item) => !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 24)) return 'Agrega productos y revisa sus cantidades.';
  if (form.items.some((item) => !options.products.some((product) => product.id === item.variantId))) return 'Retira o reemplaza los productos que ya no están disponibles.';
  if (!form.branchIds.length) return 'Elige al menos una sucursal de recojo.';
  if ([form.leadDays, form.maxActiveSubscribers, form.maxDailyPickups].some((value) => !Number.isInteger(value) || value < 1)) return 'Revisa los días de anticipación y los cupos.';
  return null;
};

export default function SubscriptionsAdminPage() {
  const { can, branchIds, isSuperAdmin } = usePermissions();
  const canManage = can(PERM.PLAN_MANAGE);
  const canConfigure = canManage && (isSuperAdmin || branchIds.length === 0);
  const editorRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>('plans');
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [options, setOptions] = useState<Options>({ products: [], branches: [] });
  const [editingId, setEditingId] = useState<number | 'new' | null>(null);
  const [form, setForm] = useState<PlanInput>(blank());
  const [formError, setFormError] = useState<string | null>(null);
  const [addVariantId, setAddVariantId] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<number | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

  const load = async () => {
    try {
      const [allPlans, allSubscribers, allOptions] = await Promise.all([subscriptionsApi.adminPlans(), subscriptionsApi.adminSubscribers(), subscriptionsApi.adminOptions()]);
      setPlans(allPlans); setSubscribers(allSubscribers); setOptions(allOptions); setError(null);
    } catch (cause) { setError(getApiErrorMessage(cause)); }
    finally { setLoading(false); }
  };
  useLiveRefresh(['subscriptions', 'catalog', 'orders', 'payments'], load);
  useEffect(() => { void load(); }, []);

  const edit = (plan?: SubscriptionPlan) => {
    setTab('plans'); setEditingId(plan?.id ?? 'new');
    setForm(plan ? fromPlan(plan) : blank(options.branches[0]?.id, plans.length + 1));
    setFormError(null); setAddVariantId(0);
    requestAnimationFrame(() => editorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const update = (values: Partial<PlanInput>) => { setForm((current) => ({ ...current, ...values })); setFormError(null); };
  const save = async () => {
    if (editingId === null || !canConfigure || busy) return;
    const issue = validatePlan(form, options);
    if (issue) { setFormError(issue); return; }
    setBusy('save');
    try {
      if (editingId === 'new') await subscriptionsApi.createPlan(form);
      else await subscriptionsApi.updatePlan(editingId, form);
      toast.success('Caja mensual guardada'); setEditingId(null); await load();
    } catch (cause) { setFormError(getApiErrorMessage(cause)); }
    finally { setBusy(null); }
  };
  const subscriberAction = async (key: string, action: () => Promise<unknown>) => {
    if (!canManage || busy) return;
    setBusy(key);
    try { await action(); toast.success('Suscripción actualizada'); await load(); }
    catch (cause) { toast.error(getApiErrorMessage(cause)); }
    finally { setBusy(null); }
  };

  if (loading) return <PageLoader />;
  const retail = form.items.reduce((sum, item) => sum + (options.products.find((product) => product.id === item.variantId)?.price ?? 0) * item.quantity, 0);
  const filtered = subscribers.filter((row) => {
    const matchesStatus = statusFilter === 'ALL' || row.status === statusFilter;
    const text = `${row.planName} ${row.user?.firstName ?? ''} ${row.user?.lastName ?? ''} ${row.user?.email ?? ''}`.toLocaleLowerCase('es-PE');
    return matchesStatus && text.includes(query.trim().toLocaleLowerCase('es-PE'));
  });
  return <div className="space-y-5">
    <PageHeader eyebrow="Fidelización" title="Suscripciones" description="Administra las cajas mensuales, su precio, contenido, sucursales y cupos. Los cambios se aplican a nuevas contrataciones." icon={CalendarClock}
      action={canConfigure ? <Button leftIcon={<Plus className="size-4" />} onClick={() => edit()}>Nueva caja mensual</Button> : undefined} />
    {error && <Card className="p-5"><p className="text-sm text-ink">{error}</p><Button variant="outline" className="mt-3" onClick={() => void load()}>Reintentar</Button></Card>}
    <div className="grid gap-3 sm:grid-cols-3"><Card className="p-4"><div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wide text-ink-muted">Cajas publicadas</span><PackageCheck className="size-5 text-brand-700" /></div><p className="mt-3 text-3xl font-black text-ink">{plans.filter((plan) => plan.isActive).length}</p></Card><Card className="p-4"><div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wide text-ink-muted">Suscripciones activas</span><Users className="size-5 text-emerald-700" /></div><p className="mt-3 text-3xl font-black text-ink">{subscribers.filter((row) => row.status === 'ACTIVE').length}</p></Card><Card className="p-4"><div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-wide text-ink-muted">Cobros pendientes</span><Clock3 className="size-5 text-orange-700" /></div><p className="mt-3 text-3xl font-black text-ink">{subscribers.filter((row) => row.status === 'PAST_DUE').length}</p></Card></div>
    <div className="flex flex-wrap gap-2 rounded-card border border-line bg-white p-2"><Button variant={tab === 'plans' ? 'primary' : 'ghost'} onClick={() => setTab('plans')}>Cajas mensuales <span className="ml-2 text-xs">{plans.length}</span></Button><Button variant={tab === 'subscribers' ? 'primary' : 'ghost'} onClick={() => setTab('subscribers')}>Suscriptores <span className="ml-2 text-xs">{subscribers.length}</span></Button></div>

    {tab === 'plans' && <>
      {editingId !== null && canConfigure && <section ref={editorRef} className="scroll-mt-24 overflow-hidden rounded-[22px] border border-brand-200 bg-white shadow-e2">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-brand-50/60 p-5 sm:p-6"><div><p className="text-xs font-extrabold uppercase tracking-wide text-brand-700">Editor de cajas</p><h2 className="mt-1 text-xl font-black text-ink">{editingId === 'new' ? 'Nueva caja mensual' : `Editar ${form.name}`}</h2><p className="mt-1 text-xs text-ink-muted">Los contratos existentes conservan el precio y contenido acordados.</p></div><Button variant="ghost" onClick={() => setEditingId(null)}>Cerrar</Button></div>
        <div className="grid gap-6 p-5 sm:p-6 xl:grid-cols-[minmax(0,1fr)_300px]"><div className="space-y-6">
          <div><h3 className="flex items-center gap-2 text-sm font-bold text-ink"><span className="flex size-6 items-center justify-center rounded-full bg-brand-700 text-xs text-white">1</span> Identidad de la caja</h3><div className="mt-4 grid gap-4 sm:grid-cols-2"><label className="text-xs font-bold text-ink">Nombre visible<input className={field} value={form.name} onChange={(event) => update({ name: event.target.value })} placeholder="Ej. Caja para compartir" /></label><label className="text-xs font-bold text-ink">Código interno<input className={field} value={form.code} onChange={(event) => update({ code: event.target.value.toUpperCase() })} placeholder="CAJA_COMPARTIR" /></label></div><label className="mt-4 block text-xs font-bold text-ink">Descripción para el cliente<textarea className={field} rows={3} value={form.description} onChange={(event) => update({ description: event.target.value })} placeholder="Explica qué incluye y para quién es esta caja" /></label></div>
          <div className="border-t border-line pt-6"><h3 className="flex items-center gap-2 text-sm font-bold text-ink"><span className="flex size-6 items-center justify-center rounded-full bg-brand-700 text-xs text-white">2</span> Productos incluidos</h3><p className="mt-2 text-xs text-ink-muted">Cada unidad indicada se incluye en cada cobro mensual confirmado.</p><div className="mt-4 flex flex-wrap gap-2"><select className={`${field} mt-0 min-w-56 flex-1`} value={addVariantId} onChange={(event) => setAddVariantId(Number(event.target.value))}><option value={0}>Elige una presentación</option>{options.products.filter((product) => !form.items.some((item) => item.variantId === product.id)).map((product) => <option key={product.id} value={product.id}>{product.name} · {formatCurrency(product.price)}</option>)}</select><Button variant="outline" disabled={!addVariantId} onClick={() => { update({ items: [...form.items, { variantId: addVariantId, quantity: 1 }] }); setAddVariantId(0); }}>Agregar</Button></div>
            {form.items.length === 0 && <p className="mt-3 rounded-card border border-dashed border-line p-4 text-xs text-ink-muted">Agrega al menos un producto del catálogo.</p>}
            <div className="mt-3 space-y-2">{form.items.map((item) => { const product = options.products.find((entry) => entry.id === item.variantId); return <div key={item.variantId} className="flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface-muted/60 p-3"><div className="min-w-40 flex-1"><p className="text-sm font-semibold text-ink">{product?.name ?? `Producto ${item.variantId} no disponible`}</p><p className="text-xs text-ink-muted">{product ? `${formatCurrency(product.price)} por unidad` : 'Retíralo o reemplázalo para guardar'}</p></div><label className="text-xs font-bold text-ink">Unidades<input type="number" min={1} max={24} className={`${field} mt-1 w-20`} value={item.quantity} onChange={(event) => update({ items: form.items.map((entry) => entry.variantId === item.variantId ? { ...entry, quantity: Number(event.target.value) } : entry) })} /></label><Button size="sm" variant="ghost" onClick={() => update({ items: form.items.filter((entry) => entry.variantId !== item.variantId) })}>Quitar</Button></div>; })}</div>
          </div>
          <div className="border-t border-line pt-6"><h3 className="flex items-center gap-2 text-sm font-bold text-ink"><span className="flex size-6 items-center justify-center rounded-full bg-brand-700 text-xs text-white">3</span> Precio y capacidad</h3><div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{([['monthlyPrice', 'Precio mensual (S/)', 0.01], ['leadDays', 'Días de anticipación', 1], ['maxActiveSubscribers', 'Cupo total de suscriptores', 1], ['maxDailyPickups', 'Recojos diarios por sucursal', 1], ['sortOrder', 'Orden de exhibición', 1]] as const).map(([key, label, step]) => <label key={key} className="text-xs font-bold text-ink">{label}<input type="number" min={key === 'sortOrder' ? 0 : 1} step={step} className={field} value={form[key]} onChange={(event) => update({ [key]: Number(event.target.value) })} /></label>)}</div></div>
          <div className="border-t border-line pt-6"><h3 className="flex items-center gap-2 text-sm font-bold text-ink"><span className="flex size-6 items-center justify-center rounded-full bg-brand-700 text-xs text-white">4</span> Sucursales de recojo</h3><div className="mt-4 grid gap-2 sm:grid-cols-2">{options.branches.map((branch) => <label key={branch.id} className={`flex cursor-pointer items-center gap-3 rounded-card border p-3 text-sm ${form.branchIds.includes(branch.id) ? 'border-brand-600 bg-brand-50 text-ink' : 'border-line text-ink-muted'}`}><input type="checkbox" checked={form.branchIds.includes(branch.id)} onChange={(event) => update({ branchIds: event.target.checked ? [...form.branchIds, branch.id] : form.branchIds.filter((id) => id !== branch.id) })} />{branch.name}</label>)}</div></div>
        </div><aside className="self-start rounded-card border border-brand-100 bg-gradient-to-b from-brand-50 to-white p-5 xl:sticky xl:top-24"><span className="text-xs font-extrabold uppercase tracking-wide text-brand-700">Vista previa</span><h3 className="mt-3 text-xl font-black text-ink">{form.name || 'Nombre de la caja'}</h3><p className="mt-2 text-sm leading-6 text-ink-muted">{form.description || 'Aquí aparecerá la descripción para tus clientes.'}</p><div className="mt-5 border-y border-brand-100 py-4"><strong className="text-3xl font-black text-ink">{formatCurrency(form.monthlyPrice || 0)}</strong><span className="ml-2 text-sm text-ink-muted">/ mes</span></div><p className="mt-4 text-xs font-bold text-ink">{form.items.length} productos · {form.branchIds.length} sucursales</p><p className="mt-2 text-xs text-ink-muted">Precio individual actual: {formatCurrency(retail)}</p>{retail > 0 && <p className={`mt-1 text-xs font-semibold ${retail >= form.monthlyPrice ? 'text-emerald-700' : 'text-orange-700'}`}>{retail >= form.monthlyPrice ? `Diferencia a favor del cliente: ${formatCurrency(retail - form.monthlyPrice)}` : `El plan supera el precio individual en ${formatCurrency(form.monthlyPrice - retail)}`}</p>}<label className="mt-6 flex cursor-pointer items-start gap-3 rounded-card border border-line bg-white p-3 text-xs leading-5 text-ink"><input type="checkbox" className="mt-1" checked={form.isActive} onChange={(event) => update({ isActive: event.target.checked })} /><span><strong className="block">Publicar para nuevos clientes</strong>{form.isActive ? 'Visible en la web cuando guardes.' : 'Permanecerá en borrador.'}</span></label></aside></div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line p-5 sm:p-6">{formError ? <p role="alert" className="text-sm font-semibold text-red-700">{formError}</p> : <p className="text-xs text-ink-muted">Revisa precio, contenido y cupos antes de publicar.</p>}<div className="flex gap-2"><Button variant="outline" onClick={() => setEditingId(null)}>Cancelar</Button><Button isLoading={busy === 'save'} onClick={() => void save()}>Guardar caja mensual</Button></div></div>
      </section>}
      <Card className="p-5 sm:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="text-lg font-black text-ink">Cajas configuradas</h2><p className="mt-1 text-xs text-ink-muted">Edita el contenido, precio y disponibilidad de cada caja.</p></div><span className="text-xs font-semibold text-ink-muted">{plans.length} en total</span></div>{plans.length === 0 && <p className="mt-5 rounded-card border border-dashed border-line p-6 text-sm text-ink-muted">Aún no hay cajas. Crea una y publícala cuando esté lista.</p>}
        <div className="mt-5 grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{plans.map((plan) => <article key={plan.id} className="flex flex-col rounded-card border border-line bg-white p-5"><div className="flex items-start justify-between gap-2"><span className={`rounded-pill px-2.5 py-1 text-xs font-bold ${plan.isActive ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-700'}`}>{plan.isActive ? 'Publicada' : 'Borrador'}</span><Gift className="size-5 text-brand-700" /></div><h3 className="mt-3 text-lg font-black text-ink">{plan.name}</h3><p className="mt-1 text-xs text-ink-muted">{plan.code}</p><p className="mt-3 line-clamp-2 text-sm leading-6 text-ink-muted">{plan.description}</p><div className="mt-4 border-y border-line py-3"><strong className="text-2xl font-black text-ink">{formatCurrency(plan.monthlyPrice)}</strong><span className="ml-1 text-xs text-ink-muted">/ mes</span></div><p className="mt-3 text-xs text-ink-muted">{plan.items.length} productos · {plan.branchIds.length} sucursales · {plan.remainingSubscriptions} cupos libres</p><p className="mt-1 text-xs text-ink-muted">{plan.leadDays} días de anticipación · {plan.maxDailyPickups} recojos diarios</p><div className="mt-auto pt-5">{canConfigure && <Button variant="outline" size="sm" className="w-full" onClick={() => edit(plan)}>Editar caja</Button>}</div></article>)}</div>
      </Card>
    </>}

    {tab === 'subscribers' && <Card className="p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-black text-ink"><Users className="size-5 text-brand-700" /> Suscriptores</h2><p className="mt-1 text-xs text-ink-muted">Consulta el estado de cobros, cajas pendientes y próximos recojos.</p></div><Button size="sm" variant="outline" leftIcon={<RefreshCw className="size-4" />} onClick={() => void load()}>Actualizar</Button></div>
      <div className="mt-5 grid gap-3 sm:grid-cols-[1fr_200px]"><label className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 size-4 text-ink-muted" /><input className={`${field} mt-0 pl-10`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar cliente, correo o caja" aria-label="Buscar suscriptor" /></label><select className={`${field} mt-0`} value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filtrar por estado"><option value="ALL">Todos los estados</option><option value="ACTIVE">Activas</option><option value="PENDING">Pendientes</option><option value="PAST_DUE">Cobro pendiente</option><option value="CANCELED">Canceladas</option></select></div>
      {subscribers.length === 0 && <p className="mt-5 rounded-card border border-dashed border-line p-6 text-sm text-ink-muted">Todavía no hay suscriptores.</p>}
      {subscribers.length > 0 && filtered.length === 0 && <p className="mt-5 text-sm text-ink-muted">No hay suscriptores para este filtro.</p>}
      <div className="mt-4 space-y-3">{filtered.map((row) => <article key={row.id} className="rounded-card border border-line p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold text-ink">{[row.user?.firstName, row.user?.lastName].filter(Boolean).join(' ') || row.user?.email || `Cliente ${row.user?.id}`}</p><p className="mt-1 text-xs text-ink-muted">{row.user?.email} · {row.planName} · {formatCurrency(row.price)} / mes</p></div><span className={`rounded-pill px-2.5 py-1 text-xs font-bold ${statusStyle[row.status]}`}>{statusLabel[row.status]}</span></div><div className="mt-4 flex flex-wrap gap-x-5 gap-y-2 border-t border-line pt-3 text-xs text-ink-muted"><span className="inline-flex items-center gap-1"><CalendarClock className="size-3.5" /> Próximo cobro: {row.nextChargeAt ? new Date(row.nextChargeAt).toLocaleDateString('es-PE') : 'Por confirmar'}</span><span className="inline-flex items-center gap-1"><CheckCircle2 className="size-3.5" /> {row.paidCycles} cuotas pagadas</span><span className="inline-flex items-center gap-1"><PackageCheck className="size-3.5" /> {row.pendingBoxes} cajas pendientes</span><span className="inline-flex items-center gap-1"><MapPin className="size-3.5" /> {row.scheduledBoxes} programadas</span></div><div className="mt-4 flex flex-wrap items-center gap-2"><Button size="sm" variant="outline" leftIcon={<RefreshCw className="size-3.5" />} disabled={!canManage || Boolean(busy)} isLoading={busy === `sync-${row.id}`} onClick={() => void subscriberAction(`sync-${row.id}`, () => subscriptionsApi.adminSync(row.id))}>Conciliar pagos</Button>{canManage && row.status !== 'CANCELED' && (cancelId === row.id ? <div className="flex flex-wrap items-center gap-2 rounded-field bg-orange-50 p-2"><span className="text-xs text-orange-900">Se detendrán los cobros futuros.</span><Button size="sm" variant="danger" isLoading={busy === `cancel-${row.id}`} onClick={() => void subscriberAction(`cancel-${row.id}`, () => subscriptionsApi.adminCancel(row.id))}>Confirmar baja</Button><Button size="sm" variant="ghost" onClick={() => setCancelId(null)}>Volver</Button></div> : <Button size="sm" variant="ghost" leftIcon={<XCircle className="size-3.5" />} onClick={() => setCancelId(row.id)}>Cancelar renovación</Button>)}</div></article>)}</div>
    </Card>}
  </div>;
}
