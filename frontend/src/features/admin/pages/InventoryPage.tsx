import { useCallback, useState } from 'react';
import { Package, Plus, TriangleAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { PageLoader } from '@components/common/PageLoader';
import { PageHeader } from '@components/common/PageHeader';
import { Modal } from '@components/ui/Modal';
import { Input } from '@components/ui/Input';
import { Select, SelectOption } from '@components/ui/Select';
import { Table, Tbody, Td, Th, Thead, Tr } from '@components/ui/Table';
import { getApiErrorMessage } from '@services/api/client';
import { cn } from '@lib/cn';
import { adminApi } from '../services/admin.service';
import { usePolling } from '../hooks/usePolling';
import { useActiveBranch } from '../hooks/useActiveBranch';
import { BranchSelector } from '../components/BranchSelector';
import type { StockRow } from '../types';

type MovementType = 'PURCHASE' | 'WASTE' | 'ADJUSTMENT';

const MOVEMENTS: Array<{ value: MovementType; label: string }> = [
  { value: 'PURCHASE', label: 'Entrada (compra)' },
  { value: 'WASTE', label: 'Merma' },
  { value: 'ADJUSTMENT', label: 'Ajuste' },
];

const EMPTY_ITEM = {
  code: '', name: '', unit: 'g', unitCost: '', minLevel: '', initialStock: '',
};

/**
 * Inventario por sucursal.
 * Si un insumo llega a cero, las opciones del constructor que lo usan se marcan
 * agotadas solas y dejan de ofrecerse (RN-005 + RN-016).
 */
const InventoryPage = () => {
  const [selected, setSelected] = useState<StockRow | null>(null);
  const [type, setType] = useState<MovementType>('PURCHASE');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newItem, setNewItem] = useState(EMPTY_ITEM);
  const { branchId, branches, setBranchId, isLoadingBranches } = useActiveBranch();

  const fetcher = useCallback(
    () => (branchId ? adminApi.stock(branchId) : Promise.resolve([])),
    [branchId],
  );
  const { data, isLoading, refresh } = usePolling<StockRow[]>(fetcher, 15000);

  const closeModal = () => {
    setSelected(null);
    setQuantity('');
    setReason('');
    setType('PURCHASE');
  };

  const handleSave = async () => {
    if (!selected || !branchId) return;

    const amount = Number(quantity);
    if (!amount || amount <= 0) {
      toast.error('Ingresa una cantidad valida');
      return;
    }
    if (reason.trim().length < 3) {
      toast.error('Explica el motivo del movimiento');
      return;
    }

    setIsSaving(true);
    try {
      await adminApi.adjustStock({
        branchId,
        inventoryItemId: selected.inventoryItemId,
        type,
        quantity: amount,
        reason: reason.trim(),
      });
      toast.success('Inventario actualizado');
      closeModal();
      await refresh();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreate = async () => {
    if (!branchId) {
      toast.error('Primero crea o selecciona una cocina');
      return;
    }
    if (newItem.code.trim().length < 2 || newItem.name.trim().length < 2) {
      toast.error('Completa el codigo y nombre del insumo');
      return;
    }

    setIsSaving(true);
    try {
      await adminApi.createInventoryItem({
        branchId,
        code: newItem.code.trim(),
        name: newItem.name.trim(),
        unit: newItem.unit.trim(),
        unitCost: Number(newItem.unitCost || 0),
        minLevel: Number(newItem.minLevel || 0),
        initialStock: Number(newItem.initialStock || 0),
      });
      toast.success('Insumo creado y habilitado en la cocina');
      setCreateOpen(false);
      setNewItem(EMPTY_ITEM);
      await refresh();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  if ((isLoading && !data) || isLoadingBranches) return <PageLoader />;

  const stock = data ?? [];
  const lowStock = stock.filter((row) => row.isLow);

  return (
    <div>
      <PageHeader
        eyebrow="Control de stock"
        title="Inventario"
        description="Disponible = en stock − reservado. Cada insumo y movimiento queda gestionado por cocina."
        icon={Package}
        action={<>
          <BranchSelector value={branchId} branches={branches} onChange={setBranchId} />
          <Button disabled={!branchId} leftIcon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
            Nuevo insumo
          </Button>
        </>}
      />

      {lowStock.length > 0 && (
        <Card className="flex items-start gap-2 border-accent-400/40 bg-accent-400/5">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-accent-500" />
          <p className="text-sm text-ink-muted">
            <strong className="text-ink">{lowStock.length} insumos bajo el minimo:</strong>{' '}
            {lowStock.map((row) => row.name).join(', ')}
          </p>
        </Card>
      )}

      <div className="mt-5">
        <Table className="min-w-[640px]">
          <Thead>
            <Tr>
              <Th>Insumo</Th>
              <Th align="right">En stock</Th>
              <Th align="right">Reservado</Th>
              <Th align="right">Disponible</Th>
              <Th align="right">Minimo</Th>
              <Th />
            </Tr>
          </Thead>

          <Tbody>
            {stock.map((row) => (
              <Tr
                key={row.inventoryItemId}
                className={cn(row.isLow && 'bg-red-50')}
              >
                <Td>
                  <p className="font-medium text-ink">{row.name}</p>
                  {row.impactedOptions.length > 0 && <p className="mt-0.5 max-w-56 text-[11px] text-ink-muted">Impacta: {row.impactedOptions.join(', ')}</p>}
                  {row.isLow && row.suggestedSubstitutes.length > 0 && <p className="mt-1 max-w-56 text-[11px] font-semibold text-brand-700">Alternativas: {row.suggestedSubstitutes.join(', ')}</p>}
                </Td>
                <Td align="right" className="text-ink-muted">
                  {row.onHand} {row.unit}
                </Td>
                <Td align="right" className="text-ink-muted">{row.reserved}</Td>
                <Td
                  align="right"
                  className={cn(
                    'font-semibold',
                    row.isLow ? 'text-red-600' : 'text-ink',
                  )}
                >
                  {row.available}
                </Td>
                <Td align="right" className="text-xs text-ink-muted">{row.minLevel}</Td>
                <Td align="right">
                  <Button size="sm" variant="outline" onClick={() => setSelected(row)}>
                    Mover
                  </Button>
                </Td>
              </Tr>
            ))}
            {stock.length === 0 && (
              <Tr>
                <Td colSpan={6} align="center" className="py-10 text-ink-muted">
                  No hay insumos en esta cocina. Crea el primero para empezar a controlar stock.
                </Td>
              </Tr>
            )}
          </Tbody>
        </Table>
      </div>

      <Modal
        isOpen={selected !== null}
        onClose={closeModal}
        title={`Movimiento de ${selected?.name ?? ''}`}
        description="Todo movimiento queda registrado en el libro de inventario."
      >
        <div className="space-y-4">
            <Select
              id="type"
              label="Tipo"
              value={type}
              onChange={(event) => setType(event.target.value as MovementType)}
            >
              {MOVEMENTS.map((movement) => (
                <SelectOption key={movement.value} value={movement.value}>
                  {movement.label}
                </SelectOption>
              ))}
            </Select>

          <Input
            label={`Cantidad (${selected?.unit ?? ''})`}
            type="number"
            min="0"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            placeholder="500"
          />

          <Input
            label="Motivo"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Reposicion del proveedor"
          />

          <Button className="w-full" isLoading={isSaving} onClick={handleSave}>
            Registrar movimiento
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nuevo insumo"
        description="Se crea en el maestro y queda habilitado en el inventario de esta cocina."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Codigo interno" placeholder="SALMON_FRESCO" value={newItem.code} onChange={(event) => setNewItem((item) => ({ ...item, code: event.target.value.toUpperCase() }))} />
          <Input label="Nombre" placeholder="Salmon fresco" value={newItem.name} onChange={(event) => setNewItem((item) => ({ ...item, name: event.target.value }))} />
          <Input label="Unidad" placeholder="g, ml, und" value={newItem.unit} onChange={(event) => setNewItem((item) => ({ ...item, unit: event.target.value }))} />
          <Input label="Costo por unidad" type="number" min="0" step="0.01" value={newItem.unitCost} onChange={(event) => setNewItem((item) => ({ ...item, unitCost: event.target.value }))} />
          <Input label="Stock minimo" type="number" min="0" value={newItem.minLevel} onChange={(event) => setNewItem((item) => ({ ...item, minLevel: event.target.value }))} />
          <Input label="Stock inicial" type="number" min="0" value={newItem.initialStock} onChange={(event) => setNewItem((item) => ({ ...item, initialStock: event.target.value }))} />
          <Button className="sm:col-span-2" isLoading={isSaving} onClick={handleCreate}>
            Crear insumo
          </Button>
        </div>
      </Modal>
    </div>
  );
};

export default InventoryPage;
