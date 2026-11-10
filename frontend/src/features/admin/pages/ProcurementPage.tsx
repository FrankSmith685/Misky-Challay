import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Ban,
  CalendarClock,
  ClipboardList,
  Download,
  ExternalLink,
  Mail,
  Package,
  PackageCheck,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
  Truck,
  WalletCards,
} from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Badge } from '@components/ui/Badge';
import { Button } from '@components/ui/Button';
import { Card, CardDescription, CardHeader, CardTitle } from '@components/ui/Card';
import { useConfirm } from '@components/ui/ConfirmDialog';
import { Input } from '@components/ui/Input';
import { Modal } from '@components/ui/Modal';
import { Pagination } from '@components/ui/Pagination';
import { Select, SelectOption } from '@components/ui/Select';
import { Textarea } from '@components/ui/Textarea';
import { PageHeader } from '@components/common/PageHeader';
import { PageLoader } from '@components/common/PageLoader';
import { LoadError } from '@components/common/LoadError';
import { PERM } from '@constants/permissions';
import { ROUTES } from '@constants/routes';
import { usePermissions } from '@hooks/usePermissions';
import { cn } from '@lib/cn';
import { getApiErrorMessage } from '@services/api/client';
import { BranchSelector } from '../components/BranchSelector';
import { OperationsMetricStrip } from '../components/OperationsMetricStrip';
import { useActiveBranch } from '../hooks/useActiveBranch';
import {
  procurementApi,
  type CostSummary,
  type LotRow,
  type ProcurementItem,
  type PurchaseOrderRow,
  type SupplierRow,
} from '../services/procurement.service';

type Tab = 'orders' | 'suppliers' | 'lots';
type OrderLineDraft = { inventoryItemId: number | ''; quantity: string; unitCost: string };
type ReceiveLineDraft = {
  purchaseOrderItemId: number;
  quantity: string;
  lotCode: string;
  expiresAt: string;
  unitCost: string;
};
type SupplierForm = {
  name: string;
  taxId: string;
  contactName: string;
  email: string;
  phone: string;
  address: string;
  paymentTermsDays: string;
  notes: string;
};

const emptySupplier: SupplierForm = {
  name: '',
  taxId: '',
  contactName: '',
  email: '',
  phone: '',
  address: '',
  paymentTermsDays: '0',
  notes: '',
};
const emptyOrderLine = (): OrderLineDraft => ({ inventoryItemId: '', quantity: '', unitCost: '' });
const PROCUREMENT_PAGE_SIZES = [10, 25, 50] as const;
const money = (value: number) =>
  `S/ ${value.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const quantity = (value: number) => value.toLocaleString('es-PE', { maximumFractionDigits: 2 });
const validDecimal = (raw: string, places: number, positive = false) => {
  const value = Number(raw);
  const factor = 10 ** places;
  return raw.trim() !== '' && Number.isFinite(value) && (positive ? value > 0 : value >= 0)
    && Math.abs(value * factor - Math.round(value * factor)) < 0.000001;
};
const peruToday = () =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
const formatDate = (value?: string | null) => {
  if (!value) return 'Sin fecha';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split('-').reverse().join('/');
  return new Date(value).toLocaleDateString('es-PE', { timeZone: 'America/Lima' });
};
const formatBusinessDate = (value?: string | null) =>
  value ? value.slice(0, 10).split('-').reverse().join('/') : 'Sin fecha';
const daysUntil = (value?: string | null) =>
  value
    ? Math.round(
        (new Date(`${value.slice(0, 10)}T12:00:00`).getTime() -
          new Date(`${peruToday()}T12:00:00`).getTime()) /
          86_400_000,
      )
    : null;
const statusLabel: Record<string, string> = {
  APPROVED: 'Aprobada',
  ORDERED: 'Pendiente',
  PARTIALLY_RECEIVED: 'Recepción parcial',
  RECEIVED: 'Recibida',
  CANCELLED: 'Cancelada',
  DRAFT: 'Borrador',
  ACTIVE: 'Disponible',
  DEPLETED: 'Agotado',
  EXPIRED: 'Vencido',
  BLOCKED: 'Bloqueado',
};
const orderBadge = (status: PurchaseOrderRow['status']) =>
  status === 'RECEIVED' ? 'success' : status === 'CANCELLED' ? 'neutral' : status === 'DRAFT' ? 'danger' : 'warning';
const canReceive = (order: PurchaseOrderRow) =>
  order.status === 'ORDERED' || order.status === 'PARTIALLY_RECEIVED';
const canEditOrder = (order: PurchaseOrderRow) =>
  (order.status === 'ORDERED' || order.status === 'DRAFT') && order.items.every((line) => line.quantityReceived <= 0);
const orderMailto = (order: PurchaseOrderRow) => {
  const lines = order.items.filter((line) => line.quantityOrdered > line.quantityReceived).map((line) =>
    `- ${line.item?.name ?? `Insumo ${line.inventoryItemId}`}: ${quantity(line.quantityOrdered - line.quantityReceived)} ${line.item?.unit ?? ''}`,
  ).join('\n');
  const body = `Hola,\n\nSolicitamos los siguientes insumos para ${order.orderNumber}:\n${lines}\n\nEntrega estimada: ${formatBusinessDate(order.expectedAt)}.\n\nGracias.`;
  return `mailto:${order.supplier?.email ?? ''}?subject=${encodeURIComponent(`Orden de compra ${order.orderNumber}`)}&body=${encodeURIComponent(body)}`;
};

const ProcurementPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { can, isSuperAdmin } = usePermissions();
  const { branchId, branches, setBranchId, setGlobalScope, isLoadingBranches, branchesError, reloadBranches } =
    useActiveBranch({ allowAll: isSuperAdmin });
  const canManage = can(PERM.PROCUREMENT_MANAGE);
  const canViewInventory = can(PERM.INVENTORY_READ) || can(PERM.INVENTORY_MANAGE);

  const [tab, setTab] = useState<Tab>('orders');
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [orders, setOrders] = useState<PurchaseOrderRow[]>([]);
  const [lots, setLots] = useState<LotRow[]>([]);
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [items, setItems] = useState<ProcurementItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [orderFilter, setOrderFilter] = useState('all');
  const [supplierFilter, setSupplierFilter] = useState('active');
  const [lotFilter, setLotFilter] = useState('available');
  const [pageSize, setPageSize] = useState<number>(10);
  const [ordersPage, setOrdersPage] = useState(1);
  const [suppliersPage, setSuppliersPage] = useState(1);
  const [lotsPage, setLotsPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const loadRequestId = useRef(0);
  const displayedBranchId = useRef<number | null>(null);
  const supplierInitial = useRef('');
  const orderInitial = useRef('');
  const receiveInitial = useRef('');

  const [supplierOpen, setSupplierOpen] = useState(false);
  const [resumeOrderAfterSupplier, setResumeOrderAfterSupplier] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<SupplierRow | null>(null);
  const [supplierForm, setSupplierForm] = useState<SupplierForm>(emptySupplier);
  const [supplierAttempted, setSupplierAttempted] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrderRow | null>(null);
  const [orderSupplier, setOrderSupplier] = useState('');
  const [orderExpected, setOrderExpected] = useState('');
  const [orderTax, setOrderTax] = useState('');
  const [orderNotes, setOrderNotes] = useState('');
  const [orderLines, setOrderLines] = useState<OrderLineDraft[]>([emptyOrderLine()]);
  const [orderAttempted, setOrderAttempted] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrderRow | null>(null);
  const [receiving, setReceiving] = useState<PurchaseOrderRow | null>(null);
  const [receiveLines, setReceiveLines] = useState<ReceiveLineDraft[]>([]);
  const [receiveAttempted, setReceiveAttempted] = useState(false);
  const [cancelling, setCancelling] = useState<PurchaseOrderRow | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const load = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    if (displayedBranchId.current !== branchId) {
      displayedBranchId.current = branchId;
      setOrders([]);
      setLots([]);
      setSummary(null);
      setItems([]);
      setSelectedOrder(null);
      setReceiving(null);
      setCancelling(null);
      setOrderOpen(false);
      setResumeOrderAfterSupplier(false);
    }
    setLoading(true);
    setError(null);
    try {
      const [supplierRows, orderRows, lotRows, costRows, itemRows] = await Promise.all([
        procurementApi.suppliers(true),
        procurementApi.purchaseOrders(branchId ?? undefined),
        procurementApi.lots(branchId ?? undefined),
        procurementApi.costSummary(branchId ?? undefined),
        branchId ? procurementApi.inventory(branchId) : Promise.resolve([]),
      ]);
      if (requestId !== loadRequestId.current) return;
      setSuppliers(supplierRows);
      setOrders(orderRows);
      setLots(lotRows);
      setSummary(costRows);
      setItems(itemRows);
      setSelectedOrder((current) =>
        current ? (orderRows.find((order) => order.id === current.id) ?? null) : null,
      );
    } catch (cause) {
      if (requestId === loadRequestId.current) setError(getApiErrorMessage(cause));
    } finally {
      if (requestId === loadRequestId.current) setLoading(false);
    }
  }, [branchId]);
  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const itemId = Number(params.get('item'));
    if (!itemId || loading || !branchId || !canManage) return;
    const item = items.find((entry) => entry.id === itemId);
    if (item) {
      const suggested = Number(params.get('qty'));
      setTab('orders');
      setOrderAttempted(false);
      setEditingOrder(null);
      setOrderExpected('');
      setOrderTax('');
      setOrderNotes('');
      const lines: OrderLineDraft[] = [
        {
          inventoryItemId: itemId,
          quantity: Number.isFinite(suggested) && suggested > 0 ? String(suggested) : '',
          unitCost: String(item.unitCost ?? 0),
        },
      ];
      setOrderLines(lines);
      const active = suppliers.filter((supplier) => supplier.isActive);
      const supplier = active.length === 1 ? String(active[0].id) : '';
      setOrderSupplier(supplier);
      orderInitial.current = JSON.stringify({ supplier, expected: '', tax: '', notes: '', lines });
      setOrderOpen(true);
    } else toast.error('El insumo no está disponible en esta sucursal');
    navigate(location.pathname, { replace: true });
  }, [
    branchId,
    canManage,
    items,
    loading,
    location.pathname,
    location.search,
    navigate,
    suppliers,
  ]);

  const pending = useMemo(() => orders.filter(canReceive), [orders]);
  const overdue = pending.filter(
    (order) => order.expectedAt && order.expectedAt.slice(0, 10) < peruToday(),
  ).length;
  const filteredOrders = useMemo(
    () =>
      orders.filter((order) => {
        const matches = [
          order.orderNumber,
          order.supplier?.name,
          ...order.items.map((line) => line.item?.name),
        ].some((value) => value?.toLowerCase().includes(search.trim().toLowerCase()));
        const statusMatches =
          orderFilter === 'all' ||
          (orderFilter === 'pending' ? canReceive(order) : order.status === orderFilter);
        return matches && statusMatches;
      }),
    [orders, search, orderFilter],
  );
  const filteredSuppliers = useMemo(
    () =>
      suppliers.filter(
        (supplier) =>
          (supplierFilter === 'all' || (supplierFilter === 'active') === supplier.isActive) &&
          [supplier.name, supplier.code, supplier.taxId, supplier.contactName].some((value) =>
            value?.toLowerCase().includes(search.trim().toLowerCase()),
          ),
      ),
    [suppliers, search, supplierFilter],
  );
  const filteredLots = useMemo(
    () =>
      lots.filter((lot) => {
        const expiring = daysUntil(lot.expiresAt);
        const statusMatches =
          lotFilter === 'all' ||
          (lotFilter === 'available'
            ? lot.status === 'ACTIVE' && lot.quantityAvailable > 0
            : lotFilter === 'expiring'
              ? lot.status === 'ACTIVE' &&
                lot.quantityAvailable > 0 &&
                expiring !== null &&
                expiring >= 0 &&
                expiring <= 7
              : lotFilter === 'expiring15'
                ? lot.status === 'ACTIVE' && lot.quantityAvailable > 0 && expiring !== null && expiring >= 0 && expiring <= 15
                : lotFilter === 'expiring30'
                  ? lot.status === 'ACTIVE' && lot.quantityAvailable > 0 && expiring !== null && expiring >= 0 && expiring <= 30
                  : lot.status === lotFilter);
        return (
          statusMatches &&
          [lot.lotCode, lot.item?.name, lot.supplier?.name].some((value) =>
            value?.toLowerCase().includes(search.trim().toLowerCase()),
          )
        );
      }),
    [lots, search, lotFilter],
  );
  const ordersTotalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const suppliersTotalPages = Math.max(1, Math.ceil(filteredSuppliers.length / pageSize));
  const lotsTotalPages = Math.max(1, Math.ceil(filteredLots.length / pageSize));
  const pagedOrders = useMemo(() => filteredOrders.slice((ordersPage - 1) * pageSize, ordersPage * pageSize), [filteredOrders, ordersPage, pageSize]);
  const pagedSuppliers = useMemo(() => filteredSuppliers.slice((suppliersPage - 1) * pageSize, suppliersPage * pageSize), [filteredSuppliers, suppliersPage, pageSize]);
  const pagedLots = useMemo(() => filteredLots.slice((lotsPage - 1) * pageSize, lotsPage * pageSize), [filteredLots, lotsPage, pageSize]);

  useEffect(() => {
    setOrdersPage(1);
    setSuppliersPage(1);
    setLotsPage(1);
  }, [search, orderFilter, supplierFilter, lotFilter, pageSize, branchId, tab]);

  useEffect(() => {
    setOrdersPage((current) => Math.min(current, ordersTotalPages));
  }, [ordersTotalPages]);
  useEffect(() => {
    setSuppliersPage((current) => Math.min(current, suppliersTotalPages));
  }, [suppliersTotalPages]);
  useEffect(() => {
    setLotsPage((current) => Math.min(current, lotsTotalPages));
  }, [lotsTotalPages]);

  const currentFilteredCount = tab === 'orders' ? filteredOrders.length : tab === 'suppliers' ? filteredSuppliers.length : filteredLots.length;
  const currentPage = tab === 'orders' ? ordersPage : tab === 'suppliers' ? suppliersPage : lotsPage;
  const currentPageStart = currentFilteredCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const currentPageEnd = Math.min(currentPage * pageSize, currentFilteredCount);
  const orderSubtotal = orderLines.reduce(
    (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitCost) || 0),
    0,
  );
  const orderTotal = orderSubtotal + (Number(orderTax) || 0);
  const activeSuppliers = suppliers.filter((supplier) => supplier.isActive);
  const orderSuppliers =
    editingOrder?.supplier && !editingOrder.supplier.isActive
      ? [...activeSuppliers, editingOrder.supplier]
      : activeSuppliers;
  const selectedSupplier = orderSuppliers.find((supplier) => supplier.id === Number(orderSupplier));
  const supplierNameError = supplierForm.name.trim().length < 2 || supplierForm.name.trim().length > 120
    ? 'Escribe un nombre de 2 a 120 caracteres.' : undefined;
  const supplierDays = Number(supplierForm.paymentTermsDays);
  const supplierTermsError = supplierForm.paymentTermsDays.trim() === '' || !Number.isInteger(supplierDays)
    || supplierDays < 0 || supplierDays > 365 ? 'Usa un número entero entre 0 y 365.' : undefined;
  const supplierEmailError = supplierForm.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supplierForm.email.trim())
    ? 'Escribe un correo válido o deja este campo vacío.' : undefined;
  const orderExpectedError = orderExpected && orderExpected < peruToday()
    && orderExpected !== editingOrder?.expectedAt?.slice(0, 10)
    ? 'La fecha no puede ser anterior a hoy.' : undefined;
  const orderTaxError = orderTax && !validDecimal(orderTax, 2)
    ? 'Usa un importe de 0 o más con hasta 2 decimales.' : undefined;
  const orderLineError = (line: OrderLineDraft) => ({
    item: !line.inventoryItemId ? 'Selecciona un insumo.'
      : orderLines.filter((entry) => entry.inventoryItemId === line.inventoryItemId).length > 1
        ? 'Cada insumo debe aparecer solo una vez.' : undefined,
    quantity: !validDecimal(line.quantity, 2, true) ? 'Mayor que 0; máximo 2 decimales.' : undefined,
    unitCost: !validDecimal(line.unitCost, 4) ? 'Costo de 0 o más; máximo 4 decimales.' : undefined,
  });
  const orderSnapshot = (supplier: string, expected: string, tax: string, notes: string, lines: OrderLineDraft[]) =>
    JSON.stringify({ supplier, expected, tax, notes, lines });
  const confirmDiscard = async (formName: string) => {
    const { confirmed } = await confirm({
      title: '¿Descartar cambios?',
      message: `Hay datos sin guardar en ${formName}. Si sales ahora tendrás que escribirlos otra vez.`,
      confirmLabel: 'Descartar cambios',
      cancelLabel: 'Seguir editando',
      tone: 'danger',
    });
    return confirmed;
  };

  const openSupplier = (supplier?: SupplierRow) => {
    setSupplierAttempted(false);
    setEditingSupplier(supplier ?? null);
    const form = supplier
        ? {
            name: supplier.name,
            taxId: supplier.taxId ?? '',
            contactName: supplier.contactName ?? '',
            email: supplier.email ?? '',
            phone: supplier.phone ?? '',
            address: supplier.address ?? '',
            paymentTermsDays: String(supplier.paymentTermsDays),
            notes: supplier.notes ?? '',
          }
        : emptySupplier;
    supplierInitial.current = JSON.stringify(form);
    setSupplierForm(form);
    setSupplierOpen(true);
  };
  const closeSupplier = async () => {
    if (saving) return;
    if (JSON.stringify(supplierForm) !== supplierInitial.current && !(await confirmDiscard('el proveedor'))) return;
    setSupplierOpen(false);
    if (resumeOrderAfterSupplier) {
      setTab('orders');
      setOrderOpen(true);
      setResumeOrderAfterSupplier(false);
    }
  };
  const saveSupplier = async () => {
    setSupplierAttempted(true);
    const days = Number(supplierForm.paymentTermsDays);
    if (supplierNameError || supplierTermsError || supplierEmailError) {
      toast.error('Revisa los campos señalados antes de guardar el proveedor');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...supplierForm,
        name: supplierForm.name.trim(),
        email: supplierForm.email.trim() || null,
        paymentTermsDays: days,
      };
      const savedSupplier = editingSupplier
        ? await procurementApi.updateSupplier(editingSupplier.id, payload)
        : await procurementApi.createSupplier(payload);
      toast.success(editingSupplier ? 'Proveedor actualizado' : 'Proveedor creado');
      setSupplierOpen(false);
      setEditingSupplier(null);
      await load();
      if (resumeOrderAfterSupplier) {
        setOrderSupplier(String(savedSupplier.id));
        setTab('orders');
        setOrderOpen(true);
        setResumeOrderAfterSupplier(false);
      }
    } catch (cause) {
      toast.error(getApiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };
  const toggleSupplier = async (supplier: SupplierRow) => {
    if (supplier.isActive) {
      const { confirmed } = await confirm({
        title: `Desactivar ${supplier.name}`,
        message:
          'No se podrá elegir en órdenes nuevas. Las compras y los lotes existentes se conservarán.',
        confirmLabel: 'Desactivar proveedor',
        tone: 'danger',
      });
      if (!confirmed) return;
    }
    setSaving(true);
    try {
      await procurementApi.updateSupplier(supplier.id, { isActive: !supplier.isActive });
      toast.success(supplier.isActive ? 'Proveedor desactivado' : 'Proveedor reactivado');
      await load();
    } catch (cause) {
      toast.error(getApiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };
  const openOrder = () => {
    setOrderAttempted(false);
    setEditingOrder(null);
    const supplier = activeSuppliers.length === 1 ? String(activeSuppliers[0].id) : '';
    setOrderSupplier(supplier);
    setOrderExpected('');
    setOrderTax('');
    setOrderNotes('');
    const lines = [emptyOrderLine()];
    setOrderLines(lines);
    orderInitial.current = orderSnapshot(supplier, '', '', '', lines);
    setOrderOpen(true);
  };
  const openEditOrder = (order: PurchaseOrderRow) => {
    setOrderAttempted(false);
    setSelectedOrder(null);
    setEditingOrder(order);
    setOrderSupplier(String(order.supplierId));
    setOrderExpected(order.expectedAt?.slice(0, 10) ?? '');
    setOrderTax(order.tax ? String(order.tax) : '');
    setOrderNotes(order.notes ?? '');
    const lines = order.items.map((line) => ({
        inventoryItemId: line.inventoryItemId,
        quantity: String(line.quantityOrdered),
        unitCost: String(line.unitCost),
      }));
    setOrderLines(lines);
    orderInitial.current = orderSnapshot(String(order.supplierId), order.expectedAt?.slice(0, 10) ?? '', order.tax ? String(order.tax) : '', order.notes ?? '', lines);
    setOrderOpen(true);
  };
  const closeOrder = async () => {
    if (saving) return;
    if (orderSnapshot(orderSupplier, orderExpected, orderTax, orderNotes, orderLines) !== orderInitial.current
      && !(await confirmDiscard('la orden'))) return;
    setOrderOpen(false);
  };
  const startPurchase = () => {
    if (!items.length) {
      if (can(PERM.INVENTORY_MANAGE)) navigate(ROUTES.adminInventory);
      else toast.error('No hay insumos en esta cocina. Pide a Inventario que cree o habilite uno.');
      return;
    }
    if (!activeSuppliers.length) {
      openOrder();
      setOrderOpen(false);
      setResumeOrderAfterSupplier(true);
      setTab('suppliers');
      openSupplier();
      return;
    }
    openOrder();
  };
  const startPurchaseLabel = !items.length
    ? can(PERM.INVENTORY_MANAGE) ? 'Crear insumo' : 'Sin insumos disponibles'
    : !activeSuppliers.length ? 'Nuevo proveedor' : 'Nueva orden';
  const clearFilters = () => {
    setSearch('');
    if (tab === 'orders') setOrderFilter('all');
    if (tab === 'suppliers') setSupplierFilter('all');
    if (tab === 'lots') setLotFilter('all');
  };

  const exportCurrent = () => {
    const rows = tab === 'orders'
      ? filteredOrders.map((order) => [order.orderNumber, order.branch?.name ?? '', order.supplier?.name ?? '', statusLabel[order.status], order.total, order.expectedAt ?? '', order.items.map((line) => line.item?.name ?? line.inventoryItemId).join(' | ')])
      : tab === 'lots'
        ? filteredLots.map((lot) => [lot.branch?.name ?? '', lot.lotCode, lot.item?.name ?? lot.inventoryItemId, lot.supplier?.name ?? '', lot.status, lot.quantityAvailable, lot.unitCost, lot.expiresAt ?? ''])
        : filteredSuppliers.map((supplier) => [supplier.code, supplier.name, supplier.taxId ?? '', supplier.contactName ?? '', supplier.email ?? '', supplier.phone ?? '', supplier.isActive ? 'Activo' : 'Inactivo']);
    const headers = tab === 'orders' ? ['Orden', 'Sucursal', 'Proveedor', 'Estado', 'Total', 'Entrega estimada', 'Insumos'] : tab === 'lots' ? ['Sucursal', 'Lote', 'Insumo', 'Proveedor', 'Estado', 'Disponible', 'Costo unitario', 'Vencimiento'] : ['Código', 'Proveedor', 'RUC/Dato fiscal', 'Contacto', 'Correo', 'Teléfono', 'Estado'];
    const csv = [headers, ...rows].map((line) => line.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([`\ufeff${csv}`], { type: 'text/csv;charset=utf-8' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `compras-${tab}-${new Date().toISOString().slice(0, 10)}.csv`; anchor.click(); URL.revokeObjectURL(url);
  };
  const showOrderForLot = (lot: LotRow) => {
    const order = orders.find((entry) => entry.id === lot.purchaseOrderId);
    if (!order) {
      toast.error('No se pudo encontrar la orden de este lote en la cocina seleccionada');
      return;
    }
    setSearch('');
    setOrderFilter('all');
    setTab('orders');
    setSelectedOrder(order);
  };
  const saveOrder = async () => {
    setOrderAttempted(true);
    if (!branchId || !orderSupplier) {
      toast.error('Selecciona un proveedor activo');
      return;
    }
    const ids = orderLines.map((line) => Number(line.inventoryItemId));
    if (
      !orderLines.length ||
      orderLines.some(
        (line) =>
          !line.inventoryItemId ||
          !validDecimal(line.quantity, 2, true) ||
          !validDecimal(line.unitCost, 4),
      )
    ) {
      toast.error('Completa cada insumo: cantidad con hasta dos decimales y costo con hasta cuatro');
      return;
    }
    if (new Set(ids).size !== ids.length) {
      toast.error('Cada insumo debe aparecer una sola vez');
      return;
    }
    if (
      orderExpected &&
      orderExpected < peruToday() &&
      orderExpected !== editingOrder?.expectedAt?.slice(0, 10)
    ) {
      toast.error('La entrega estimada no puede estar en el pasado');
      return;
    }
    if (orderTax && !validDecimal(orderTax, 2)) {
      toast.error('El impuesto adicional debe ser válido y tener hasta dos decimales');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        branchId,
        supplierId: Number(orderSupplier),
        expectedAt: orderExpected || undefined,
        notes: orderNotes.trim() || undefined,
        tax: Number(orderTax || 0),
        items: orderLines.map((line) => ({
          inventoryItemId: Number(line.inventoryItemId),
          quantity: Number(line.quantity),
          unitCost: Number(line.unitCost),
        })),
      };
      const savedOrder = editingOrder
        ? await procurementApi.updatePurchaseOrder(editingOrder.id, payload)
        : await procurementApi.createPurchaseOrder({ ...payload, idempotencyKey: crypto.randomUUID() });
      toast.success(
        editingOrder
          ? 'Orden actualizada'
          : savedOrder.status === 'DRAFT'
            ? 'Orden creada; requiere aprobación por su importe'
            : 'Orden creada; recibirás los lotes cuando llegue la mercadería',
      );
      setOrderOpen(false);
      setEditingOrder(null);
      setOrderLines([emptyOrderLine()]);
      await load();
    } catch (cause) {
      toast.error(getApiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };
  const openReceive = (order: PurchaseOrderRow) => {
    setReceiveAttempted(false);
    setSelectedOrder(null);
    setReceiving(order);
    const lines = order.items
        .filter((line) => line.quantityOrdered > line.quantityReceived)
        .map((line) => ({
          purchaseOrderItemId: line.id,
          quantity: '',
          lotCode: '',
          expiresAt: '',
          unitCost: String(line.unitCost),
        }));
    receiveInitial.current = JSON.stringify(lines);
    setReceiveLines(lines);
  };
  const closeReceive = async () => {
    if (saving) return;
    if (JSON.stringify(receiveLines) !== receiveInitial.current && !(await confirmDiscard('la recepción'))) return;
    setReceiving(null);
  };
  const chosenReceiveLines = receiveLines.filter((line) => line.quantity.trim() !== '');
  const lotCodeExists = (inventoryItemId: number, lotCode: string) => lots.some((lot) =>
    lot.inventoryItemId === inventoryItemId
    && lot.lotCode.toLocaleLowerCase('es') === lotCode.trim().toLocaleLowerCase('es'),
  );
  const receiveLineError = (line: ReceiveLineDraft) => {
    const item = receiving?.items.find((entry) => entry.id === line.purchaseOrderItemId);
    const remaining = (item?.quantityOrdered ?? 0) - (item?.quantityReceived ?? 0);
    return {
      quantity: !validDecimal(line.quantity, 2, true) || Number(line.quantity) > remaining + 0.00001
        ? `Indica más de 0 y hasta ${quantity(Math.max(0, remaining))}, con máximo 2 decimales.` : undefined,
      lotCode: !line.lotCode.trim() ? 'Indica el código del envase o genera uno interno.'
        : item && lotCodeExists(item.inventoryItemId, line.lotCode)
          ? 'Este código ya existe para el insumo en esta cocina.' : undefined,
      expiresAt: line.expiresAt && line.expiresAt < peruToday() ? 'El vencimiento no puede ser anterior a hoy.' : undefined,
      unitCost: !validDecimal(line.unitCost, 4) ? 'Usa un costo de 0 o más, con máximo 4 decimales.' : undefined,
    };
  };
  const receivePreviewValid = chosenReceiveLines.every((line) => {
    const item = receiving?.items.find((entry) => entry.id === line.purchaseOrderItemId);
    if (!item) return false;
    return validDecimal(line.quantity, 2, true)
      && Number(line.quantity) <= (item.quantityOrdered - item.quantityReceived) + 0.00001
      && validDecimal(line.unitCost, 4) && Boolean(line.lotCode.trim())
      && !lotCodeExists(item.inventoryItemId, line.lotCode)
      && (!line.expiresAt || line.expiresAt >= peruToday());
  });
  const receivedValue = chosenReceiveLines.reduce(
    (sum, line) => sum + (Number(line.quantity) || 0) * (Number(line.unitCost) || 0),
    0,
  );
  const completesOrder = receiving?.items.every((item) => {
    const draft = chosenReceiveLines.find((line) => line.purchaseOrderItemId === item.id);
    return item.quantityReceived + Number(draft?.quantity || 0) >= item.quantityOrdered - 0.000001;
  }) ?? false;
  const receiveOrder = async () => {
    setReceiveAttempted(true);
    if (!branchId || !receiving) return;
    const chosen = chosenReceiveLines;
    if (!chosen.length) {
      toast.error('Indica al menos un insumo recibido');
      return;
    }
    for (const line of chosen) {
      const item = receiving.items.find((candidate) => candidate.id === line.purchaseOrderItemId);
      if (item && lotCodeExists(item.inventoryItemId, line.lotCode)) {
        toast.error(`El lote ${line.lotCode.trim()} ya existe para ${item.item?.name ?? 'este insumo'} en esta cocina`);
        return;
      }
      const remaining = (item?.quantityOrdered ?? 0) - (item?.quantityReceived ?? 0);
      if (
        !validDecimal(line.quantity, 2, true) ||
        Number(line.quantity) > remaining + 0.00001 ||
        !line.lotCode.trim() ||
        !validDecimal(line.unitCost, 4) ||
        (line.expiresAt && line.expiresAt < peruToday())
      ) {
        toast.error(
          `Revisa cantidad, lote, vencimiento y costo de ${item?.item?.name ?? 'cada insumo'}`,
        );
        return;
      }
    }
    setSaving(true);
    try {
      await procurementApi.receivePurchaseOrder(receiving.id, {
        branchId,
        idempotencyKey: crypto.randomUUID(),
        lines: chosen.map((line) => ({
          purchaseOrderItemId: line.purchaseOrderItemId,
          quantity: Number(line.quantity),
          lotCode: line.lotCode.trim(),
          expiresAt: line.expiresAt || undefined,
          unitCost: Number(line.unitCost),
        })),
      });
      toast.success('Recepción registrada: stock y costo actualizados');
      setReceiving(null);
      await load();
    } catch (cause) {
      toast.error(getApiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };
  const cancelOrder = async () => {
    if (!branchId || !cancelling) return;
    if (cancelReason.trim().length < 4 || cancelReason.trim().length > 500) {
      toast.error('Escribe un motivo de 4 a 500 caracteres');
      return;
    }
    setSaving(true);
    try {
      await procurementApi.cancelPurchaseOrder(cancelling.id, branchId, cancelReason.trim());
      toast.success('Saldo pendiente cancelado; los lotes recibidos se conservan');
      setCancelling(null);
      setCancelReason('');
      setSelectedOrder(null);
      await load();
    } catch (cause) {
      toast.error(getApiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const approveOrder = async (order: PurchaseOrderRow) => {
    if (!branchId) return;
    setSaving(true);
    try {
      await procurementApi.approvePurchaseOrder(order.id, branchId);
      toast.success('Orden aprobada y lista para enviar al proveedor');
      await load();
    } catch (cause) { toast.error(getApiErrorMessage(cause)); }
    finally { setSaving(false); }
  };
  const closeCancel = async () => {
    if (saving) return;
    if (cancelReason.trim() && !(await confirmDiscard('la cancelación'))) return;
    setCancelling(null);
  };

  if (isLoadingBranches || (loading && !summary)) return <PageLoader />;
  if (branchesError && !branchId)
    return <LoadError message={branchesError} onRetry={reloadBranches} />;
  if (error && !summary) return <LoadError message={error} onRetry={load} />;

  const emptyMessage =
    tab === 'orders'
      ? 'No encontramos órdenes con estos filtros.'
      : tab === 'suppliers'
        ? 'No encontramos proveedores con estos filtros.'
        : 'No encontramos lotes con estos filtros.';
  const filterOptions: Array<[string, string]> =
    tab === 'orders'
      ? [
          ['all', 'Todas'],
          ['pending', 'Por recibir'],
          ['DRAFT', 'Pendientes de aprobación'],
          ['APPROVED', 'Aprobadas'],
          ['RECEIVED', 'Recibidas'],
          ['CANCELLED', 'Canceladas'],
        ]
      : tab === 'suppliers'
        ? [
            ['active', 'Activos'],
            ['inactive', 'Inactivos'],
            ['all', 'Todos'],
          ]
        : [
            ['available', 'Disponibles'],
            ['expiring', 'Vencen en 7 días'],
            ['expiring15', 'Vencen en 15 días'],
            ['expiring30', 'Vencen en 30 días'],
            ['EXPIRED', 'Vencidos'],
            ['DEPLETED', 'Agotados'],
            ['BLOCKED', 'Bloqueados'],
            ['all', 'Todos'],
          ];
  return (
    <div className="grid gap-6">
      <PageHeader
        eyebrow="Compras y abastecimiento"
        title="Compras, proveedores y lotes"
        description="Planifica pedidos, registra cada entrega y sigue el costo real de tus insumos."
        action={
          <div className="flex flex-wrap gap-2">
            <BranchSelector
              value={branchId}
              branches={branches}
              onChange={setBranchId}
              allowAll={isSuperAdmin}
              onSelectAll={setGlobalScope}
              hasError={Boolean(branchesError)}
            />
            <Button variant="outline" size="sm" onClick={exportCurrent} leftIcon={<Download size={16} />}>Exportar CSV</Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void load()}
              leftIcon={<RefreshCw size={16} />}
            >
              Actualizar
            </Button>
          </div>
        }
      />

      {!branchId && !isSuperAdmin && (
        <Card className="border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          Puedes preparar el directorio de proveedores ahora. Para crear órdenes y recibir lotes, primero necesitas una cocina asignada.
        </Card>
      )}

      {error && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          <span>No se pudieron actualizar los datos: {error}</span>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            Reintentar
          </Button>
        </div>
      )}
      <Card className="border-brand-100 bg-gradient-to-r from-brand-50 via-white to-accent-50 p-4 shadow-e1 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-700 text-white">
              <PackageCheck className="size-5" />
            </span>
            <div>
              <h2 className="font-extrabold text-ink">Cómo funcionan las compras</h2>
              <p className="mt-1 max-w-2xl text-sm text-ink-muted">
                Aquí planificas el abastecimiento, registras lo que realmente llegó y conservas
                el proveedor, el lote y el costo de cada insumo. Los proveedores se comparten en
                el negocio; las órdenes y los lotes pertenecen a la cocina seleccionada.
              </p>
            </div>
          </div>
          {canManage && (
            <Button size="sm" disabled={!branchId} onClick={startPurchase} leftIcon={<Plus className="size-4" />}>
              {startPurchaseLabel}
            </Button>
          )}
        </div>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <li className="rounded-lg border border-brand-100 bg-white/85 p-3">
            <strong className="block text-sm text-ink">1. Prepara</strong>
            <p className="mt-1 text-xs leading-5 text-ink-muted">Necesitas un proveedor activo y un insumo habilitado en esta cocina. Desde Inventario puedes abrir una compra con la cantidad sugerida.</p>
          </li>
          <li className="rounded-lg border border-brand-100 bg-white/85 p-3">
            <strong className="block text-sm text-ink">2. Registra la orden</strong>
            <p className="mt-1 text-xs leading-5 text-ink-muted">Elige cantidades, costo previsto y fecha estimada. La orden queda registrada aquí; no envía un correo al proveedor ni aumenta el stock. Puedes editarla antes de la primera recepción.</p>
          </li>
          <li className="rounded-lg border border-brand-100 bg-white/85 p-3">
            <strong className="block text-sm text-ink">3. Recibe lo entregado</strong>
            <p className="mt-1 text-xs leading-5 text-ink-muted">Anota la cantidad real, el código de lote, el costo y el vencimiento si existe. La recepción aumenta Inventario; puedes recibir una parte y dejar el resto pendiente.</p>
          </li>
          <li className="rounded-lg border border-brand-100 bg-white/85 p-3">
            <strong className="block text-sm text-ink">4. Sigue lotes y costos</strong>
            <p className="mt-1 text-xs leading-5 text-ink-muted">Revisa qué lote sigue disponible o vence pronto y cuánto costó. Cancelar una orden solo cierra lo pendiente; lo recibido y su stock se conservan.</p>
          </li>
        </ol>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs leading-5 text-ink-muted">
          <p>«Stock en lotes» valora solo lotes activos recibidos; las entradas manuales se consultan en Inventario.</p>
          {canViewInventory && <Link to={ROUTES.adminInventory} className="font-bold text-brand-700 hover:underline">Ver Inventario</Link>}
        </div>
      </Card>

      <OperationsMetricStrip
        metrics={[
          {
            label: 'Por recibir',
            value: pending.length,
            icon: ClipboardList,
            tone: pending.length ? 'accent' : 'neutral',
          },
          {
            label: 'Entregas atrasadas',
            value: overdue,
            icon: CalendarClock,
            tone: overdue ? 'danger' : 'neutral',
          },
          {
            label: 'Valor recibido',
            value: money(summary?.purchasesTotal ?? 0),
            icon: Truck,
            tone: 'brand',
          },
          {
            label: 'Variación vs previsto',
            value: money(summary?.purchaseVariance ?? 0),
            icon: WalletCards,
            tone: (summary?.purchaseVariance ?? 0) > 0 ? 'danger' : 'neutral',
          },
          { label: 'Stock en lotes', value: money(summary?.stockValue ?? 0), icon: WalletCards },
        ]}
      />

      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div
          className="flex max-w-full gap-2 overflow-x-auto"
          role="tablist"
          aria-label="Gestión de compras"
        >
          {(
            [
              ['orders', 'Órdenes', orders.length],
              ['suppliers', 'Proveedores', suppliers.length],
              ['lots', 'Lotes y costos', lots.length],
            ] as Array<[Tab, string, number]>
          ).map(([value, label, count]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => {
                setTab(value);
                setSearch('');
              }}
              className={cn(
                'shrink-0 rounded-lg px-4 py-2.5 text-sm font-bold transition',
                tab === value
                  ? 'bg-brand-700 text-white shadow-e1'
                  : 'text-ink-muted hover:bg-brand-50 hover:text-brand-800',
              )}
            >
              {label}{' '}
              <span
                className={cn(
                  'ml-1 rounded-full px-1.5 py-0.5 text-xs',
                  tab === value ? 'bg-white/20' : 'bg-surface-muted',
                )}
              >
                {count}
              </span>
            </button>
          ))}
        </div>
        {canManage && tab === 'suppliers' && (
          <Button size="sm" leftIcon={<Plus size={16} />} onClick={() => openSupplier()}>
            Nuevo proveedor
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <Input
            label={`Buscar ${tab === 'orders' ? 'orden' : tab === 'suppliers' ? 'proveedor' : 'lote'}`}
            startAdornment={<Search className="size-4" />}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={
              tab === 'orders'
                ? 'Buscar orden, proveedor o insumo'
                : tab === 'suppliers'
                  ? 'Buscar nombre, código o contacto'
                  : 'Buscar lote, insumo o proveedor'
            }
          />
        </div>
        <div className="w-full sm:w-52">
          <Select
            label="Estado"
            value={
              tab === 'orders' ? orderFilter : tab === 'suppliers' ? supplierFilter : lotFilter
            }
            onChange={(event) =>
              tab === 'orders'
                ? setOrderFilter(String(event.target.value))
                : tab === 'suppliers'
                  ? setSupplierFilter(String(event.target.value))
                  : setLotFilter(String(event.target.value))
            }
          >
            {filterOptions.map(([value, label]) => (
              <SelectOption key={value} value={value}>
                {label}
              </SelectOption>
            ))}
          </Select>
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-ink-muted sm:pb-1">
          <label className="flex items-center gap-2">
            <span>Mostrar</span>
            <select
              aria-label="Resultados por página"
              value={pageSize}
              onChange={(event) => setPageSize(Number(event.target.value))}
              className="rounded-lg border border-line bg-white px-2 py-2 text-ink"
            >
              {PROCUREMENT_PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>
          <span className="whitespace-nowrap">
            {currentFilteredCount > 0 ? `${currentPageStart}–${currentPageEnd} de ${currentFilteredCount}` : '0 resultados'}
          </span>
        </div>
      </div>

      {tab === 'orders' &&
        (filteredOrders.length ? (
          <>
          <div className="grid gap-3">
            {pagedOrders.map((order) => {
              const receivedLines = order.items.filter((line) => line.quantityReceived > 0).length;
              const percent = order.items.length
                ? Math.round(
                    (order.items.reduce(
                      (sum, line) =>
                        sum + Math.min(1, line.quantityReceived / line.quantityOrdered),
                      0,
                    ) /
                      order.items.length) *
                      100,
                  )
                : 0;
              const late =
                canReceive(order) &&
                order.expectedAt &&
                order.expectedAt.slice(0, 10) < peruToday();
              return (
                <Card key={order.id} className="p-0 shadow-e1">
                  <div className="flex flex-wrap items-start justify-between gap-4 p-4 sm:p-5">
                    <div className="flex min-w-0 items-start gap-3">
                      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700">
                        <ClipboardList className="size-5" />
                      </span>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <h2 className="font-extrabold text-ink">{order.orderNumber}</h2>
                          <Badge variant={orderBadge(order.status)}>
                            {statusLabel[order.status]}
                          </Badge>
                          {late && <Badge variant="danger">Entrega atrasada</Badge>}
                        </div>
                        <p className="mt-1 text-sm text-ink-muted">
                          {order.supplier?.name ?? 'Proveedor'} · {order.items.length}{' '}
                          {order.items.length === 1 ? 'insumo' : 'insumos'}
                        </p>
                        {branchId === null && order.branch && <p className="mt-1 text-xs font-bold text-brand-700">Sucursal: {order.branch.name}</p>}
                        <p className="mt-1 text-xs text-ink-muted">
                          Solicitada {formatDate(order.orderedAt)} · Entrega{' '}
                          {formatBusinessDate(order.expectedAt)}
                        </p>
                      </div>
                    </div>
                    <div className="text-left sm:text-right">
                      <p className="text-xs font-semibold uppercase tracking-wide text-ink-muted">
                        Total previsto
                      </p>
                      <p className="text-lg font-black tabular-nums text-ink">
                        {money(order.total)}
                      </p>
                    </div>
                  </div>
                  <div className="px-4 pb-4 sm:px-5">
                    <div className="mb-2 flex justify-between text-xs text-ink-muted">
                      <span>Recepción</span>
                      <span>
                        {percent}% · {receivedLines}/{order.items.length} líneas con recepción
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
                      <div
                        className="h-full rounded-full bg-brand-600"
                        style={{ width: `${percent}%` }}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 sm:px-5">
                    <Button size="sm" variant="ghost" onClick={() => setSelectedOrder(order)}>
                      Ver detalle <ArrowRight className="ml-1 size-4" />
                    </Button>
                    {canManage && branchId && order.status === 'DRAFT' && (
                      <Button size="sm" onClick={() => void approveOrder(order)} isLoading={saving}>Aprobar y ordenar</Button>
                    )}
                    {canManage && branchId && canReceive(order) && (
                      <div className="flex flex-wrap gap-2">
                        {canEditOrder(order) && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => openEditOrder(order)}
                            leftIcon={<Pencil className="size-4" />}
                          >
                            Editar
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setCancelling(order);
                            setCancelReason('');
                          }}
                        >
                          Cancelar pendiente
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => openReceive(order)}
                          leftIcon={<PackageCheck className="size-4" />}
                        >
                          Registrar recepción
                        </Button>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
          {ordersTotalPages > 1 && (
            <div className="mt-5 flex flex-col items-center justify-between gap-3 rounded-card border border-line bg-white p-4 shadow-e1 sm:flex-row">
              <p className="text-xs text-ink-muted">Mostrando {currentPageStart}–{currentPageEnd} de {filteredOrders.length} órdenes</p>
              <Pagination page={ordersPage} totalPages={ordersTotalPages} onChange={setOrdersPage} />
            </div>
          )}
          </>
        ) : (
          <Card className="border-dashed py-12 text-center shadow-e1">
            <ClipboardList className="mx-auto size-10 text-brand-600" />
            <h2 className="mt-3 text-lg font-black">
              {orders.length ? emptyMessage : 'Aún no hay órdenes de compra'}
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-ink-muted">
              {orders.length
                ? 'Prueba otro estado o término de búsqueda.'
                : 'Crea una orden para solicitar insumos. Cuando llegue la mercadería, registra el lote y su costo real.'}
            </p>
            {orders.length > 0 && <Button className="mt-4" size="sm" variant="outline" onClick={clearFilters}>Mostrar todas las órdenes</Button>}
            {canManage && branchId && !orders.length && (
              <Button
                className="mt-5"
                onClick={startPurchase}
                leftIcon={<Plus className="size-4" />}
              >
                {startPurchaseLabel}
              </Button>
            )}
          </Card>
        ))}

      {tab === 'suppliers' &&
        (filteredSuppliers.length ? (
          <>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {pagedSuppliers.map((supplier) => (
              <Card key={supplier.id} className="flex flex-col gap-4 shadow-e1">
                <div className="flex items-start justify-between gap-2">
                  <span className="grid size-11 place-items-center rounded-xl bg-brand-50 text-brand-700">
                    <Truck className="size-5" />
                  </span>
                  <Badge variant={supplier.isActive ? 'success' : 'neutral'}>
                    {supplier.isActive ? 'Activo' : 'Inactivo'}
                  </Badge>
                </div>
                <div className="min-w-0">
                  <h2 className="truncate text-lg font-black text-ink">{supplier.name}</h2>
                  <p className="mt-1 font-mono text-xs text-ink-muted">
                    {supplier.code}
                    {supplier.taxId ? ` · ${supplier.taxId}` : ''}
                  </p>
                </div>
                <div className="grid gap-1.5 text-sm text-ink-muted">
                  <p>{supplier.contactName || 'Sin contacto asignado'}</p>
                  {supplier.phone && <a href={`tel:${supplier.phone.replace(/[^\d+]/g, '')}`} className="font-semibold text-brand-700 hover:underline">Llamar: {supplier.phone}</a>}
                  {supplier.email && (
                    <a
                      href={`mailto:${supplier.email}`}
                      className="inline-flex items-center gap-1 break-all text-brand-700 hover:underline"
                    >
                      <Mail className="size-4 shrink-0" />
                      {supplier.email}
                    </a>
                  )}
                  <p>
                    {supplier.paymentTermsDays
                      ? `${supplier.paymentTermsDays} días de crédito`
                      : 'Pago al contado'}
                  </p>
                  {supplier.address && <p className="text-xs">Dirección: {supplier.address}</p>}
                  {supplier.notes && (
                    <details className="text-xs">
                      <summary className="cursor-pointer font-bold text-brand-700">Ver acuerdos y notas</summary>
                      <p className="mt-2 whitespace-pre-wrap text-ink-muted">{supplier.notes}</p>
                    </details>
                  )}
                </div>
                <div className="mt-auto flex flex-wrap gap-2 border-t border-line pt-3">
                  {canManage && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openSupplier(supplier)}
                        leftIcon={<Pencil className="size-4" />}
                      >
                        Editar
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={saving}
                        onClick={() => void toggleSupplier(supplier)}
                        leftIcon={
                          supplier.isActive ? (
                            <Ban className="size-4" />
                          ) : (
                            <RotateCcw className="size-4" />
                          )
                        }
                      >
                        {supplier.isActive ? 'Desactivar' : 'Reactivar'}
                      </Button>
                    </>
                  )}
                </div>
              </Card>
            ))}
          </div>
          {suppliersTotalPages > 1 && (
            <div className="mt-5 flex flex-col items-center justify-between gap-3 rounded-card border border-line bg-white p-4 shadow-e1 sm:flex-row">
              <p className="text-xs text-ink-muted">Mostrando {currentPageStart}–{currentPageEnd} de {filteredSuppliers.length} proveedores</p>
              <Pagination page={suppliersPage} totalPages={suppliersTotalPages} onChange={setSuppliersPage} />
            </div>
          )}
          </>
        ) : (
          <Card className="border-dashed py-12 text-center shadow-e1">
            <Truck className="mx-auto size-10 text-brand-600" />
            <h2 className="mt-3 text-lg font-black">
              {suppliers.length ? emptyMessage : 'Empieza con un proveedor'}
            </h2>
            <p className="mx-auto mt-2 max-w-lg text-sm text-ink-muted">
              {suppliers.length
                ? 'Prueba otro estado o término de búsqueda. Puede haber proveedores inactivos.'
                : 'Guarda sus datos de contacto y condiciones. El código interno se asigna automáticamente.'}
            </p>
            {suppliers.length > 0 && <Button className="mt-4" size="sm" variant="outline" onClick={clearFilters}>Mostrar todos los proveedores</Button>}
            {canManage && !suppliers.length && (
              <Button
                className="mt-5"
                onClick={() => openSupplier()}
                leftIcon={<Plus className="size-4" />}
              >
                Crear proveedor
              </Button>
            )}
          </Card>
        ))}

      {tab === 'lots' && (
        <div className="grid gap-5">
          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_250px]">
            <Card className="shadow-e1">
              <CardHeader>
                <CardTitle>Lotes y vencimientos</CardTitle>
                <CardDescription>
                  Consulta lo recibido, lo disponible y su origen. El consumo prioriza los lotes
                  que vencen antes; si vencen el mismo día, usa primero el recibido más antiguo.
                </CardDescription>
              </CardHeader>
              {filteredLots.length ? (
                <>
                <div className="grid gap-2">
                  {pagedLots.map((lot) => {
                    const days = daysUntil(lot.expiresAt);
                    return (
                      <div
                        key={lot.id}
                        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line p-3"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
                            <Package className="size-5" />
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-bold text-ink">
                              {lot.item?.name ?? `Insumo ${lot.inventoryItemId}`}
                            </p>
                            <p className="text-xs text-ink-muted">
                              Lote {lot.lotCode} · {lot.supplier?.name ?? 'Sin proveedor'}
                            </p>
                            {lot.purchaseOrderId && (
                              <button type="button" className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-brand-700 hover:underline" onClick={() => showOrderForLot(lot)}>
                                Ver orden de compra <ArrowRight className="size-3" />
                              </button>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-4">
                          <div className="text-sm">
                            <p className="font-bold tabular-nums">
                              {quantity(lot.quantityAvailable)} {lot.item?.unit}
                            </p>
                            <p className="text-xs text-ink-muted">
                              {money(lot.stockValue)} en stock
                            </p>
                          </div>
                          <div className="text-sm">
                            <p
                              className={cn(
                                days !== null && days <= 7 && lot.status === 'ACTIVE'
                                  ? 'font-bold text-amber-700'
                                  : 'text-ink',
                              )}
                            >
                              {lot.expiresAt
                                ? `Vence ${formatDate(lot.expiresAt)}`
                                : 'Sin vencimiento'}
                            </p>
                            <p className="text-xs text-ink-muted">
                              Costo {money(lot.unitCost)} / {lot.item?.unit}
                            </p>
                          </div>
                          <Badge
                            variant={
                              lot.status === 'ACTIVE'
                                ? days !== null && days <= 7
                                  ? 'warning'
                                  : 'success'
                                : lot.status === 'EXPIRED'
                                  ? 'danger'
                                  : 'neutral'
                            }
                          >
                            {statusLabel[lot.status] ?? lot.status}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {lotsTotalPages > 1 && (
                  <div className="mt-5 flex flex-col items-center justify-between gap-3 rounded-card border border-line bg-white p-4 shadow-e1 sm:flex-row">
                    <p className="text-xs text-ink-muted">Mostrando {currentPageStart}–{currentPageEnd} de {filteredLots.length} lotes</p>
                    <Pagination page={lotsPage} totalPages={lotsTotalPages} onChange={setLotsPage} />
                  </div>
                )}
                </>
              ) : (
                <div className="py-10 text-center text-sm text-ink-muted">
                  <p>{lots.length ? emptyMessage : 'Los lotes aparecerán cuando registres la primera recepción.'}</p>
                  {lots.length > 0 && <Button className="mt-4" size="sm" variant="outline" onClick={clearFilters}>Mostrar todos los lotes</Button>}
                </div>
              )}
            </Card>
            <Card className="h-fit border-brand-100 bg-brand-50 shadow-e1">
              <WalletCards className="size-7 text-brand-700" />
              <h3 className="mt-3 text-base font-black">Costos de esta cocina</h3>
              <p className="mt-2 text-sm text-ink-muted">
                Insumos recibidos (sin impuesto):{' '}
                <strong className="text-ink">{money(summary?.purchasesTotal ?? 0)}</strong>
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                En lotes activos:{' '}
                <strong className="text-ink">{money(summary?.stockValue ?? 0)}</strong>
              </p>
              <p className="mt-1 text-sm text-ink-muted">
                Consumido o perdido:{' '}
                <strong className="text-ink">{money(summary?.consumedCost ?? 0)}</strong>
              </p>
              {canViewInventory && (
                <Link
                  to={ROUTES.adminInventory}
                  className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-brand-700 hover:underline"
                >
                  Ver inventario <ExternalLink className="size-4" />
                </Link>
              )}
            </Card>
          </div>
          <Card className="shadow-e1">
            <CardHeader>
              <CardTitle>Costo por insumo</CardTitle>
              <CardDescription>
                Los importes comprados muestran lotes recibidos, no órdenes pendientes.
              </CardDescription>
            </CardHeader>
            {(summary?.rows.length ?? 0) ? (
              <div className="grid gap-2">
                {summary?.rows.map((row) => (
                  <div
                    key={row.inventoryItemId}
                    className="grid gap-2 rounded-lg border border-line px-3 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_repeat(3,130px)] sm:items-center"
                  >
                    <strong className="truncate">{row.name}</strong>
                    <span>
                      Comprado <b className="block tabular-nums">{money(row.purchased)}</b>
                    </span>
                    <span>
                      Consumido <b className="block tabular-nums">{money(row.consumed)}</b>
                    </span>
                    <span>
                      En stock <b className="block tabular-nums">{money(row.stockValue)}</b>
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="py-6 text-sm text-ink-muted">
                Todavía no hay costos de recepción o consumo.
              </p>
            )}
          </Card>
        </div>
      )}

      <Modal
        isOpen={supplierOpen}
        onClose={() => void closeSupplier()}
        title={editingSupplier ? `Editar ${editingSupplier.name}` : 'Nuevo proveedor'}
        description="Registra a quién compras, cómo contactarlo y las condiciones acordadas. Estos datos ayudan a preparar órdenes y a rastrear los lotes recibidos."
        icon={Truck}
        eyebrow="Directorio de compras"
        maxWidth="md"
        disableBackdropClose
        actions={
          <>
            <Button variant="outline" disabled={saving} onClick={() => void closeSupplier()}>
              {resumeOrderAfterSupplier ? 'Volver a la orden' : 'Cancelar'}
            </Button>
            <Button isLoading={saving} onClick={() => void saveSupplier()}>
              {editingSupplier ? 'Guardar cambios' : 'Crear proveedor'}
            </Button>
          </>
        }
      >
        <div className="grid min-w-0 gap-5">
          <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
            <strong>{editingSupplier ? 'Qué cambia al guardar' : 'Qué se crea al guardar'}</strong>
            <p className="mt-1 text-xs leading-relaxed">
              {editingSupplier
                ? 'Se actualiza la ficha del proveedor. Las órdenes y los lotes existentes no se eliminan y podrán mostrar sus datos de contacto actualizados.'
                : 'Se crea una ficha disponible para las compras de todas las cocinas. Todavía no se crea una orden, no cambia el inventario y no se envía ningún mensaje.'}
              {resumeOrderAfterSupplier && ' Después volverás a la orden con este proveedor seleccionado.'}
            </p>
          </div>
          <section className="grid gap-3 border-t border-line pt-5" aria-labelledby="supplier-identity-heading">
            <div>
              <h3 id="supplier-identity-heading" className="text-sm font-black text-ink">1. Identifica al proveedor</h3>
              <p className="mt-1 text-xs text-ink-muted">Solo el nombre es obligatorio. El código interno {editingSupplier ? editingSupplier.code : 'se asigna automáticamente'} y ayuda a reconocerlo en órdenes y lotes.</p>
            </div>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <Input label="Nombre comercial" required autoFocus={!editingSupplier} maxLength={120} value={supplierForm.name}
                error={supplierAttempted ? supplierNameError : undefined}
                hint="Nombre que verás al seleccionar el proveedor en una orden."
                onChange={(event) => setSupplierForm((form) => ({ ...form, name: event.target.value }))} />
              <Input label="RUC o documento (opcional)" maxLength={20} value={supplierForm.taxId}
                hint="Referencia para identificarlo en tus comprobantes."
                onChange={(event) => setSupplierForm((form) => ({ ...form, taxId: event.target.value }))} />
            </div>
          </section>
          <section className="grid gap-3 border-t border-line pt-5" aria-labelledby="supplier-contact-heading">
            <div>
              <h3 id="supplier-contact-heading" className="text-sm font-black text-ink">2. Cómo comunicarte con él</h3>
              <p className="mt-1 text-xs text-ink-muted">Estos datos son opcionales. El correo permite preparar un mensaje con los insumos pendientes desde una orden; deberás enviarlo tú.</p>
            </div>
            <div className="grid min-w-0 gap-4 sm:grid-cols-2">
              <Input label="Persona de contacto (opcional)" maxLength={120} value={supplierForm.contactName}
                hint="Nombre de quien atiende los pedidos."
                onChange={(event) => setSupplierForm((form) => ({ ...form, contactName: event.target.value }))} />
              <Input label="Teléfono (opcional)" type="tel" maxLength={30} value={supplierForm.phone}
                hint="Para consultar entregas o coordinar compras."
                onChange={(event) => setSupplierForm((form) => ({ ...form, phone: event.target.value }))} />
              <Input label="Correo (opcional)" type="email" maxLength={160} value={supplierForm.email}
                error={supplierAttempted ? supplierEmailError : undefined}
                hint="Se usará para abrir un borrador de correo desde la orden."
                onChange={(event) => setSupplierForm((form) => ({ ...form, email: event.target.value }))} />
              <Input label="Dirección (opcional)" maxLength={255} value={supplierForm.address}
                hint="Referencia interna para ubicar al proveedor."
                onChange={(event) => setSupplierForm((form) => ({ ...form, address: event.target.value }))} />
            </div>
            {!supplierForm.email.trim() && !supplierForm.phone.trim() && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">Sin teléfono ni correo podrás guardar la ficha, pero necesitarás otro medio para contactar al proveedor.</p>
            )}
          </section>
          <section className="grid gap-3 border-t border-line pt-5" aria-labelledby="supplier-terms-heading">
            <div>
              <h3 id="supplier-terms-heading" className="text-sm font-black text-ink">3. Condiciones y acuerdos</h3>
              <p className="mt-1 text-xs text-ink-muted">Son referencias internas para el equipo. Guardarlas no programa ni registra pagos.</p>
            </div>
            <Input label="Días de crédito" required type="number" min="0" max="365" step="1"
              value={supplierForm.paymentTermsDays} error={supplierAttempted ? supplierTermsError : undefined}
              hint="0 = pago al contado. Un valor mayor indica los días acordados para pagar."
              onChange={(event) => setSupplierForm((form) => ({ ...form, paymentTermsDays: event.target.value }))} />
            <Textarea label="Notas internas (opcional)" rows={3} maxLength={2000}
              value={supplierForm.notes} hint="Anota horarios de entrega, mínimos de compra u otros acuerdos."
              onChange={(event) => setSupplierForm((form) => ({ ...form, notes: event.target.value }))} />
          </section>
        </div>
      </Modal>

      <Modal
        isOpen={orderOpen}
        onClose={() => void closeOrder()}
        title={editingOrder ? `Editar ${editingOrder.orderNumber}` : 'Nueva orden de compra'}
        description={
          editingOrder
            ? 'Corrige proveedor, insumos, cantidades y costos antes de recibir el primer lote.'
            : 'Planifica qué necesitas. El stock cambiará al registrar la recepción.'
        }
        icon={ClipboardList}
        eyebrow="Abastecimiento"
        maxWidth="md"
        disableBackdropClose
        actions={
          <>
            <Button variant="outline" disabled={saving} onClick={() => void closeOrder()}>
              Cancelar
            </Button>
            <Button
              isLoading={saving}
              disabled={!orderSuppliers.length || !items.length}
              onClick={() => void saveOrder()}
            >
              {editingOrder ? 'Guardar cambios' : 'Crear orden'}
            </Button>
          </>
        }
      >
        <div className="grid min-w-0 grid-cols-1 gap-6">
          <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
            <strong>Qué hace esta orden</strong>
            <p className="mt-1 text-xs leading-relaxed">Deja registrado lo que planeas comprar a este proveedor y su costo estimado. Guardarla no envía el pedido ni suma existencias: podrás preparar el correo desde el detalle y registrar el stock cuando recibas los insumos.</p>
          </div>
          {!activeSuppliers.length && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              Necesitas un proveedor activo.{' '}
              <button
                type="button"
                className="font-bold underline"
                onClick={() => {
                  setOrderOpen(false);
                  setResumeOrderAfterSupplier(true);
                  setTab('suppliers');
                  openSupplier();
                }}
              >
                Crear proveedor
              </button>
            </div>
          )}
          {!items.length && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950">
              Primero debe existir un insumo habilitado en esta cocina.
              {canViewInventory && <> Revísalo en <Link to={ROUTES.adminInventory} className="font-bold underline">Inventario</Link>.</>}
            </div>
          )}
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
            <Select
              label="Proveedor"
              required
              error={orderAttempted && !orderSupplier ? 'Selecciona a quién comprarás.' : undefined}
              hint="La ficha del proveedor se comparte entre cocinas."
              value={orderSupplier}
              onChange={(event) => setOrderSupplier(String(event.target.value))}
            >
              <SelectOption value="" disabled>
                Selecciona un proveedor
              </SelectOption>
              {orderSuppliers.map((supplier) => (
                <SelectOption key={supplier.id} value={supplier.id}>
                  {supplier.name}
                  {!supplier.isActive ? ' (inactivo)' : ''}
                </SelectOption>
              ))}
            </Select>
            <Input
              label="Entrega estimada"
              type="date"
              min={peruToday()}
              value={orderExpected}
              onChange={(event) => setOrderExpected(event.target.value)}
              error={orderAttempted ? orderExpectedError : undefined}
              hint="Opcional. La fecha sirve para reconocer órdenes retrasadas; no agenda la entrega."
            />
          </div>
          {selectedSupplier && (
            <div className="rounded-lg border border-line bg-surface-muted/50 px-4 py-3 text-xs text-ink-muted">
              <strong className="text-ink">Proveedor elegido: {selectedSupplier.name}</strong>
              <p className="mt-1">{selectedSupplier.email ? `Correo: ${selectedSupplier.email}. ` : 'Sin correo: podrás contactarlo por otro medio. '}{selectedSupplier.paymentTermsDays === 0 ? 'Condición registrada: pago al contado.' : `Condición registrada: ${selectedSupplier.paymentTermsDays} días de crédito.`}</p>
            </div>
          )}
          <div className="border-t border-line pt-5">
            <h3 className="font-black text-ink">Insumos solicitados</h3>
            <p className="mt-1 text-xs text-ink-muted">
              Elige un insumo por fila. La cantidad usa su unidad de Inventario y el costo es por esa unidad; puedes corregir el valor sugerido.
            </p>
            <div className="mt-4 grid gap-3">
              {orderLines.map((line, index) => {
                const item = items.find((entry) => entry.id === Number(line.inventoryItemId));
                return (
                  <div
                    key={index}
                    className="rounded-lg border border-line bg-surface-muted/40 p-3"
                  >
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <strong className="text-sm">Insumo {index + 1}</strong>
                      {orderLines.length > 1 && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            setOrderLines((current) =>
                              current.filter((_, position) => position !== index),
                            )
                          }
                          leftIcon={<Trash2 className="size-4" />}
                        >
                          Quitar
                        </Button>
                      )}
                    </div>
                    <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_110px_135px]">
                      <Select
                        label="Insumo"
                        required
                        error={orderAttempted ? orderLineError(line).item : undefined}
                        value={line.inventoryItemId}
                        onChange={(event) => {
                          const selected = items.find(
                            (entry) => entry.id === Number(event.target.value),
                          );
                          setOrderLines((current) =>
                            current.map((entry, position) =>
                              position === index
                                ? {
                                    ...entry,
                                    inventoryItemId: selected?.id ?? '',
                                    unitCost: selected ? String(selected.unitCost ?? 0) : '',
                                  }
                                : entry,
                            ),
                          );
                        }}
                      >
                        <SelectOption value="" disabled>
                          Selecciona un insumo
                        </SelectOption>
                        {items.map((entry) => (
                          <SelectOption
                            key={entry.id}
                            value={entry.id}
                            disabled={orderLines.some(
                              (other, position) =>
                                position !== index && Number(other.inventoryItemId) === entry.id,
                            )}
                          >
                            {entry.name} ({entry.unit})
                          </SelectOption>
                        ))}
                      </Select>
                      <Input
                        label={`Cantidad${item ? ` (${item.unit})` : ''}`}
                        required
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={line.quantity}
                        error={orderAttempted ? orderLineError(line).quantity : undefined}
                        onChange={(event) =>
                          setOrderLines((current) =>
                            current.map((entry, position) =>
                              position === index
                                ? { ...entry, quantity: event.target.value }
                                : entry,
                            ),
                          )
                        }
                      />
                      <Input
                        label="Costo por unidad (S/)"
                        required
                        type="number"
                        min="0"
                        step="0.0001"
                        value={line.unitCost}
                        error={orderAttempted ? orderLineError(line).unitCost : undefined}
                        onChange={(event) =>
                          setOrderLines((current) =>
                            current.map((entry, position) =>
                              position === index
                                ? { ...entry, unitCost: event.target.value }
                                : entry,
                            ),
                          )
                        }
                      />
                    </div>
                    <p className="mt-2 text-right text-xs text-ink-muted">
                      Subtotal{' '}
                      <strong className="text-ink">
                        {money((Number(line.quantity) || 0) * (Number(line.unitCost) || 0))}
                      </strong>
                    </p>
                  </div>
                );
              })}
            </div>
            <Button
              className="mt-3"
              variant="outline"
              size="sm"
              disabled={orderLines.length >= 100}
              onClick={() => setOrderLines((current) => [...current, emptyOrderLine()])}
              leftIcon={<Plus className="size-4" />}
            >
              Agregar otro insumo
            </Button>
          </div>
          <div className="grid min-w-0 grid-cols-1 gap-4 border-t border-line pt-5 sm:grid-cols-2">
            <Input
              label="Impuesto adicional (S/)"
              type="number"
              min="0"
              step="0.01"
              value={orderTax}
              onChange={(event) => setOrderTax(event.target.value)}
              error={orderAttempted ? orderTaxError : undefined}
              hint="Solo si no está incluido en los costos unitarios."
            />
            <div className="text-xs leading-relaxed text-ink-muted">El subtotal suma las cantidades por su costo estimado. El impuesto adicional se suma una vez al total y no forma parte del valor del lote que entra al inventario.</div>
          </div>
          <Textarea label="Notas para la compra (opcional)" rows={3} maxLength={2000}
            value={orderNotes} hint="Indicaciones para tu equipo; no se envían automáticamente al proveedor."
            onChange={(event) => setOrderNotes(event.target.value)} />
          <div className="rounded-lg bg-brand-50 px-4 py-3 text-sm">
            <div className="flex justify-between">
              <span>Subtotal</span>
              <strong>{money(orderSubtotal)}</strong>
            </div>
            <div className="mt-1 flex justify-between">
              <span>Impuesto adicional</span>
              <strong>{money(Number(orderTax) || 0)}</strong>
            </div>
            <div className="mt-2 flex justify-between border-t border-brand-100 pt-2 text-base font-black">
              <span>Total previsto</span>
              <span>{money(orderTotal)}</span>
            </div>
            <p className="mt-2 text-xs text-brand-900">Es una estimación. En la recepción podrás registrar el costo real de cada lote.</p>
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(selectedOrder)}
        onClose={() => setSelectedOrder(null)}
        title={selectedOrder?.orderNumber ?? 'Orden'}
        description={`${selectedOrder?.supplier?.name ?? 'Proveedor'} · Solicitada ${formatDate(selectedOrder?.orderedAt)}`}
        icon={ClipboardList}
        eyebrow="Detalle de compra"
        maxWidth="md"
        actions={
          <>
            <Button variant="outline" onClick={() => setSelectedOrder(null)}>
              Cerrar
            </Button>
            {canManage && branchId && selectedOrder?.status === 'DRAFT' && (
              <Button onClick={() => void approveOrder(selectedOrder)} isLoading={saving}>
                Aprobar y ordenar
              </Button>
            )}
            {canManage && branchId && selectedOrder && canEditOrder(selectedOrder) && (
              <Button
                variant="outline"
                onClick={() => openEditOrder(selectedOrder)}
                leftIcon={<Pencil className="size-4" />}
              >
                Editar orden
              </Button>
            )}
            {canManage && branchId && selectedOrder && canReceive(selectedOrder) && (
              <Button
                onClick={() => openReceive(selectedOrder)}
                leftIcon={<PackageCheck className="size-4" />}
              >
                Recibir lote
              </Button>
            )}
          </>
        }
      >
        {selectedOrder && (
          <div className="grid gap-5">
            <div className="rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
              <strong>Cómo usar esta orden</strong>
              <p className="mt-1 text-xs leading-relaxed">Compara lo solicitado, recibido y pendiente en cada insumo. El total es el costo previsto de la compra; el stock y su costo real se registran al recibir lotes. {canEditOrder(selectedOrder) ? 'Puedes corregirla antes de la primera recepción.' : canReceive(selectedOrder) ? 'Registra las siguientes entregas desde «Recibir lote».' : 'Esta orden ya no tiene entregas pendientes.'}</p>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge variant={orderBadge(selectedOrder.status)}>
                {statusLabel[selectedOrder.status]}
              </Badge>
              <span className="text-sm text-ink-muted">
                Entrega estimada: {formatBusinessDate(selectedOrder.expectedAt)}
              </span>
            </div>
            {selectedOrder.supplier?.email && canManage && branchId && canReceive(selectedOrder) && (
              <div>
                <a href={orderMailto(selectedOrder)} className="inline-flex w-fit items-center gap-2 rounded-lg border border-line bg-white px-3 py-2 text-sm font-bold text-brand-700 hover:border-brand-300 hover:underline">
                  <Mail className="size-4" /> Preparar correo al proveedor
                </a>
                <p className="mt-1 text-xs text-ink-muted">Se abrirá un borrador con lo que falta entregar. Revisa el mensaje y envíalo desde tu correo.</p>
              </div>
            )}
            <div className="grid gap-2">
              {selectedOrder.items.map((line) => (
                <div key={line.id} className="rounded-lg border border-line px-3 py-3">
                  <div className="flex justify-between gap-3">
                    <strong>{line.item?.name ?? `Insumo ${line.inventoryItemId}`}</strong>
                    <strong className="tabular-nums">
                      {money(line.quantityOrdered * line.unitCost)}
                    </strong>
                  </div>
                  <p className="mt-1 text-xs text-ink-muted">
                    Solicitado {quantity(line.quantityOrdered)} {line.item?.unit} · Recibido{' '}
                    {quantity(line.quantityReceived)} · Pendiente{' '}
                    {quantity(Math.max(0, line.quantityOrdered - line.quantityReceived))}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    Costo estimado {money(line.unitCost)} / {line.item?.unit}
                  </p>
                </div>
              ))}
            </div>
            <div className="rounded-lg bg-surface-muted px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <strong>{money(selectedOrder.subtotal)}</strong>
              </div>
              <div className="mt-1 flex justify-between">
                <span>Impuesto adicional</span>
                <strong>{money(selectedOrder.tax)}</strong>
              </div>
              <div className="mt-2 flex justify-between border-t border-line pt-2 font-black">
                <span>Total previsto</span>
                <span>{money(selectedOrder.total)}</span>
              </div>
            </div>
            {selectedOrder.notes && (
              <div>
                <p className="text-xs font-bold uppercase text-ink-muted">Notas</p>
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{selectedOrder.notes}</p>
              </div>
            )}
            {canManage && branchId && canReceive(selectedOrder) && (
              <Button
                size="sm"
                variant="ghost"
                className="justify-self-start text-red-700"
                onClick={() => {
                  setCancelling(selectedOrder);
                  setSelectedOrder(null);
                  setCancelReason('');
                }}
                leftIcon={<Ban className="size-4" />}
              >
                Cancelar saldo pendiente
              </Button>
            )}
          </div>
        )}
      </Modal>

      <Modal
        isOpen={Boolean(receiving)}
        onClose={() => void closeReceive()}
        title={`Recibir ${receiving?.orderNumber ?? ''}`}
        description="Registra solo lo que llegó hoy. Cada línea seleccionada crea un lote y aumenta el stock."
        icon={PackageCheck}
        eyebrow="Recepción de mercadería"
        maxWidth="md"
        disableBackdropClose
        actions={
          <>
            <Button variant="outline" disabled={saving} onClick={() => void closeReceive()}>
              Cancelar
            </Button>
            <Button isLoading={saving} disabled={!chosenReceiveLines.length} onClick={() => void receiveOrder()}>
              Registrar recepción
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="rounded-lg border border-brand-100 bg-brand-50 p-3 text-sm text-brand-800">
            <strong>Registra únicamente lo que tienes delante.</strong> Escribe la cantidad que llegó y los datos de su lote. Si un insumo aún no llegó, deja su cantidad vacía. Podrás registrar el resto en otra recepción.
          </div>
          {receiveLines.map((line, index) => {
            const item = receiving?.items.find(
              (candidate) => candidate.id === line.purchaseOrderItemId,
            );
            const remaining = Math.max(
              0,
              (item?.quantityOrdered ?? 0) - (item?.quantityReceived ?? 0),
            );
            return (
              <div
                key={line.purchaseOrderItemId}
                className={cn(
                  'rounded-lg border p-4',
                  line.quantity.trim()
                    ? 'border-brand-200 bg-white'
                    : 'border-line bg-surface-muted/40',
                )}
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <strong>{item?.item?.name ?? 'Insumo'}</strong>
                  <Badge variant="neutral">
                    Pendiente {quantity(remaining)} {item?.item?.unit}
                  </Badge>
                </div>
                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                  <Input
                    label={`Cantidad recibida (${item?.item?.unit ?? 'unidad'})`}
                    type="number"
                    min="0.01"
                    max={remaining}
                    step="0.01"
                    placeholder="Dejar vacío si no llegó"
                    value={line.quantity}
                    error={receiveAttempted && line.quantity.trim() ? receiveLineError(line).quantity : undefined}
                    hint="Vacío = no llegó. No superes la cantidad pendiente."
                    onChange={(event) =>
                      setReceiveLines((current) =>
                        current.map((entry, position) =>
                          position === index ? { ...entry, quantity: event.target.value } : entry,
                        ),
                      )
                    }
                  />
                  <div>
                    <Input
                      label="Código del lote"
                      maxLength={80}
                      hint="Usa el código del proveedor o genera uno interno."
                      value={line.lotCode}
                      error={receiveAttempted && line.quantity.trim() ? receiveLineError(line).lotCode : undefined}
                      onChange={(event) =>
                        setReceiveLines((current) =>
                          current.map((entry, position) =>
                            position === index ? { ...entry, lotCode: event.target.value } : entry,
                          ),
                        )
                      }
                    />
                    <button type="button" className="mt-1 text-xs font-bold text-brand-700 hover:underline" onClick={() => setReceiveLines((current) => current.map((entry, position) => position === index ? { ...entry, lotCode: `INT-${Date.now().toString(36).toUpperCase()}-${entry.purchaseOrderItemId}` } : entry))}>
                      Generar código interno
                    </button>
                  </div>
                  <Input
                    label="Vencimiento · opcional"
                    type="date"
                    min={peruToday()}
                    value={line.expiresAt}
                    error={receiveAttempted && line.quantity.trim() ? receiveLineError(line).expiresAt : undefined}
                    hint="Si el producto vence, anota la fecha del envase para seguir el lote."
                    onChange={(event) =>
                      setReceiveLines((current) =>
                        current.map((entry, position) =>
                          position === index ? { ...entry, expiresAt: event.target.value } : entry,
                        ),
                      )
                    }
                  />
                  <Input
                    label={`Costo real (S/ por ${item?.item?.unit ?? 'unidad'})`}
                    type="number"
                    min="0"
                    step="0.0001"
                    value={line.unitCost}
                    error={receiveAttempted && line.quantity.trim() ? receiveLineError(line).unitCost : undefined}
                    hint="Precio pagado por unidad en esta entrega; puede diferir del estimado."
                    onChange={(event) =>
                      setReceiveLines((current) =>
                        current.map((entry, position) =>
                          position === index ? { ...entry, unitCost: event.target.value } : entry,
                        ),
                      )
                    }
                  />
                </div>
                {line.quantity.trim() && <p className="mt-3 text-xs text-ink-muted">Esta fila creará un lote para {item?.item?.name ?? 'este insumo'} y sumará {validDecimal(line.quantity, 2, true) ? quantity(Number(line.quantity)) : 'la cantidad indicada'} {item?.item?.unit} a Inventario.</p>}
              </div>
            );
          })}
          {chosenReceiveLines.length > 0 && receivePreviewValid && (
            <div role="status" className="rounded-lg border border-brand-200 bg-brand-50 p-4 text-sm">
              <p className="font-black text-brand-900">Así se registrará esta recepción</p>
              <ul className="mt-2 grid gap-1 text-xs text-ink-muted">
                {chosenReceiveLines.map((line) => {
                  const item = receiving?.items.find((entry) => entry.id === line.purchaseOrderItemId);
                  return <li key={line.purchaseOrderItemId}>+{quantity(Number(line.quantity))} {item?.item?.unit} de {item?.item?.name ?? 'insumo'} · lote {line.lotCode.trim() || 'sin código'}</li>;
                })}
              </ul>
              <p className="mt-2 text-xs text-ink-muted">Valor de los insumos recibidos, sin impuesto: <strong className="text-ink">{money(receivedValue)}</strong>. La orden quedará {completesOrder ? 'recibida por completo' : 'con saldo pendiente'}.</p>
            </div>
          )}
          {chosenReceiveLines.length > 0 && !receivePreviewValid && (
            <p role="alert" className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              Revisa la cantidad pendiente, el código del lote, el costo y el vencimiento antes de registrar la recepción.
            </p>
          )}
          <p className="text-xs text-ink-muted">
            Al confirmar, la recepción guarda los lotes, suma sus cantidades al stock, actualiza el costo promedio y deja una entrada trazable en Inventario. Revisa los datos físicos antes de registrar.
          </p>
        </div>
      </Modal>

      <Modal
        isOpen={Boolean(cancelling)}
        onClose={() => void closeCancel()}
        title="Cancelar saldo pendiente"
        description={`Orden ${cancelling?.orderNumber ?? ''}. Los lotes ya recibidos y su stock se conservarán.`}
        icon={Ban}
        tone="danger"
        maxWidth="sm"
        actions={
          <>
            <Button variant="outline" disabled={saving} onClick={() => void closeCancel()}>
              Volver
            </Button>
            <Button isLoading={saving} disabled={cancelReason.trim().length < 4 || cancelReason.trim().length > 500} onClick={() => void cancelOrder()}>
              Confirmar cancelación
            </Button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-950">
            <strong>Qué sucederá al confirmar</strong>
            <p className="mt-1 text-xs leading-relaxed">Se cerrará el saldo pendiente de esta orden. Ya no podrás registrar más recepciones en ella. Las cantidades recibidas y sus lotes permanecerán en Inventario.</p>
          </div>
          <Textarea label="Motivo de la cancelación" required rows={3} maxLength={500}
            value={cancelReason} onChange={(event) => setCancelReason(event.target.value)}
            error={cancelReason.trim().length > 0 && cancelReason.trim().length < 4 ? 'Explica el motivo con al menos 4 caracteres.' : undefined}
            hint="Escribe de 4 a 500 caracteres. El motivo se guardará en la orden y en la auditoría." />
        </div>
      </Modal>
    </div>
  );
};

export default ProcurementPage;
