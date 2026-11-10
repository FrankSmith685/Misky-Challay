import { useCallback, useEffect, useState } from 'react';
import { Activity, Archive, CalendarClock, Calculator, CircleCheck, Pencil, Plus, Search, Ticket, Users } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Select, SelectOption } from '@components/ui/Select';
import { Checkbox } from '@components/ui/Checkbox';
import { Modal } from '@components/ui/Modal';
import { useConfirm } from '@components/ui/ConfirmDialog';
import { Card } from '@components/ui/Card';
import { PageLoader } from '@components/common/PageLoader';
import { PageHeader } from '@components/common/PageHeader';
import { LoadError } from '@components/common/LoadError';
import { getApiErrorMessage } from '@services/api/client';
import { formatCurrency, formatDateOnly } from '@lib/format';
import { StatusBadge } from '@components/ui/StatusBadge';
import { commercialApi, type AdminCoupon, type AdminCouponRedemption, type CouponPreview } from '../services/commercialAdmin.service';
import { OperationsMetricStrip } from '../components/OperationsMetricStrip';

const TYPES = [
  { value: 'PERCENT', label: 'Porcentaje (%)' },
  { value: 'FIXED', label: 'Importe fijo (S/)' },
  { value: 'FREE_DELIVERY', label: 'Delivery gratis' },
];

const EMPTY = {
  code: '',
  description: '',
  discountType: 'PERCENT',
  value: '10',
  minOrderAmount: '30',
  maxDiscountAmount: '',
  validFrom: '',
  validUntil: '',
  usageLimit: '',
  usageLimitPerUser: '1',
  stackMode: 'STACKABLE',
  budgetAmount: '',
  branchIds: '',
  productIds: '',
  paymentMethods: '',
  deliveryTypes: '',
  firstOrderOnly: false,
};

const parseIds = (value: string): number[] => value.split(',').map((item) => Number(item.trim())).filter((item) => Number.isInteger(item) && item > 0);

/**
 * VIGENCIA Y TOPE DE CANJES (F19)
 * ---------------------------------------------------------------------------
 * El backend acepta `validUntil` y `usageLimit` desde el primer dia y el motor de
 * cupones los respeta, pero el formulario no los exponia: todo cupon creado desde
 * el panel nacia ETERNO e ILIMITADO mientras la tabla prometia "Usos x/y" y una
 * columna "Vence" que siempre decia "Sin vencimiento".
 *
 * El campo es una fecha suelta y el cupon deja de aceptarse al TERMINAR ese dia,
 * que es lo que entiende quien escribe "vence el 31 de diciembre". La conversion
 * se hace aqui, en hora local, y viaja en ISO: dejar que el servidor interprete
 * "2026-12-31" lo colocaria a medianoche UTC, o sea el 30 a las 19:00 en Lima.
 */
const toIsoEndOfDay = (value: string): string | null =>
  value ? new Date(`${value}T23:59:59`).toISOString() : null;

/** ISO -> AAAA-MM-DD en hora local (`toISOString` daria el dia anterior en Lima). */
const toDateInput = (value: string | null): string => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
};

const isExpired = (coupon: AdminCoupon): boolean =>
  Boolean(coupon.validUntil) && new Date(coupon.validUntil as string).getTime() < Date.now();

const isExhausted = (coupon: AdminCoupon): boolean =>
  coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit;

/** Cupones (RN-010, RN-011). Apagar uno no borra los canjes ya hechos. */
const CouponsPage = () => {
  const confirm = useConfirm();
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<AdminCoupon | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  /** Clave de la fila en curso: sin ella el segundo toque repetia la llamada. */
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | AdminCoupon['status']>('ALL');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewForm, setPreviewForm] = useState<{ code: string; subtotal: string; deliveryType: 'DELIVERY' | 'PICKUP' | 'DINE_IN'; paymentMethod: 'ONLINE' | 'YAPE' | 'PLIN' | 'CASH' }>({ code: '', subtotal: '100', deliveryType: 'DELIVERY', paymentMethod: 'ONLINE' });
  const [preview, setPreview] = useState<CouponPreview | null>(null);
  const [metricsCoupon, setMetricsCoupon] = useState<AdminCoupon | null>(null);
  const [metrics, setMetrics] = useState<{ reserved: number; confirmed: number; released: number; discountConfirmed: number; budgetAmount: number | null; budgetUsed: number; budgetRemaining: number | null; grossSales: number; averageOrderValue: number } | null>(null);
  const [redemptions, setRedemptions] = useState<AdminCouponRedemption[]>([]);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setCoupons(await commercialApi.coupons());
    } catch (error) {
      // Sin esto, un fallo de red dejaba la tabla vacia y sin una sola palabra.
      setLoadError(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const handleCreate = async () => {
    if (!form.code || !form.description) {
      toast.error('Completa el codigo y la descripcion');
      return;
    }
    if (form.validUntil && new Date(`${form.validUntil}T23:59:59`).getTime() < Date.now()) {
      toast.error('La fecha de vencimiento ya pasó');
      return;
    }

    setIsSaving(true);
    try {
      await commercialApi.createCoupon({
        code: form.code,
        description: form.description,
        discountType: form.discountType,
        value: Number(form.value),
        minOrderAmount: Number(form.minOrderAmount),
        maxDiscountAmount: form.maxDiscountAmount ? Number(form.maxDiscountAmount) : null,
        validFrom: form.validFrom ? new Date(`${form.validFrom}T00:00:00`).toISOString() : null,
        validUntil: toIsoEndOfDay(form.validUntil),
        usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
        usageLimitPerUser: Number(form.usageLimitPerUser),
        stackMode: form.stackMode as AdminCoupon['stackMode'],
        budgetAmount: form.budgetAmount ? Number(form.budgetAmount) : null,
        rules: {
          branchIds: parseIds(form.branchIds),
          productIds: parseIds(form.productIds),
          paymentMethods: form.paymentMethods.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean),
          deliveryTypes: form.deliveryTypes.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean),
          firstOrderOnly: form.firstOrderOnly,
        },
      });

      toast.success('Cupon creado');
      setIsCreating(false);
      setForm(EMPTY);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!editing) return;
    if (editing.description.trim().length < 3) {
      toast.error('Escribe la descripcion del cupon');
      return;
    }
    if (editing.usageLimit !== null && editing.usageLimit < editing.usedCount) {
      toast.error(`Ese cupón ya se usó ${editing.usedCount} veces: el tope no puede ser menor`);
      return;
    }

    setIsSaving(true);
    try {
      await commercialApi.updateCoupon(editing.id, {
        description: editing.description.trim(),
        validUntil: editing.validUntil,
        validFrom: editing.validFrom,
        value: editing.value,
        minOrderAmount: editing.minOrderAmount,
        maxDiscountAmount: editing.maxDiscountAmount,
        usageLimit: editing.usageLimit,
        stackMode: editing.stackMode,
        budgetAmount: editing.budgetAmount,
        expectedVersion: editing.version,
        rules: editing.rules,
      });
      toast.success('Cupon actualizado');
      setEditing(null);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleArchive = async (coupon: AdminCoupon) => {
    const { confirmed } = await confirm({
      title: `Archivar ${coupon.code}`,
      message: 'Se dejará de aceptar y conservará todo su historial. Esta acción no se puede revertir desde el panel.',
      confirmLabel: 'Archivar cupón',
      tone: 'danger',
    });
    if (!confirmed) return;
    setBusy(`archive-${coupon.id}`);
    try {
      await commercialApi.archiveCoupon(coupon.id, coupon.version);
      toast.success('Cupón archivado');
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const handlePreview = async () => {
    if (!previewForm.code.trim() || Number(previewForm.subtotal) < 0) {
      toast.error('Indica un código y un subtotal válido');
      return;
    }
    try {
      setPreview(await commercialApi.previewCoupon({ code: previewForm.code, subtotal: Number(previewForm.subtotal), deliveryType: previewForm.deliveryType, paymentMethod: previewForm.paymentMethod }));
    } catch (error) {
      setPreview(null);
      toast.error(getApiErrorMessage(error));
    }
  };

  const handleMetrics = async (coupon: AdminCoupon) => {
    setMetricsCoupon(coupon);
    setMetrics(null);
    setRedemptions([]);
    try {
      const [nextMetrics, nextRedemptions] = await Promise.all([commercialApi.couponMetrics(coupon.id), commercialApi.couponRedemptions(coupon.id)]);
      setMetrics(nextMetrics);
      setRedemptions(nextRedemptions);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    }
  };

  const handleToggle = async (coupon: AdminCoupon) => {
    if (coupon.isActive) {
      const { confirmed } = await confirm({
        title: `Apagar ${coupon.code}`,
        message:
          'Deja de aceptarse en el acto, también en los carritos que ya lo tienen puesto. Los canjes hechos no se borran y puedes volver a activarlo.',
        confirmLabel: 'Apagar cupón',
        tone: 'danger',
      });
      if (!confirmed) return;
    }

    setBusy(`toggle-${coupon.id}`);
    try {
      await commercialApi.toggleCoupon(coupon.id, !coupon.isActive);
      toast.success(coupon.isActive ? 'Cupon apagado' : 'Cupon activado');
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  if (isLoading) return <PageLoader />;

  const describe = (coupon: AdminCoupon): string => {
    if (coupon.discountType === 'FREE_DELIVERY') return 'Delivery gratis';
    if (coupon.discountType === 'PERCENT') {
      return `${coupon.value}%${coupon.maxDiscountAmount ? ` (tope ${formatCurrency(coupon.maxDiscountAmount)})` : ''}`;
    }
    return formatCurrency(coupon.value);
  };

  const visibleCoupons = coupons.filter((coupon) => {
    const matchesQuery = !query.trim() || `${coupon.code} ${coupon.description}`.toLowerCase().includes(query.trim().toLowerCase());
    const matchesStatus = statusFilter === 'ALL' || coupon.status === statusFilter;
    return matchesQuery && matchesStatus;
  });

  const statusMap = {
    ACTIVE: { label: 'Activa', variant: 'brand' as const },
    SCHEDULED: { label: 'Programada', variant: 'warning' as const },
    PAUSED: { label: 'Pausada', variant: 'neutral' as const },
    EXPIRED: { label: 'Vencida', variant: 'danger' as const },
    EXHAUSTED: { label: 'Agotada', variant: 'danger' as const },
    ARCHIVED: { label: 'Archivada', variant: 'neutral' as const },
  };

  return (
    <div>
      <PageHeader
        eyebrow="Promociones"
        title="Cupones"
        description="El cupón se reserva al crear el pedido y se consume cuando el pago se confirma."
        icon={Ticket}
        action={(
          <>
            <Button variant="outline" leftIcon={<Calculator className="size-4" />} onClick={() => { setPreview(null); setIsPreviewing(true); }}>Simular</Button>
            <Button leftIcon={<Plus className="size-4" />} onClick={() => setIsCreating(true)}>Nuevo cupón</Button>
          </>
        )}
      />

      <div className="mb-5 grid gap-3 rounded-card border border-line bg-white p-4 shadow-e1 md:grid-cols-[1fr_220px]">
        <Input label="Buscar campaña" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Código o descripción" startAdornment={<Search className="size-4" />} />
        <Select id="coupon-status-filter" label="Estado" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as typeof statusFilter)}>
          <SelectOption value="ALL">Todos</SelectOption>
          <SelectOption value="ACTIVE">Activas</SelectOption>
          <SelectOption value="SCHEDULED">Programadas</SelectOption>
          <SelectOption value="PAUSED">Pausadas</SelectOption>
          <SelectOption value="EXPIRED">Vencidas</SelectOption>
          <SelectOption value="EXHAUSTED">Agotadas</SelectOption>
          <SelectOption value="ARCHIVED">Archivadas</SelectOption>
        </Select>
      </div>
      <div className="mb-5 rounded-card border border-brand-200 bg-brand-50/60 px-4 py-3 text-sm text-brand-900">
        La comisión configurada de plataforma se registra por separado en cada pedido pagado y se calcula sobre la venta neta de productos después del cupón; el delivery queda fuera de esa base.
      </div>

      <OperationsMetricStrip
        className="mb-5"
        ariaLabel="Resumen de promociones"
        metrics={[
          { label: 'Campañas', value: coupons.length, icon: Ticket },
          { label: 'Activas', value: coupons.filter((coupon) => coupon.isActive && !isExpired(coupon) && !isExhausted(coupon)).length, icon: CircleCheck, tone: 'brand' },
          { label: 'Canjes confirmados', value: coupons.reduce((total, coupon) => total + coupon.usedCount, 0), icon: Users, tone: 'neutral' },
          { label: 'Vencidas o agotadas', value: coupons.filter((coupon) => isExpired(coupon) || isExhausted(coupon)).length, icon: CalendarClock, tone: 'danger' },
        ]}
      />

      {/* Con la tabla ya poblada, un fallo de recarga no puede llevarse los datos
          de la pantalla: se avisa encima y lo de abajo se marca como no actual. */}
      {loadError && coupons.length > 0 && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-red-200 bg-red-50/60 px-4 py-3 text-sm text-red-800"
        >
          <span>No pudimos actualizar la lista: {loadError}</span>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Reintentar
          </Button>
        </div>
      )}

      {loadError && coupons.length === 0 ? (
        <LoadError
          title="No pudimos cargar los cupones"
          message={loadError}
          onRetry={() => void load()}
        />
      ) : coupons.length === 0 ? (
        <p className="rounded-card border border-dashed border-line p-10 text-center text-sm text-ink-muted">
          Todavía no hay cupones. Crea el primero con «Nuevo cupón».
        </p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleCoupons.map((coupon) => {
            const expired = coupon.status === 'EXPIRED' || isExpired(coupon);
            const exhausted = coupon.status === 'EXHAUSTED' || isExhausted(coupon);
            const unavailable = coupon.status !== 'ACTIVE';
            const usagePercent = coupon.usageLimit ? Math.min(100, Math.round((coupon.usedCount / coupon.usageLimit) * 100)) : 0;
            return (
              <Card key={coupon.id} className={unavailable ? 'flex flex-col border-line bg-surface-muted/35' : 'flex flex-col overflow-hidden border-brand-100'} shadow="e2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="font-mono text-lg font-black tracking-wide text-ink">{coupon.code}</p><p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-muted">{coupon.description}</p></div>
                  <StatusBadge status={coupon.status} map={statusMap} />
                </div>

                <div className="my-4 rounded-card border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-brand-700">Beneficio para el cliente</p>
                  <p className="mt-1 text-2xl font-black text-brand-900">{describe(coupon)}</p>
                  <p className="mt-1 text-xs text-ink-muted">Desde {formatCurrency(coupon.minOrderAmount)} de compra</p>
                </div>

                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-field bg-surface-muted p-3"><dt className="font-bold uppercase tracking-wide text-ink-muted">Vigencia</dt><dd className={expired ? 'mt-1 font-bold text-red-700' : 'mt-1 font-semibold text-ink'}>{coupon.validFrom ? `Desde ${formatDateOnly(coupon.validFrom)}` : 'Desde ahora'}{coupon.validUntil ? ` · ${formatDateOnly(coupon.validUntil)}` : ' · Sin vencimiento'}</dd></div>
                  <div className="rounded-field bg-surface-muted p-3"><dt className="font-bold uppercase tracking-wide text-ink-muted">Por cliente</dt><dd className="mt-1 font-semibold text-ink">Máx. {coupon.usageLimitPerUser} {coupon.usageLimitPerUser === 1 ? 'uso' : 'usos'}</dd></div>
                </dl>

                <div className="mt-4 flex-1">
                  <div className="flex items-center justify-between text-xs"><p className={exhausted ? 'font-bold text-red-700' : 'font-semibold text-ink'}>{coupon.usedCount} canjes confirmados</p><span className="text-ink-muted">{coupon.usageLimit === null ? 'Sin tope total' : `${coupon.usedCount}/${coupon.usageLimit}`}</span></div>
                  {coupon.usageLimit !== null && <div className="mt-2 h-2 overflow-hidden rounded-pill bg-surface-muted"><div className={exhausted ? 'h-full bg-red-500' : 'h-full bg-brand-600'} style={{ width: `${usagePercent}%` }} /></div>}
                  {coupon.budgetAmount !== null && <p className="mt-2 text-xs text-ink-muted">Presupuesto: {formatCurrency(coupon.budgetUsed)} / {formatCurrency(coupon.budgetAmount)}</p>}
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2 border-t border-line pt-4">
                  <Button size="sm" variant="outline" leftIcon={<Pencil className="size-3.5" />} onClick={() => setEditing(coupon)}>Editar campaña</Button>
                  <Button size="sm" variant="ghost" isLoading={busy === `toggle-${coupon.id}`} disabled={busy !== null || coupon.status === 'ARCHIVED'} onClick={() => void handleToggle(coupon)}>{coupon.isActive ? 'Pausar' : 'Activar'}</Button>
                  <Button size="sm" variant="ghost" leftIcon={<Activity className="size-3.5" />} onClick={() => void handleMetrics(coupon)}>Métricas</Button>
                  {coupon.status !== 'ARCHIVED' && <Button size="sm" variant="ghost" leftIcon={<Archive className="size-3.5" />} isLoading={busy === `archive-${coupon.id}`} disabled={busy !== null} onClick={() => void handleArchive(coupon)}>Archivar</Button>}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        isOpen={isCreating}
        onClose={() => setIsCreating(false)}
        title="Nuevo cupon"
        description="El codigo se guarda en mayusculas."
        icon={Ticket}
        eyebrow="Promociones"
        disableBackdropClose
      >
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Codigo"
              value={form.code}
              onChange={(e) => setForm((c) => ({ ...c, code: e.target.value.toUpperCase() }))}
              placeholder="VERANO20"
            />

              <Select
                id="type"
                label="Tipo"
                value={form.discountType}
                onChange={(e) => setForm((c) => ({ ...c, discountType: e.target.value }))}
              >
                {TYPES.map((type) => (
                  <SelectOption key={type.value} value={type.value}>
                    {type.label}
                  </SelectOption>
                ))}
              </Select>
          </div>

          <Input
            label="Descripcion"
            value={form.description}
            onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))}
            placeholder="20% de descuento de verano"
          />

          <div className="grid gap-3 sm:grid-cols-3">
            {form.discountType !== 'FREE_DELIVERY' && (
              <Input
                label={form.discountType === 'PERCENT' ? 'Porcentaje' : 'Importe'}
                type="number"
                value={form.value}
                onChange={(e) => setForm((c) => ({ ...c, value: e.target.value }))}
              />
            )}

            <Input
              label="Pedido minimo"
              type="number"
              value={form.minOrderAmount}
              onChange={(e) => setForm((c) => ({ ...c, minOrderAmount: e.target.value }))}
            />

            {form.discountType === 'PERCENT' && (
              <Input
                label="Tope del descuento"
                type="number"
                value={form.maxDiscountAmount}
                onChange={(e) => setForm((c) => ({ ...c, maxDiscountAmount: e.target.value }))}
                placeholder="15"
              />
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              label="Vigente desde"
              type="date"
              value={form.validFrom}
              onChange={(e) => setForm((c) => ({ ...c, validFrom: e.target.value }))}
              hint="Permite programar la campaña."
            />
            <Input
              label="Vence el"
              type="date"
              min={toDateInput(new Date().toISOString())}
              value={form.validUntil}
              onChange={(e) => setForm((c) => ({ ...c, validUntil: e.target.value }))}
              hint="Deja de aceptarse al terminar ese día. Vacío = sin vencimiento."
            />
            <Input
              label="Usos totales máximos"
              type="number"
              min="1"
              value={form.usageLimit}
              onChange={(e) => setForm((c) => ({ ...c, usageLimit: e.target.value }))}
              placeholder="Sin tope"
              hint="Canjes de toda la campaña."
            />
            <Input
              label="Usos por cliente"
              type="number"
              min="1"
              value={form.usageLimitPerUser}
              onChange={(e) => setForm((c) => ({ ...c, usageLimitPerUser: e.target.value }))}
              hint="Veces que lo puede usar la misma persona."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Select id="coupon-stack-mode" label="Combinación" value={form.stackMode} onChange={(e) => setForm((c) => ({ ...c, stackMode: e.target.value }))}>
              <SelectOption value="STACKABLE">Compatible con beneficios</SelectOption>
              <SelectOption value="EXCLUSIVE">Exclusivo: reemplaza beneficios</SelectOption>
            </Select>
            <Input
              label="Presupuesto de descuentos"
              type="number"
              min="0"
              value={form.budgetAmount}
              onChange={(e) => setForm((c) => ({ ...c, budgetAmount: e.target.value }))}
              placeholder="Sin presupuesto"
              hint="Se consume al confirmar pagos."
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Sucursales permitidas" value={form.branchIds} onChange={(e) => setForm((c) => ({ ...c, branchIds: e.target.value }))} placeholder="IDs separados por coma" hint="Vacío = todas las sucursales." />
            <Input label="Productos permitidos" value={form.productIds} onChange={(e) => setForm((c) => ({ ...c, productIds: e.target.value }))} placeholder="IDs separados por coma" hint="Vacío = todos los productos." />
          </div>
          <Input label="Medios de pago permitidos" value={form.paymentMethods} onChange={(e) => setForm((c) => ({ ...c, paymentMethods: e.target.value }))} placeholder="ONLINE, YAPE, PLIN" hint="Vacío = todos los medios habilitados." />
          <Input label="Tipos de entrega permitidos" value={form.deliveryTypes} onChange={(e) => setForm((c) => ({ ...c, deliveryTypes: e.target.value }))} placeholder="DELIVERY, PICKUP" hint="Vacío = delivery, recojo y salón." />
          <Checkbox label="Solo primer pedido del cliente" checked={form.firstOrderOnly} onChange={(e) => setForm((c) => ({ ...c, firstOrderOnly: e.target.checked }))} />

          <Button className="w-full" isLoading={isSaving} onClick={handleCreate}>
            Crear cupon
          </Button>
        </div>
      </Modal>

      {/* Edicion: el codigo y el tipo NO se tocan. Un cupon ya repartido que
          cambiara de porcentaje a importe fijo valdria otra cosa para quien lo
          tiene guardado; para eso esta crear uno nuevo. */}
      <Modal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title={`Editar ${editing?.code ?? ''}`}
        description="Ajusta la vigencia, el tope de canjes y los importes. El código y el tipo no cambian."
        icon={Ticket}
        eyebrow="Promociones"
        disableBackdropClose
      >
        {editing && (
          <div className="grid gap-3">
            <Input
              label="Descripcion"
              value={editing.description}
              onChange={(e) => setEditing((c) => (c ? { ...c, description: e.target.value } : c))}
            />

            <div className="grid gap-3 sm:grid-cols-3">
              {editing.discountType !== 'FREE_DELIVERY' && (
                <Input
                  label={editing.discountType === 'PERCENT' ? 'Porcentaje' : 'Importe'}
                  type="number"
                  min="0"
                  value={editing.value}
                  onChange={(e) =>
                    setEditing((c) => (c ? { ...c, value: Number(e.target.value) } : c))
                  }
                />
              )}
              <Input
                label="Pedido minimo"
                type="number"
                min="0"
                value={editing.minOrderAmount}
                onChange={(e) =>
                  setEditing((c) => (c ? { ...c, minOrderAmount: Number(e.target.value) } : c))
                }
              />
              {editing.discountType === 'PERCENT' && (
                <Input
                  label="Tope del descuento"
                  type="number"
                  min="0"
                  value={editing.maxDiscountAmount ?? ''}
                  onChange={(e) =>
                    setEditing((c) =>
                      c
                        ? { ...c, maxDiscountAmount: e.target.value ? Number(e.target.value) : null }
                        : c,
                    )
                  }
                  placeholder="Sin tope"
                />
              )}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Vigente desde"
                type="date"
                value={toDateInput(editing.validFrom)}
                onChange={(e) => setEditing((c) => (c ? { ...c, validFrom: e.target.value ? new Date(`${e.target.value}T00:00:00`).toISOString() : null } : c))}
                hint="Puedes programar o adelantar la campaña."
              />
              <Input
                label="Vence el"
                type="date"
                value={toDateInput(editing.validUntil)}
                onChange={(e) =>
                  setEditing((c) => (c ? { ...c, validUntil: toIsoEndOfDay(e.target.value) } : c))
                }
                hint="Vacío = sin vencimiento."
              />
              <Input
                label="Usos totales máximos"
                type="number"
                min={editing.usedCount || 1}
                value={editing.usageLimit ?? ''}
                onChange={(e) =>
                  setEditing((c) =>
                    c ? { ...c, usageLimit: e.target.value ? Number(e.target.value) : null } : c,
                  )
                }
                placeholder="Sin tope"
                hint={`Ya se canjeó ${editing.usedCount} ${editing.usedCount === 1 ? 'vez' : 'veces'}.`}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Select id="editing-coupon-stack-mode" label="Combinación" value={editing.stackMode} onChange={(e) => setEditing((c) => (c ? { ...c, stackMode: e.target.value as AdminCoupon['stackMode'] } : c))}>
                <SelectOption value="STACKABLE">Compatible con beneficios</SelectOption>
                <SelectOption value="EXCLUSIVE">Exclusivo: reemplaza beneficios</SelectOption>
              </Select>
              <Input
                label="Presupuesto de descuentos"
                type="number"
                min="0"
                value={editing.budgetAmount ?? ''}
                onChange={(e) => setEditing((c) => (c ? { ...c, budgetAmount: e.target.value ? Number(e.target.value) : null } : c))}
                hint={`Consumido: ${formatCurrency(editing.budgetUsed)}.`}
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Sucursales permitidas" value={(editing.rules.branchIds ?? []).join(', ')} onChange={(e) => setEditing((c) => (c ? { ...c, rules: { ...c.rules, branchIds: parseIds(e.target.value) } } : c))} placeholder="IDs separados por coma" />
              <Input label="Productos permitidos" value={(editing.rules.productIds ?? []).join(', ')} onChange={(e) => setEditing((c) => (c ? { ...c, rules: { ...c.rules, productIds: parseIds(e.target.value) } } : c))} placeholder="IDs separados por coma" />
            </div>
            <Input label="Medios de pago permitidos" value={(editing.rules.paymentMethods ?? []).join(', ')} onChange={(e) => setEditing((c) => (c ? { ...c, rules: { ...c.rules, paymentMethods: e.target.value.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean) } } : c))} placeholder="ONLINE, YAPE, PLIN" />
            <Input label="Tipos de entrega permitidos" value={(editing.rules.deliveryTypes ?? []).join(', ')} onChange={(e) => setEditing((c) => (c ? { ...c, rules: { ...c.rules, deliveryTypes: e.target.value.split(',').map((item) => item.trim().toUpperCase()).filter(Boolean) } } : c))} placeholder="DELIVERY, PICKUP" />
            <Checkbox label="Solo primer pedido del cliente" checked={Boolean(editing.rules.firstOrderOnly)} onChange={(e) => setEditing((c) => (c ? { ...c, rules: { ...c.rules, firstOrderOnly: e.target.checked } } : c))} />

            <Button className="w-full" isLoading={isSaving} onClick={() => void handleEdit()}>
              Guardar cambios
            </Button>
          </div>
        )}
      </Modal>

      <Modal
        isOpen={isPreviewing}
        onClose={() => setIsPreviewing(false)}
        title="Simular cupón"
        description="Usa la misma validación que el checkout antes de publicar una campaña."
        icon={Calculator}
        eyebrow="Control comercial"
        disableBackdropClose
      >
        <div className="grid gap-3">
          <Input label="Código" value={previewForm.code} onChange={(event) => setPreviewForm((current) => ({ ...current, code: event.target.value.toUpperCase() }))} placeholder="VERANO20" />
          <Input label="Subtotal del carrito" type="number" min="0" value={previewForm.subtotal} onChange={(event) => setPreviewForm((current) => ({ ...current, subtotal: event.target.value }))} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Select id="preview-delivery-type" label="Tipo de entrega" value={previewForm.deliveryType} onChange={(event) => setPreviewForm((current) => ({ ...current, deliveryType: event.target.value as typeof current.deliveryType }))}>
              <SelectOption value="DELIVERY">Delivery</SelectOption>
              <SelectOption value="PICKUP">Recojo</SelectOption>
              <SelectOption value="DINE_IN">Salón</SelectOption>
            </Select>
            <Select id="preview-payment-method" label="Medio de pago" value={previewForm.paymentMethod} onChange={(event) => setPreviewForm((current) => ({ ...current, paymentMethod: event.target.value as typeof current.paymentMethod }))}>
              <SelectOption value="ONLINE">Pasarela</SelectOption>
              <SelectOption value="YAPE">Yape</SelectOption>
              <SelectOption value="PLIN">Plin</SelectOption>
              <SelectOption value="CASH">Efectivo</SelectOption>
            </Select>
          </div>
          <Button className="w-full" onClick={() => void handlePreview()}>Calcular</Button>
          {preview && (
            <div className="rounded-card border border-brand-200 bg-brand-50/60 p-4 text-sm">
              <p className="font-black text-brand-900">{preview.code} · {preview.description}</p>
              <p className="mt-2 text-brand-900">{preview.freeDelivery ? 'Delivery gratis' : `Descuento: ${formatCurrency(preview.amount)}`}</p>
              <p className="mt-1 text-xs text-ink-muted">Política: {preview.stackMode === 'EXCLUSIVE' ? 'exclusivo' : 'combinable'} · Impacto presupuestal: {formatCurrency(preview.budgetImpact)}</p>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        isOpen={metricsCoupon !== null}
        onClose={() => { setMetricsCoupon(null); setMetrics(null); setRedemptions([]); }}
        title={`Métricas ${metricsCoupon?.code ?? ''}`}
        description="Canjes y presupuesto de la campaña."
        icon={Activity}
        eyebrow="Control comercial"
      >
        {metrics ? (
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-card border border-line bg-surface-muted p-4"><p className="text-xs text-ink-muted">Reservados</p><p className="mt-1 text-2xl font-black">{metrics.reserved}</p></div>
            <div className="rounded-card border border-line bg-surface-muted p-4"><p className="text-xs text-ink-muted">Confirmados</p><p className="mt-1 text-2xl font-black">{metrics.confirmed}</p></div>
            <div className="rounded-card border border-line bg-surface-muted p-4"><p className="text-xs text-ink-muted">Liberados</p><p className="mt-1 text-2xl font-black">{metrics.released}</p></div>
            <div className="rounded-card border border-brand-200 bg-brand-50/60 p-4"><p className="text-xs text-brand-800">Descuento confirmado</p><p className="mt-1 text-2xl font-black text-brand-900">{formatCurrency(metrics.discountConfirmed)}</p></div>
            <div className="rounded-card border border-line bg-surface-muted p-4"><p className="text-xs text-ink-muted">Ventas atribuidas</p><p className="mt-1 text-2xl font-black">{formatCurrency(metrics.grossSales)}</p></div>
            <div className="rounded-card border border-line bg-surface-muted p-4"><p className="text-xs text-ink-muted">Ticket promedio</p><p className="mt-1 text-2xl font-black">{formatCurrency(metrics.averageOrderValue)}</p></div>
            {metrics.budgetAmount !== null && <div className="sm:col-span-2 rounded-card border border-line bg-surface-muted p-4 text-sm">Presupuesto restante: <strong>{formatCurrency(metrics.budgetRemaining ?? 0)}</strong></div>}
            <div className="sm:col-span-2 overflow-hidden rounded-card border border-line">
              <div className="border-b border-line bg-surface-muted px-4 py-3 text-xs font-black uppercase tracking-wide text-ink-muted">Últimos canjes</div>
              {redemptions.slice(0, 10).map((redemption) => (
                <div key={redemption.id} className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 text-sm last:border-b-0">
                  <span className="font-semibold">{redemption.order?.orderNumber ?? 'Pedido pendiente'}</span>
                  <span className="text-ink-muted">{redemption.status} · {formatCurrency(redemption.amount)}</span>
                </div>
              ))}
              {redemptions.length === 0 && <p className="px-4 py-4 text-sm text-ink-muted">Todavía no hay canjes registrados.</p>}
            </div>
          </div>
        ) : <PageLoader />}
      </Modal>
    </div>
  );
};

export default CouponsPage;
