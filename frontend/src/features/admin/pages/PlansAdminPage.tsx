import { useCallback, useEffect, useState } from 'react';
import { Gift, Plus, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardDescription } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Select, SelectOption } from '@components/ui/Select';
import { Modal } from '@components/ui/Modal';
import { PageLoader } from '@components/common/PageLoader';
import { PageHeader } from '@components/common/PageHeader';
import { getApiErrorMessage } from '@services/api/client';
import { formatCurrency } from '@lib/format';
import { cn } from '@lib/cn';
import { commercialApi, type AdminPlan } from '../services/commercialAdmin.service';

const EMPTY = { code: '', name: '', description: '', price: '', grantedCredit: '', validityDays: '30' };

/**
 * Planes y beneficios.
 * Cambiar un plan NO afecta a quien ya lo compro: las activaciones guardan un
 * snapshot del precio, el saldo y la vigencia.
 */
const PlansAdminPage = () => {
  const [plans, setPlans] = useState<AdminPlan[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState<AdminPlan | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [benefit, setBenefit] = useState({
    type: 'DISCOUNT_PERCENT' as 'DISCOUNT_PERCENT' | 'FREE_DELIVERY',
    value: '5',
    maxAmountPerOrder: '10',
    description: '',
  });

  const load = useCallback(async () => {
    try {
      setPlans(await commercialApi.plans());
    } catch (error) {
      toast.error(getApiErrorMessage(error));
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

  if (isLoading) return <PageLoader />;

  return (
    <div>
      <PageHeader
        eyebrow="Fidelización"
        title="Planes"
        description="El cliente paga el precio y recibe saldo; la diferencia corresponde a la bonificación."
        icon={Wallet}
        action={<Button leftIcon={<Plus className="size-4" />} onClick={() => setIsCreating(true)}>Nuevo plan</Button>}
      />

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.id} className={cn('flex flex-col', !plan.isActive && 'opacity-60')}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-ink">{plan.name}</p>
                <p className="text-xs text-ink-muted">{plan.code}</p>
              </div>
              <span
                className={cn(
                  'rounded-full px-2 py-0.5 text-xs font-medium',
                  plan.isActive ? 'bg-brand-50 text-brand-700' : 'bg-surface-muted text-ink-muted',
                )}
              >
                {plan.isActive ? 'Activo' : 'Apagado'}
              </span>
            </div>

            <div className="mt-4 grid gap-2 sm:grid-cols-3">
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
                label="Dias"
                type="number"
                value={plan.validityDays}
                onChange={(e) => patchPlan(plan.id, { validityDays: Number(e.target.value) })}
              />
            </div>

            <p className="mt-2 text-xs text-accent-500">
              Bonificacion: {formatCurrency(plan.grantedCredit - plan.price)}
            </p>

            <div className="mt-3 flex-1">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                Beneficios
              </p>

              {plan.benefits.length === 0 ? (
                <CardDescription className="text-xs">Sin beneficios todavia.</CardDescription>
              ) : (
                <ul className="space-y-1">
                  {plan.benefits.map((entry) => (
                    <li
                      key={entry.id}
                      className="flex items-center justify-between gap-2 text-xs text-ink-muted"
                    >
                      <span className="flex items-center gap-1">
                        <Gift className="size-3 text-brand-600" />
                        {entry.description}
                      </span>
                      <button
                        type="button"
                        className="text-ink-muted hover:text-red-600"
                        onClick={() =>
                          void run(
                            `ben-${entry.id}`,
                            () => commercialApi.removePlanBenefit(plan.id, entry.id),
                            'Beneficio quitado',
                          )
                        }
                      >
                        quitar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="mt-4 flex gap-2">
              <Button
                size="sm"
                className="flex-1"
                isLoading={busy === `plan-${plan.id}`}
                onClick={() =>
                  run(
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
                Guardar
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  setEditing(plan);
                  setBenefit({
                    type: 'DISCOUNT_PERCENT',
                    value: '5',
                    maxAmountPerOrder: '10',
                    description: '',
                  });
                }}
              >
                Beneficio
              </Button>

              <Button
                size="sm"
                variant="ghost"
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
          </Card>
        ))}
      </div>

      {/* Crear plan */}
      <Modal
        isOpen={isCreating}
        onClose={() => setIsCreating(false)}
        title="Nuevo plan"
        description="El saldo otorgado no puede ser menor que el precio."
      >
        <div className="space-y-3">
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
              label="Vigencia (dias)"
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
        description="Se aplica solo mientras el plan este vigente."
      >
        <div className="space-y-3">
            <Select
              id="btype"
              label="Tipo"
              value={benefit.type}
              onChange={(e) =>
                setBenefit((c) => ({
                  ...c,
                  type: e.target.value as 'DISCOUNT_PERCENT' | 'FREE_DELIVERY',
                }))
              }
            >
              <SelectOption value="DISCOUNT_PERCENT">Descuento en cada pedido</SelectOption>
              <SelectOption value="FREE_DELIVERY">Delivery gratis</SelectOption>
            </Select>

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
