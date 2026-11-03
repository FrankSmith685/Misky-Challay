import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { isAxiosError } from 'axios';
import { Link, useSearchParams } from 'react-router-dom';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { Archive, ArrowDownUp, Check, ClipboardList, History, Info, MoreHorizontal, Package, PackagePlus, Pencil, Plus, RefreshCw, RotateCcw, Search, Trash2, TriangleAlert, Wallet } from 'lucide-react';
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
import { Pagination } from '@components/ui/Pagination';
import { Select, SelectOption } from '@components/ui/Select';
import { Table, Tbody, Td, Th, Thead, Tr } from '@components/ui/Table';
import { api, getApiErrorMessage } from '@services/api/client';
import { usePermissions } from '@hooks/usePermissions';
import { PERM } from '@constants/permissions';
import { ROUTES } from '@constants/routes';
import { formatRelative } from '@lib/format';
import { cn } from '@lib/cn';
import type { ApiSuccess } from '@/types/api';
import { adminApi } from '../services/admin.service';
import { usePolling } from '../hooks/usePolling';
import { useActiveBranch } from '../hooks/useActiveBranch';
import { BranchSelector } from '../components/BranchSelector';
import { MediaPicker } from '../components/MediaPicker';
import type { StockMovementRow, StockRow } from '../types';

type MovementType = 'PURCHASE' | 'WASTE' | 'ADJUSTMENT';

const MOVEMENTS: Array<{ value: MovementType; label: string; hint: string }> = [
  { value: 'PURCHASE', label: 'Entrada manual', hint: 'Suma existencias sin crear una orden de compra ni un lote.' },
  { value: 'WASTE', label: 'Merma', hint: 'Resta existencias dañadas o vencidas.' },
  { value: 'ADJUSTMENT', label: 'Ajuste por conteo', hint: 'Registra la diferencia entre el conteo físico y el sistema.' },
];

type StockFilter = 'FINISHED' | 'INGREDIENTS' | 'ALL' | 'ATTENTION' | 'OUT' | 'HEALTHY' | 'ALLERGENS_PENDING' | 'CAKE_ALLERGENS_PENDING';
type StockSort = 'PRIORITY' | 'NAME' | 'AVAILABLE' | 'VALUE';
const priority: Record<StockRow['stockStatus'], number> = { OUT: 0, CRITICAL: 1, LOW: 2, HEALTHY: 3 };
const movementLabels: Record<StockMovementRow['type'], string> = {
  PURCHASE: 'Entrada', RESERVE: 'Reserva', RELEASE: 'Liberación',
  CONSUME: 'Consumo', WASTE: 'Merma', ADJUSTMENT: 'Ajuste',
};

const EMPTY_ITEM = {
  itemType: 'INGREDIENT' as 'INGREDIENT' | 'FINISHED_PRODUCT',
  name: '', unit: '', imageUrl: '', unitCost: '', minLevel: '', initialStock: '', allergens: null as string[] | null,
};

interface AllergenOption { code: string; name: string }

const AllergenFields = ({ value, options, onChange }: { value: string[] | null; options: AllergenOption[]; onChange: (next: string[] | null) => void }) => (
  <div className="rounded-card border border-line p-4">
    <h3 className="text-sm font-black text-ink">Alérgenos del insumo</h3>
    <p className="mt-1 text-xs leading-5 text-ink-muted">Revisa la ficha del proveedor y registra los alérgenos presentes. Los productos que usan este artículo se actualizan automáticamente.</p>
    <label className="mt-3 flex items-center gap-2 text-sm text-ink">
      <input type="checkbox" checked={value !== null} disabled={options.length === 0} onChange={(event) => onChange(event.target.checked ? [] : null)} />
      Ya revisé este insumo
    </label>
    {options.length === 0 && <p className="mt-2 text-xs text-amber-800">Cargando la lista de alérgenos. Si no aparece, vuelve a abrir esta ficha.</p>}
    {value !== null && <>
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Alérgenos presentes en el insumo">
        {options.map((option) => <button key={option.code} type="button" aria-pressed={value.includes(option.code)} onClick={() => onChange(value.includes(option.code) ? value.filter((code) => code !== option.code) : [...value, option.code])} className={cn('rounded-lg border px-3 py-2 text-xs font-semibold', value.includes(option.code) ? 'border-brand-700 bg-brand-700 text-white' : 'border-line bg-white text-ink-muted hover:border-brand-400')}>
          {option.name}
        </button>)}
      </div>
      <p className="mt-2 text-xs text-ink-muted">{value.length === 0 ? 'Revisado sin alérgenos de esta lista.' : `${value.length} alérgeno(s) presente(s).`} El contacto cruzado se gestiona por separado.</p>
    </>}
    {value === null && <p className="mt-2 text-xs text-amber-800">Pendiente de clasificar. Los productos que lo usan no podrán publicarse.</p>}
  </div>
);

/** La misma unidad se guarda en inventario, compras y recetas; no hay conversión automática. */
const INVENTORY_UNITS = [
  { value: 'g', label: 'g · gramos' },
  { value: 'kg', label: 'kg · kilogramos' },
  { value: 'ml', label: 'ml · mililitros' },
  { value: 'l', label: 'l · litros' },
  { value: 'und', label: 'und · unidades' },
] as const;
const isSuggestedUnit = (value: string): boolean => INVENTORY_UNITS.some((unit) => unit.value === value);
const INVENTORY_PAGE_SIZES = [10, 25, 50] as const;

/** Insumo del maestro tal y como lo ve esta cocina. */
interface MasterItem {
  inventoryItemId: number;
  code: string;
  name: string;
  unit: string;
  minLevel: number;
  imageUrl: string | null;
  isActive: boolean;
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
const purchaseLink = (row: StockRow): string => `${ROUTES.adminProcurement}?item=${row.inventoryItemId}&qty=${row.suggestedPurchase}`;
const validDecimal = (raw: string, places: number, max: number): boolean => {
  const value = Number(raw);
  const factor = 10 ** places;
  return raw.trim() !== '' && Number.isFinite(value) && value >= 0 && value <= max
    && Math.abs(value * factor - Math.round(value * factor)) < 0.000001;
};

type MovementAssessment =
  | { state: 'empty' }
  | { state: 'invalid'; message: string }
  | { state: 'valid'; quantity: number; effect: number; nextOnHand: number; nextAvailable: number };

/** La misma regla alimenta la vista previa y el envío: nunca prometemos un saldo que no enviaríamos. */
const assessMovement = (row: StockRow, type: MovementType, rawAmount: string): MovementAssessment => {
  if (rawAmount.trim() === '') return { state: 'empty' };
  const value = Number(rawAmount);
  if (!Number.isFinite(value) || value > 9_999_999_999.99 || Math.abs(value * 100 - Math.round(value * 100)) > 0.000001) {
    return { state: 'invalid', message: 'Ingresa un número con máximo dos decimales.' };
  }
  if (value < 0 || (type !== 'ADJUSTMENT' && value === 0)) {
    return { state: 'invalid', message: type === 'ADJUSTMENT' ? 'El conteo no puede ser negativo.' : 'La cantidad debe ser mayor que cero.' };
  }
  const quantity = type === 'ADJUSTMENT' ? Math.round((value - row.onHand) * 100) / 100 : value;
  if (type === 'ADJUSTMENT' && quantity === 0) return { state: 'invalid', message: 'El conteo coincide con el sistema; no hay diferencia que registrar.' };
  const effect = type === 'WASTE' ? -quantity : quantity;
  const nextOnHand = Math.round((row.onHand + effect) * 100) / 100;
  const nextAvailable = Math.round((nextOnHand - row.reserved) * 100) / 100;
  if (nextOnHand > 9_999_999_999.99) return { state: 'invalid', message: 'El saldo final supera el máximo permitido.' };
  if (nextAvailable < 0) {
    return { state: 'invalid', message: `Hay ${formatQuantity(row.reserved)} ${row.unit} reservados para pedidos. La cantidad registrada no puede quedar por debajo de esa reserva.` };
  }
  return { state: 'valid', quantity, effect, nextOnHand, nextAvailable };
};

const EffectNote = ({ children }: { children: ReactNode }) => (
  <div className="flex gap-3 rounded-card border border-brand-100 bg-brand-50/75 p-3 text-sm leading-6 text-brand-900">
    <Info className="mt-1 size-4 shrink-0" aria-hidden="true" />
    <div><p className="font-bold">Qué hará el sistema</p><div className="mt-0.5 text-xs leading-5">{children}</div></div>
  </div>
);

const InventoryUnitField = ({ value, custom, onSelect }: {
  value: string;
  custom: boolean;
  onSelect: (value: string) => void;
}) => (
  <Select
    label="Unidad de control"
    value={custom ? 'other' : value}
    onChange={(event) => onSelect(event.target.value)}
    hint="Misma unidad en recetas y compras; no convierte kg↔g ni l↔ml."
    required
  >
    <SelectOption value="" disabled>Selecciona una unidad</SelectOption>
    {INVENTORY_UNITS.map((unit) => <SelectOption key={unit.value} value={unit.value}>{unit.label}</SelectOption>)}
    <SelectOption value="other">Otra unidad…</SelectOption>
  </Select>
);

const STOCK_STATUS = {
  OUT: { label: 'Agotado', badge: 'danger' as const, bar: 'bg-red-600' },
  CRITICAL: { label: 'Crítico', badge: 'danger' as const, bar: 'bg-red-500' },
  LOW: { label: 'Stock bajo', badge: 'warning' as const, bar: 'bg-amber-500' },
  HEALTHY: { label: 'Sin alerta', badge: 'success' as const, bar: 'bg-brand-500' },
};

/**
 * Inventario por sucursal.
 * Si un insumo llega a cero, las opciones del constructor que lo usan se marcan
 * agotadas solas y dejan de ofrecerse (RN-005 + RN-016).
 */
const InventoryPage = () => {
  const [searchParams] = useSearchParams();
  const [selected, setSelected] = useState<StockRow | null>(null);
  const [type, setType] = useState<MovementType>('ADJUSTMENT');
  /** Cantidad del movimiento; con "Ajuste por conteo" es el stock real contado. */
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [stockQuery, setStockQuery] = useState('');
  const [filter, setFilter] = useState<StockFilter>(() => searchParams.get('filter') === 'cake-allergens' ? 'CAKE_ALLERGENS_PENDING' : 'ALL');
  const [sort, setSort] = useState<StockSort>('PRIORITY');
  const [inventoryPage, setInventoryPage] = useState(1);
  const [inventoryPageSize, setInventoryPageSize] = useState<number>(10);
  const [tab, setTab] = useState<'stock' | 'history'>('stock');
  const [movements, setMovements] = useState<StockMovementRow[]>([]);
  const [movementError, setMovementError] = useState('');
  const [movementLoading, setMovementLoading] = useState(false);
  const movementRequestId = useRef(0);
  const [historyItemId, setHistoryItemId] = useState<number | null>(null);
  const [editing, setEditing] = useState<StockRow | null>(null);
  const [actionRow, setActionRow] = useState<StockRow | null>(null);
  const [actionAnchor, setActionAnchor] = useState<HTMLElement | null>(null);
  const [editForm, setEditForm] = useState({ name: '', itemType: 'INGREDIENT' as 'INGREDIENT' | 'FINISHED_PRODUCT', unit: '', imageUrl: '', unitCost: '', minLevel: '', allergens: null as string[] | null });
  const [editCustomUnit, setEditCustomUnit] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [newItem, setNewItem] = useState(EMPTY_ITEM);
  const [allergenOptions, setAllergenOptions] = useState<AllergenOption[]>([]);
  const [createCustomUnit, setCreateCustomUnit] = useState(false);
  const [enableOpen, setEnableOpen] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
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
  const canProcure = can(PERM.PROCUREMENT_MANAGE);

  useEffect(() => {
    if (!createOpen && !editing) return;
    void api.get<ApiSuccess<AllergenOption[]>>('/operations/inventory/allergens')
      .then(({ data }) => setAllergenOptions(data.data))
      .catch((cause) => toast.error(getApiErrorMessage(cause)));
  }, [createOpen, editing]);

  const fetcher = useCallback(
    (signal: AbortSignal): Promise<StockRow[]> =>
      branchId ? adminApi.stock(branchId, signal) : Promise.resolve([]),
    [branchId],
  );
  const { data, error, isLoading, lastSuccessAt, isStale, refresh } = usePolling<StockRow[]>(fetcher, 15000);

  const loadMovements = useCallback(async () => {
    if (!branchId) return;
    const requestId = ++movementRequestId.current;
    setMovementLoading(true); setMovementError('');
    try {
      const rows = await adminApi.stockMovements(branchId, historyItemId ?? undefined);
      if (requestId === movementRequestId.current) setMovements(rows);
    } catch (cause) {
      if (requestId === movementRequestId.current) setMovementError(getApiErrorMessage(cause));
    } finally {
      if (requestId === movementRequestId.current) setMovementLoading(false);
    }
  }, [branchId, historyItemId]);

  useEffect(() => { if (tab === 'history') void loadMovements(); }, [tab, loadMovements]);
  useEffect(() => { setHistoryItemId(null); }, [branchId]);

  const stock = useMemo(() => data ?? [], [data]);
  const summary = useMemo(() => ({
    low: stock.filter((row) => row.isLow),
    out: stock.filter((row) => row.stockStatus === 'OUT'),
    value: stock.reduce((total, row) => total + row.stockValue, 0),
    reserved: stock.reduce((total, row) => total + row.reserved, 0),
    withoutCost: stock.filter((row) => row.onHand > 0 && row.averageUnitCost <= 0 && row.unitCost <= 0),
    allergensPending: stock.filter((row) => row.allergens === null),
    cakeAllergensPending: stock.filter((row) => row.usedInCake && row.allergens === null),
  }), [stock]);
  const visibleStock = useMemo(() => {
    const query = stockQuery.trim().toLocaleLowerCase('es');
    return stock.filter((row) =>
      (!query || `${row.name} ${row.code}`.toLocaleLowerCase('es').includes(query))
      && (filter === 'ALL' || (filter === 'ATTENTION' && row.isLow)
        || (filter === 'OUT' && row.stockStatus === 'OUT')
        || (filter === 'HEALTHY' && row.stockStatus === 'HEALTHY')
        || (filter === 'ALLERGENS_PENDING' && row.allergens === null)
        || (filter === 'FINISHED' && row.itemType === 'FINISHED_PRODUCT')
        || (filter === 'INGREDIENTS' && row.itemType !== 'FINISHED_PRODUCT')
        || (filter === 'CAKE_ALLERGENS_PENDING' && row.usedInCake && row.allergens === null)),
    ).sort((a, b) => sort === 'NAME' ? a.name.localeCompare(b.name, 'es')
      : sort === 'AVAILABLE' ? a.available - b.available
        : sort === 'VALUE' ? b.stockValue - a.stockValue
          : priority[a.stockStatus] - priority[b.stockStatus] || a.name.localeCompare(b.name, 'es'));
  }, [stock, stockQuery, filter, sort]);
  const inventoryTotalPages = Math.max(1, Math.ceil(visibleStock.length / inventoryPageSize));
  const pagedStock = useMemo(() => {
    const start = (inventoryPage - 1) * inventoryPageSize;
    return visibleStock.slice(start, start + inventoryPageSize);
  }, [visibleStock, inventoryPage, inventoryPageSize]);
  const inventoryStart = visibleStock.length === 0 ? 0 : (inventoryPage - 1) * inventoryPageSize + 1;
  const inventoryEnd = Math.min(inventoryPage * inventoryPageSize, visibleStock.length);

  useEffect(() => {
    setInventoryPage(1);
  }, [stockQuery, filter, sort, inventoryPageSize, branchId]);

  useEffect(() => {
    setInventoryPage((current) => Math.min(current, inventoryTotalPages));
  }, [inventoryTotalPages]);

  const visibleMasterItems = masterItems?.filter((item) => showArchived ? !item.isActive && item.isEnabledInBranch : item.isActive) ?? [];

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
    setType('ADJUSTMENT');
  };

  const openMovement = (row: StockRow) => {
    setSelected(row); setType('ADJUSTMENT'); setAmount(''); setReason('');
  };

  const openEdit = (row: StockRow) => {
    setEditing(row);
    setEditCustomUnit(!isSuggestedUnit(row.unit));
    setEditForm({ name: row.name, itemType: row.itemType ?? 'INGREDIENT', unit: row.unit, imageUrl: row.imageUrl ?? '', unitCost: String(row.unitCost), minLevel: String(row.minLevel), allergens: row.allergens });
  };

  const showHistory = (row: StockRow) => {
    setHistoryItemId(row.inventoryItemId);
    setTab('history');
  };

  const closeActions = () => { setActionAnchor(null); setActionRow(null); };

  const saveEdit = async () => {
    if (!editing || !branchId) return;
    const unitCost = Number(editForm.unitCost);
    const minLevel = Number(editForm.minLevel);
    if (editForm.name.trim().length < 2 || editForm.name.trim().length > 80 || !editForm.unit.trim() || editForm.unit.trim().length > 10
      || !validDecimal(editForm.unitCost, 4, 99_999_999.9999) || !validDecimal(editForm.minLevel, 2, 9_999_999_999.99)) {
      toast.error('Completa nombre, costo de referencia y stock mínimo válidos'); return;
    }
    setIsSaving(true);
    try {
      await adminApi.updateInventoryItem({ branchId, inventoryItemId: editing.inventoryItemId,
        name: editForm.name.trim(), itemType: editForm.itemType, unit: editForm.unit.trim(), imageUrl: editForm.imageUrl || null, unitCost, minLevel, allergens: editForm.allergens });
      toast.success('Insumo actualizado'); setEditing(null); refresh();
    } catch (cause) { toast.error(getApiErrorMessage(cause)); }
    finally { setIsSaving(false); }
  };

  const archiveItem = async (row: StockRow) => {
    if (!branchId) return;
    const { confirmed } = await confirm({
      title: `Archivar ${row.name}`,
      message: 'Desaparecerá del inventario de todas las cocinas. Su historial, compras y código se conservarán; podrás restaurarlo desde el maestro de insumos. Debe tener stock cero y no estar vinculado a recetas ni compras pendientes.',
      confirmLabel: 'Archivar insumo',
      tone: 'danger',
    });
    if (!confirmed) return;
    setIsSaving(true);
    try {
      await adminApi.archiveInventoryItem(branchId, row.inventoryItemId);
      toast.success('Insumo archivado. Puedes restaurarlo desde el maestro.');
      setEditing(null);
      refresh();
      if (enableOpen) void loadMasterItems();
    } catch (cause) { toast.error(getApiErrorMessage(cause)); }
    finally { setIsSaving(false); }
  };

  const restoreItem = async (item: MasterItem) => {
    if (!branchId) return;
    setEnablingId(item.inventoryItemId);
    try {
      await adminApi.restoreInventoryItem(branchId, item.inventoryItemId);
      toast.success('Insumo restaurado');
      await loadMasterItems();
      refresh();
    } catch (cause) { toast.error(getApiErrorMessage(cause)); }
    finally { setEnablingId(null); }
  };

  const deleteArchivedItem = async (item: MasterItem) => {
    if (!branchId) return;
    const { confirmed } = await confirm({
      title: `Eliminar ${item.name} definitivamente`,
      message: 'Se quitará el insumo y su código de todas las cocinas. Esta acción no se puede deshacer. Solo se permite si nunca tuvo movimientos, lotes, compras, recetas ni presupuestos de tortas, y no tiene stock. Si tuvo actividad, déjalo archivado para conservar el historial.',
      confirmLabel: 'Eliminar definitivamente',
      requireTypedText: item.name,
      tone: 'danger',
    });
    if (!confirmed) return;
    setEnablingId(item.inventoryItemId);
    try {
      await adminApi.deleteArchivedInventoryItem(branchId, item.inventoryItemId);
      toast.success('Insumo eliminado definitivamente');
      await loadMasterItems();
      refresh();
    } catch (cause) { toast.error(getApiErrorMessage(cause)); }
    finally { setEnablingId(null); }
  };

  const handleSave = async () => {
    if (!selected || !branchId) return;
    const assessment = assessMovement(selected, type, amount);
    if (assessment.state !== 'valid') {
      toast.error(assessment.state === 'empty' ? 'Ingresa la cantidad o el total que contaste en cocina.' : assessment.message);
      return;
    }

    if (reason.trim().length < 3) {
      toast.error('Explica el motivo del movimiento');
      return;
    }

    // Solo lo que RESTA stock pide confirmacion: el libro de movimientos es
    // inmutable y deshacerlo obliga a registrar otro movimiento encima.
    if (assessment.effect < 0) {
      const { confirmed } = await confirm({
        title: `Bajar el stock de ${selected.name}`,
        message: `La cantidad registrada bajará de ${formatQuantity(selected.onHand)} a ${formatQuantity(assessment.nextOnHand)} ${selected.unit}; quedarán ${formatQuantity(assessment.nextAvailable)} ${selected.unit} disponibles. Las reservas se mantienen. El movimiento queda en el historial y no se puede borrar.`,
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
        quantity: assessment.quantity,
        expectedOnHand: selected.onHand,
        expectedReserved: selected.reserved,
        reason: reason.trim(),
      });
      toast.success('Inventario actualizado');
      closeModal();
      refresh();
      if (tab === 'history') void loadMovements();
    } catch (saveError) {
      toast.error(getApiErrorMessage(saveError));
      if (isAxiosError(saveError) && saveError.response?.status === 409) { closeModal(); refresh(); }
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
    if (newItem.name.trim().length < 2 || newItem.name.trim().length > 80 || !newItem.unit.trim() || newItem.unit.trim().length > 10
      || !validDecimal(newItem.unitCost || '0', 4, 99_999_999.9999)
      || !validDecimal(newItem.minLevel || '0', 2, 9_999_999_999.99)
      || !validDecimal(newItem.initialStock || '0', 2, 9_999_999_999.99)) {
      toast.error('Revisa nombre, unidad, costo (hasta 4 decimales) y cantidades (hasta 2 decimales)');
      return;
    }

    setIsSaving(true);
    try {
      const created = await adminApi.createInventoryItem({
        branchId,
        name: newItem.name.trim(),
        itemType: newItem.itemType,
        unit: newItem.unit.trim(),
        imageUrl: newItem.imageUrl || null,
        allergens: newItem.allergens,
        unitCost: Number(newItem.unitCost || 0),
        minLevel: Number(newItem.minLevel || 0),
        initialStock: Number(newItem.initialStock || 0),
      });
      toast.success(`Insumo creado con código ${created.code}`);
      setCreateOpen(false);
      setNewItem(EMPTY_ITEM);
      setCreateCustomUnit(false);
      refresh();
      if (tab === 'history') void loadMovements();
    } catch (createError) {
      toast.error(getApiErrorMessage(createError));
    } finally {
      setIsSaving(false);
    }
  };

  if ((isLoading && !data) || isLoadingBranches) return <PageLoader />;

  const freshnessLabel = (() => {
    if (lastSuccessAt === null) return 'todavia sin datos de esta cocina';
    const seconds = Math.max(0, Math.round((now - lastSuccessAt) / 1000));
    return seconds < 90
      ? `datos de hace ${seconds} s`
      : `datos de ${formatRelative(new Date(lastSuccessAt))}`;
  })();

  const movementAssessment = selected ? assessMovement(selected, type, amount) : { state: 'empty' as const };
  const canSubmitMovement = movementAssessment.state === 'valid' && reason.trim().length >= 3 && reason.trim().length <= 255;

  return (
    <div>
      <PageHeader
        eyebrow="Operación / Almacén"
        title="Inventario de insumos"
        description="Controla existencias, detecta faltantes y revisa cada movimiento de tu cocina."
        icon={Package}
        action={<BranchSelector value={branchId} branches={branches} onChange={setBranchId} hasError={Boolean(branchesError)} />}
      />

      <section className="mt-5 rounded-card border border-brand-100 bg-brand-50/60 p-4 text-sm text-ink" aria-labelledby="inventory-guide-title">
        <h2 id="inventory-guide-title" className="font-black text-brand-900">Cómo funciona el inventario</h2>
        <p className="mt-1 text-xs leading-5 text-ink-muted">
          Cada insumo tiene una ficha compartida por todo el negocio, pero cada cocina controla sus propias cantidades.
          Disponible = registrado − reservado: lo reservado sigue físicamente en cocina, aunque ya está comprometido con pedidos.
        </p>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <li className="rounded-lg border border-brand-100 bg-white/80 p-3">
            <strong className="block text-brand-900">1. Registra y repone</strong>
            <span className="mt-1 block text-xs leading-5 text-ink-muted">Crea un insumo o habilita uno existente en esta cocina. La compra sugerida abre una orden precargada; el stock aumenta y se crea un lote cuando recibes la compra, no al crear la orden.</span>
          </li>
          <li className="rounded-lg border border-brand-100 bg-white/80 p-3">
            <strong className="block text-brand-900">2. El pedido reserva</strong>
            <span className="mt-1 block text-xs leading-5 text-ink-muted">Las recetas y opciones elegidas indican cuánto insumo necesita el pedido. La reserva reduce lo disponible para nuevos pedidos, sin quitar todavía la cantidad registrada.</span>
          </li>
          <li className="rounded-lg border border-brand-100 bg-white/80 p-3">
            <strong className="block text-brand-900">3. Cocina consume o libera</strong>
            <span className="mt-1 block text-xs leading-5 text-ink-muted">Al empezar a preparar el pedido, Cocina descuenta lo reservado del stock registrado. Si el pedido se cancela antes de prepararse, su reserva se libera.</span>
          </li>
          <li className="rounded-lg border border-brand-100 bg-white/80 p-3">
            <strong className="block text-brand-900">4. Controla y revisa</strong>
            <span className="mt-1 block text-xs leading-5 text-ink-muted">Movimiento corrige conteos, registra mermas o entradas excepcionales con un motivo. En Movimientos ves entradas, reservas, consumos y ajustes; el historial no se edita.</span>
          </li>
        </ol>
        <p className="mt-3 text-xs leading-5 text-ink-muted">
          Cuando cambia el stock, se recalcula la disponibilidad de las opciones del catálogo que usan ese insumo en esta cocina.
        </p>
      </section>

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

      <div className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-5" aria-label="Resumen del inventario">
        {[
          { label: 'Insumos activos', value: String(stock.length), detail: 'Controlados en esta cocina', icon: Package, tone: 'text-brand-700 bg-brand-50' },
          { label: 'Por atender', value: String(summary.low.length), detail: `${summary.out.length} agotados; revisar reposición`, icon: TriangleAlert, tone: 'text-amber-700 bg-amber-50' },
          { label: 'Valor estimado', value: `S/ ${summary.value.toFixed(2)}`, detail: 'Cantidad registrada × costo conocido', icon: Wallet, tone: 'text-brand-700 bg-brand-50' },
          { label: 'Sin costo', value: String(summary.withoutCost.length), detail: 'Con saldo, pero sin costo para valorarlo', icon: ClipboardList, tone: 'text-slate-700 bg-slate-100' },
          { label: 'Alérgenos pendientes', value: String(summary.allergensPending.length), detail: `${summary.cakeAllergensPending.length} usados en recetas`, icon: TriangleAlert, tone: 'text-amber-700 bg-amber-50' },
        ].map(({ label, value, detail, icon: Icon, tone }) => <Card key={label} className="border-line bg-white p-4 shadow-e1"><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">{label}</p><p className="mt-2 text-2xl font-black tabular-nums text-ink">{value}</p><p className="mt-1 text-xs text-ink-muted">{detail}</p></div><span className={cn('grid size-10 shrink-0 place-items-center rounded-xl', tone)}><Icon className="size-5" /></span></div></Card>)}
      </div>

      <div className="mt-4 grid gap-3 rounded-card border border-line bg-white p-4 text-xs leading-5 text-ink-muted sm:grid-cols-3" aria-label="Cómo leer las existencias">
        <p><strong className="block text-sm text-ink">Registrado</strong> Es lo que el sistema cree que hay en esta cocina; un conteo puede corregirlo.</p>
        <p><strong className="block text-sm text-ink">Reservado</strong> Ya está comprometido con pedidos, pero aún permanece en la cocina.</p>
        <p><strong className="block text-sm text-ink">Disponible</strong> Registrado menos reservado: lo que queda para nuevos pedidos.</p>
      </div>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex gap-1" role="tablist" aria-label="Vistas del inventario">
          <button type="button" role="tab" aria-selected={tab === 'stock'} onClick={() => setTab('stock')} className={cn('rounded-lg px-4 py-2 text-sm font-bold', tab === 'stock' ? 'bg-brand-700 text-white' : 'text-ink-muted hover:bg-brand-50')}>Existencias</button>
          <button type="button" role="tab" aria-selected={tab === 'history'} onClick={() => setTab('history')} className={cn('flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold', tab === 'history' ? 'bg-brand-700 text-white' : 'text-ink-muted hover:bg-brand-50')}><History className="size-4" /> Movimientos</button>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" title="Consulta nuevamente los datos. No cambia existencias." leftIcon={<RefreshCw className="size-4" />} onClick={() => { refresh(); if (tab === 'history') void loadMovements(); }}>Actualizar</Button>
          {canManage && <Button size="sm" variant="outline" title="Habilita insumos existentes en esta cocina y gestiona los archivados." disabled={!branchId} onClick={() => { setShowArchived(false); setEnableOpen(true); void loadMasterItems(); }}>Maestro de insumos</Button>}
          {canManage && <Button size="sm" title="Crea una ficha nueva para controlar cantidades y costos." disabled={!branchId} leftIcon={<Plus className="size-4" />} onClick={() => setCreateOpen(true)}>Nuevo insumo</Button>}
        </div>
      </div>

      {tab === 'stock' && stock.length > 0 && <div className="mt-5 flex flex-col gap-3 rounded-card border border-line bg-white p-4 shadow-e1 lg:flex-row lg:items-center">
        <label className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-field border border-line px-3 focus-within:border-brand-500">
          <Search className="size-4 shrink-0 text-ink-muted" />
          <span className="sr-only">Buscar insumo por nombre o código</span>
          <input className="min-w-0 flex-1 bg-transparent text-sm outline-none" value={stockQuery} onChange={(event) => setStockQuery(event.target.value)} placeholder="Buscar por nombre o código" />
        </label>
        <div className="flex flex-wrap gap-1" aria-label="Filtrar estado">
          {([['ALL', 'Todos'], ['INGREDIENTS', 'Insumos'], ['FINISHED', 'Productos terminados'], ['ATTENTION', 'Por atender'], ['OUT', 'Agotados'], ['HEALTHY', 'Sin alerta'], ['ALLERGENS_PENDING', 'Alérgenos pendientes'], ['CAKE_ALLERGENS_PENDING', 'Pendientes en recetas']] as Array<[StockFilter, string]>).map(([value, label]) => <button key={value} type="button" aria-pressed={filter === value} onClick={() => setFilter(value)} className={cn('rounded-lg px-3 py-2 text-xs font-bold transition', filter === value ? 'bg-brand-100 text-brand-900' : 'text-ink-muted hover:bg-surface-muted')}>{label}</button>)}
        </div>
        <label className="flex items-center gap-2 text-xs font-bold text-ink-muted"><ArrowDownUp className="size-4" /><span>Ordenar</span><select value={sort} onChange={(event) => setSort(event.target.value as StockSort)} className="rounded-lg border border-line bg-white px-2 py-2 text-ink"><option value="PRIORITY">Prioridad</option><option value="NAME">Nombre</option><option value="AVAILABLE">Menor disponible</option><option value="VALUE">Mayor valor</option></select></label>
        <label className="flex items-center gap-2 text-xs font-bold text-ink-muted"><span>Mostrar</span><select aria-label="Insumos por página" value={inventoryPageSize} onChange={(event) => setInventoryPageSize(Number(event.target.value))} className="rounded-lg border border-line bg-white px-2 py-2 text-ink">{INVENTORY_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}</select></label>
        <span className="whitespace-nowrap text-xs text-ink-muted">{visibleStock.length > 0 ? `${inventoryStart}–${inventoryEnd} de ${visibleStock.length}` : '0 insumos'}</span>
      </div>}
      {tab === 'stock' && stock.length > 0 && <p className="mt-2 text-xs text-ink-muted">Buscar, filtrar y ordenar solo cambian lo que ves en la lista; no modifican cantidades. Usa «Mostrar» para ver más insumos por página.</p>}

      {tab === 'stock' && stock.length > 0 && (
        <details className="mt-3 rounded-card border border-line bg-white px-4 py-3 text-sm text-ink-muted">
          <summary className="cursor-pointer font-bold text-ink">Cómo se calculan las alertas, la cobertura y la compra sugerida</summary>
          <div className="mt-3 grid gap-3 border-t border-line pt-3 text-xs leading-5 sm:grid-cols-2">
            <p><strong className="text-ink">Estado:</strong> agotado si el disponible es cero; crítico o bajo si llega al mínimo configurado o quedan pocos días según el consumo. «Sin alerta» solo indica que no se cumple ninguna de esas reglas; no certifica la calidad del insumo.</p>
            <p><strong className="text-ink">Cobertura:</strong> días aproximados que duraría el disponible al ritmo de consumo de los últimos siete días. Sin consumo reciente no se puede estimar.</p>
            <p><strong className="text-ink">Objetivo y compra sugerida:</strong> el objetivo toma el mayor entre el doble del mínimo y el consumo de siete días. La sugerencia es lo que falta para llegar a ese objetivo; si está agotado, se sugiere al menos una unidad.</p>
            <p><strong className="text-ink">Valor estimado:</strong> cantidad registrada por costo promedio o, si falta, costo de referencia. No representa dinero pagado ni ganancia.</p>
          </div>
        </details>
      )}

      {tab === 'stock' && summary.low.length > 0 && (
        <Card className="mt-4 hidden border-amber-200 bg-amber-50/70 p-4 sm:block">
          <div className="flex items-start gap-3">
            <span className="grid size-10 shrink-0 place-items-center rounded-card bg-amber-100 text-amber-800"><TriangleAlert className="size-5" /></span>
            <div className="min-w-0 flex-1">
              <p className="font-bold text-amber-950">{summary.low.length} insumo{summary.low.length === 1 ? '' : 's'} requieren atención</p>
              <p className="mt-1 text-sm leading-relaxed text-amber-900">La sugerencia usa el disponible, el mínimo y el consumo reciente. El botón abre una orden precargada; revisa cantidad, costo y proveedor. El stock aumenta cuando recibas la compra y registres el lote.</p>
              {canProcure && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {summary.low.slice(0, 4).map((row) => <Link key={row.inventoryItemId} to={purchaseLink(row)} className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-xs font-bold text-amber-950 hover:border-amber-600">Preparar compra de {row.name} · {formatQuantity(row.suggestedPurchase)} {row.unit}</Link>)}
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
      ) : tab === 'history' ? (
        <Card className="mt-5 overflow-hidden border-line bg-white shadow-e1">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-5">
            <div><h2 className="text-lg font-black text-ink">Libro de movimientos</h2><p className="mt-1 text-sm text-ink-muted">Últimos 50 movimientos de esta cocina. Reservar o liberar cambia el disponible sin sacar stock; consumir, mermar o recibir cambia la cantidad registrada. Cada registro conserva el saldo posterior, motivo y responsable cuando corresponde.</p></div>
            <label className="text-xs font-bold text-ink-muted">Insumo<select className="ml-2 rounded-lg border border-line bg-white px-3 py-2 text-sm text-ink" value={historyItemId ?? ''} onChange={(event) => setHistoryItemId(event.target.value ? Number(event.target.value) : null)}><option value="">Todos</option>{stock.map((row) => <option key={row.inventoryItemId} value={row.inventoryItemId}>{row.name}</option>)}</select></label>
          </div>
          {movementError ? <LoadError className="m-5" title="No pudimos cargar los movimientos" message={movementError} onRetry={() => void loadMovements()} /> : movementLoading ? <p className="p-8 text-center text-sm text-ink-muted">Cargando movimientos…</p> : movements.length === 0 ? <div className="px-6 py-14 text-center"><History className="mx-auto size-9 text-brand-300" /><p className="mt-3 font-bold text-ink">Todavía no hay movimientos</p><p className="mt-1 text-sm text-ink-muted">Al registrar stock inicial, compras, reservas o consumo aparecerán aquí.</p></div> : <div className="overflow-x-auto"><table className="w-full min-w-[740px] text-left text-sm"><thead className="bg-surface-muted text-xs font-bold uppercase tracking-wide text-ink-muted"><tr><th className="px-5 py-3">Fecha y operación</th><th className="px-5 py-3">Insumo</th><th className="px-5 py-3 text-right">Movimiento</th><th className="px-5 py-3 text-right">Saldo posterior</th><th className="px-5 py-3">Motivo / referencia</th></tr></thead><tbody>{movements.map((row) => <tr key={row.id} className="border-t border-line"><td className="px-5 py-4"><p className="font-bold text-ink">{movementLabels[row.type]}</p><p className="mt-1 text-xs text-ink-muted">{new Date(row.createdAt).toLocaleString('es-PE')}</p><p className="mt-1 text-xs text-ink-muted">{row.actorName ? `Responsable: ${row.actorName}` : row.type === 'RESERVE' || row.type === 'RELEASE' ? 'Automático por pedido' : 'Responsable no registrado'}</p></td><td className="px-5 py-4 font-medium text-ink">{row.itemName}</td><td className="px-5 py-4 text-right font-bold tabular-nums">{row.type === 'RESERVE' ? 'Reserva +' : row.type === 'RELEASE' ? 'Liberación −' : row.type === 'PURCHASE' || row.type === 'ADJUSTMENT' && row.quantity > 0 ? '+' : '−'}{formatQuantity(Math.abs(row.quantity))} {row.unit}</td><td className="px-5 py-4 text-right tabular-nums"><strong>{formatQuantity(row.onHandAfter)} {row.unit}</strong><span className="block text-xs text-ink-muted">{formatQuantity(row.reservedAfter)} reservados</span></td><td className="px-5 py-4 text-ink-muted">{row.reason || (row.purchaseOrderId ? `Compra #${row.purchaseOrderId}` : row.orderId ? `Pedido #${row.orderId}` : 'Movimiento del sistema')}{row.lotId && <span className="block text-xs">Lote #{row.lotId}</span>}</td></tr>)}</tbody></table></div>}
        </Card>
      ) : stock.length === 0 ? (
        <Card className="mt-5 border-dashed border-brand-200 bg-white px-6 py-14 text-center shadow-e1"><span className="mx-auto grid size-16 place-items-center rounded-2xl bg-brand-50 text-brand-700"><PackagePlus className="size-8" /></span><h2 className="mt-5 text-xl font-black text-ink">Empieza por tu primer insumo</h2><p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-ink-muted">Registra ingredientes y materiales con su unidad, costo y stock mínimo. Después crea una orden de compra para recibir lotes con trazabilidad.</p><div className="mt-6 flex flex-wrap justify-center gap-2">{canManage && <Button onClick={() => setCreateOpen(true)} leftIcon={<Plus className="size-4" />}>Crear primer insumo</Button>}{canProcure && <Link to={ROUTES.adminProcurement} className="inline-flex items-center rounded-lg border border-line px-4 py-2 text-sm font-bold text-ink hover:bg-surface-muted">Ir a compras</Link>}</div></Card>
      ) : (
      <div className="mt-5">
        <div className="hidden md:block">
        <Table className="min-w-[950px]" caption="Stock por insumo de la cocina seleccionada">
          <Thead>
            <Tr>
              <Th>Insumo</Th>
              <Th align="right">Registrado</Th>
              <Th align="right">Reservado</Th>
              <Th align="right">Disponible</Th>
              <Th align="right">Costo / valor</Th>
              <Th>Estado y cobertura</Th>
              <Th align="right"><span className="sr-only">Acciones</span></Th>
            </Tr>
          </Thead>

          <Tbody>
            {pagedStock.map((row) => (
              <Tr
                key={row.inventoryItemId}
                className={cn(
                  row.stockStatus === 'OUT' && 'bg-red-50',
                  row.stockStatus === 'CRITICAL' && 'bg-red-50/60',
                  row.stockStatus === 'LOW' && 'bg-amber-50/50',
                )}
              >
                <Td>
                  <div className="flex items-start gap-3">
                    <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-brand-50 text-brand-600">{row.imageUrl ? <img src={row.imageUrl} alt="" className="size-full object-cover" /> : <Package className="size-5" />}</span>
                    <div className="min-w-0"><p className="font-bold text-ink">{row.name}</p>
                      <p className="mt-0.5 text-xs text-ink-muted">{row.code} · {row.unit}</p>
                      <p className="mt-1 text-[10px] font-semibold text-ink-muted">{row.itemType === 'FINISHED_PRODUCT' ? 'Producto terminado' : 'Insumo de elaboración'}</p><p className={cn('mt-1 text-[11px] font-semibold', row.allergens === null ? 'text-amber-800' : 'text-brand-700')}>{row.allergens === null ? 'Alérgenos pendientes' : row.allergens.length ? `${row.allergens.length} alérgeno(s) registrados` : 'Alérgenos revisados: ninguno'}</p>
                      {row.usedInCake && <p className="mt-0.5 text-[11px] text-ink-muted">Usado en tortas</p>}
                      {row.allergens === null && canManage && <button type="button" className="mt-1 text-xs font-bold text-brand-700 underline" onClick={() => openEdit(row)}>Clasificar alérgenos</button>}
                      {row.impactedOptions.length > 0 && <p className="mt-0.5 max-w-56 text-[11px] text-ink-muted">Impacta: {row.impactedOptions.join(', ')}</p>}
                      {row.isLow && row.suggestedSubstitutes.length > 0 && <p className="mt-1 max-w-56 text-[11px] font-semibold text-brand-700">Alternativas: {row.suggestedSubstitutes.join(', ')}</p>}
                    </div>
                  </div>
                </Td>
                <Td align="right" className="text-ink-muted">
                  {formatQuantity(row.onHand)} {row.unit}
                </Td>
                <Td align="right" className="text-ink-muted">{formatQuantity(row.reserved)}</Td>
                <Td
                  align="right"
                  className={cn(
                    'font-semibold',
                    row.isLow ? 'text-red-600' : 'text-ink',
                  )}
                >
                  {formatQuantity(row.available)}
                </Td>
                <Td align="right"><p className="font-semibold tabular-nums">S/ {row.stockValue.toFixed(2)}</p><p className="whitespace-nowrap text-xs text-ink-muted">{row.averageUnitCost > 0 ? 'Prom.' : row.unitCost > 0 ? 'Ref.' : 'Sin costo'} {row.averageUnitCost > 0 || row.unitCost > 0 ? `S/ ${(row.averageUnitCost > 0 ? row.averageUnitCost : row.unitCost).toFixed(4)} / ${row.unit}` : ''}</p></Td>
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
                <Td align="right">
                  <div className="flex items-center justify-end gap-1 whitespace-nowrap">
                    {row.isLow && canProcure
                      ? <Link to={purchaseLink(row)} className="rounded-lg bg-brand-700 px-3 py-2 text-xs font-bold text-white hover:bg-brand-800">Preparar compra</Link>
                      : canManage
                        ? <Button size="sm" variant="outline" onClick={() => openMovement(row)}>Movimiento</Button>
                        : <Button size="sm" variant="outline" onClick={() => showHistory(row)}>Historial</Button>}
                    {(canManage || row.isLow && canProcure) && <Button size="sm" variant="ghost" aria-label={`Más acciones para ${row.name}`} onClick={(event) => { setActionRow(row); setActionAnchor(event.currentTarget); }}><MoreHorizontal className="size-4" /></Button>}
                  </div>
                </Td>
              </Tr>
            ))}
            {visibleStock.length === 0 && (
              <Tr>
                {/* La fila vacía ocupa también la columna de acciones. */}
                <Td colSpan={7} align="center" className="py-10 text-ink-muted">
                  No hay insumos que coincidan con los filtros. <button type="button" className="font-bold text-brand-700 underline" onClick={() => { setStockQuery(''); setFilter('ALL'); }}>Limpiar filtros</button>
                </Td>
              </Tr>
            )}
          </Tbody>
        </Table>
        </div>

        <div className="grid gap-3 md:hidden" aria-label="Stock por insumo de la cocina seleccionada">
          {pagedStock.map((row) => (
            <Card key={row.inventoryItemId} className={cn('p-4', row.isLow && 'border-red-200 bg-red-50/45')}>
              <div className="flex min-w-0 items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-lg bg-brand-50 text-brand-600">{row.imageUrl ? <img src={row.imageUrl} alt="" className="size-full object-cover" /> : <Package className="size-5" />}</span>
                  <div className="min-w-0"><p className="font-bold text-ink">{row.name}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">{row.code} · {row.unit}</p>
                    <p className="mt-1 text-[10px] font-semibold text-ink-muted">{row.itemType === 'FINISHED_PRODUCT' ? 'Producto terminado' : 'Insumo de elaboración'}</p><p className={cn('mt-1 text-[11px] font-semibold', row.allergens === null ? 'text-amber-800' : 'text-brand-700')}>{row.allergens === null ? 'Alérgenos pendientes' : row.allergens.length ? `${row.allergens.length} alérgeno(s) registrados` : 'Alérgenos revisados: ninguno'}</p>
                    {row.usedInCake && <p className="mt-0.5 text-[11px] text-ink-muted">Usado en tortas</p>}
                  </div>
                </div>
                <Badge variant={STOCK_STATUS[row.stockStatus].badge}>{STOCK_STATUS[row.stockStatus].label}</Badge>
              </div>

              <div className="mt-4 grid grid-cols-3 divide-x divide-line rounded-card border border-line bg-white py-3 text-center">
                <div className="px-2"><p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">Registrado</p><p className="mt-1 font-extrabold text-ink">{formatQuantity(row.onHand)}</p></div>
                <div className="px-2"><p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">Reservado</p><p className="mt-1 font-extrabold text-ink">{formatQuantity(row.reserved)}</p></div>
                <div className="px-2"><p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">Disponible</p><p className={cn('mt-1 font-extrabold', row.isLow ? 'text-red-600' : 'text-brand-700')}>{formatQuantity(row.available)}</p></div>
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
              {row.isLow && <p className="mt-3 rounded-field bg-red-100 px-3 py-2 text-xs font-bold text-red-800">Compra sugerida: {formatQuantity(row.suggestedPurchase)} {row.unit}. Revísala antes de pedir.</p>}
              <p className="mt-3 text-xs text-ink-muted">Valor estimado: <strong>S/ {row.stockValue.toFixed(2)}</strong> · {row.averageUnitCost > 0 ? 'costo prom.' : 'costo ref.'} S/ {(row.averageUnitCost > 0 ? row.averageUnitCost : row.unitCost).toFixed(4)} / {row.unit}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {canManage && <Button size="sm" variant="outline" onClick={() => openMovement(row)}>Movimiento</Button>}
                {canManage && <Button size="sm" variant="ghost" onClick={() => openEdit(row)}>Editar</Button>}
                <Button size="sm" variant="ghost" onClick={() => { setHistoryItemId(row.inventoryItemId); setTab('history'); }}>Historial</Button>
                {canManage && <Button size="sm" variant="ghost" className="text-red-700" onClick={() => void archiveItem(row)}>Archivar</Button>}
                {row.isLow && canProcure && <Link to={purchaseLink(row)} className="rounded-lg bg-brand-700 px-3 py-2 text-xs font-bold text-white">Preparar compra</Link>}
              </div>
            </Card>
          ))}
          {visibleStock.length === 0 && <Card className="border-dashed p-8 text-center text-sm text-ink-muted">No hay insumos que coincidan con los filtros. <button type="button" className="font-bold text-brand-700 underline" onClick={() => { setStockQuery(''); setFilter('ALL'); }}>Limpiar filtros</button></Card>}
        </div>

        {visibleStock.length > 0 && inventoryTotalPages > 1 && (
          <div className="mt-5 flex flex-col items-center justify-between gap-3 rounded-card border border-line bg-white p-4 shadow-e1 sm:flex-row">
            <p className="text-xs text-ink-muted">Mostrando {inventoryStart}–{inventoryEnd} de {visibleStock.length} insumos</p>
            <Pagination page={inventoryPage} totalPages={inventoryTotalPages} onChange={setInventoryPage} />
          </div>
        )}
      </div>
      )}

      <Menu anchorEl={actionAnchor} open={Boolean(actionAnchor)} onClose={closeActions}>
        {canManage && <MenuItem onClick={() => { if (actionRow) openMovement(actionRow); closeActions(); }}>Registrar movimiento</MenuItem>}
        {canManage && <MenuItem onClick={() => { if (actionRow) openEdit(actionRow); closeActions(); }}>Editar insumo</MenuItem>}
        <MenuItem onClick={() => { if (actionRow) showHistory(actionRow); closeActions(); }}>Ver historial</MenuItem>
        {canManage && <MenuItem sx={{ color: 'error.main' }} onClick={() => { const row = actionRow; closeActions(); if (row) void archiveItem(row); }}>Archivar insumo</MenuItem>}
      </Menu>

      <Modal
        isOpen={selected !== null}
        onClose={() => { if (!isSaving) closeModal(); }}
        title={`Movimiento de ${selected?.name ?? ''}`}
        description="Registra un conteo, una merma o una entrada excepcional en la cocina seleccionada."
        icon={RefreshCw}
        eyebrow="Control de existencias"
        tone={selected?.isLow ? 'danger' : 'brand'}
        disableBackdropClose
        headerAside={selected && (
          <div className="hidden items-center gap-3 rounded-card border border-white/70 bg-white/75 px-3 py-2 shadow-e1 backdrop-blur-sm sm:flex">
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
            <Button isLoading={isSaving} disabled={!canSubmitMovement} onClick={() => void handleSave()}>Registrar movimiento</Button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="grid grid-cols-3 divide-x divide-line rounded-card border border-line bg-surface-muted/55 py-3 text-center">
            <div className="px-2"><p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">Registrado</p><b className="mt-1 block text-sm text-ink">{formatQuantity(selected?.onHand ?? 0)} {selected?.unit}</b></div>
            <div className="px-2"><p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">Reservado</p><b className="mt-1 block text-sm text-ink">{formatQuantity(selected?.reserved ?? 0)} {selected?.unit}</b></div>
            <div className="px-2"><p className="text-[10px] font-bold uppercase tracking-wide text-ink-muted">Disponible</p><b className="mt-1 block text-sm text-ink">{formatQuantity(selected?.available ?? 0)} {selected?.unit}</b></div>
          </div>
          <p className="text-xs leading-5 text-ink-muted">Estas cifras son las que Misky Challay tiene guardadas para esta cocina, antes de hacer un nuevo conteo. Disponible = registrado − reservado.</p>
          <EffectNote>
            {type === 'ADJUSTMENT' && <>El insumo ya existe en Inventario. Aquí corriges su cantidad: el sistema tiene registrados <strong>{formatQuantity(selected?.onHand ?? 0)} {selected?.unit}</strong>, pero todavía no sabe cuánto encontraste al contar. Escribe abajo el total real; guardará solo la diferencia. Por ejemplo, si marca 3.5 kg y encuentras 3 kg, descontará 0.5 kg. Si falta stock, descontará de los lotes existentes; si sobra, lo sumará sin crear compra ni lote. Las reservas se mantienen.</>}
            {type === 'WASTE' && <>Resta unidades dañadas o vencidas solo del stock disponible. Conserva las reservas y registra la pérdida en el historial; los lotes existentes se descuentan por orden de salida.</>}
            {type === 'PURCHASE' && <>Suma una entrada excepcional al stock y la valora con el costo de referencia. No crea proveedor, orden de compra ni lote. Para una compra trazable, usa <Link className="font-bold underline" to={ROUTES.adminProcurement}>Compras y proveedores</Link>.</>}
          </EffectNote>
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
                label={`Cantidad contada en cocina (${selected?.unit ?? ''})`}
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder={selected ? formatQuantity(selected.onHand) : '0'}
                hint="Escribe el total que acabas de contar, no cuánto falta o sobra. Si coincide con lo registrado, no se guarda ningún ajuste."
              />

            </div>
          ) : (
            <Input
              label={`${type === 'WASTE' ? 'Cantidad perdida' : 'Cantidad que ingresa manualmente'} (${selected?.unit ?? ''})`}
              type="number"
              min="0"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="0.5"
            />
          )}

          <Input
            label="Motivo"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={255}
            hint="Obligatorio: explica qué ocurrió. Quedará en el historial junto con el responsable."
            placeholder={type === 'ADJUSTMENT' ? 'Conteo físico del cierre' : type === 'WASTE' ? 'Insumo vencido o dañado' : 'Entrada excepcional de insumo'}
          />

          {movementAssessment.state === 'invalid' && <p role="alert" className="rounded-card border border-red-200 bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">{movementAssessment.message}</p>}
          {movementAssessment.state === 'valid' && selected && (
            <div role="status" className={cn('rounded-card border p-4', movementAssessment.effect < 0 ? 'border-amber-200 bg-amber-50/70' : 'border-brand-200 bg-brand-50/70')}>
              <p className="text-xs font-black uppercase tracking-wide text-ink-muted">Así quedará el inventario al guardar</p>
              <p className="mt-1 text-sm text-ink-muted">{type === 'ADJUSTMENT' ? 'Diferencia del conteo' : type === 'WASTE' ? 'Merma registrada' : 'Entrada registrada'}: <strong className="text-ink">{movementAssessment.effect > 0 ? '+' : '−'}{formatQuantity(Math.abs(movementAssessment.effect))} {selected.unit}</strong></p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                <div className="rounded-lg bg-white p-3"><p className="text-xs text-ink-muted">Cantidad registrada</p><b className="tabular-nums">{formatQuantity(selected.onHand)} → {formatQuantity(movementAssessment.nextOnHand)} {selected.unit}</b></div>
                <div className="rounded-lg bg-white p-3"><p className="text-xs text-ink-muted">Reservado</p><b className="tabular-nums">{formatQuantity(selected.reserved)} {selected.unit}</b><span className="block text-xs text-ink-muted">Sin cambios</span></div>
                <div className="rounded-lg bg-white p-3"><p className="text-xs text-ink-muted">Disponible</p><b className="tabular-nums">{formatQuantity(selected.available)} → {formatQuantity(movementAssessment.nextAvailable)} {selected.unit}</b></div>
              </div>
              {movementAssessment.nextAvailable <= selected.minLevel && <p className="mt-3 text-xs font-semibold text-amber-900">El disponible quedará en el mínimo o por debajo. El sistema mostrará una alerta de reposición.</p>}
              {selected.impactedOptions.length > 0 && <p className="mt-2 text-xs text-ink-muted">Opciones que usan este insumo: {selected.impactedOptions.join(', ')}. Su disponibilidad se recalculará.</p>}
            </div>
          )}

        </div>
      </Modal>

      <Modal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title={`Editar ${editing?.name ?? 'insumo'}`}
        description="Actualiza los datos compartidos por todas las cocinas. El historial y el costo promedio registrado se conservan."
        icon={Pencil}
        eyebrow="Maestro de inventario"
        maxWidth="md"
        disableBackdropClose
        actions={<><Button variant="ghost" className="mr-auto text-red-700" disabled={isSaving} leftIcon={<Archive className="size-4" />} onClick={() => { if (editing) void archiveItem(editing); }}>Archivar</Button><Button variant="outline" disabled={isSaving} onClick={() => setEditing(null)}>Cancelar</Button><Button isLoading={isSaving} onClick={() => void saveEdit()}>Guardar cambios</Button></>}
      >
        <div className="grid min-w-0 grid-cols-1 gap-6">
          <EffectNote>El nombre, imagen, unidad, alérgenos, costo de referencia y mínimo se comparten entre cocinas. Guardar no cambia las existencias ni reescribe compras o movimientos anteriores. Si cambias el mínimo, se recalculan las alertas; la unidad solo puede cambiarse antes de usar este insumo. Si cambias los alérgenos, se recalculan los productos que usan este artículo.</EffectNote>
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <Input label="Nombre del insumo" value={editForm.name} onChange={(event) => setEditForm((current) => ({ ...current, name: event.target.value }))} />
            <div className="rounded-lg border border-line bg-surface-muted px-4 py-3 text-xs text-ink-muted">Código interno <strong className="mt-1 block font-mono text-sm text-ink">{editing?.code}</strong></div>
          </div>
          <Select label="Tipo de artículo" value={editForm.itemType} onChange={(event) => setEditForm((current) => ({ ...current, itemType: event.target.value as 'INGREDIENT' | 'FINISHED_PRODUCT' }))} hint="Un producto terminado representa unidades ya preparadas para vender; el insumo se usa en elaboración."><SelectOption value="INGREDIENT">Insumo de elaboración</SelectOption><SelectOption value="FINISHED_PRODUCT">Producto terminado</SelectOption></Select>
          <div className={cn('grid min-w-0 gap-4', editCustomUnit && 'sm:grid-cols-2')}>
            <InventoryUnitField
              value={editForm.unit}
              custom={editCustomUnit}
              onSelect={(value) => {
                setEditCustomUnit(value === 'other');
                setEditForm((current) => ({ ...current, unit: value === 'other' ? '' : value }));
              }}
            />
            {editCustomUnit && <Input label="Especifica la unidad" maxLength={10} value={editForm.unit} onChange={(event) => setEditForm((current) => ({ ...current, unit: event.target.value }))} hint="Ej. caja o paquete. Máximo 10 caracteres." required />}
          </div>
          <p className="-mt-3 text-xs text-ink-muted">Puedes cambiarla solo si el insumo no tiene movimientos, compras ni recetas. El sistema no convierte cantidades existentes.</p>
          <MediaPicker value={editForm.imageUrl} altText={editForm.name} category="ingredients" imagePurpose="ingredient" subjectName={editForm.name} label="Imagen del insumo · opcional" hint="Ayuda a identificarlo en Inventario. Para mostrar una foto al cliente al personalizar, elige una imagen en la opción correspondiente del Constructor." onChange={(image) => setEditForm((current) => ({ ...current, imageUrl: image.url }))} />
          <AllergenFields value={editForm.allergens} options={allergenOptions} onChange={(allergens) => setEditForm((current) => ({ ...current, allergens }))} />
          <div className="border-t border-line pt-5">
            <h3 className="text-sm font-black text-ink">Control y costo</h3>
            <p className="mb-4 mt-1 text-xs text-ink-muted">El costo de referencia se usa en futuras entradas; los lotes ya recibidos conservan su costo.</p>
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
              <Input label={`Costo de referencia (S/ por ${editForm.unit || 'unidad'})`} type="number" min="0" step="0.0001" value={editForm.unitCost} onChange={(event) => setEditForm((current) => ({ ...current, unitCost: event.target.value }))} />
              <Input label={`Stock mínimo (${editForm.unit || 'unidad'})`} type="number" min="0" step="0.01" value={editForm.minLevel} onChange={(event) => setEditForm((current) => ({ ...current, minLevel: event.target.value }))} hint="Este umbral se comparte entre cocinas." />
            </div>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nuevo insumo"
        description="Añade un ingrediente o material para controlar stock, costos y compras."
        icon={PackagePlus}
        eyebrow="Maestro de inventario"
        maxWidth="md"
        disableBackdropClose
        actions={
          <>
            <Button variant="outline" disabled={isSaving} onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button isLoading={isSaving} onClick={() => void handleCreate()}>Crear insumo</Button>
          </>
        }
      >
        <div className="grid min-w-0 grid-cols-1 gap-6">
          <EffectNote>Creará un insumo con código automático para todo el negocio y lo habilitará en esta cocina. Si anotas saldo inicial, se registrará como entrada en el historial. Otras cocinas podrán habilitar el mismo insumo desde el maestro.</EffectNote>
          <div className={cn('grid min-w-0 grid-cols-1 gap-4', createCustomUnit ? 'sm:grid-cols-2' : 'sm:grid-cols-[minmax(0,1fr)_220px]')}>
            <Input className={createCustomUnit ? 'sm:col-span-2' : undefined} label="Nombre del insumo" placeholder="Ej. Harina de trigo" value={newItem.name} onChange={(event) => setNewItem((item) => ({ ...item, name: event.target.value }))} hint="Usa el nombre con el que lo identifica tu equipo." />
            <InventoryUnitField
              value={newItem.unit}
              custom={createCustomUnit}
              onSelect={(value) => {
                setCreateCustomUnit(value === 'other');
                setNewItem((item) => ({ ...item, unit: value === 'other' ? '' : value }));
              }}
            />
            {createCustomUnit && <Input label="Especifica la unidad" maxLength={10} value={newItem.unit} onChange={(event) => setNewItem((item) => ({ ...item, unit: event.target.value }))} hint="Ej. caja o paquete. Máximo 10 caracteres." required />}
          </div>
          <div className="flex items-start gap-3 rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-sm">
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-white text-brand-700"><Package className="size-4" /></span>
            <div className="min-w-0"><p className="font-bold text-ink">Código interno automático</p><p className="mt-0.5 text-xs leading-5 text-ink-muted">Se asignará al guardar y podrás verlo en la lista. Es único y no necesitas escribirlo.</p></div>
          </div>
          <MediaPicker value={newItem.imageUrl} altText={newItem.name} category="ingredients" imagePurpose="ingredient" subjectName={newItem.name} label="Imagen del insumo · opcional" hint="Puedes subir, elegir o generar una imagen con IA. Es para identificar el insumo; la imagen pública de cada opción se configura en Constructor." onChange={(image) => setNewItem((current) => ({ ...current, imageUrl: image.url }))} />
          <Select label="Tipo de artículo" value={newItem.itemType} onChange={(event) => setNewItem((current) => ({ ...current, itemType: event.target.value as 'INGREDIENT' | 'FINISHED_PRODUCT' }))} hint="Para vender productos preparados, registra sus unidades listas para venta como Producto terminado."><SelectOption value="INGREDIENT">Insumo de elaboración</SelectOption><SelectOption value="FINISHED_PRODUCT">Producto terminado</SelectOption></Select>
          <AllergenFields value={newItem.allergens} options={allergenOptions} onChange={(allergens) => setNewItem((current) => ({ ...current, allergens }))} />
          <div className="border-t border-line pt-5">
            <h3 className="text-sm font-black text-ink">Valores iniciales</h3>
            <p className="mb-4 mt-1 text-xs text-ink-muted">El costo y el mínimo ayudan a valorar el almacén y detectar faltantes. Si aún no tienes stock, deja el saldo inicial en cero.</p>
            <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-3">
              <Input label={`Costo (S/ por ${newItem.unit || 'unidad'})`} type="number" min="0" step="0.0001" value={newItem.unitCost} onChange={(event) => setNewItem((item) => ({ ...item, unitCost: event.target.value }))} hint="Valor de referencia; no registra un gasto." />
              <Input label={`Mínimo (${newItem.unit || 'unidad'})`} type="number" min="0" step="0.01" value={newItem.minLevel} onChange={(event) => setNewItem((item) => ({ ...item, minLevel: event.target.value }))} hint="Si el disponible baja hasta este nivel, aparece una alerta." />
              <Input label={`Saldo inicial (${newItem.unit || 'unidad'})`} type="number" min="0" step="0.01" value={newItem.initialStock} onChange={(event) => setNewItem((item) => ({ ...item, initialStock: event.target.value }))} hint="Solo lo que ya contaste en cocina; crea entrada inicial sin proveedor ni lote." />
            </div>
          </div>
          <p className="text-xs leading-5 text-ink-muted">Las compras nuevas se registran en <strong>Compras y proveedores</strong> para conservar proveedor, lote y costo real.</p>
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
        title="Maestro de insumos"
        description="Habilita, restaura o elimina definitivamente insumos archivados sin historial."
        icon={PackagePlus}
        eyebrow="Gestión del inventario"
        maxWidth="md"
      >
        <div className="mb-4"><EffectNote>Habilitar añade el insumo a esta cocina con saldo cero; no duplica el código ni mueve stock de otra cocina. Restaurar vuelve a mostrar un insumo archivado donde ya estaba habilitado. Eliminar definitivamente solo funciona si nunca se usó: borra el insumo y su código de todas las cocinas; si hay historial, debes conservarlo archivado.</EffectNote></div>
        <div className="mb-4 flex gap-2 border-b border-line pb-3" role="tablist" aria-label="Estado de los insumos">
          <button type="button" role="tab" aria-selected={!showArchived} onClick={() => setShowArchived(false)} className={cn('rounded-lg px-3 py-2 text-sm font-bold', !showArchived ? 'bg-brand-700 text-white' : 'text-ink-muted hover:bg-brand-50')}>Activos</button>
          <button type="button" role="tab" aria-selected={showArchived} onClick={() => setShowArchived(true)} className={cn('rounded-lg px-3 py-2 text-sm font-bold', showArchived ? 'bg-brand-700 text-white' : 'text-ink-muted hover:bg-brand-50')}>Archivados</button>
        </div>
        {masterError ? (
          <LoadError
            title="No pudimos cargar el maestro de insumos"
            message={masterError}
            onRetry={() => void loadMasterItems()}
          />
        ) : masterItems === null ? (
          <p className="py-6 text-center text-sm text-ink-muted">Cargando insumos…</p>
        ) : visibleMasterItems.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-muted">
            {showArchived ? 'No hay insumos archivados en esta cocina.' : 'Todavía no hay insumos activos en el negocio.'}
          </p>
        ) : (
          <ul className="grid gap-2">
            {visibleMasterItems.map((item) => (
              <li
                key={item.inventoryItemId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line px-3 py-2"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-brand-50 text-brand-600">{item.imageUrl ? <img src={item.imageUrl} alt="" className="size-full object-cover" /> : <Package className="size-5" />}</span>
                  <div className="min-w-0"><p className="truncate text-sm font-semibold text-ink">{item.name}</p>
                    <p className="text-xs text-ink-muted">{item.code} · {item.unit}</p></div>
                </div>

                {!item.isActive ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" className="shrink-0" leftIcon={<RotateCcw className="size-4" />} disabled={enablingId !== null} isLoading={enablingId === item.inventoryItemId} onClick={() => void restoreItem(item)}>Restaurar</Button>
                    <Button size="sm" variant="ghost" className="shrink-0 text-red-700" leftIcon={<Trash2 className="size-4" />} disabled={enablingId !== null} onClick={() => void deleteArchivedItem(item)}>Eliminar</Button>
                  </div>
                ) : item.isEnabledInBranch ? (
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
