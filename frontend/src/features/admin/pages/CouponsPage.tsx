import { useCallback, useEffect, useState } from 'react';
import { Plus, Ticket } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Select, SelectOption } from '@components/ui/Select';
import { Modal } from '@components/ui/Modal';
import { Table, Tbody, Td, Th, Thead, Tr } from '@components/ui/Table';
import { PageLoader } from '@components/common/PageLoader';
import { PageHeader } from '@components/common/PageHeader';
import { getApiErrorMessage } from '@services/api/client';
import { formatCurrency, formatDate } from '@lib/format';
import { cn } from '@lib/cn';
import { commercialApi, type AdminCoupon } from '../services/commercialAdmin.service';

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
  usageLimitPerUser: '1',
};

/** Cupones (RN-010, RN-011). Apagar uno no borra los canjes ya hechos. */
const CouponsPage = () => {
  const [coupons, setCoupons] = useState<AdminCoupon[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setCoupons(await commercialApi.coupons());
    } catch (error) {
      toast.error(getApiErrorMessage(error));
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

    setIsSaving(true);
    try {
      await commercialApi.createCoupon({
        code: form.code,
        description: form.description,
        discountType: form.discountType,
        value: Number(form.value),
        minOrderAmount: Number(form.minOrderAmount),
        maxDiscountAmount: form.maxDiscountAmount ? Number(form.maxDiscountAmount) : null,
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

  const handleToggle = async (coupon: AdminCoupon) => {
    try {
      await commercialApi.toggleCoupon(coupon.id, !coupon.isActive);
      toast.success(coupon.isActive ? 'Cupon apagado' : 'Cupon activado');
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
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

      <Table className="min-w-[720px]">
          <Thead>
            <Tr>
              <Th>Codigo</Th>
              <Th>Descuento</Th>
              <Th align="right">Minimo</Th>
              <Th align="center">Usos</Th>
              <Th>Vence</Th>
              <Th>Estado</Th>
              <Th />
            </Tr>
          </Thead>

          <Tbody>
            {coupons.map((coupon) => (
              <Tr key={coupon.id}>
                <Td>
                  <p className="font-mono font-medium text-ink">{coupon.code}</p>
                  <p className="text-xs text-ink-muted">{coupon.description}</p>
                </Td>
                <Td className="font-medium text-brand-700">{describe(coupon)}</Td>
                <Td align="right" className="text-ink-muted">
                  {formatCurrency(coupon.minOrderAmount)}
                </Td>
                <Td align="center" className="text-ink-muted">
                  {coupon.usedCount}
                  {coupon.usageLimit ? ` / ${coupon.usageLimit}` : ''}
                  <span className="block text-xs">max {coupon.usageLimitPerUser} por cliente</span>
                </Td>
                <Td className="text-xs text-ink-muted">
                  {coupon.validUntil ? formatDate(coupon.validUntil) : 'Sin vencimiento'}
                </Td>
                <Td>
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-xs font-medium',
                      coupon.isActive
                        ? 'bg-brand-50 text-brand-700'
                        : 'bg-surface-muted text-ink-muted',
                    )}
                  >
                    {coupon.isActive ? 'Activo' : 'Apagado'}
                  </span>
                </Td>
                <Td align="right">
                  <Button size="sm" variant="ghost" onClick={() => handleToggle(coupon)}>
                    {coupon.isActive ? 'Apagar' : 'Activar'}
                  </Button>
                </Td>
              </Tr>
            ))}
          </Tbody>
      </Table>

      <Modal
        isOpen={isCreating}
        onClose={() => setIsCreating(false)}
        title="Nuevo cupon"
        description="El codigo se guarda en mayusculas."
      >
        <div className="space-y-3">
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

          <Input
            label="Usos por cliente"
            type="number"
            min="1"
            value={form.usageLimitPerUser}
            onChange={(e) => setForm((c) => ({ ...c, usageLimitPerUser: e.target.value }))}
          />

          <Button className="w-full" isLoading={isSaving} onClick={handleCreate}>
            Crear cupon
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default CouponsPage;
