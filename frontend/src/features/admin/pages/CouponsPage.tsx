import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CircleCheck, Pencil, Plus, Ticket, Users } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Select, SelectOption } from '@components/ui/Select';
import { Modal } from '@components/ui/Modal';
import { useConfirm } from '@components/ui/ConfirmDialog';
import { Card } from '@components/ui/Card';
import { PageLoader } from '@components/common/PageLoader';
import { PageHeader } from '@components/common/PageHeader';
import { LoadError } from '@components/common/LoadError';
import { getApiErrorMessage } from '@services/api/client';
import { formatCurrency, formatDateOnly } from '@lib/format';
import { StatusBadge, activeStateMap } from '@components/ui/StatusBadge';
import { commercialApi, type AdminCoupon } from '../services/commercialAdmin.service';
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
  validUntil: '',
  usageLimit: '',
  usageLimitPerUser: '1',
};

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
        validUntil: toIsoEndOfDay(form.validUntil),
        usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
        usageLimitPerUser: Number(form.usageLimitPerUser),
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
        value: editing.value,
        minOrderAmount: editing.minOrderAmount,
        maxDiscountAmount: editing.maxDiscountAmount,
        usageLimit: editing.usageLimit,
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

  return (
    <div>
      <PageHeader
        eyebrow="Promociones"
        title="Cupones"
        description="El cupón se reserva al crear el pedido y se consume cuando el pago se confirma."
        icon={Ticket}
        action={<Button leftIcon={<Plus className="size-4" />} onClick={() => setIsCreating(true)}>Nuevo cupón</Button>}
      />

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
          {coupons.map((coupon) => {
            const expired = isExpired(coupon);
            const exhausted = isExhausted(coupon);
            const unavailable = !coupon.isActive || expired || exhausted;
            const usagePercent = coupon.usageLimit ? Math.min(100, Math.round((coupon.usedCount / coupon.usageLimit) * 100)) : 0;
            return (
              <Card key={coupon.id} className={unavailable ? 'flex flex-col border-line bg-surface-muted/35' : 'flex flex-col overflow-hidden border-brand-100'} shadow="e2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0"><p className="font-mono text-lg font-black tracking-wide text-ink">{coupon.code}</p><p className="mt-1 line-clamp-2 text-sm leading-relaxed text-ink-muted">{coupon.description}</p></div>
                  <StatusBadge status={String(coupon.isActive && !expired && !exhausted)} map={activeStateMap('Disponible', expired ? 'Vencido' : exhausted ? 'Agotado' : 'Apagado')} />
                </div>

                <div className="my-4 rounded-card border border-brand-100 bg-gradient-to-br from-brand-50 to-white p-4">
                  <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-brand-700">Beneficio para el cliente</p>
                  <p className="mt-1 text-2xl font-black text-brand-900">{describe(coupon)}</p>
                  <p className="mt-1 text-xs text-ink-muted">Desde {formatCurrency(coupon.minOrderAmount)} de compra</p>
                </div>

                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-field bg-surface-muted p-3"><dt className="font-bold uppercase tracking-wide text-ink-muted">Vigencia</dt><dd className={expired ? 'mt-1 font-bold text-red-700' : 'mt-1 font-semibold text-ink'}>{coupon.validUntil ? formatDateOnly(coupon.validUntil) : 'Sin vencimiento'}</dd></div>
                  <div className="rounded-field bg-surface-muted p-3"><dt className="font-bold uppercase tracking-wide text-ink-muted">Por cliente</dt><dd className="mt-1 font-semibold text-ink">Máx. {coupon.usageLimitPerUser} {coupon.usageLimitPerUser === 1 ? 'uso' : 'usos'}</dd></div>
                </dl>

                <div className="mt-4 flex-1">
                  <div className="flex items-center justify-between text-xs"><p className={exhausted ? 'font-bold text-red-700' : 'font-semibold text-ink'}>{coupon.usedCount} canjes confirmados</p><span className="text-ink-muted">{coupon.usageLimit === null ? 'Sin tope total' : `${coupon.usedCount}/${coupon.usageLimit}`}</span></div>
                  {coupon.usageLimit !== null && <div className="mt-2 h-2 overflow-hidden rounded-pill bg-surface-muted"><div className={exhausted ? 'h-full bg-red-500' : 'h-full bg-brand-600'} style={{ width: `${usagePercent}%` }} /></div>}
                </div>

                <div className="mt-5 grid grid-cols-2 gap-2 border-t border-line pt-4">
                  <Button size="sm" variant="outline" leftIcon={<Pencil className="size-3.5" />} onClick={() => setEditing(coupon)}>Editar campaña</Button>
                  <Button size="sm" variant="ghost" isLoading={busy === `toggle-${coupon.id}`} disabled={busy !== null} onClick={() => void handleToggle(coupon)}>{coupon.isActive ? 'Pausar' : 'Activar'}</Button>
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

            <Button className="w-full" isLoading={isSaving} onClick={() => void handleEdit()}>
              Guardar cambios
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
};

export default CouponsPage;
