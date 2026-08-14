import { useCallback, useEffect, useRef, useState } from 'react';
import { CircleCheck, Gift, Pencil, Plus, RotateCcw, Sparkles, Users, Wallet } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Card, CardDescription } from '@components/ui/Card';
import { Badge } from '@components/ui/Badge';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Select, SelectOption } from '@components/ui/Select';
import { Modal } from '@components/ui/Modal';
import { useConfirm } from '@components/ui/ConfirmDialog';
import { PageLoader } from '@components/common/PageLoader';
import { PageHeader } from '@components/common/PageHeader';
import { LoadError } from '@components/common/LoadError';
import { getApiErrorMessage } from '@services/api/client';
import { formatCurrency } from '@lib/format';
import { cn } from '@lib/cn';
import { usePermissions } from '@hooks/usePermissions';
import { PERM } from '@constants/permissions';
import { StatusBadge, activeStateMap } from '@components/ui/StatusBadge';
import {
  commercialApi,
  type AdminPlan,
  type AdminPlanBenefit,
} from '../services/commercialAdmin.service';
import { OperationsMetricStrip } from '../components/OperationsMetricStrip';

const EMPTY = { code: '', name: '', description: '', price: '', grantedCredit: '', validityDays: '30' };
const EMPTY_BENEFIT = {
  type: 'DISCOUNT_PERCENT' as AdminPlanBenefit['type'],
  value: '5',
  maxAmountPerOrder: '10',
  description: '',
};

/** Los tres importes que se teclean en la tarjeta: lo unico que hay que proteger. */
type PlanAmounts = Pick<AdminPlan, 'price' | 'grantedCredit' | 'validityDays'>;

const amountsOf = (plan: AdminPlan): PlanAmounts => ({
  price: plan.price,
  grantedCredit: plan.grantedCredit,
  validityDays: plan.validityDays,
});

const sameAmounts = (a: PlanAmounts, b: PlanAmounts): boolean =>
  a.price === b.price && a.grantedCredit === b.grantedCredit && a.validityDays === b.validityDays;

/**
 * MEZCLA EN VEZ DE REEMPLAZO (F20)
 * ---------------------------------------------------------------------------
 * `run()` termina siempre en `load()`, y `load()` reemplazaba el array entero: al
 * guardar UN plan —o al apagar otro, o al guardar un beneficio— se perdian sin
 * aviso los importes tecleados en todas las demas tarjetas, con un toast verde en
 * pantalla diciendo que todo habia ido bien.
 *
 * Se conserva lo local SOLO donde difiere de lo que el servidor habia mandado la
 * vez anterior: asi lo que si se guardo se refresca con el valor real (incluidas
 * las correcciones del servidor) y lo que sigue a medio teclear sobrevive.
 */
const mergePlans = (fresh: AdminPlan[], local: AdminPlan[], previous: AdminPlan[]): AdminPlan[] =>
  fresh.map((plan) => {
    const edited = local.find((entry) => entry.id === plan.id);
    const server = previous.find((entry) => entry.id === plan.id);
    return edited && server && !sameAmounts(amountsOf(edited), amountsOf(server))
      ? { ...plan, ...amountsOf(edited) }
      : plan;
  });

/**
 * Planes y beneficios.
 * Cambiar un plan NO afecta a quien ya lo compro: las activaciones guardan un
 * snapshot del precio, el saldo y la vigencia. Los BENEFICIOS son la excepcion:
 * se leen en vivo al cotizar, asi que quitar uno se nota en el acto.
 */
const PlansAdminPage = () => {
  const confirm = useConfirm();
  const { can } = usePermissions();
  /* La ruta esta abierta a plan.read (Soporte consulta los planes al atender por
   * telefono). Sin plan.manage no se pinta ni una escritura: antes esta pantalla
   * no comprobaba ningun permiso y ofrecia botones que solo devolvian 403. */
  const canManage = can(PERM.PLAN_MANAGE);

  const [plans, setPlans] = useState<AdminPlan[]>([]);
  /** Ultima respuesta del servidor: la referencia contra la que se calcula lo sucio. */
  const serverPlans = useRef<AdminPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<AdminPlan | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [benefit, setBenefit] = useState(EMPTY_BENEFIT);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const fresh = await commercialApi.plans();
      const previous = serverPlans.current;
      setPlans((current) => mergePlans(fresh, current, previous));
      serverPlans.current = fresh;
    } catch (error) {
      setLoadError(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (key: string, action: () => Promise<void>, message: string) => {
    setBusy(key);
    try {
      await action();
      toast.success(message);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setBusy(null);
    }
  };

  const patchPlan = (planId: number, patch: Partial<AdminPlan>) => {
    setPlans((current) =>
      current.map((plan) => (plan.id === planId ? { ...plan, ...patch } : plan)),
    );
  };

  const serverPlan = (planId: number) => serverPlans.current.find((entry) => entry.id === planId);

  const isDirty = (plan: AdminPlan): boolean => {
    const server = serverPlan(plan.id);
    return server ? !sameAmounts(amountsOf(plan), amountsOf(server)) : false;
  };

  const openBenefit = (plan: AdminPlan, entry?: AdminPlanBenefit) => {
    setEditing(plan);
    setBenefit(
      entry
        ? {
            type: entry.type,
            value: String(entry.value),
            maxAmountPerOrder: String(entry.maxAmountPerOrder ?? ''),
            description: entry.description,
          }
        : EMPTY_BENEFIT,
    );
  };

  /**
   * Quitar un beneficio NO es como bajar un precio: el precio, el saldo y la
   * vigencia quedaron congelados en la compra, pero los beneficios se consultan
   * al cotizar cada pedido. Por eso la pregunta dice a cuanta gente afecta HOY.
   */
  const removeBenefit = async (plan: AdminPlan, entry: AdminPlanBenefit) => {
    const subscribers = plan.activeSubscribers ?? 0;
    const { confirmed } = await confirm({
      title: 'Quitar este beneficio',
      message:
        `«${entry.description}» dejará de aplicarse de inmediato`
        + (subscribers > 0
          ? `, incluso a ${subscribers} cliente${subscribers === 1 ? '' : 's'} con ${plan.name} vigente: los beneficios se leen en vivo, no se congelan al comprar.`
          : '. Ningún cliente tiene este plan vigente ahora mismo.')
        + ' Se apaga, no se borra: puedes volver a activarlo cuando quieras.',
      confirmLabel: 'Quitar beneficio',
      tone: 'danger',
    });
    if (!confirmed) return;

    await run(
      `ben-${entry.id}`,
      () => commercialApi.removePlanBenefit(plan.id, entry.id),
      'Beneficio quitado',
    );
  };

  if (isLoading) return <PageLoader />;

  return (
    <div>
      <PageHeader
        eyebrow="Fidelización"
        title="Planes"
        description="El cliente paga el precio y recibe saldo; la diferencia corresponde a la bonificación."
        icon={Wallet}
        action={
          canManage ? (
            <Button leftIcon={<Plus className="size-4" />} onClick={() => setIsCreating(true)}>Nuevo plan</Button>
          ) : undefined
        }
      />

      <OperationsMetricStrip
        className="mb-5"
        ariaLabel="Resumen de fidelización"
        metrics={[
          { label: 'Planes', value: plans.length, icon: Wallet },
          { label: 'Publicados', value: plans.filter((plan) => plan.isActive).length, icon: CircleCheck, tone: 'brand' },
          { label: 'Clientes vigentes', value: plans.reduce((total, plan) => total + (plan.activeSubscribers ?? 0), 0), icon: Users, tone: 'neutral' },
          { label: 'Beneficios activos', value: plans.reduce((total, plan) => total + plan.benefits.filter((benefit) => benefit.isActive !== false).length, 0), icon: Sparkles, tone: 'accent' },
        ]}
      />

      {/* Con las tarjetas ya pintadas, un fallo de recarga se avisa encima en vez
          de vaciar la pantalla y llevarse lo que se estaba tecleando. */}
      {loadError && plans.length > 0 && (
        <div
          role="alert"
          className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-card border border-red-200 bg-red-50/60 px-4 py-3 text-sm text-red-800"
        >
          <span>No pudimos actualizar los planes: {loadError}</span>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Reintentar
          </Button>
        </div>
      )}

      {loadError && plans.length === 0 ? (
        <LoadError
          title="No pudimos cargar los planes"
          message={loadError}
          onRetry={() => void load()}
        />
      ) : plans.length === 0 ? (
        <p className="rounded-card border border-dashed border-line p-10 text-center text-sm text-ink-muted">
          Todavía no hay planes configurados.
        </p>
      ) : (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => {
          const dirty = isDirty(plan);
          const server = serverPlan(plan.id);
          const bonus = Math.max(0, plan.grantedCredit - plan.price);
          const bonusPercent = plan.price > 0 ? Math.round((bonus / plan.price) * 100) : 0;

          return (
          <Card key={plan.id} className={cn('flex flex-col overflow-hidden', plan.isActive ? 'border-brand-100' : 'bg-surface-muted/40 opacity-70')}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-ink">{plan.name}</p>
                <p className="text-xs text-ink-muted">
                  {plan.code}
                  {plan.activeSubscribers !== undefined && ` · ${plan.activeSubscribers} vigente${plan.activeSubscribers === 1 ? '' : 's'}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {dirty && <Badge variant="warning">Sin guardar</Badge>}
                <StatusBadge status={String(plan.isActive)} map={activeStateMap('Activo', 'Apagado')} />
              </div>
            </div>

            <div className="mt-4 rounded-card border border-brand-100 bg-gradient-to-br from-brand-50 via-white to-accent-50/40 p-4">
              <p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-brand-700">Propuesta de valor</p>
              <div className="mt-3 grid grid-cols-3 divide-x divide-brand-100 text-center">
                <div className="px-2"><p className="text-[10px] text-ink-muted">Paga</p><p className="mt-1 text-lg font-black text-ink">{formatCurrency(plan.price)}</p></div>
                <div className="px-2"><p className="text-[10px] text-ink-muted">Recibe</p><p className="mt-1 text-lg font-black text-brand-800">{formatCurrency(plan.grantedCredit)}</p></div>
                <div className="px-2"><p className="text-[10px] text-ink-muted">Gana extra</p><p className="mt-1 text-lg font-black text-accent-700">{bonusPercent}%</p></div>
              </div>
              <p className="mt-3 text-center text-xs font-semibold text-accent-800">Bonificación real: {formatCurrency(bonus)}</p>
            </div>

            {canManage ? (
              <div className="mt-4 rounded-card border border-line bg-surface-muted/45 p-3">
                <p className="mb-3 text-[10px] font-extrabold uppercase tracking-wide text-ink-muted">Configuración comercial</p>
                <div className="grid gap-2 sm:grid-cols-3">
                <Input
                  label="Precio"
                  type="number"
                  step="10"
                  value={plan.price}
                  onChange={(e) => patchPlan(plan.id, { price: Number(e.target.value) })}
                />
                <Input
                  label="Saldo"
                  type="number"
                  step="10"
                  value={plan.grantedCredit}
                  onChange={(e) => patchPlan(plan.id, { grantedCredit: Number(e.target.value) })}
                />
                <Input
                  label="Días bono/beneficios"
                  type="number"
                  value={plan.validityDays}
                  onChange={(e) => patchPlan(plan.id, { validityDays: Number(e.target.value) })}
                />
                </div>
              </div>
            ) : (
              <dl className="mt-4 grid grid-cols-3 gap-2 text-sm">
                {[
                  { label: 'Precio', value: formatCurrency(plan.price) },
                  { label: 'Saldo', value: formatCurrency(plan.grantedCredit) },
                  { label: 'Vigencia', value: `${plan.validityDays} días` },
                ].map((item) => (
                  <div key={item.label}>
                    <dt className="text-xs text-ink-muted">{item.label}</dt>
                    <dd className="font-semibold text-ink">{item.value}</dd>
                  </div>
                ))}
              </dl>
            )}

            <div className="mt-3 flex-1">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Beneficios
              </p>

              {plan.benefits.length === 0 ? (
                <CardDescription className="text-xs">Sin beneficios todavia.</CardDescription>
              ) : (
                <ul className="space-y-1.5">
                  {plan.benefits.map((entry) => {
                    const off = entry.isActive === false;

                    return (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between gap-2 text-xs text-ink-muted"
                    >
                      <span className={cn('flex items-center gap-1', off && 'line-through opacity-70')}>
                        <Gift className={cn('size-3', off ? 'text-ink-muted' : 'text-brand-600')} />
                        {entry.description}
                      </span>

                      {canManage && (
                        off ? (
                          /* Apagado, no borrado: la fila sigue ahi y el backend la
                             reactiva al volver a guardarla (indice unico plan+tipo). */
                          <Button
                            size="sm"
                            variant="ghost"
                            isLoading={busy === `ben-${entry.id}`}
                            disabled={busy !== null}
                            onClick={() =>
                              void run(
                                `ben-${entry.id}`,
                                () =>
                                  commercialApi.setPlanBenefit(plan.id, {
                                    type: entry.type,
                                    value: entry.value,
                                    maxAmountPerOrder: entry.maxAmountPerOrder,
                                    description: entry.description,
                                  }),
                                'Beneficio activado',
                              )
                            }
                          >
                            Activar
                          </Button>
                        ) : (
                          <span className="flex shrink-0 items-center">
                            <Button
                              size="sm"
                              variant="ghost"
                              aria-label={`Editar ${entry.description}`}
                              onClick={() => openBenefit(plan, entry)}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              isLoading={busy === `ben-${entry.id}`}
                              disabled={busy !== null}
                              onClick={() => void removeBenefit(plan, entry)}
                            >
                              Quitar
                            </Button>
                          </span>
                        )
                      )}
                    </li>
                    );
                  })}
                </ul>
              )}
            </div>

            {canManage && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                size="sm"
                className="flex-1"
                disabled={!dirty || busy !== null}
                isLoading={busy === `plan-${plan.id}`}
                onClick={() =>
                  void run(
                    `plan-${plan.id}`,
                    () =>
                      commercialApi.updatePlan(plan.id, {
                        price: plan.price,
                        grantedCredit: plan.grantedCredit,
                        validityDays: plan.validityDays,
                      }),
                    'Plan actualizado',
                  )
                }
              >
                {dirty ? 'Guardar' : 'Guardado'}
              </Button>

              {dirty && server && (
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Descartar los cambios de ${plan.name}`}
                  onClick={() => patchPlan(plan.id, amountsOf(server))}
                >
                  <RotateCcw className="size-3.5" />
                </Button>
              )}

              <Button size="sm" variant="outline" onClick={() => openBenefit(plan)}>
                Añadir beneficio
              </Button>

              <Button
                size="sm"
                variant="ghost"
                isLoading={busy === `toggle-${plan.id}`}
                disabled={busy !== null}
                onClick={() =>
                  void run(
                    `toggle-${plan.id}`,
                    () => commercialApi.updatePlan(plan.id, { isActive: !plan.isActive }),
                    plan.isActive ? 'Plan apagado' : 'Plan activado',
                  )
                }
              >
                {plan.isActive ? 'Apagar' : 'Activar'}
              </Button>
            </div>
            )}

            {!canManage && (
              <p className="mt-4 rounded-card border border-dashed border-line px-3 py-2 text-xs text-ink-muted">
                Solo lectura: necesitas el permiso de gestión de planes para editarlos.
              </p>
            )}
          </Card>
          );
        })}
      </div>
      )}

      {/* Crear plan */}
      <Modal
        isOpen={isCreating}
        onClose={() => setIsCreating(false)}
        title="Nuevo plan"
        description="El saldo otorgado no puede ser menor que el precio."
        icon={Wallet}
        eyebrow="Fidelización"
        disableBackdropClose
      >
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Codigo"
              value={form.code}
              onChange={(e) => setForm((c) => ({ ...c, code: e.target.value.toUpperCase() }))}
              placeholder="TRIMESTRAL"
            />
            <Input
              label="Nombre"
              value={form.name}
              onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
              placeholder="Plan Trimestral"
            />
          </div>

          <Input
            label="Descripcion"
            value={form.description}
            onChange={(e) => setForm((c) => ({ ...c, description: e.target.value }))}
          />

          <div className="grid gap-3 sm:grid-cols-3">
            <Input
              label="Precio"
              type="number"
              value={form.price}
              onChange={(e) => setForm((c) => ({ ...c, price: e.target.value }))}
              placeholder="900"
            />
            <Input
              label="Saldo otorgado"
              type="number"
              value={form.grantedCredit}
              onChange={(e) => setForm((c) => ({ ...c, grantedCredit: e.target.value }))}
              placeholder="1100"
            />
            <Input
              label="Vigencia bono/beneficios (días)"
              type="number"
              value={form.validityDays}
              onChange={(e) => setForm((c) => ({ ...c, validityDays: e.target.value }))}
            />
          </div>

          <Button
            className="w-full"
            isLoading={busy === 'new-plan'}
            onClick={() =>
              void run(
                'new-plan',
                async () => {
                  await commercialApi.createPlan({
                    code: form.code,
                    name: form.name,
                    description: form.description || undefined,
                    price: Number(form.price),
                    grantedCredit: Number(form.grantedCredit),
                    validityDays: Number(form.validityDays),
                  });
                  setIsCreating(false);
                  setForm(EMPTY);
                },
                'Plan creado',
              )
            }
          >
            Crear plan
          </Button>
        </div>
      </Modal>

      {/* Beneficio */}
      <Modal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title={`Beneficio de ${editing?.name ?? ''}`}
        description="Se aplica en cada pedido mientras el plan esté vigente, y se lee en vivo: el cambio se nota de inmediato."
        icon={Gift}
        eyebrow="Fidelización"
        disableBackdropClose
      >
        <div className="grid gap-3">
            <Select
              id="btype"
              label="Tipo"
              value={benefit.type}
              onChange={(e) =>
                setBenefit((c) => ({
                  ...c,
                  type: e.target.value as AdminPlanBenefit['type'],
                }))
              }
            >
              <SelectOption value="DISCOUNT_PERCENT">Descuento en cada pedido</SelectOption>
              <SelectOption value="FREE_DELIVERY">Delivery gratis</SelectOption>
            </Select>

            {/* Un plan admite un solo beneficio por tipo (indice unico plan+tipo):
                guardar sobre uno existente lo reescribe, no crea otro. */}
            {editing?.benefits.some((entry) => entry.type === benefit.type) && (
              <p className="rounded-card border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                {editing.name} ya tiene un beneficio de este tipo: al guardar se reemplaza
                {(editing.activeSubscribers ?? 0) > 0
                  ? ` para ${editing.activeSubscribers} cliente${editing.activeSubscribers === 1 ? '' : 's'} con el plan vigente.`
                  : '.'}
              </p>
            )}

          {benefit.type === 'DISCOUNT_PERCENT' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Porcentaje"
                type="number"
                value={benefit.value}
                onChange={(e) => setBenefit((c) => ({ ...c, value: e.target.value }))}
              />
              <Input
                label="Tope por pedido"
                type="number"
                value={benefit.maxAmountPerOrder}
                onChange={(e) => setBenefit((c) => ({ ...c, maxAmountPerOrder: e.target.value }))}
              />
            </div>
          )}

          <Input
            label="Descripcion (la ve el cliente)"
            value={benefit.description}
            onChange={(e) => setBenefit((c) => ({ ...c, description: e.target.value }))}
            placeholder="5% de descuento en cada pedido"
          />

          <Button
            className="w-full"
            isLoading={busy === 'benefit'}
            onClick={() => {
              if (!editing || benefit.description.length < 3) {
                toast.error('Escribe la descripcion del beneficio');
                return;
              }

              void run(
                'benefit',
                async () => {
                  await commercialApi.setPlanBenefit(editing.id, {
                    type: benefit.type,
                    value: benefit.type === 'FREE_DELIVERY' ? 0 : Number(benefit.value),
                    maxAmountPerOrder:
                      benefit.type === 'FREE_DELIVERY' ? null : Number(benefit.maxAmountPerOrder),
                    description: benefit.description,
                  });
                  setEditing(null);
                },
                'Beneficio guardado',
              );
            }}
          >
            Guardar beneficio
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default PlansAdminPage;
