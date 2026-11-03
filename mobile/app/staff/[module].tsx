import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useDeferredValue, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { AppImage } from '../../src/components/AppImage';
import { EmptyState } from '../../src/components/EmptyState';
import { PrimaryButton } from '../../src/components/PrimaryButton';
import { ScreenScaffold } from '../../src/components/ScreenScaffold';
import { Skeleton } from '../../src/components/Skeleton';
import { StatusPill } from '../../src/components/StatusPill';
import { StaffFormSheet, type StaffFormField, type StaffFormValue } from '../../src/components/staff/StaffFormSheet';
import { STAFF_MODULES, canAccessStaffModule, type StaffModuleKey } from '../../src/constants/staffModules';
import { useResource } from '../../src/hooks/useResource';
import { useSession } from '../../src/providers/SessionProvider';
import { useToast } from '../../src/providers/ToastProvider';
import { staffApi, type StaffModulePayload, type StaffRow } from '../../src/services/api/staff.service';
import { printInternalReceipt } from '../../src/lib/internalReceipt';
import { colors, radius, shadow, spacing, type } from '../../src/theme/tokens';

const KITCHEN_NEXT: Record<string, { status: string; label: string }> = {
  QUEUED: { status: 'ACCEPTED', label: 'Aceptar comanda' },
  ACCEPTED: { status: 'PREPARING', label: 'Empezar preparación' },
  PREPARING: { status: 'READY', label: 'Marcar lista' },
  READY: { status: 'DISPATCHED', label: 'Entregar a despacho' },
};
const DELIVERY_NEXT: Record<string, { status: string; label: string }> = {
  ASSIGNED: { status: 'PICKED_UP', label: 'Pedido recogido' },
  PICKED_UP: { status: 'ON_ROUTE', label: 'Salir a ruta' },
  ON_ROUTE: { status: 'DELIVERED', label: 'Confirmar entrega' },
};
const object = (value: unknown): StaffRow =>
  value && typeof value === 'object' && !Array.isArray(value) ? value as StaffRow : {};
const stringValue = (value: unknown, fallback = '—'): string =>
  value === null || value === undefined || value === '' ? fallback : String(value);
const numberValue = (value: StaffFormValue | undefined, fallback = 0): number => {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const money = (value: unknown): string => `S/ ${Number(value ?? 0).toFixed(2)}`;
const booleanValue = (value: unknown): boolean => value === true || value === 1 || value === 'true';
const dateTime = (value: unknown): string => {
  const date = new Date(String(value ?? ''));
  if (Number.isNaN(date.getTime())) return 'hora pendiente';
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  }).format(date);
};
const todayInLima = (): string => {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

const settingValue = (value: unknown): string => {
  if (value === null || value === undefined || value === '') return 'No configurado';
  if (typeof value === 'boolean') return value ? 'Activado' : 'Desactivado';
  if (typeof value === 'number') return String(value);
  const text = String(value);
  if (text === 'environment') return 'Variables del servidor';
  if (text === 'database') return 'Configurado en el panel';
  return text;
};

const friendlyLoadError = (message: string): string => {
  if (/less than or equal to 50/i.test(message)) return 'La consulta solicitó demasiados registros. Actualiza e inténtalo nuevamente.';
  if (/network|fetch|timeout|socket/i.test(message)) return 'No pudimos comunicarnos con el servidor. Revisa tu conexión e inténtalo otra vez.';
  if (/forbidden|permission|403/i.test(message)) return 'Tu rol no tiene permiso para consultar esta información.';
  return message;
};

const statusTone = (value: string, danger = false): 'neutral' | 'success' | 'warning' | 'danger' | 'info' => {
  if (danger) return 'danger';
  const normalized = value.toUpperCase();
  if (['ACTIVE', 'READY', 'DELIVERED', 'APPROVED', 'HEALTHY', 'OPEN'].includes(normalized)) return 'success';
  if (['PENDING', 'PREPARING', 'QUEUED', 'SCHEDULED', 'LOW', 'ASSIGNED'].includes(normalized)) return 'warning';
  if (['CONFIRMED', 'PICKED_UP', 'ON_ROUTE', 'ACCEPTED'].includes(normalized)) return 'info';
  if (['CANCELLED', 'FAILED', 'BLOCKED', 'CRITICAL', 'OUT', 'REJECTED'].includes(normalized)) return 'danger';
  return 'neutral';
};

interface Presentation {
  title: string;
  badge: string;
  meta: string;
  detail: string;
  danger: boolean;
  imageUrl?: string | null;
  searchText: string;
}

function rowPresentation(module: StaffModuleKey, row: StaffRow): Presentation {
  const order = object(row.order);
  const command = object(row.command);
  let result: Omit<Presentation, 'searchText'>;
  if (module === 'dashboard') result = {
    title: stringValue(row.name, 'Producto'), badge: `${stringValue(row.units, '0')} vendidos`,
    meta: Number(row.revenue ?? 0) > 0 ? `${money(row.revenue)} en ventas` : 'Ranking por unidades vendidas',
    detail: 'Rendimiento del período seleccionado', danger: false,
  };
  else if (module === 'inventory') result = {
    title: stringValue(row.name, 'Insumo'), badge: stringValue(row.stockStatus, row.isLow ? 'BAJO' : 'SALUDABLE'),
    meta: `${stringValue(row.available, '0')} ${stringValue(row.unit, '')} disponibles · mínimo ${stringValue(row.minLevel, '0')}`,
    detail: Number(row.suggestedPurchase ?? 0) > 0 ? `Compra sugerida: ${stringValue(row.suggestedPurchase)} ${stringValue(row.unit, '')}` : 'Stock suficiente para la demanda actual',
    danger: Boolean(row.isLow) || ['OUT', 'CRITICAL'].includes(String(row.stockStatus)),
  };
  else if (module === 'procurement') {
    const supplier = object(row.supplier);
    const items = Array.isArray(row.items) ? row.items : [];
    result = {
      title: stringValue(row.orderNumber, `Orden #${row.id}`),
      badge: stringValue(row.status, 'ORDERED'),
      meta: `${stringValue(supplier.name, 'Proveedor pendiente')} · ${money(row.total)}`,
      detail: `${items.length} insumos · ${row.receivedAt ? `recibida ${dateTime(row.receivedAt)}` : 'pendiente de recepción'}`,
      danger: row.status === 'CANCELLED',
    };
  }
  else if (module === 'cakes') {
    const items = Array.isArray(order.items) ? order.items.map(object) : [];
    const recipe = items.map((item) => {
      const choices = Array.isArray(item.customizations) ? item.customizations.map(object) : [];
      const selections = choices.map((choice) => `${stringValue(choice.groupNameSnapshot)}: ${stringValue(choice.optionNameSnapshot)}${Number(choice.quantity ?? 1) > 1 ? ` ×${choice.quantity}` : ''}`).join(' · ');
      return `${stringValue(item.quantity, '1')}× ${stringValue(item.productNameSnapshot)}${item.variantNameSnapshot ? ` · ${item.variantNameSnapshot}` : ''}${item.requestedServings ? ` · ${item.requestedServings} porciones` : ''}${selections ? `\n${selections}` : ''}${item.specialInstructions ? `\nIndicación: ${item.specialInstructions}` : ''}${Array.isArray(item.allergenSnapshotJson) && item.allergenSnapshotJson.length ? `\nAlérgenos: ${item.allergenSnapshotJson.join(', ')}` : ''}${item.reference ? '\nIncluye imagen de referencia' : ''}`;
    }).join('\n');
    result = {
      title: `Pedido ${stringValue(order.orderNumber, stringValue(row.orderId))}`,
      badge: stringValue(row.status),
      meta: `${stringValue(row.station)} · ${stringValue(row.workDate)}${row.status !== 'DONE' && String(row.workDate) < todayInLima() ? ' · ATRASADA' : ''} · entrega ${dateTime(order.scheduledAt)}`,
      detail: `${recipe || 'Consulta la ficha del pedido para ver la receta.'}${order.notes ? `\nNota: ${order.notes}` : ''}${row.assignedTo ? '' : '\nSin responsable asignado'}`,
      danger: row.status === 'BLOCKED' || (row.status !== 'DONE' && String(row.workDate) < todayInLima()),
    };
  }
  else if (module === 'kitchen') {
    const items = Array.isArray(order.items) ? order.items : [];
    const products = items.map((item) => {
      const line = object(item);
      return `${stringValue(line.quantity, '1')}× ${stringValue(line.name, 'Producto')}`;
    }).join(' · ');
    const scheduled = booleanValue(row.isScheduledPreview);
    result = {
      title: `${scheduled ? 'Pedido programado' : 'Comanda'} ${stringValue(order.orderNumber)}`,
      badge: scheduled ? 'PROGRAMADO' : stringValue(row.status),
      meta: scheduled
        ? `${stringValue(order.deliveryType)} · entrega ${dateTime(order.scheduledAt)} · entra a cola ${dateTime(row.releaseAt)}`
        : `${stringValue(order.deliveryType)} · ${stringValue(order.contactName, stringValue(object(order.diningTable).code, 'Cliente'))}`,
      detail: products || 'Sin líneas de producto',
      danger: Boolean(row.isLate),
    };
  } else if (module === 'orders') result = { title: `Pedido ${stringValue(row.orderNumber)}`, badge: stringValue(row.status), meta: `${stringValue(row.deliveryType)} · ${money(row.grandTotal)}`, detail: `${stringValue(row.contactName, 'Cliente')} · ${stringValue(object(row.branch).name, '')}`, danger: row.status === 'CANCELLED' };
  else if (module === 'cash') result = { title: `Operación ${stringValue(row.operationCode)}`, badge: stringValue(row.provider).toUpperCase(), meta: `${money(row.amount)} · ${stringValue(object(row.order).orderNumber)}`, detail: stringValue(row.payerPhone, 'Teléfono no informado'), danger: false };
  else if (module === 'dining') result = { title: `Mesa ${stringValue(row.code)}`, badge: stringValue(row.status), meta: `${stringValue(row.area)} · ${stringValue(row.capacity)} personas`, detail: command.orderNumber ? `${stringValue(command.orderNumber)} · ${money(command.total)}` : 'Disponible para recibir comensales', danger: false };
  else if (module === 'delivery') result = { title: `Entrega ${stringValue(order.orderNumber, stringValue(row.id))}`, badge: stringValue(row.status), meta: `${stringValue(object(row.driver).fullName, 'Sin repartidor')} · ${stringValue(order.contactPhone, '')}`, detail: stringValue(object(order.addressSnapshotJson).line1, 'Dirección no disponible'), danger: row.status === 'FAILED' };
  else if (module === 'catalog') result = { title: stringValue(row.name, 'Producto'), badge: stringValue(row.status), meta: `${stringValue(row.type)} · ${stringValue(object(row.category).name, 'Sin categoría')}`, detail: stringValue(row.description, 'Sin descripción'), danger: row.status === 'INACTIVE', imageUrl: typeof row.imageUrl === 'string' ? row.imageUrl : null };
  else if (module === 'builder') result = { title: stringValue(row.name, 'Bowl personalizable'), badge: stringValue(row.status), meta: 'Configura pasos, ingredientes y disponibilidad', detail: stringValue(row.description, ''), danger: false, imageUrl: typeof row.imageUrl === 'string' ? row.imageUrl : null };
  else if (module === 'media') result = { title: stringValue(row.originalName, 'Recurso multimedia'), badge: stringValue(row.category, 'general'), meta: `${stringValue(row.mimeType, '')} · ${Math.round(Number(row.sizeBytes ?? 0) / 1024)} KB`, detail: stringValue(row.altText, 'Sin texto alternativo'), danger: Boolean(row.deletedAt), imageUrl: typeof row.url === 'string' ? row.url : null };
  else if (module === 'users') result = { title: `${stringValue(row.firstName, '')} ${stringValue(row.lastName, '')}`.trim() || stringValue(row.email, 'Usuario'), badge: booleanValue(row.isSuperAdmin) ? 'SUPERADMIN' : stringValue(row.status), meta: stringValue(row.email), detail: `${Array.isArray(row.roles) ? row.roles.map((role) => stringValue(object(role).name)).join(', ') : 'Sin rol'} · ${Array.isArray(row.branchIds) ? row.branchIds.length : 0} locales`, danger: row.status === 'BLOCKED' };
  else if (module === 'roles') result = { title: stringValue(row.name, 'Rol'), badge: booleanValue(row.isSystem) ? 'SISTEMA' : 'PERSONALIZADO', meta: stringValue(row.description, 'Sin descripción'), detail: `${Array.isArray(row.permissions) ? row.permissions.length : 0} permisos · ${stringValue(row.userCount, '0')} usuarios`, danger: false };
  else if (module === 'complaints') result = { title: `${stringValue(row.type)} ${stringValue(row.code, `#${row.id}`)}`, badge: stringValue(row.status), meta: `${stringValue(row.consumerName)} · ${stringValue(row.email)}`, detail: `Vence: ${stringValue(row.dueAt, 'sin fecha')}`, danger: row.status !== 'RESOLVED' && row.dueAt ? new Date(String(row.dueAt)).getTime() < Date.now() : false };
  else if (module === 'business' || module === 'design') result = { title: stringValue(row.name, 'Dato'), badge: stringValue(row.group, ''), meta: settingValue(row.value), detail: 'Configuración compartida por la web y la aplicación', danger: false };
  else if (module === 'audit') result = { title: stringValue(row.action, 'Cambio registrado'), badge: stringValue(row.entity, ''), meta: `${stringValue(object(row.actor).email, 'Sistema')} · ${stringValue(row.createdAt)}`, detail: stringValue(row.entityId, ''), danger: false };
  else result = { title: stringValue(row.name ?? row.commercialName ?? row.code ?? row.originalName ?? row.email ?? row.id, 'Registro'), badge: stringValue(row.status ?? row.type ?? row.isActive, ''), meta: stringValue(row.description ?? row.email ?? row.addressLine ?? row.slug ?? row.createdAt, ''), detail: '', danger: false };
  return { ...result, searchText: [result.title, result.badge, result.meta, result.detail].join(' ').toLocaleLowerCase('es-PE') };
}

function Summary({ module, data }: { module: StaffModuleKey; data: StaffRow }) {
  if (module === 'kitchen') {
    const metrics = [
      ['Programados', stringValue(data.scheduled, '0')],
      ['En cola', stringValue(data.queued, '0')],
      ['Preparando', stringValue(data.preparing, '0')],
      ['Listos', stringValue(data.ready, '0')],
      ['Atrasados', stringValue(data.late, '0')],
    ];
    return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metrics}>{metrics.map(([label, value]) => <View key={label} style={[styles.metric, label === 'Atrasados' && Number(value) > 0 && styles.metricDanger]}><Text style={[styles.metricValue, label === 'Atrasados' && Number(value) > 0 && styles.metricValueDanger]}>{value}</Text><Text style={[styles.metricLabel, label === 'Atrasados' && Number(value) > 0 && styles.metricLabelDanger]}>{label}</Text></View>)}</ScrollView>;
  }
  if (module === 'procurement') {
    const metrics = [
      ['Compras', money(data.purchasesTotal)],
      ['Consumido', money(data.consumedCost)],
      ['Stock valorizado', money(data.stockValue)],
    ];
    return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metrics}>{metrics.map(([label, value], index) => <View key={label} style={[styles.metric, index === 0 && styles.metricAccent]}><Text style={[styles.metricValue, index === 0 && styles.metricValueAccent]}>{value}</Text><Text style={[styles.metricLabel, index === 0 && styles.metricLabelAccent]}>{label}</Text></View>)}</ScrollView>;
  }
  if (module !== 'dashboard' && module !== 'cash') return null;
  const sales = object(data.sales);
  const operations = object(data.operations);
  const quality = object(data.quality);
  const metrics = [
    ['Pedidos', stringValue(sales.orders, 'Sin acceso')],
    ['Ventas', sales.revenue === undefined ? 'Sin acceso' : money(sales.revenue)],
    ['Ticket prom.', sales.averageTicket === undefined ? '—' : money(sales.averageTicket)],
    ['Preparación', `${stringValue(operations.avgPrepMinutes, '—')} min`],
    ['Cancelación', `${stringValue(quality.cancellationRate, '0')}%`],
  ].filter(([label]) => module === 'dashboard' || ['Pedidos', 'Ventas', 'Ticket prom.'].includes(label));
  return <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.metrics}>{metrics.map(([label, value], index) => <View key={label} style={[styles.metric, index === 1 && styles.metricAccent]}><Text style={[styles.metricValue, index === 1 && styles.metricValueAccent]}>{value}</Text><Text style={[styles.metricLabel, index === 1 && styles.metricLabelAccent]}>{label}</Text></View>)}</ScrollView>;
}

interface FormState {
  title: string;
  subtitle?: string;
  submitLabel?: string;
  fields: StaffFormField[];
  submit: (values: Record<string, StaffFormValue>) => Promise<void>;
}

export default function StaffModuleScreen() {
  const params = useLocalSearchParams<{ module?: string; branchId?: string; branchName?: string; pedido?: string; tarea?: string; reparto?: string; solicitud?: string }>();
  const { status, user } = useSession();
  const toast = useToast();
  const [actingKey, setActingKey] = useState<string | null>(null);
  const [search, setSearch] = useState(params.pedido ?? '');
  const [page, setPage] = useState(1);
  const [allRows, setAllRows] = useState<StaffRow[]>([]);
  const [loadedPage, setLoadedPage] = useState(0);
  const [form, setForm] = useState<FormState | null>(null);
  const module = STAFF_MODULES.find((entry) => entry.key === params.module);
  const branchId = params.branchId ? Number(params.branchId) : undefined;
  const sourceKey = `${module?.key}:${branchId ?? 'global'}`;
  const [rowsSource, setRowsSource] = useState(sourceKey);
  useEffect(() => { setAllRows([]); setLoadedPage(0); setPage(1); setForm(null); setSearch(params.pedido ?? ''); }, [sourceKey, params.pedido]);
  const allowed = Boolean(module && user && canAccessStaffModule(module, user));
  const remoteSearch = module?.key === 'orders' || module?.key === 'complaints' || module?.key === 'media' || module?.key === 'catalog';
  const deferredSearch = useDeferredValue(search.trim());
  const resourceKey = allowed && module && module.key !== 'business' ? `staff:${module.key}:${branchId ?? 'global'}:${page}:${remoteSearch ? deferredSearch : ''}` : null;

  useEffect(() => {
    if (module?.key === 'business') router.replace('/staff/business-editor' as never);
  }, [module?.key]);

  const resource = useResource<StaffModulePayload>({
    key: resourceKey,
    fetcher: () => staffApi.load(module!.key, branchId, { page, pageSize: 20, search: remoteSearch ? deferredSearch || undefined : undefined }),
    pollIntervalMs: module?.live && page === 1 ? (module.key === 'orders' || module.key === 'kitchen' ? 10_000 : 20_000) : 0,
    cacheMs: module?.live ? 10_000 : 60_000,
  });

  const currentRows = resource.data?.rows ?? [];
  useEffect(() => {
    if (!resource.data) return;
    setRowsSource(sourceKey);
    if (page === 1) {
      setAllRows(currentRows);
      setLoadedPage(1);
      return;
    }
    if (loadedPage === page) return;
    setLoadedPage(page);
    setAllRows((previous) => [...previous, ...currentRows.filter((row) => !previous.some((old) => String(old.id ?? old.paymentId) === String(row.id ?? row.paymentId))) ]);
  }, [currentRows, loadedPage, page, resource.data, sourceKey]);
  const rows = rowsSource === sourceKey && (allRows.length || page > 1) ? allRows : currentRows;
  const can = (permission: string) => Boolean(user?.isSuperAdmin || user?.permissions.includes(permission));
  const mutate = useCallback(async (key: string, action: () => Promise<unknown>, success = 'Cambio guardado y sincronizado con la web.') => {
    setActingKey(key);
    try {
      await action();
      setForm(null);
      setPage(1);
      setAllRows([]);
      setLoadedPage(0);
      toast.show({ tone: 'success', message: success });
      await resource.refresh();
    } catch (caught) {
      toast.show({ tone: 'error', message: caught instanceof Error ? caught.message : 'No pudimos guardar el cambio.' });
    } finally {
      setActingKey(null);
    }
  }, [resource, toast]);

  const visibleRows = useMemo(() => {
    const target = Number(module?.key === 'cakes' ? params.tarea : module?.key === 'delivery' ? params.reparto : 0);
    const prioritized = target ? [...rows].sort((a, b) => Number(Number(b.id) === target) - Number(Number(a.id) === target)) : rows;
    if (remoteSearch) return prioritized;
    const term = search.trim().toLocaleLowerCase('es-PE');
    if (!term) return prioritized;
    return prioritized.filter((row) => rowPresentation(module!.key, row).searchText.includes(term));
  }, [module, remoteSearch, rows, search, params.tarea, params.reparto]);

  const openOrderStatus = (row: StaffRow, statusValue: string, label: string) => setForm({
    title: label,
    subtitle: `Pedido ${stringValue(row.orderNumber)}`,
    submitLabel: label,
    fields: [{ key: 'comment', label: statusValue === 'CANCELLED' ? 'Motivo obligatorio' : 'Comentario para el historial', kind: 'multiline', required: statusValue === 'CANCELLED' }],
    submit: (values) => mutate(`order:${row.orderNumber}`, () => staffApi.updateOrder(String(row.orderNumber), statusValue, String(values.comment || '') || undefined)),
  });

  const openRowAction = (row: StaffRow) => {
    if (!module || !branchId && module.branchScoped) return;
    const id = Number(row.id ?? row.inventoryItemId ?? row.paymentId);
    if (module.key === 'inventory' && can('inventory.manage')) {
      setForm({ title: `Actualizar ${stringValue(row.name)}`, subtitle: `${stringValue(row.available)} ${stringValue(row.unit)} disponibles`, submitLabel: 'Registrar movimiento', fields: [
        { key: 'type', label: 'Tipo de movimiento', kind: 'choice', required: true, value: 'PURCHASE', choices: [{ label: 'Compra', value: 'PURCHASE' }, { label: 'Merma', value: 'WASTE' }, { label: 'Ajuste', value: 'ADJUSTMENT' }] },
        { key: 'quantity', label: 'Cantidad', kind: 'number', required: true },
        { key: 'reason', label: 'Motivo', kind: 'multiline', required: true },
      ], submit: (values) => mutate(`inventory:${id}`, () => staffApi.adjustStock({ branchId: branchId!, inventoryItemId: Number(row.inventoryItemId ?? row.id), type: values.type as 'PURCHASE' | 'WASTE' | 'ADJUSTMENT', quantity: numberValue(values.quantity), reason: String(values.reason) })) });
    } else if (module.key === 'catalog' && can('catalog.product.write')) {
      setForm({ title: `Editar ${stringValue(row.name)}`, subtitle: 'Nombre, descripción y destaque se comparten con web.', fields: [
        { key: 'name', label: 'Nombre', value: stringValue(row.name, ''), required: true },
        { key: 'description', label: 'Descripción', value: stringValue(row.description, ''), kind: 'multiline' },
        { key: 'isFeatured', label: 'Producto destacado', value: booleanValue(row.isFeatured), kind: 'boolean' },
      ], submit: (values) => mutate(`catalog:${id}`, () => staffApi.updateProduct(id, { name: values.name, description: values.description || null, isFeatured: values.isFeatured })) });
    } else if (module.key === 'media' && (can('catalog.product.write') || can('catalog.customization.write'))) {
      setForm({ title: `Editar ${stringValue(row.originalName)}`, subtitle: 'El texto alternativo hace la imagen accesible en web y app.', fields: [
        { key: 'altText', label: 'Descripción accesible', kind: 'multiline', value: stringValue(row.altText, '') },
        { key: 'category', label: 'Categoría', value: stringValue(row.category, 'general'), required: true },
      ], submit: (values) => mutate(`media:${id}`, () => staffApi.updateMedia(id, { altText: values.altText || null, category: values.category })) });
    } else if (module.key === 'coupons' && can('promotion.manage')) {
      setForm({ title: `Editar cupón ${stringValue(row.code)}`, fields: [
        { key: 'description', label: 'Descripción', value: stringValue(row.description, ''), required: true }, { key: 'value', label: 'Valor', kind: 'number', value: stringValue(row.value, '0'), required: true }, { key: 'minOrderAmount', label: 'Compra mínima', kind: 'number', value: stringValue(row.minOrderAmount, '0'), required: true }, { key: 'maxDiscountAmount', label: 'Tope de descuento', kind: 'number', value: stringValue(row.maxDiscountAmount, '') }, { key: 'usageLimit', label: 'Límite total de usos', kind: 'number', value: stringValue(row.usageLimit, '') }, { key: 'validUntil', label: 'Vigencia ISO', value: stringValue(row.validUntil, '') }, { key: 'isActive', label: 'Cupón activo', kind: 'boolean', value: booleanValue(row.isActive) },
      ], submit: (values) => mutate(`coupon:${id}`, () => staffApi.updateCoupon(id, { description: values.description, value: numberValue(values.value), minOrderAmount: numberValue(values.minOrderAmount), maxDiscountAmount: values.maxDiscountAmount ? numberValue(values.maxDiscountAmount) : null, usageLimit: values.usageLimit ? numberValue(values.usageLimit) : null, validUntil: values.validUntil || null, isActive: values.isActive })) });
    } else if (module.key === 'plans' && can('plan.manage')) {
      setForm({ title: `Editar ${stringValue(row.name)}`, fields: [
        { key: 'name', label: 'Nombre', value: stringValue(row.name, ''), required: true }, { key: 'price', label: 'Precio', kind: 'number', value: stringValue(row.price, '0'), required: true }, { key: 'grantedCredit', label: 'Saldo entregado', kind: 'number', value: stringValue(row.grantedCredit, '0'), required: true }, { key: 'validityDays', label: 'Vigencia en días', kind: 'number', value: stringValue(row.validityDays, '30'), required: true }, { key: 'isFeatured', label: 'Plan destacado', kind: 'boolean', value: booleanValue(row.isFeatured) }, { key: 'isActive', label: 'Plan activo', kind: 'boolean', value: booleanValue(row.isActive) },
      ], submit: (values) => mutate(`plan:${id}`, () => staffApi.updatePlan(id, { name: values.name, price: numberValue(values.price), grantedCredit: numberValue(values.grantedCredit), validityDays: numberValue(values.validityDays), isFeatured: values.isFeatured, isActive: values.isActive })) });
    } else if (module.key === 'coverage' && can('geo.write')) {
      if ('acceptsPickup' in row) setForm({ title: `Editar ${stringValue(row.name)}`, fields: [
        { key: 'prepMinutes', label: 'Minutos de preparación', kind: 'number', value: stringValue(row.prepMinutes, '20'), required: true },
        { key: 'acceptsPickup', label: 'Acepta recojo', kind: 'boolean', value: booleanValue(row.acceptsPickup) },
        { key: 'isActive', label: 'Local activo', kind: 'boolean', value: booleanValue(row.isActive) },
      ], submit: (values) => mutate(`branch:${id}`, () => staffApi.updateBranch(id, { prepMinutes: numberValue(values.prepMinutes), acceptsPickup: values.acceptsPickup, isActive: values.isActive })) });
      else setForm({ title: `Editar zona ${stringValue(row.name)}`, fields: [
        { key: 'deliveryFee', label: 'Costo de envío', kind: 'number', value: stringValue(row.deliveryFee, '0'), required: true },
        { key: 'minimumOrder', label: 'Mínimo opcional (0 = sin mínimo)', kind: 'number', value: stringValue(row.minimumOrder, '0'), required: true },
        { key: 'estimatedMinutes', label: 'Minutos estimados', kind: 'number', value: stringValue(row.estimatedMinutes, '30'), required: true },
        { key: 'isActive', label: 'Zona activa', kind: 'boolean', value: booleanValue(row.isActive) },
      ], submit: (values) => mutate(`zone:${id}`, () => staffApi.updateZone(id, { deliveryFee: numberValue(values.deliveryFee), minimumOrder: numberValue(values.minimumOrder), estimatedMinutes: numberValue(values.estimatedMinutes), isActive: values.isActive })) });
    } else if (module.key === 'users' && can('user.manage')) {
      void staffApi.roles().then((roles) => setForm({ title: `Administrar ${stringValue(row.email)}`, subtitle: 'Los permisos efectivos siguen validados por el backend.', fields: [
        { key: 'status', label: 'Estado de la cuenta', kind: 'choice', value: stringValue(row.status, 'ACTIVE'), choices: [{ label: 'Activa', value: 'ACTIVE' }, { label: 'Bloqueada', value: 'BLOCKED' }] },
        { key: 'isSuperAdmin', label: 'Acceso de superadministrador', kind: 'boolean', value: booleanValue(row.isSuperAdmin), hint: 'Otorga acceso a todos los locales y módulos.' },
        { key: 'roleIds', label: 'Roles', kind: 'multiChoice', value: Array.isArray(row.roles) ? row.roles.map((role) => String(object(role).id)) : [], choices: roles.map((role) => ({ label: stringValue(role.name), value: String(role.id) })) },
        { key: 'branchId', label: 'ID del local principal', kind: 'number', value: Array.isArray(row.branchIds) && row.branchIds[0] ? String(row.branchIds[0]) : '' },
      ], submit: async (values) => mutate(`user:${id}`, async () => {
        if (values.status !== row.status) await staffApi.setStaffStatus(id, values.status as 'ACTIVE' | 'BLOCKED');
        if (Boolean(values.isSuperAdmin) !== booleanValue(row.isSuperAdmin)) await staffApi.setSuperAdmin(id, Boolean(values.isSuperAdmin));
        await staffApi.updateStaffRoles(id, { roleIds: (values.roleIds as string[]).map(Number), branchId: values.branchId ? numberValue(values.branchId) : null });
      }) })).catch((error: unknown) => toast.show({ tone: 'error', message: error instanceof Error ? error.message : 'No pudimos cargar los roles.' }));
    } else if (module.key === 'roles' && can('role.manage') && !booleanValue(row.isProtected)) {
      void staffApi.permissions().then((groups) => { const permissions = groups.flatMap((group) => Array.isArray(group.permissions) ? group.permissions.map(object) : []); setForm({ title: `Editar ${stringValue(row.name)}`, subtitle: `${Array.isArray(row.permissions) ? row.permissions.length : 0} permisos asignados`, fields: [
        { key: 'name', label: 'Nombre del rol', value: stringValue(row.name, ''), required: true }, { key: 'description', label: 'Descripción', kind: 'multiline', value: stringValue(row.description, '') }, { key: 'permissions', label: 'Permisos', kind: 'multiChoice', value: Array.isArray(row.permissions) ? row.permissions.map(String) : [], choices: permissions.map((permission) => ({ label: stringValue(permission.label), value: String(permission.code) })) },
      ], submit: (values) => mutate(`role:${id}`, () => staffApi.updateRole(id, { name: values.name, description: values.description, permissions: values.permissions })) }); }).catch((error: unknown) => toast.show({ tone: 'error', message: error instanceof Error ? error.message : 'No pudimos cargar los permisos.' }));
    } else if (module.key === 'complaints' && can('complaint.manage')) {
      setForm({ title: `Responder ${stringValue(row.code, `#${id}`)}`, subtitle: `${stringValue(row.consumerName)} · ${stringValue(row.email)}`, submitLabel: 'Guardar respuesta', fields: [
        { key: 'status', label: 'Estado', kind: 'choice', required: true, value: row.status === 'RESOLVED' ? 'RESOLVED' : 'IN_PROGRESS', choices: [{ label: 'En atención', value: 'IN_PROGRESS' }, { label: 'Resuelto', value: 'RESOLVED' }] },
        { key: 'response', label: 'Respuesta formal al consumidor', kind: 'multiline', required: true },
      ], submit: (values) => mutate(`complaint:${id}`, () => staffApi.respondComplaint(id, String(values.response), values.status as 'IN_PROGRESS' | 'RESOLVED')) });
    }
  };

  const chooseMediaFile = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, quality: 0.82, base64: true });
    if (result.canceled || !result.assets[0]?.base64) return;
    const asset = result.assets[0];
    const mimeType = asset.mimeType === 'image/png' ? 'image/png' : asset.mimeType === 'image/webp' ? 'image/webp' : 'image/jpeg';
    setForm({
      title: 'Publicar imagen',
      subtitle: asset.fileName ?? 'Imagen de la galería',
      submitLabel: 'Subir a la biblioteca',
      fields: [
        { key: 'altText', label: 'Descripción accesible', kind: 'multiline', required: true },
        { key: 'category', label: 'Categoría', value: 'products', required: true },
      ],
      submit: (values) => mutate('media:upload', () => staffApi.uploadMedia({
        fileName: asset.fileName ?? `imagen-${Date.now()}.${mimeType.split('/')[1]}`,
        mimeType,
        dataUrl: `data:${mimeType};base64,${asset.base64}`,
        altText: String(values.altText),
        category: String(values.category),
      }), 'Imagen disponible en web y app.'),
    });
  };

  const openMediaUrlForm = () => setForm({
    title: 'Importar imagen desde URL',
    subtitle: 'La imagen se descargará y quedará guardada en Misky Challay.',
    submitLabel: 'Importar a la biblioteca',
    fields: [
      { key: 'sourceUrl', label: 'URL pública HTTPS', kind: 'url', required: true, placeholder: 'https://sitio.com/imagen.jpg' },
      { key: 'altText', label: 'Descripción accesible', kind: 'multiline', required: true },
      { key: 'category', label: 'Categoría', value: 'products', required: true },
    ],
    submit: (values) => mutate('media:import-url', () => staffApi.importMediaFromUrl({
      sourceUrl: String(values.sourceUrl).trim(),
      altText: String(values.altText).trim(),
      category: String(values.category).trim(),
    }), 'Imagen importada y disponible en web y app.'),
  });

  const openCreate = () => {
    if (!module || !branchId && module.branchScoped) return;
    if (module.key === 'inventory' && can('inventory.manage')) setForm({ title: 'Nuevo insumo', subtitle: 'Se habilitará en el local activo.', submitLabel: 'Crear insumo', fields: [
      { key: 'name', label: 'Nombre', required: true }, { key: 'unit', label: 'Unidad', required: true, placeholder: 'kg' },
      { key: 'unitCost', label: 'Costo unitario', kind: 'number', value: '0', required: true }, { key: 'minLevel', label: 'Stock mínimo', kind: 'number', value: '0', required: true }, { key: 'initialStock', label: 'Stock inicial', kind: 'number', value: '0', required: true },
    ], submit: (values) => mutate('inventory:create', () => staffApi.createInventoryItem({ branchId: branchId!, name: String(values.name).trim(), unit: String(values.unit).trim(), unitCost: numberValue(values.unitCost), minLevel: numberValue(values.minLevel), initialStock: numberValue(values.initialStock) })) });
    else if (module.key === 'dining' && can('dining.operate')) setForm({ title: 'Nueva mesa', subtitle: 'El QR se puede activar desde la tarjeta después de crearla.', submitLabel: 'Crear mesa', fields: [
      { key: 'code', label: 'Código de mesa', required: true, placeholder: 'M-08' }, { key: 'area', label: 'Área', required: true, value: 'Salón principal' }, { key: 'capacity', label: 'Capacidad', kind: 'number', value: '2', required: true },
    ], submit: (values) => mutate('table:create', () => staffApi.createDiningTable({ branchId: branchId!, code: String(values.code).trim(), area: String(values.area).trim(), capacity: numberValue(values.capacity, 2) })) });
    else if (module.key === 'catalog' && can('catalog.product.write')) void staffApi.catalogMeta().then((meta) => {
      const categories = Array.isArray(meta.categories) ? meta.categories.map(object) : [];
      setForm({ title: 'Nuevo producto', subtitle: 'Nace como borrador hasta que se publique.', submitLabel: 'Crear producto', fields: [
        { key: 'name', label: 'Nombre', required: true }, { key: 'categoryId', label: 'Categoría', kind: 'choice', required: true, choices: categories.map((category) => ({ label: stringValue(category.name), value: String(category.id) })) },
        { key: 'type', label: 'Tipo de producto', kind: 'choice', value: 'FIXED', choices: [{ label: 'Plato fijo', value: 'FIXED' }, { label: 'Arma tu bowl', value: 'CUSTOMIZABLE' }] },
        { key: 'description', label: 'Descripción', kind: 'multiline' }, { key: 'imageUrl', label: 'URL de imagen' }, { key: 'variantName', label: 'Nombre de presentación', value: 'Único', required: true }, { key: 'basePrice', label: 'Precio base', kind: 'number', required: true },
      ], submit: (values) => mutate('catalog:create', () => staffApi.createProduct({ name: values.name, categoryId: numberValue(values.categoryId), type: values.type, description: values.description || undefined, imageUrl: values.imageUrl || null, variantName: values.variantName, basePrice: numberValue(values.basePrice) })) });
    }).catch((error: unknown) => toast.show({ tone: 'error', message: error instanceof Error ? error.message : 'No pudimos cargar las categorías.' }));
    else if (module.key === 'coupons' && can('promotion.manage')) setForm({ title: 'Nuevo cupón', submitLabel: 'Crear promoción', fields: [
      { key: 'code', label: 'Código', required: true }, { key: 'description', label: 'Descripción', required: true }, { key: 'discountType', label: 'Tipo', kind: 'choice', value: 'PERCENT', choices: [{ label: 'Porcentaje', value: 'PERCENT' }, { label: 'Monto fijo', value: 'FIXED' }, { label: 'Envío gratis', value: 'FREE_DELIVERY' }] },
      { key: 'value', label: 'Valor', kind: 'number', value: '0', required: true }, { key: 'minOrderAmount', label: 'Compra mínima', kind: 'number', value: '0', required: true }, { key: 'usageLimitPerUser', label: 'Usos por cliente', kind: 'number', value: '1', required: true }, { key: 'validUntil', label: 'Vigencia ISO (opcional)', placeholder: '2026-12-31T23:59:59.000Z' },
    ], submit: (values) => mutate('coupon:create', () => staffApi.createCoupon({ code: String(values.code).trim().toUpperCase(), description: values.description, discountType: values.discountType, value: numberValue(values.value), minOrderAmount: numberValue(values.minOrderAmount), usageLimitPerUser: numberValue(values.usageLimitPerUser, 1), validUntil: values.validUntil || null })) });
    else if (module.key === 'plans' && can('plan.manage')) setForm({ title: 'Nuevo plan', submitLabel: 'Crear plan', fields: [
      { key: 'code', label: 'Código', required: true }, { key: 'name', label: 'Nombre', required: true }, { key: 'description', label: 'Descripción', kind: 'multiline' }, { key: 'price', label: 'Precio', kind: 'number', required: true }, { key: 'grantedCredit', label: 'Saldo entregado', kind: 'number', required: true }, { key: 'validityDays', label: 'Vigencia en días', kind: 'number', value: '30', required: true },
    ], submit: (values) => mutate('plan:create', () => staffApi.createPlan({ code: String(values.code).trim().toUpperCase(), name: values.name, description: values.description || undefined, price: numberValue(values.price), grantedCredit: numberValue(values.grantedCredit), validityDays: numberValue(values.validityDays, 30) })) });
    else if (module.key === 'users' && can('user.manage')) void Promise.all([staffApi.roles()]).then(([roles]) => setForm({ title: 'Nuevo integrante', subtitle: 'La contraseña debe cambiarse después del primer acceso.', submitLabel: 'Crear usuario', fields: [
      { key: 'email', label: 'Correo', kind: 'email', required: true }, { key: 'password', label: 'Contraseña temporal', kind: 'password', required: true }, { key: 'firstName', label: 'Nombres', required: true }, { key: 'lastName', label: 'Apellidos', required: true },
      { key: 'roleIds', label: 'Roles', kind: 'multiChoice', value: [], required: true, choices: roles.map((role) => ({ label: stringValue(role.name), value: String(role.id) })) }, { key: 'branchId', label: 'ID del local', kind: 'number', value: branchId ? String(branchId) : '' },
    ], submit: (values) => mutate('user:create', () => staffApi.createStaff({ email: String(values.email).trim().toLowerCase(), password: values.password, firstName: values.firstName, lastName: values.lastName, roleIds: (values.roleIds as string[]).map(Number), branchId: values.branchId ? numberValue(values.branchId) : null })) })).catch((error: unknown) => toast.show({ tone: 'error', message: error instanceof Error ? error.message : 'No pudimos cargar los roles.' }));
    else if (module.key === 'roles' && can('role.manage')) void staffApi.permissions().then((groups) => {
      const permissions = groups.flatMap((group) => Array.isArray(group.permissions) ? group.permissions.map(object) : []);
      setForm({ title: 'Nuevo rol', submitLabel: 'Crear rol', fields: [{ key: 'code', label: 'Código', required: true, hint: 'Solo minúsculas, números y guion bajo.' }, { key: 'name', label: 'Nombre', required: true }, { key: 'description', label: 'Descripción', kind: 'multiline' }, { key: 'permissions', label: 'Permisos', kind: 'multiChoice', value: [], required: true, choices: permissions.map((permission) => ({ label: stringValue(permission.label), value: String(permission.code) })) }], submit: (values) => mutate('role:create', () => staffApi.createRole({ code: String(values.code).trim().toLowerCase().replace(/\s+/g, '_'), name: values.name, description: values.description || undefined, permissions: values.permissions })) });
    }).catch((error: unknown) => toast.show({ tone: 'error', message: error instanceof Error ? error.message : 'No pudimos cargar los permisos.' }));
    else if (module.key === 'coverage' && can('geo.write')) setForm({ title: 'Nuevo local', subtitle: 'La zona se asigna después desde la cobertura.', submitLabel: 'Crear local', fields: [
      { key: 'cityId', label: 'ID de ciudad', kind: 'number', required: true }, { key: 'name', label: 'Nombre del local', required: true }, { key: 'addressLine', label: 'Dirección', required: true }, { key: 'latitude', label: 'Latitud', kind: 'number' }, { key: 'longitude', label: 'Longitud', kind: 'number' }, { key: 'phone', label: 'Teléfono' }, { key: 'prepMinutes', label: 'Minutos de preparación', kind: 'number', value: '20', required: true }, { key: 'acceptsPickup', label: 'Acepta recojo', kind: 'boolean', value: true }, { key: 'acceptsDelivery', label: 'Acepta delivery', kind: 'boolean', value: true },
    ], submit: (values) => mutate('branch:create', () => staffApi.createBranch({ cityId: numberValue(values.cityId), name: values.name, addressLine: values.addressLine, latitude: values.latitude ? numberValue(values.latitude) : null, longitude: values.longitude ? numberValue(values.longitude) : null, phone: values.phone || undefined, prepMinutes: numberValue(values.prepMinutes, 20), acceptsPickup: values.acceptsPickup, acceptsDelivery: values.acceptsDelivery })) });
    else if (module.key === 'media' && (can('catalog.product.write') || can('catalog.customization.write'))) Alert.alert(
      'Agregar imagen',
      'Elige cómo quieres incorporarla a la biblioteca compartida.',
      [
        { text: 'Cancelar', style: 'cancel' },
        { text: 'Importar URL', onPress: openMediaUrlForm },
        { text: 'Elegir archivo', onPress: () => void chooseMediaFile().catch((error: unknown) => toast.show({ tone: 'error', message: error instanceof Error ? error.message : 'No pudimos abrir la galería.' })) },
      ],
    );
  };

  const createZone = () => setForm({ title: 'Nueva zona de reparto', submitLabel: 'Crear zona', fields: [
    { key: 'cityId', label: 'ID de ciudad', kind: 'number', required: true }, { key: 'name', label: 'Nombre de zona', required: true }, { key: 'deliveryFee', label: 'Costo de envío', kind: 'number', value: '0', required: true }, { key: 'minimumOrder', label: 'Mínimo opcional (0 = sin mínimo)', kind: 'number', value: '0', required: true }, { key: 'estimatedMinutes', label: 'Minutos estimados', kind: 'number', value: '30', required: true }, { key: 'priority', label: 'Prioridad', kind: 'number', value: '1', required: true },
  ], submit: (values) => mutate('zone:create', () => staffApi.createZone({ cityId: numberValue(values.cityId), name: values.name, deliveryFee: numberValue(values.deliveryFee), minimumOrder: numberValue(values.minimumOrder), estimatedMinutes: numberValue(values.estimatedMinutes, 30), priority: numberValue(values.priority, 1) })) });

  if (status !== 'authenticated' || !module || !allowed) {
    return <ScreenScaffold title="Acceso restringido" showBack><EmptyState icon="shield-lock-outline" title="No tienes permiso para este módulo" message="La app y el backend validan el mismo rol. Solicita el permiso correspondiente a un administrador." actionLabel="Volver" onAction={() => router.back()} /></ScreenScaffold>;
  }
  if (module.key === 'business') return null;

  const canCreate = (module.key === 'inventory' && can('inventory.manage')) || (module.key === 'dining' && can('dining.operate')) || (module.key === 'catalog' && can('catalog.product.write')) || (module.key === 'media' && (can('catalog.product.write') || can('catalog.customization.write'))) || (module.key === 'coupons' && can('promotion.manage')) || (module.key === 'plans' && can('plan.manage')) || (module.key === 'coverage' && can('geo.write')) || (module.key === 'users' && can('user.manage')) || (module.key === 'roles' && can('role.manage'));
  const hasMore = Boolean(resource.data?.meta && page < resource.data.meta.totalPages);

  const renderRow = ({ item: row, index }: { item: StaffRow; index: number }) => {
    const presentation = rowPresentation(module.key, row);
    const id = Number(row.id ?? row.inventoryItemId ?? row.paymentId ?? index);
    const key = `${module.key}:${id}`;
    const kitchenDeliveryType = stringValue(object(row.order).deliveryType, '');
    const kitchenNext = module.key === 'kitchen'
      && !(String(row.status) === 'READY' && kitchenDeliveryType !== 'PICKUP')
      ? KITCHEN_NEXT[stringValue(row.status)]
      : undefined;
    const kitchenActionLabel = kitchenNext?.status === 'DISPATCHED'
      ? kitchenDeliveryType === 'DELIVERY'
        ? 'Entregar a reparto'
        : kitchenDeliveryType === 'DINE_IN'
          ? 'Avisar a salón'
          : 'Entregar en mostrador'
      : kitchenNext?.status === 'READY'
        ? kitchenDeliveryType === 'DELIVERY'
          ? 'Marcar listo para reparto'
          : kitchenDeliveryType === 'DINE_IN'
            ? 'Marcar listo y avisar a salón'
            : 'Marcar listo para recojo'
        : kitchenNext?.label;
    const advanceKitchen = async () => {
      if (!kitchenNext) return;
      await staffApi.advanceKitchen(id, kitchenNext.status);
      if (kitchenNext.status !== 'READY') return;
      const orderNumber = stringValue(object(row.order).orderNumber, '');
      if (!orderNumber) return;
      const detail = await staffApi.orderDetail(orderNumber);
      if (!booleanValue(object(detail.receiptSettings).autoPrintCustomerTicket)) return;
      await staffApi.recordInternalReceiptPrint(orderNumber);
      await printInternalReceipt(detail);
    };
    const deliveryNext = module.key === 'delivery' ? DELIVERY_NEXT[stringValue(row.status)] : undefined;
    const editable = (module.key === 'inventory' && can('inventory.manage')) || (module.key === 'catalog' && can('catalog.product.write')) || (module.key === 'media' && (can('catalog.product.write') || can('catalog.customization.write'))) || (module.key === 'coupons' && can('promotion.manage')) || (module.key === 'plans' && can('plan.manage')) || (module.key === 'coverage' && can('geo.write')) || (module.key === 'users' && can('user.manage')) || (module.key === 'roles' && can('role.manage') && !booleanValue(row.isProtected)) || (module.key === 'complaints' && can('complaint.manage'));
    return (
      <View style={[styles.card, shadow.sm, presentation.danger && styles.cardDanger]}>
        {presentation.imageUrl ? <AppImage uri={presentation.imageUrl} style={styles.image} contentFit="cover" accessibilityLabel={presentation.title} /> : null}
        <View style={styles.cardTop}>
          <View style={[styles.rowIcon, module.key === 'dashboard' && styles.rankIcon, presentation.danger && styles.rowIconDanger]}>
            {module.key === 'dashboard' ? <Text style={styles.rankText}>#{index + 1}</Text> : <MaterialCommunityIcons name={module.icon} size={20} color={presentation.danger ? colors.danger : colors.brand700} />}
          </View>
          <View style={styles.cardCopy}><Text style={styles.cardTitle}>{presentation.title}</Text><Text style={styles.cardMeta}>{presentation.meta}</Text></View>
          {presentation.badge ? <StatusPill label={presentation.badge} tone={statusTone(presentation.badge, presentation.danger)} live={module.live && !presentation.danger} /> : null}
        </View>
        {presentation.detail ? <Text style={styles.cardDetail}>{presentation.detail}</Text> : null}
        {module.key === 'inventory' && presentation.danger ? <View style={styles.stockAlert}><MaterialCommunityIcons name="alert-circle" size={18} color={colors.danger} /><Text style={styles.stockAlertText}>Requiere reposición. Revisa los platos afectados antes de vender.</Text></View> : null}
        {module.key === 'procurement' && can('procurement.manage') && !['RECEIVED', 'CANCELLED'].includes(String(row.status)) ? <PrimaryButton label="Registrar recepción y lote" variant="secondary" onPress={() => {
          const firstItem = object(Array.isArray(row.items) ? row.items[0] : null);
          const remaining = Math.max(0, Number(firstItem.quantityOrdered ?? 0) - Number(firstItem.quantityReceived ?? 0));
          setForm({ title: `Recibir ${stringValue(firstItem.item && object(firstItem.item).name, 'insumo')}`, subtitle: `${stringValue(row.orderNumber)} · pendiente ${remaining}`, submitLabel: 'Actualizar inventario', fields: [
            { key: 'quantity', label: 'Cantidad recibida', kind: 'number', value: String(remaining || 1), required: true },
            { key: 'lotCode', label: 'Código de lote', required: true, placeholder: 'LOTE-2026-001' },
            { key: 'expiresAt', label: 'Vencimiento (AAAA-MM-DD)', placeholder: '2026-12-31' },
            { key: 'unitCost', label: 'Costo unitario (opcional)', kind: 'number', value: String(firstItem.unitCost ?? '') },
          ], submit: (values) => mutate(key, () => staffApi.receivePurchaseOrder({ branchId: branchId!, orderId: Number(row.id), lines: [{ purchaseOrderItemId: Number(firstItem.id), quantity: numberValue(values.quantity), lotCode: String(values.lotCode).trim(), expiresAt: values.expiresAt ? String(values.expiresAt).trim() : null, unitCost: values.unitCost ? numberValue(values.unitCost) : undefined }] }), 'Recepción registrada y stock actualizado.') });
        }} style={styles.action} /> : null}
        {module.key === 'builder' ? <PrimaryButton label="Administrar ingredientes" variant="secondary" onPress={() => router.push(`/staff/builder-editor?productId=${id}&branchId=${branchId ?? ''}` as never)} style={styles.action} /> : null}
        {kitchenNext && can('kitchen.operate') ? <PrimaryButton label={kitchenActionLabel ?? kitchenNext.label} loading={actingKey === key} onPress={() => void mutate(key, advanceKitchen)} style={styles.action} /> : null}
        {deliveryNext && can('delivery.operate') ? <PrimaryButton label={deliveryNext.label} loading={actingKey === key} onPress={() => void mutate(key, () => staffApi.advanceDelivery(id, deliveryNext.status))} style={styles.action} /> : null}
        {module.key === 'delivery' && can('delivery.operate') && !['DELIVERED', 'FAILED'].includes(String(row.status)) ? <PrimaryButton label="Reportar entrega fallida" variant="danger" onPress={() => setForm({ title: 'Reportar entrega fallida', subtitle: presentation.title, submitLabel: 'Confirmar incidencia', fields: [{ key: 'comment', label: 'Motivo de la incidencia', kind: 'multiline', required: true }], submit: (values) => mutate(key, () => staffApi.advanceDelivery(id, 'FAILED', String(values.comment))) })} style={styles.action} /> : null}
        {module.key === 'kitchen' && booleanValue(row.isScheduledPreview) && can('order.read') ? <PrimaryButton label="Ver detalle del pedido" variant="secondary" icon="clipboard-text-outline" onPress={() => router.push(`/staff/order-detail?orderNumber=${encodeURIComponent(String(object(row.order).orderNumber))}` as never)} style={styles.action} /> : null}
        {module.key === 'kitchen' && !booleanValue(row.isScheduledPreview) && can('kitchen.operate') && can('order.cancel') && !['DISPATCHED', 'CANCELLED'].includes(String(row.status)) ? <PrimaryButton label="Cancelar por incidencia" variant="danger" onPress={() => setForm({ title: 'Cancelar pedido desde cocina', subtitle: presentation.title, submitLabel: 'Cancelar pedido', fields: [{ key: 'comment', label: 'Motivo obligatorio', kind: 'multiline', required: true }], submit: (values) => mutate(key, () => staffApi.advanceKitchen(id, 'CANCELLED', String(values.comment))) })} style={styles.action} /> : null}
        {module.key === 'delivery' && can('delivery.assign') && !object(row.driver).id ? <PrimaryButton label="Asignar repartidor" variant="secondary" onPress={() => router.push(`/staff/delivery-assign?deliveryId=${id}&branchId=${branchId}` as never)} style={styles.action} /> : null}
        {module.key === 'orders' && can('order.read') ? <PrimaryButton label="Ver detalle operativo" variant="secondary" icon="clipboard-text-outline" onPress={() => router.push(`/staff/order-detail?orderNumber=${encodeURIComponent(String(row.orderNumber))}` as never)} style={styles.action} /> : null}
        {module.key === 'orders' && object(row.kitchenTicket).id && can('kitchen.read') ? <PrimaryButton label="Abrir Cocina" variant="secondary" icon="chef-hat" onPress={() => router.push(`/staff/kitchen?branchId=${Number(object(row.branch).id ?? branchId ?? '')}` as never)} style={styles.action} /> : null}
        {module.key === 'orders' && can('order.cancel') && !['CANCELLED', 'DELIVERED', 'REFUNDED'].includes(String(row.status)) ? <PrimaryButton label="Cancelar pedido" variant="danger" onPress={() => openOrderStatus(row, 'CANCELLED', 'Cancelar pedido')} style={styles.action} /> : null}
        {module.key === 'cash' && can('payment.verify') ? <View style={styles.actionGrid}><PrimaryButton label="Rechazar" variant="danger" loading={actingKey === key} onPress={() => Alert.alert('Rechazar pago', 'Confirma que el código no coincide con el movimiento de caja.', [{ text: 'Volver', style: 'cancel' }, { text: 'Rechazar', style: 'destructive', onPress: () => void mutate(key, () => staffApi.reviewPayment(Number(row.paymentId ?? row.id), 'REJECT', 'No coincide con el pago verificado en caja.')) }])} style={styles.flexAction} /><PrimaryButton label="Aprobar" loading={actingKey === key} onPress={() => Alert.alert('Aprobar pago', 'Confirma que verificaste importe y código en Yape o Plin.', [{ text: 'Volver', style: 'cancel' }, { text: 'Aprobar', onPress: () => void mutate(key, () => staffApi.reviewPayment(Number(row.paymentId ?? row.id), 'APPROVE')) }])} style={styles.flexAction} /></View> : null}
        {module.key === 'dining' && can('dining.operate') ? <View style={styles.actionGrid}><PrimaryButton label={booleanValue(row.qrEnabled) ? 'Desactivar QR' : 'Activar QR'} variant="secondary" onPress={() => void mutate(key, () => staffApi.setDiningQr(id, { branchId: branchId!, enabled: !booleanValue(row.qrEnabled) }))} style={styles.flexAction} />{object(row.command).orderNumber ? <><PrimaryButton label="Agregar productos" variant="secondary" onPress={() => router.push(`/staff/dining-command?orderNumber=${encodeURIComponent(String(object(row.command).orderNumber))}&tableId=${id}&branchId=${branchId}` as never)} style={styles.flexAction} /><PrimaryButton label="Cobrar mesa" onPress={() => router.push(`/staff/dining-close?orderNumber=${encodeURIComponent(String(object(row.command).orderNumber))}&branchId=${branchId}&total=${encodeURIComponent(String(object(row.command).total ?? ''))}` as never)} style={styles.flexAction} /></> : <PrimaryButton label="Abrir comanda" onPress={() => router.push(`/staff/dining-command?tableId=${id}&branchId=${branchId}` as never)} style={styles.flexAction} />}</View> : null}
        {module.key === 'catalog' && can('catalog.product.publish') ? <View style={styles.actionGrid}>{row.status !== 'ACTIVE' ? <PrimaryButton label="Publicar" onPress={() => void mutate(key, () => staffApi.changeProductStatus(id, 'ACTIVE'))} style={styles.flexAction} /> : <PrimaryButton label="Retirar" variant="danger" onPress={() => void mutate(key, () => staffApi.changeProductStatus(id, 'INACTIVE'))} style={styles.flexAction} />}</View> : null}
        {module.key === 'catalog' ? <PrimaryButton label="Precio y disponibilidad" variant="secondary" onPress={() => router.push(`/staff/catalog-editor?productId=${id}&branchId=${branchId ?? ''}` as never)} style={styles.action} /> : null}
        {module.key === 'media' && (can('catalog.product.write') || can('catalog.customization.write')) ? <PrimaryButton label={row.deletedAt ? 'Restaurar imagen' : 'Mover a papelera'} variant={row.deletedAt ? 'secondary' : 'danger'} onPress={() => Alert.alert(row.deletedAt ? 'Restaurar imagen' : 'Mover a papelera', stringValue(row.originalName), [{ text: 'Volver', style: 'cancel' }, { text: row.deletedAt ? 'Restaurar' : 'Eliminar', style: row.deletedAt ? 'default' : 'destructive', onPress: () => void mutate(key, () => row.deletedAt ? staffApi.restoreMedia(id) : staffApi.removeMedia(id)) }])} style={styles.action} /> : null}
        {module.key === 'plans' && can('plan.manage') ? <View style={styles.actionGrid}><PrimaryButton label="Agregar beneficio" variant="secondary" onPress={() => setForm({ title: `Beneficio para ${stringValue(row.name)}`, fields: [{ key: 'type', label: 'Tipo', kind: 'choice', value: 'DISCOUNT_PERCENT', choices: [{ label: 'Descuento', value: 'DISCOUNT_PERCENT' }, { label: 'Envío gratis', value: 'FREE_DELIVERY' }] }, { key: 'value', label: 'Valor', kind: 'number', value: '0', required: true }, { key: 'maxAmountPerOrder', label: 'Tope por pedido', kind: 'number' }, { key: 'description', label: 'Descripción', kind: 'multiline', required: true }], submit: (values) => mutate(`benefit:${id}`, () => staffApi.setPlanBenefit(id, { type: values.type, value: numberValue(values.value), maxAmountPerOrder: values.maxAmountPerOrder ? numberValue(values.maxAmountPerOrder) : null, description: values.description })) })} style={styles.flexAction} /></View> : null}
        {editable ? <PrimaryButton label={module.key === 'roles' ? 'Eliminar rol' : module.key === 'coupons' || module.key === 'plans' ? 'Cambiar estado' : 'Administrar'} variant="secondary" onPress={() => openRowAction(row)} style={styles.action} /> : null}
      </View>
    );
  };

  const listHeader = (
    <View>
      <View style={[styles.guide, shadow.md]}><View style={styles.guideIcon}><MaterialCommunityIcons name={module.icon} size={29} color={colors.surface} /></View><View style={styles.guideCopy}><Text style={styles.guideEyebrow}>{module.live ? 'OPERACIÓN EN VIVO' : 'GESTIÓN SINCRONIZADA'}</Text><Text style={styles.guideTitle}>{module.description}</Text><Text style={styles.guideText}>Los cambios usan el mismo servidor, permisos y locales que la web.</Text></View></View>
      {resource.data?.summary ? <Summary module={module.key} data={resource.data.summary} /> : null}
      {resource.error ? <View style={styles.error}><Text style={styles.errorTitle}>No pudimos cargar el módulo</Text><Text style={styles.errorText}>{friendlyLoadError(resource.error.message)}</Text><PrimaryButton label="Reintentar" variant="secondary" onPress={() => void resource.refetch()} /></View> : null}
      {!resource.error && rows.length > 0 ? <View style={styles.resultsHead}><View><Text style={styles.resultsEyebrow}>INFORMACIÓN DEL MÓDULO</Text><Text style={styles.resultsTitle}>{resource.data?.meta?.total ?? rows.length} registros</Text></View>{module.live ? <View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveText}>En vivo</Text></View> : null}</View> : null}
      {!resource.error && (rows.length > 5 || remoteSearch) ? <View style={styles.search}><MaterialCommunityIcons name="magnify" size={21} color={colors.inkMuted} /><TextInput value={search} onChangeText={(value) => { setSearch(value); if (remoteSearch) { setPage(1); setAllRows([]); setLoadedPage(0); } }} placeholder="Buscar en este módulo" placeholderTextColor="#7d8a84" style={styles.searchInput} />{search ? <Pressable onPress={() => { setSearch(''); setPage(1); setAllRows([]); setLoadedPage(0); }}><MaterialCommunityIcons name="close-circle" size={20} color={colors.inkMuted} /></Pressable> : null}</View> : null}
      {module.key === 'coverage' && can('geo.write') ? <PrimaryButton label="Crear zona de reparto" variant="secondary" onPress={createZone} style={styles.businessAction} /> : null}
    </View>
  );

  return (
    <ScreenScaffold title={module.title} subtitle={module.branchScoped ? (params.branchName || `Local #${branchId ?? 'sin elegir'}`) : 'Gestión general'} showBack headerRight={canCreate ? <Pressable accessibilityLabel="Crear registro" onPress={openCreate} style={styles.headerCreate}><MaterialCommunityIcons name="plus" size={25} color={colors.surface} /></Pressable> : undefined}>
      <FlatList
        data={visibleRows}
        keyExtractor={(row, index) => `${module.key}-${String(row.id ?? row.inventoryItemId ?? row.paymentId ?? index)}`}
        renderItem={renderRow}
        contentContainerStyle={styles.content}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={resource.loading ? <ModuleSkeleton /> : !resource.error ? <EmptyState fill={false} icon={search ? 'magnify-close' : module.live ? 'check-circle-outline' : 'database-check-outline'} title={search ? 'Sin coincidencias' : module.live ? 'Todo al día' : 'Aún no hay registros'} message={search ? 'Prueba otro término o limpia la búsqueda.' : module.live ? 'No hay tareas pendientes para este momento.' : 'Cuando se cree información aparecerá aquí y también en la web.'} /> : null}
        ListFooterComponent={hasMore ? <PrimaryButton label="Cargar más" variant="secondary" loading={resource.loading && page > 1} onPress={() => setPage((current) => current + 1)} style={styles.loadMore} /> : null}
        refreshControl={<RefreshControl refreshing={resource.refreshing} onRefresh={() => { setPage(1); setAllRows([]); setLoadedPage(0); void resource.refresh(); }} tintColor={colors.brand600} />}
        initialNumToRender={8}
        maxToRenderPerBatch={8}
        windowSize={7}
        removeClippedSubviews={false}
        keyboardShouldPersistTaps="handled"
      />
      {form ? <StaffFormSheet visible title={form.title} subtitle={form.subtitle} fields={form.fields} submitLabel={form.submitLabel} loading={actingKey !== null} onClose={() => setForm(null)} onSubmit={form.submit} /> : null}
    </ScreenScaffold>
  );
}

function ModuleSkeleton() {
  return <View style={styles.moduleSkeleton}>{[0, 1, 2].map((item) => <View key={item} style={styles.moduleSkeletonCard}><Skeleton width={46} height={46} rounded="md" /><View style={styles.moduleSkeletonCopy}><Skeleton width="58%" height={18} rounded="sm" /><Skeleton width="88%" height={13} rounded="sm" style={styles.moduleSkeletonLine} /></View></View>)}</View>;
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: spacing.md, paddingBottom: spacing.xxxl, backgroundColor: '#f3f7f4' },
  separator: { height: spacing.sm + spacing.xs },
  guide: { position: 'relative', overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.xl, backgroundColor: colors.brand950, padding: spacing.lg, marginBottom: spacing.lg },
  guideIcon: { width: 58, height: 58, borderRadius: radius.md + 4, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand600 },
  guideCopy: { flex: 1 }, guideEyebrow: { ...type.caption, color: colors.brand100, letterSpacing: 1, fontWeight: '900' }, guideTitle: { ...type.heading, color: colors.onDark, fontWeight: '900', marginTop: 3 }, guideText: { ...type.bodySm, color: colors.onDarkMuted, marginTop: 4 },
  metrics: { gap: spacing.sm, paddingBottom: spacing.lg }, metric: { minWidth: 142, minHeight: 104, justifyContent: 'space-between', borderRadius: radius.lg, borderWidth: 1, borderColor: colors.lineSoft, backgroundColor: colors.surface, padding: spacing.md }, metricAccent: { backgroundColor: colors.accent50, borderColor: colors.accent100 }, metricDanger: { backgroundColor: colors.danger50, borderColor: '#efb5b5' }, metricValue: { ...type.title, color: colors.brand900 }, metricValueAccent: { color: colors.warning }, metricValueDanger: { color: colors.danger }, metricLabel: { ...type.caption, color: colors.inkMuted, marginTop: 8, textTransform: 'uppercase' }, metricLabelAccent: { color: colors.warning }, metricLabelDanger: { color: colors.danger },
  resultsHead: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: spacing.sm, marginTop: spacing.sm, marginBottom: spacing.md }, resultsEyebrow: { ...type.caption, color: colors.brand600, fontWeight: '900', letterSpacing: 1 }, resultsTitle: { ...type.title, color: colors.ink, marginTop: 2 }, liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, backgroundColor: colors.brand50, paddingHorizontal: 10, paddingVertical: 6 }, liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.success }, liveText: { ...type.caption, color: colors.brand700 },
  search: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, borderRadius: radius.md + 4, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, paddingHorizontal: spacing.md, marginBottom: spacing.md, ...shadow.sm }, searchInput: { ...type.body, flex: 1, color: colors.ink },
  card: { overflow: 'hidden', borderRadius: radius.xl, borderWidth: 1, borderColor: colors.lineSoft, backgroundColor: colors.surface, padding: spacing.md }, cardDanger: { borderColor: '#efb5b5', backgroundColor: colors.danger50 }, image: { height: 176, margin: -spacing.md, marginBottom: spacing.md }, cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm }, rowIcon: { width: 46, height: 46, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand50 }, rowIconDanger: { backgroundColor: '#ffecec' }, cardCopy: { flex: 1 }, cardTitle: { ...type.heading, color: colors.ink }, cardMeta: { ...type.bodySm, color: colors.inkMuted, marginTop: 3 }, cardDetail: { ...type.bodySm, color: colors.ink, marginTop: spacing.sm }, badge: { maxWidth: 110, borderRadius: radius.pill, backgroundColor: colors.brand50, paddingHorizontal: 9, paddingVertical: 5 }, badgeDanger: { backgroundColor: '#ffe5e5' }, badgeText: { ...type.caption, color: colors.brand700, textTransform: 'uppercase' }, badgeTextDanger: { color: colors.danger },
  rankIcon: { backgroundColor: colors.accent50, borderWidth: 1, borderColor: colors.accent100 }, rankText: { ...type.bodySm, color: colors.warning, fontWeight: '900' },
  stockAlert: { flexDirection: 'row', alignItems: 'flex-start', gap: 7, borderRadius: radius.sm, backgroundColor: '#ffecec', padding: spacing.sm, marginTop: spacing.sm }, stockAlertText: { ...type.caption, flex: 1, color: colors.danger },
  action: { marginTop: spacing.md }, actionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md }, flexAction: { flexGrow: 1, minWidth: 140 }, loadMore: { marginTop: spacing.lg },
  error: { gap: spacing.sm, borderRadius: radius.lg, backgroundColor: '#fff0f0', padding: spacing.md, marginBottom: spacing.md }, errorTitle: { ...type.heading, color: colors.danger }, errorText: { ...type.bodySm, color: colors.inkMuted },
  headerCreate: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand600 },
  businessAction: { marginBottom: spacing.md },
  moduleSkeleton: { gap: spacing.sm + spacing.xs },
  moduleSkeletonCard: { minHeight: 96, flexDirection: 'row', alignItems: 'center', gap: spacing.md, borderRadius: radius.lg, borderWidth: 1, borderColor: colors.lineSoft, backgroundColor: colors.surface, padding: spacing.md },
  moduleSkeletonCopy: { flex: 1 },
  moduleSkeletonLine: { marginTop: spacing.sm },
});
