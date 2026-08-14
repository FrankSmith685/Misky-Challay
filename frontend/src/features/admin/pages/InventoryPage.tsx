import { useCallback, useEffect, useState } from 'react';
import { Check, Package, PackagePlus, Plus, RefreshCw, Search, TriangleAlert } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Badge } from '@components/ui/Badge';
import { Card } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { useConfirm } from '@components/ui/ConfirmDialog';
import { PageLoader } from '@components/common/PageLoader';
import { PageHeader } from '@components/common/PageHeader';
import { LoadError } from '@components/common/LoadError';
import { Modal } from '@components/ui/Modal';
import { Input } from '@components/ui/Input';
import { Select, SelectOption } from '@components/ui/Select';
import { Table, Tbody, Td, Th, Thead, Tr } from '@components/ui/Table';
import { api, getApiErrorMessage } from '@services/api/client';
import { usePermissions } from '@hooks/usePermissions';
import { PERM } from '@constants/permissions';
import { formatRelative } from '@lib/format';
import { cn } from '@lib/cn';
import type { ApiSuccess } from '@/types/api';
import { adminApi } from '../services/admin.service';
import { usePolling } from '../hooks/usePolling';
import { useActiveBranch } from '../hooks/useActiveBranch';
import { BranchSelector } from '../components/BranchSelector';
import { OperationsMetricStrip } from '../components/OperationsMetricStrip';
import type { StockRow } from '../types';

type MovementType = 'PURCHASE' | 'WASTE' | 'ADJUSTMENT';

const MOVEMENTS: Array<{ value: MovementType; label: string; hint: string }> = [
  { value: 'PURCHASE', label: 'Entrada (compra)', hint: 'Suma lo que acaba de llegar del proveedor.' },
  { value: 'WASTE', label: 'Merma', hint: 'Resta lo que se tiro o se echo a perder.' },
  { value: 'ADJUSTMENT', label: 'Ajuste por conteo', hint: 'Cuadra el sistema con lo que hay de verdad en la camara.' },
];

const EMPTY_ITEM = {
  code: '', name: '', unit: 'g', unitCost: '', minLevel: '', initialStock: '',
};

/** Insumo del maestro tal y como lo ve esta cocina. */
interface MasterItem {
  inventoryItemId: number;
  code: string;
  name: string;
  unit: string;
  minLevel: number;
  isEnabledInBranch: boolean;
}

const inventoryCatalogApi = {
  async list(branchId: number): Promise<MasterItem[]> {
    const { data } = await api.get<ApiSuccess<MasterItem[]>>('/operations/inventory/items', {
      params: { branchId },
    });
    return data.data;
  },

  async enable(input: {
    branchId: number;
    inventoryItemId: number;
    initialStock: number;
  }): Promise<string> {
    const { data } = await api.post<ApiSuccess<unknown>>('/operations/inventory/items/enable', input);
    return data.message;
  },
};

/** Cantidades con dos decimales como mucho: "120" y no "120.00", "95.5" y no "95.50". */
const formatQuantity = (value: number): string => String(Math.round(value * 100) / 100);

const STOCK_STATUS = {
  OUT: { label: 'Agotado', badge: 'danger' as const, bar: 'bg-red-600' },
  CRITICAL: { label: 'Crítico', badge: 'danger' as const, bar: 'bg-red-500' },
  LOW: { label: 'Stock bajo', badge: 'warning' as const, bar: 'bg-amber-500' },
  HEALTHY: { label: 'Saludable', badge: 'success' as const, bar: 'bg-brand-500' },
};

/**
 * Inventario por sucursal.
 * Si un insumo llega a cero, las opciones del constructor que lo usan se marcan
 * agotadas solas y dejan de ofrecerse (RN-005 + RN-016).
 */
const InventoryPage = () => {
  const [selected, setSelected] = useState<StockRow | null>(null);
  const [type, setType] = useState<MovementType>('PURCHASE');
  /** Cantidad del movimiento; con "Ajuste por conteo" es el stock real contado. */
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [stockQuery, setStockQuery] = useState('');
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newItem, setNewItem] = useState(EMPTY_ITEM);
  const [enableOpen, setEnableOpen] = useState(false);
  const [masterItems, setMasterItems] = useState<MasterItem[] | null>(null);
  const [masterError, setMasterError] = useState<string | null>(null);
  const [enablingId, setEnablingId] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const {
    branchId, branches, setBranchId, isLoadingBranches, branchesError, reloadBranches,
  } = useActiveBranch();
  const { can } = usePermissions();
  const confirm = useConfirm();

  const canManage = can(PERM.INVENTORY_MANAGE);

  const fetcher = useCallback(
    (signal: AbortSignal): Promise<StockRow[]> =>
      branchId ? adminApi.stock(branchId, signal) : Promise.resolve([]),
    [branchId],
  );
  const { data, error, isLoading, lastSuccessAt, isStale, refresh } = usePolling<StockRow[]>(fetcher, 15000);

  useEffect(() => {
    if (!error) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [error]);

  const loadMasterItems = useCallback(async () => {
    if (!branchId) return;
    setMasterError(null);
    try {
      setMasterItems(await inventoryCatalogApi.list(branchId));
    } catch (loadError) {
      setMasterItems(null);
      setMasterError(getApiErrorMessage(loadError));
    }
  }, [branchId]);

  const closeModal = () => {
    setSelected(null);
    setAmount('');
    setReason('');
    setType('PURCHASE');
  };

  const handleSave = async () => {
    if (!selected || !branchId) return;

    const typed = Number(amount);
    if (amount.trim() === '' || Number.isNaN(typed)) {
      toast.error('Ingresa una cantidad valida');
      return;
    }

    /**
     * El AJUSTE viaja con signo y se calcula contra lo que hay en el sistema: el
     * operario cuenta 95 g donde el sistema dice 120 y manda -25. Antes solo se
     * podia sumar, asi que un conteo a la baja no tenia forma correcta de
     * registrarse y acababa anotado como merma.
     */
    const quantity = type === 'ADJUSTMENT' ? Math.round((typed - selected.onHand) * 100) / 100 : typed;

    if (type === 'ADJUSTMENT') {
      if (typed < 0) {
        toast.error('El stock contado no puede ser negativo');
        return;
      }
      if (quantity === 0) {
        toast.error('El conteo coincide con el sistema: no hay nada que ajustar');
        return;
      }
      if (typed < selected.reserved) {
        toast.error(`Hay ${formatQuantity(selected.reserved)} ${selected.unit} reservados para pedidos ya pagados: no puedes bajar de ahi`);
        return;
      }
    } else if (quantity <= 0) {
      toast.error('Ingresa una cantidad mayor que cero');
      return;
    }

    if (reason.trim().length < 3) {
      toast.error('Explica el motivo del movimiento');
      return;
    }

    // Efecto real sobre el saldo: la merma viaja en positivo pero resta.
    const effect = type === 'WASTE' ? -quantity : quantity;

    // Solo lo que RESTA stock pide confirmacion: el libro de movimientos es
    // inmutable y deshacerlo obliga a registrar otro movimiento encima.
    if (effect < 0) {
      const { confirmed } = await confirm({
        title: `Bajar el stock de ${selected.name}`,
        message: `Vas a dejar ${formatQuantity(selected.onHand + effect)} ${selected.unit} donde el sistema tenia ${formatQuantity(selected.onHand)} ${selected.unit}. El movimiento queda registrado y no se puede borrar.`,
        confirmLabel: 'Registrar movimiento',
        tone: 'danger',
      });
      if (!confirmed) return;
    }

    setIsSaving(true);
    try {
      await adminApi.adjustStock({
        branchId,
        inventoryItemId: selected.inventoryItemId,
        type,
        quantity,
        reason: reason.trim(),
      });
      toast.success('Inventario actualizado');
      closeModal();
      refresh();
    } catch (saveError) {
      toast.error(getApiErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  };

  const handleEnable = async (item: MasterItem) => {
    if (!branchId) return;

    setEnablingId(item.inventoryItemId);
    try {
      const message = await inventoryCatalogApi.enable({
        branchId,
        inventoryItemId: item.inventoryItemId,
        initialStock: 0,
      });
      toast.success(message);
      await loadMasterItems();
      refresh();
    } catch (enableError) {
      toast.error(getApiErrorMessage(enableError));
    } finally {
      setEnablingId(null);
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
      refresh();
    } catch (createError) {
      toast.error(getApiErrorMessage(createError));
    } finally {
      setIsSaving(false);
    }
  };

  if ((isLoading && !data) || isLoadingBranches) return <PageLoader />;

  const stock = data ?? [];
  const lowStock = stock.filter((row) => row.isLow);
  const outOfStock = stock.filter((row) => row.stockStatus === 'OUT');
  const criticalStock = stock.filter((row) => row.stockStatus === 'CRITICAL');
  const healthyStock = stock.filter((row) => row.stockStatus === 'HEALTHY');
  const normalizedStockQuery = stockQuery.trim().toLocaleLowerCase('es');
  const visibleStock = stock.filter((row) =>
    (!normalizedStockQuery || row.name.toLocaleLowerCase('es').includes(normalizedStockQuery))
    && (!onlyLowStock || row.isLow),
  );

  const freshnessLabel = (() => {
    if (lastSuccessAt === null) return 'todavia sin datos de esta cocina';
    const seconds = Math.max(0, Math.round((now - lastSuccessAt) / 1000));
    return seconds < 90
      ? `datos de hace ${seconds} s`
      : `datos de ${formatRelative(new Date(lastSuccessAt))}`;
  })();

  const counted = Number(amount);
  const adjustmentPreview =
    selected && type === 'ADJUSTMENT' && amount.trim() !== '' && !Number.isNaN(counted)
      ? { from: selected.onHand, to: counted, delta: Math.round((counted - selected.onHand) * 100) / 100 }
      : null;

  return (
    <div>
      <PageHeader
        eyebrow="Control de stock"
        title="Inventario"
        description="Disponible = en stock − reservado. Cada insumo y movimiento queda gestionado por cocina."
        icon={Package}
        action={<>
          <BranchSelector value={branchId} branches={branches} onChange={setBranchId} hasError={Boolean(branchesError)} />
          {canManage && (
            <>
              <Button
                variant="outline"
                disabled={!branchId}
                leftIcon={<PackagePlus className="size-4" />}
                onClick={() => {
                  setEnableOpen(true);
                  void loadMasterItems();
                }}
              >
                Habilitar insumo existente
              </Button>
              <Button disabled={!branchId} leftIcon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>
                Nuevo insumo
              </Button>
            </>
          )}
        </>}
      />

      {/* Punto de estado: el sondeo cae en silencio y la tabla se queda con datos
          viejos que parecen recien traidos. */}
      {error && (
        <p
          role="status"
          className={cn(
            'mb-4 flex flex-wrap items-center gap-2 text-sm font-medium',
            isStale ? 'text-red-700' : 'text-accent-700',
          )}
        >
          <span
            className={cn('size-2 shrink-0 rounded-pill', isStale ? 'bg-red-600' : 'bg-accent-500')}
            aria-hidden="true"
          />
          Sin conexion con el servidor · {freshnessLabel}.
          <Button size="sm" variant="ghost" leftIcon={<RefreshCw className="size-4" />} onClick={refresh}>
            Reintentar
          </Button>
        </p>
      )}

      <OperationsMetricStrip
        className="mt-5"
        ariaLabel="Estado general del inventario"
        metrics={[
          { label: 'Insumos', value: stock.length, icon: Package },
          { label: 'Agotados', value: outOfStock.length, icon: TriangleAlert, tone: outOfStock.length ? 'danger' : 'brand' },
          { label: 'Críticos', value: criticalStock.length, icon: TriangleAlert, tone: criticalStock.length ? 'accent' : 'brand' },
          { label: 'Saludables', value: healthyStock.length, icon: Check, tone: 'brand' },
        ]}
      />

      <div className="mt-5 flex flex-col gap-3 rounded-card border border-line bg-white p-3 shadow-e1 sm:flex-row sm:items-center">
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-field border border-line px-3">
          <Search className="size-4 shrink-0 text-ink-muted" />
          <span className="sr-only">Buscar insumo</span>
          <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={stockQuery} onChange={(event) => setStockQuery(event.target.value)} placeholder="Buscar insumo" />
        </label>
        <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-field border border-line px-3 text-sm font-medium text-ink">
          <input type="checkbox" checked={onlyLowStock} onChange={(event) => setOnlyLowStock(event.target.checked)} className="size-4 accent-brand-600" /> Solo stock bajo
        </label>
        <span className="text-xs text-ink-muted sm:px-2">{visibleStock.length} de {stock.length}</span>
      </div>

      {lowStock.length > 0 && (
        <Card className="mt-3 border-red-200 bg-red-50/70 p-4">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-card bg-red-100 text-red-700"><TriangleAlert className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-red-900">Reposición necesaria en {lowStock.length} insumo{lowStock.length === 1 ? '' : 's'}</p>
              <p className="mt-1 text-sm leading-relaxed text-red-800">
                {outOfStock.length > 0 ? `${outOfStock.map((row) => row.name).join(', ')} ya no se pueden vender. ` : ''}
                La prioridad considera disponible, reservas y consumo de los últimos 7 días.
              </p>
              {canManage && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {lowStock.slice(0, 5).map((row) => (
                    <Button
                      key={row.inventoryItemId}
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelected(row);
                        setType('PURCHASE');
                        setAmount(formatQuantity(row.suggestedPurchase));
                        setReason(`Reposición de ${row.name}`);
                      }}
                    >
                      Reponer {row.name} · {formatQuantity(row.suggestedPurchase)} {row.unit}
                    </Button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </Card>
      )}

      {/* El fallo se ramifica ANTES de mirar la longitud de la lista: una tabla
          vacia con "no hay insumos" es una respuesta que nadie dio. */}
      {branchesError ? (
        <LoadError
          title="No pudimos cargar las cocinas"
          message={branchesError}
          onRetry={() => void reloadBranches()}
          className="mt-5"
        />
      ) : error && !data ? (
        <LoadError
          title="No pudimos cargar el inventario"
          message={error}
          onRetry={refresh}
          className="mt-5"
        />
      ) : (
      <div className="mt-5">
        <div className="hidden md:block">
        <Table className="min-w-[640px]" caption="Stock por insumo de la cocina seleccionada">
          <Thead>
            <Tr>
              <Th>Insumo</Th>
              <Th align="right">En stock</Th>
              <Th align="right">Reservado</Th>
              <Th align="right">Disponible</Th>
              <Th>Estado y cobertura</Th>
              {canManage && <Th><span className="sr-only">Acciones</span></Th>}
            </Tr>
          </Thead>

          <Tbody>
            {visibleStock.map((row) => (
              <Tr
                key={row.inventoryItemId}
                className={cn(
                  row.stockStatus === 'OUT' && 'bg-red-50',
                  row.stockStatus === 'CRITICAL' && 'bg-red-50/60',
                  row.stockStatus === 'LOW' && 'bg-amber-50/50',
                )}
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
                <Td>
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant={STOCK_STATUS[row.stockStatus].badge}>{STOCK_STATUS[row.stockStatus].label}</Badge>
                    <span className="text-[11px] text-ink-muted">
                      {row.daysRemaining === null ? 'Sin consumo reciente' : `≈ ${formatQuantity(row.daysRemaining)} días`}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-pill bg-surface-muted">
                    <div
                      className={cn('h-full rounded-pill', STOCK_STATUS[row.stockStatus].bar)}
                      style={{ width: `${Math.min(100, row.targetLevel > 0 ? Math.max(3, (Math.max(0, row.available) / row.targetLevel) * 100) : 100)}%` }}
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-ink-muted">Mín. {formatQuantity(row.minLevel)} · objetivo {formatQuantity(row.targetLevel)} {row.unit}</p>
                </Td>
                {canManage && (
                  <Td align="right">
                    <Button size="sm" variant={row.isLow ? 'primary' : 'outline'} onClick={() => {
                      setSelected(row);
                      if (row.isLow) {
                        setType('PURCHASE');
                        setAmount(formatQuantity(row.suggestedPurchase));
                        setReason(`Reposición de ${row.name}`);
                      }
                    }}>
                      {row.isLow ? 'Reponer' : 'Mover'}
                    </Button>
                  </Td>
                )}
              </Tr>
            ))}
            {visibleStock.length === 0 && (
              <Tr>
                {/* El colSpan sigue a la columna de acciones: sin esto, al ocultarla
                    la fila vacia desbordaba la tabla. */}
                <Td colSpan={canManage ? 6 : 5} align="center" className="py-10 text-ink-muted">
                  {stock.length === 0 && canManage
                    ? 'No hay insumos en esta cocina. Crea el primero o habilita uno que ya exista en otra.'
                    : stock.length === 0 ? 'No hay insumos en esta cocina.' : 'No hay insumos que coincidan con los filtros.'}
                </Td>
              </Tr>
            )}
          </Tbody>
        </Table>
        </div>

        <div className="grid gap-3 md:hidden" aria-label="Stock por insumo de la cocina seleccionada">
          {visibleStock.map((row) => (
            <Card key={row.inventoryItemId} className={cn('p-4', row.isLow && 'border-red-200 bg-red-50/45')}>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-ink">{row.name}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">Unidad de control: {row.unit}</p>
                </div>
                <Badge variant={STOCK_STATUS[row.stockStatus].badge}>{STOCK_STATUS[row.stockStatus].label}</Badge>
              </div>

              <div className="mt-4 grid grid-cols-3 divide-x divide-line rounded-card border border-line bg-white py-3 text-center">
                <div className="px-2"><p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">En stock</p><p className="mt-1 font-extrabold text-ink">{row.onHand}</p></div>
                <div className="px-2"><p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">Reservado</p><p className="mt-1 font-extrabold text-ink">{row.reserved}</p></div>
                <div className="px-2"><p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">Disponible</p><p className={cn('mt-1 font-extrabold', row.isLow ? 'text-red-600' : 'text-brand-700')}>{row.available}</p></div>
              </div>

              <div className="mt-3 rounded-card bg-surface-muted p-3">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-ink-muted">Cobertura estimada</span>
                  <b className={row.stockStatus === 'HEALTHY' ? 'text-brand-700' : 'text-red-700'}>{row.daysRemaining === null ? 'Sin consumo reciente' : `≈ ${formatQuantity(row.daysRemaining)} días`}</b>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-pill bg-white">
                  <div className={cn('h-full rounded-pill', STOCK_STATUS[row.stockStatus].bar)} style={{ width: `${Math.min(100, row.targetLevel > 0 ? Math.max(3, (Math.max(0, row.available) / row.targetLevel) * 100) : 100)}%` }} />
                </div>
                <p className="mt-2 text-[11px] text-ink-muted">Mínimo {formatQuantity(row.minLevel)} · objetivo {formatQuantity(row.targetLevel)} {row.unit}</p>
              </div>
              {row.impactedOptions.length > 0 && <p className="mt-2 text-xs leading-relaxed text-ink-muted"><b className="text-ink">Impacta:</b> {row.impactedOptions.join(', ')}</p>}
              {row.isLow && row.suggestedSubstitutes.length > 0 && <p className="mt-2 text-xs font-semibold leading-relaxed text-brand-700">Alternativas: {row.suggestedSubstitutes.join(', ')}</p>}
              {row.isLow && <p className="mt-3 rounded-field bg-red-100 px-3 py-2 text-xs font-bold text-red-800">Compra sugerida: {formatQuantity(row.suggestedPurchase)} {row.unit}</p>}
              {canManage && <Button className="mt-4 w-full" size="sm" variant={row.isLow ? 'primary' : 'outline'} onClick={() => { setSelected(row); if (row.isLow) { setType('PURCHASE'); setAmount(formatQuantity(row.suggestedPurchase)); setReason(`Reposición de ${row.name}`); } }}><PackagePlus className="size-4" /> {row.isLow ? 'Registrar reposición' : 'Registrar movimiento'}</Button>}
            </Card>
          ))}
          {visibleStock.length === 0 && <Card className="border-dashed p-8 text-center text-sm text-ink-muted">{stock.length === 0 ? (canManage ? 'No hay insumos en esta cocina. Crea el primero o habilita uno existente.' : 'No hay insumos en esta cocina.') : 'No hay insumos que coincidan con los filtros.'}</Card>}
        </div>
      </div>
      )}

      <Modal
        isOpen={selected !== null}
        onClose={closeModal}
        title={`Movimiento de ${selected?.name ?? ''}`}
        description="Todo movimiento queda registrado en el libro de inventario."
        icon={RefreshCw}
        eyebrow="Control de existencias"
        tone={selected?.isLow ? 'danger' : 'brand'}
        headerAside={selected && (
          <div className="flex items-center gap-3 rounded-card border border-white/70 bg-white/75 px-3 py-2 shadow-e1 backdrop-blur-sm">
            <div className="text-right">
              <p className="text-[10px] font-bold uppercase tracking-[.08em] text-ink-muted">Disponible ahora</p>
              <p className={cn('text-lg font-black leading-tight', selected.isLow ? 'text-red-700' : 'text-brand-800')}>
                {formatQuantity(selected.available)} <span className="text-xs font-bold">{selected.unit}</span>
              </p>
            </div>
            <Badge variant={STOCK_STATUS[selected.stockStatus].badge}>{STOCK_STATUS[selected.stockStatus].label}</Badge>
          </div>
        )}
        actions={
          <>
            <Button variant="outline" disabled={isSaving} onClick={closeModal}>Cancelar</Button>
            <Button isLoading={isSaving} onClick={() => void handleSave()}>Registrar movimiento</Button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="grid grid-cols-3 divide-x divide-line rounded-card border border-line bg-surface-muted/55 py-3 text-center">
            <div className="px-2"><p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">Stock</p><b className="mt-1 block text-sm text-ink">{formatQuantity(selected?.onHand ?? 0)}</b></div>
            <div className="px-2"><p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">Reservado</p><b className="mt-1 block text-sm text-ink">{formatQuantity(selected?.reserved ?? 0)}</b></div>
            <div className="px-2"><p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">Mínimo</p><b className="mt-1 block text-sm text-ink">{formatQuantity(selected?.minLevel ?? 0)}</b></div>
          </div>
            <Select
              id="type"
              label="Tipo"
              value={type}
              hint={MOVEMENTS.find((movement) => movement.value === type)?.hint}
              onChange={(event) => {
                setType(event.target.value as MovementType);
                // La cifra cambia de significado (cantidad vs. stock contado):
                // arrastrarla seria pedir un error de inventario.
                setAmount('');
              }}
            >
              {MOVEMENTS.map((movement) => (
                <SelectOption key={movement.value} value={movement.value}>
                  {movement.label}
                </SelectOption>
              ))}
            </Select>

          {type === 'ADJUSTMENT' ? (
            <div className="grid gap-2">
              <Input
                label={`Stock real contado (${selected?.unit ?? ''})`}
                type="number"
                min="0"
                step="any"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder={selected ? formatQuantity(selected.onHand) : '0'}
                hint="Escribe lo que hay de verdad en la camara, no la diferencia."
              />

              {adjustmentPreview && adjustmentPreview.delta !== 0 && (
                <p className={cn(
                  'rounded-card border px-3 py-2 text-sm font-medium',
                  adjustmentPreview.delta < 0
                    ? 'border-red-200 bg-red-50 text-red-700'
                    : 'border-brand-200 bg-brand-50 text-brand-800',
                )}>
                  {formatQuantity(adjustmentPreview.from)} {selected?.unit} → {formatQuantity(adjustmentPreview.to)} {selected?.unit}
                  {' '}({adjustmentPreview.delta > 0 ? '+' : '−'}{formatQuantity(Math.abs(adjustmentPreview.delta))} {selected?.unit})
                </p>
              )}
            </div>
          ) : (
            <Input
              label={`Cantidad (${selected?.unit ?? ''})`}
              type="number"
              min="0"
              step="any"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="500"
            />
          )}

          <Input
            label="Motivo"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder={type === 'ADJUSTMENT' ? 'Conteo fisico del cierre' : 'Reposicion del proveedor'}
          />

        </div>
      </Modal>

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nuevo insumo"
        description="Se crea en el maestro y queda habilitado en el inventario de esta cocina."
        icon={PackagePlus}
        eyebrow="Maestro de inventario"
        disableBackdropClose
        actions={
          <>
            <Button variant="outline" disabled={isSaving} onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button isLoading={isSaving} onClick={() => void handleCreate()}>Crear insumo</Button>
          </>
        }
      >
        <div className="grid gap-5">
          <div className="flex items-start gap-3 rounded-card border border-brand-100 bg-brand-50/60 p-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-field bg-white text-brand-700 shadow-e1"><Package className="size-5" /></span>
            <div><p className="text-sm font-bold text-ink">Identifica el insumo como lo llama tu cocina</p><p className="mt-1 text-xs leading-5 text-ink-muted">El código evita duplicados; el mínimo activa la alerta roja antes de que el producto se agote.</p></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Código interno" placeholder="SALMON_FRESCO" hint="Mayúsculas y guiones bajos, sin espacios." value={newItem.code} onChange={(event) => setNewItem((item) => ({ ...item, code: event.target.value.toUpperCase() }))} />
            <Input label="Nombre visible" placeholder="Salmón fresco" value={newItem.name} onChange={(event) => setNewItem((item) => ({ ...item, name: event.target.value }))} />
            <Input label="Unidad de control" placeholder="g, ml, und" value={newItem.unit} onChange={(event) => setNewItem((item) => ({ ...item, unit: event.target.value }))} />
            <Input label="Costo por unidad" type="number" min="0" step="0.01" value={newItem.unitCost} onChange={(event) => setNewItem((item) => ({ ...item, unitCost: event.target.value }))} />
            <Input label="Stock mínimo" type="number" min="0" value={newItem.minLevel} onChange={(event) => setNewItem((item) => ({ ...item, minLevel: event.target.value }))} hint="Al llegar aquí aparecerá como stock bajo." />
            <Input label="Stock inicial" type="number" min="0" value={newItem.initialStock} onChange={(event) => setNewItem((item) => ({ ...item, initialStock: event.target.value }))} hint="Lo que existe físicamente en esta cocina." />
          </div>
        </div>
      </Modal>

      {/*
        El insumo es unico para todo el negocio y el stock es por cocina: sin esta
        lista, habilitar en Miraflores algo que dio de alta San Isidro era imposible
        (el codigo ya existe y "Nuevo insumo" respondia conflicto).
      */}
      <Modal
        isOpen={enableOpen}
        onClose={() => setEnableOpen(false)}
        title="Habilitar insumo existente"
        description="Insumos ya creados en el negocio. Al habilitarlos aparecen en esta cocina con saldo 0, listos para su primer conteo."
        icon={PackagePlus}
        eyebrow="Disponibilidad por local"
      >
        {masterError ? (
          <LoadError
            title="No pudimos cargar el maestro de insumos"
            message={masterError}
            onRetry={() => void loadMasterItems()}
          />
        ) : masterItems === null ? (
          <p className="py-6 text-center text-sm text-ink-muted">Cargando insumos…</p>
        ) : masterItems.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">
            Todavia no hay insumos creados en el negocio.
          </p>
        ) : (
          <ul className="grid gap-2">
            {masterItems.map((item) => (
              <li
                key={item.inventoryItemId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line px-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">{item.name}</p>
                  <p className="text-xs text-ink-muted">{item.code} · {item.unit}</p>
                </div>

                {item.isEnabledInBranch ? (
                  <Badge variant="success" className="shrink-0">
                    <Check className="size-3" /> Ya en esta cocina
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    isLoading={enablingId === item.inventoryItemId}
                    onClick={() => void handleEnable(item)}
                  >
                    Habilitar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
};

export default InventoryPage;
