import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Ban, BarChart3, CalendarClock, Copy, ExternalLink, GripVertical, History, ImageIcon, Pencil, Plus, Sliders, Trash2, TrendingUp } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Card, CardDescription } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Select, SelectOption } from '@components/ui/Select';
import { Modal } from '@components/ui/Modal';
import { useConfirm } from '@components/ui/ConfirmDialog';
import { LoadError } from '@components/common/LoadError';
import { PageLoader } from '@components/common/PageLoader';
import { PageHeader } from '@components/common/PageHeader';
import { api, getApiErrorMessage } from '@services/api/client';
import { usePermissions } from '@hooks/usePermissions';
import { PERM } from '@constants/permissions';
import { formatCurrency, formatDate, formatRelative } from '@lib/format';
import { cn } from '@lib/cn';
import { MediaPicker } from '../components/MediaPicker';
import { catalogAdminApi, type CatalogMeta } from '../services/catalogAdmin.service';
import {
  commercialApi,
  type BuilderConfig,
  type BuilderGroup,
  type BuilderOption,
  type BuilderPreset,
  type BuilderAnalytics,
  type BuilderHistoryEntry,
} from '../services/commercialAdmin.service';

/**
 * Orden del constructor: se manda la lista COMPLETA de ids y el servidor reescribe
 * `sortOrder` de 0 a n-1. Intercambiar dos valores no servia porque no eran
 * unicos, y con un empate el desempate pasa a alfabetico: la flecha no movia nada
 * y el toast decia "Orden actualizado" igualmente.
 */
const builderOrderApi = {
  groups: async (productId: number, groupIds: number[]): Promise<void> => {
    await api.patch(`/admin/builder/${productId}/groups/order`, { groupIds });
  },
  options: async (groupId: number, optionIds: number[]): Promise<void> => {
    await api.patch(`/admin/builder/groups/${groupId}/options/order`, { optionIds });
  },
  presets: async (productId: number, presetIds: number[]): Promise<void> => {
    await api.patch(`/admin/builder/${productId}/presets/order`, { presetIds });
  },
};

/** Mueve un elemento de la lista y devuelve el nuevo orden completo. */
const moveInList = <T,>(items: T[], from: number, to: number): T[] => {
  if (to < 0 || to >= items.length || from === to) return items;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
};

const NEW_OPTION = {
  name: '',
  description: '',
  imageUrl: '',
  imageAlt: '',
  imagePosition: '50% 50%',
  dietaryTags: '',
  allergens: [] as string[],
  spiceLevel: '0',
  priceDelta: '0',
  chargeAlways: false,
  calories: '0',
  protein: '0',
  carbs: '0',
  fat: '0',
  inventoryItemId: '' as number | '',
  consumptionQuantity: '0',
  maxPerItem: '1',
};

/* Sin campo de orden: el orden se cambia arrastrando y lo renumera el servidor.
 * Un numero tecleado a mano es justo lo que volvia a crear los empates. */
const NEW_PRESET = { code: '', name: '', description: '', imageUrl: '', badge: '', isFeatured: false, isActive: true, optionIds: [] as number[] };

/** Reglas de un paso mientras se teclean, antes de guardarlas. */
interface GroupRules {
  minSelection: number;
  maxSelection: number;
  freeQuantity: number;
}

/**
 * ABM del constructor de bowls.
 *
 * Aqui se cambian las REGLAS que usa el motor de cotizacion: cuantas opciones se
 * eligen en cada paso, cuantas van incluidas, que cuesta cada extra y que
 * combinaciones se prohiben. Nada de esto vive ya en el codigo.
 */
const BuilderAdminPage = () => {
  const { can } = usePermissions();
  const confirm = useConfirm();
  const canEdit = can(PERM.CATALOG_CUSTOMIZATION_WRITE);
  /* El nutricionista entra aqui porque los alergenos y los macros de CADA
   * ingrediente del bowl solo se editan en esta pantalla, y el permiso que la
   * abria (`catalog.customization.write`) no lo tiene. Ve su parte y nada mas: el
   * precio, el estado, el insumo y el orden siguen siendo del gestor de catalogo,
   * y el servidor lo vuelve a comprobar campo por campo. */
  const canEditNutrition = can(PERM.NUTRITION_WRITE);
  const canEditAllergens = can(PERM.ALLERGEN_WRITE);
  const canEditTags = can(PERM.DIETARY_TAG_WRITE);
  const canEditFood = canEditNutrition || canEditAllergens || canEditTags;
  const canOpenOption = canEdit || canEditFood;

  const [productId, setProductId] = useState<number | null>(null);
  const [config, setConfig] = useState<BuilderConfig | null>(null);
  const [allergenMaster, setAllergenMaster] = useState<CatalogMeta['allergens']>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [addingTo, setAddingTo] = useState<BuilderGroup | null>(null);
  const [editingOption, setEditingOption] = useState<BuilderOption | null>(null);
  const [optionForm, setOptionForm] = useState(NEW_OPTION);
  const [linking, setLinking] = useState<BuilderOption | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<number[]>([]);
  const [scheduling, setScheduling] = useState<BuilderOption | null>(null);
  const [scheduleForm, setScheduleForm] = useState({ branchId: '' as number | '', isAvailable: true, priceOverride: '', availableFrom: '', availableUntil: '' });
  const [editingPreset, setEditingPreset] = useState<BuilderPreset | null>(null);
  const [presetOpen, setPresetOpen] = useState(false);
  const [presetForm, setPresetForm] = useState(NEW_PRESET);
  const [analytics, setAnalytics] = useState<BuilderAnalytics | null>(null);
  const [history, setHistory] = useState<BuilderHistoryEntry[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [dragging, setDragging] = useState<{ kind: 'group' | 'option' | 'preset'; id: number } | null>(null);
  /* Reglas tecleadas y todavia sin guardar, por paso. Viven fuera de `config`
   * porque cualquier accion de la pantalla termina en `load()`, que reemplaza el
   * arbol entero: guardar un paso borraba lo escrito en los otros tres. */
  const [ruleDrafts, setRuleDrafts] = useState<Record<number, GroupRules>>({});

  const load = useCallback(async (id: number) => {
    try {
      const data = await commercialApi.builder(id);
      setConfig(data);
      setLoadError(null);
      void Promise.all([
        commercialApi.builderAnalytics(id).then(setAnalytics),
        commercialApi.builderHistory(id).then(setHistory),
      ]).catch(() => undefined);
    } catch (error) {
      // Sin config no hay pantalla: el fallo se pinta, no se susurra en un toast
      // que se va en tres segundos dejando "no hay ningun producto personalizable".
      setLoadError(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // El constructor pertenece al producto personalizable ("Arma tu bowl").
  const loadProduct = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    catalogAdminApi
      .products()
      .then((products) => {
        const customizable = products.find((product) => product.type === 'CUSTOMIZABLE');
        if (!customizable) {
          setIsLoading(false);
          return;
        }
        setProductId(customizable.id);
        void load(customizable.id);
      })
      .catch((error) => {
        setLoadError(getApiErrorMessage(error));
        setIsLoading(false);
      });
  }, [load]);

  useEffect(() => {
    loadProduct();
  }, [loadProduct]);

  /* Maestro de alergenos: los del ingrediente son CODIGOS que el motor cruza
   * contra las preferencias del cliente, asi que se eligen de la lista y no se
   * teclean. Si no llega, el formulario sigue funcionando y avisa. */
  useEffect(() => {
    if (!canOpenOption) return;
    catalogAdminApi
      .meta()
      .then((meta) => setAllergenMaster(meta.allergens))
      .catch(() => setAllergenMaster([]));
  }, [canOpenOption]);

  const refresh = () => {
    if (productId) void load(productId);
  };

  const run = async (key: string, action: () => Promise<void>, message: string) => {
    setBusy(key);
    try {
      await action();
      toast.success(message);
      refresh();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
      // Tambien se recarga al fallar: si el rechazo viene de que otro
      // administrador cambio la lista (el orden se rechaza cuando no coincide con
      // la de ahora), reintentar sobre datos viejos volveria a fallar siempre.
      refresh();
    } finally {
      setBusy(null);
    }
  };

  const inventoryById = useMemo(
    () => new Map((config?.inventoryItems ?? []).map((item) => [item.id, item])),
    [config],
  );

  /** Reglas efectivas de un paso: lo tecleado si lo hay, si no lo del servidor. */
  const rulesOf = (group: BuilderGroup): GroupRules =>
    ruleDrafts[group.id] ?? {
      minSelection: group.minSelection,
      maxSelection: group.maxSelection,
      freeQuantity: group.freeQuantity,
    };

  const patchRules = (group: BuilderGroup, patch: Partial<GroupRules>) => {
    setRuleDrafts((current) => ({ ...current, [group.id]: { ...rulesOf(group), ...patch } }));
  };

  const isRulesDirty = (group: BuilderGroup): boolean => {
    const draft = ruleDrafts[group.id];
    if (!draft) return false;
    return (
      draft.minSelection !== group.minSelection
      || draft.maxSelection !== group.maxSelection
      || draft.freeQuantity !== group.freeQuantity
    );
  };

  if (isLoading) return <PageLoader />;

  if (loadError) {
    return (
      <LoadError
        title="No pudimos cargar el constructor"
        message={loadError}
        onRetry={loadProduct}
      />
    );
  }

  if (!config) {
    return (
      <Card className="border-dashed py-12 text-center">
        <CardDescription>
          No hay ningun producto personalizable. Crea uno de tipo CUSTOMIZABLE en el catalogo.
        </CardDescription>
      </Card>
    );
  }

  const allOptions = config.groups.flatMap((group) => group.options);
  const scheduledRows = config.groups.flatMap((group) => group.options.flatMap((option) =>
    option.branchAvailability.filter((row) => row.availableFrom || row.availableUntil || row.priceOverride !== null || !row.isAvailable).map((row) => ({ ...row, option, group })),
  ));

  const scheduleForBranch = (option: BuilderOption, branchId: number) => {
    const existing = option.branchAvailability.find((row) => row.branchId === branchId);
    setScheduleForm({
      branchId,
      isAvailable: existing?.isAvailable ?? true,
      priceOverride: existing?.priceOverride === null || existing?.priceOverride === undefined ? '' : String(existing.priceOverride),
      availableFrom: existing?.availableFrom ? existing.availableFrom.slice(0, 16) : '',
      availableUntil: existing?.availableUntil ? existing.availableUntil.slice(0, 16) : '',
    });
  };

  const moveGroup = (from: number, to: number) => {
    const ordered = moveInList(config.groups, from, to);
    if (ordered === config.groups) return;
    void run(
      'order-groups',
      () => builderOrderApi.groups(config.product.id, ordered.map((entry) => entry.id)),
      'Orden de pasos actualizado',
    );
  };

  const moveOption = (group: BuilderGroup, from: number, to: number) => {
    const ordered = moveInList(group.options, from, to);
    if (ordered === group.options) return;
    void run(
      `order-options-${group.id}`,
      () => builderOrderApi.options(group.id, ordered.map((entry) => entry.id)),
      'Orden de ingredientes actualizado',
    );
  };

  const movePreset = (from: number, to: number) => {
    const ordered = moveInList(config.presets, from, to);
    if (ordered === config.presets) return;
    void run(
      'order-presets',
      () => builderOrderApi.presets(config.product.id, ordered.map((entry) => entry.id)),
      'Orden de recomendaciones actualizado',
    );
  };

  const openOptionEditor = (option: BuilderOption) => {
    setOptionForm({
      name: option.name,
      description: option.description ?? '',
      imageUrl: option.imageUrl ?? '',
      imageAlt: option.imageAlt ?? '',
      imagePosition: option.imagePosition,
      dietaryTags: option.dietaryTags.join(', '),
      allergens: option.allergens,
      spiceLevel: String(option.spiceLevel),
      priceDelta: String(option.priceDelta),
      chargeAlways: option.chargeAlways,
      calories: String(option.calories),
      protein: String(option.protein),
      carbs: String(option.carbs),
      fat: String(option.fat),
      inventoryItemId: option.inventoryItemId ?? '',
      consumptionQuantity: String(option.consumptionQuantity),
      maxPerItem: String(option.maxPerItem),
    });
    setEditingOption(option);
  };

  /* Alergenos del formulario contra el maestro. Sin maestro cargado no se toca lo
   * que ya tenia el ingrediente: mejor conservarlo que borrarlo por un fallo de red. */
  const knownAllergenCodes = new Set(allergenMaster.map((allergen) => allergen.code));
  const strayAllergens = allergenMaster.length === 0
    ? []
    : optionForm.allergens.filter((code) => !knownAllergenCodes.has(code));
  const allergensForPayload = allergenMaster.length === 0
    ? optionForm.allergens
    : optionForm.allergens.filter((code) => knownAllergenCodes.has(code));

  const selectedInventoryUnit = optionForm.inventoryItemId === ''
    ? ''
    : inventoryById.get(optionForm.inventoryItemId)?.unit ?? 'la unidad del insumo';
  const inventoryQuantityError =
    optionForm.inventoryItemId !== '' && !(Number(optionForm.consumptionQuantity) > 0)
      ? 'Indica cuánto descuenta: con 0 no se descuenta stock ni se agota sola.'
      : undefined;

  /** Insumo que descuenta la opcion, y el aviso cuando el enlace no descuenta nada. */
  const renderInventory = (option: BuilderOption) => {
    if (option.inventoryItemId === null) return <span className="text-ink-muted">—</span>;

    const item = inventoryById.get(option.inventoryItemId);
    const name = item?.name ?? `Insumo #${option.inventoryItemId}`;

    if (option.consumptionQuantity <= 0) {
      return (
        <span
          className="font-semibold text-red-700"
          title="Enlazada a un insumo pero sin cantidad: no descuenta stock ni se agota sola"
        >
          {name} · sin cantidad
        </span>
      );
    }

    return (
      <span className="text-ink-muted">
        {name} · {option.consumptionQuantity} {item?.unit ?? ''}
      </span>
    );
  };

  const dropEntity = (kind: 'group' | 'option' | 'preset', targetId: number, group?: BuilderGroup) => {
    if (!dragging || dragging.kind !== kind || dragging.id === targetId) return;
    const draggedId = dragging.id;
    setDragging(null);

    const list = kind === 'group' ? config.groups : kind === 'preset' ? config.presets : group?.options;
    if (!list) return;

    const from = list.findIndex((entry) => entry.id === draggedId);
    const to = list.findIndex((entry) => entry.id === targetId);
    if (from < 0 || to < 0) return;

    if (kind === 'group') moveGroup(from, to);
    else if (kind === 'preset') movePreset(from, to);
    else if (group) moveOption(group, from, to);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Configuración"
        title="Constructor de bowls"
        description="Gestiona las reglas del motor de precios. Los cambios se aplican a bowls nuevos, nunca a pedidos ya realizados."
        icon={Sliders}
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-3 shadow-e1">
        <div>
          <p className="text-sm font-bold text-ink">Vista del cliente</p>
          <p className="text-xs text-ink-muted">Revisa el constructor publicado en otra pestaña.</p>
        </div>
        <div className="flex gap-2">{canEdit && <Button variant="outline" onClick={() => setHistoryOpen(true)}><History className="size-4" /> Historial ({history.length})</Button>}<Button variant="outline" onClick={() => window.open('/arma-tu-bowl', '_blank', 'noopener,noreferrer')}><ExternalLink className="size-4" /> Abrir vista previa</Button></div>
      </div>

      {analytics && (
        <Card className="mb-5 overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="flex items-center gap-2 font-bold text-ink"><BarChart3 className="size-4 text-brand-600" /> Rendimiento del constructor</p><p className="text-xs text-ink-muted">Embudo de los últimos {analytics.range.days} días.</p></div><span className="inline-flex items-center gap-1 rounded-pill bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700"><TrendingUp className="size-3.5" /> {analytics.funnel.conversionRate}% conversión</span></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[['Visitas', analytics.funnel.viewed], ['Iniciaron', analytics.funnel.started], ['Completaron', analytics.funnel.completed], ['Al carrito', analytics.funnel.addedToCart]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-surface-muted p-3"><p className="text-xs text-ink-muted">{label}</p><p className="mt-1 text-2xl font-black text-ink">{value}</p></div>)}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-3"><div><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Más seleccionados</p>{analytics.topSelectedOptions.slice(0, 5).map((item) => <div key={item.id} className="mt-2 flex justify-between text-sm"><span>{item.name}</span><b>{item.count}</b></div>)}</div><div><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Presets utilizados</p>{analytics.presetUsage.slice(0, 5).map((item) => <div key={item.id} className="mt-2 flex justify-between text-sm"><span>{item.name}</span><b>{item.count}</b></div>)}</div><div><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Señales de calidad</p><div className="mt-2 grid gap-2 text-sm"><p className="flex justify-between"><span>Abandono</span><b>{analytics.funnel.abandonmentRate}%</b></p><p className="flex justify-between"><span>Conflictos resueltos</span><b>{analytics.interactions.conflictsResolved}</b></p><p className="flex justify-between"><span>Errores de cotización</span><b>{analytics.interactions.quoteErrors}</b></p></div></div></div>
        </Card>
      )}

      <Card className="mb-5">
        <div className="flex items-start justify-between gap-3"><div><p className="flex items-center gap-2 font-bold text-ink"><CalendarClock className="size-4 text-brand-600" /> Calendario de disponibilidad</p><p className="text-xs text-ink-muted">{scheduledRows.length ? `${scheduledRows.length} reglas especiales activas o programadas.` : 'No hay ventanas especiales; aplica la disponibilidad global.'}</p></div></div>
        {scheduledRows.length > 0 && <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{scheduledRows.map((row) => <button key={`${row.option.id}-${row.branchId}`} type="button" onClick={() => { setScheduling(row.option); scheduleForBranch(row.option, row.branchId); }} className="rounded-xl border border-line p-3 text-left transition hover:border-brand-300"><div className="flex justify-between gap-2"><span className="font-bold text-ink">{row.option.name}</span><span className={cn('rounded-pill px-2 py-0.5 text-[10px] font-bold', row.isAvailable ? 'bg-brand-50 text-brand-700' : 'bg-red-50 text-red-700')}>{row.isAvailable ? 'Disponible' : 'Bloqueado'}</span></div><p className="mt-1 text-xs text-ink-muted">{config.branches.find((branch) => branch.id === row.branchId)?.name ?? `Sucursal #${row.branchId}`}</p><p className="mt-2 text-xs text-ink-muted">{row.availableFrom ? formatDate(row.availableFrom) : 'Desde ahora'} → {row.availableUntil ? formatDate(row.availableUntil) : 'Sin vencimiento'}{row.priceOverride !== null ? ` · ${formatCurrency(row.priceOverride)}` : ''}</p></button>)}</div>}
      </Card>

      <Card className="mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="font-bold text-ink">Combinaciones recomendadas</p><p className="text-xs text-ink-muted">Atajos que aparecen al inicio del constructor.</p></div>
          {canEdit && <Button size="sm" onClick={() => { setEditingPreset(null); setPresetForm(NEW_PRESET); setPresetOpen(true); }}><Plus className="size-4" /> Nueva recomendación</Button>}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {config.presets.map((preset) => (
            <div key={preset.id} draggable={canEdit} onDragStart={() => setDragging({ kind: 'preset', id: preset.id })} onDragOver={(event) => event.preventDefault()} onDrop={() => dropEntity('preset', preset.id)} className={cn('overflow-hidden rounded-2xl border bg-white', preset.isActive ? 'border-line' : 'border-dashed border-line opacity-60', canEdit && 'cursor-grab active:cursor-grabbing')}>
              {preset.imageUrl && <img src={preset.imageUrl} alt="" className="h-24 w-full object-cover" />}
              <div className="p-3">
                <div className="flex items-start justify-between gap-2"><div><p className="font-bold text-ink">{preset.name}</p><p className="text-xs text-ink-muted">{preset.selections.length} ingredientes</p></div>{preset.badge && <span className="rounded-pill bg-accent-100 px-2 py-0.5 text-[10px] font-bold text-accent-700">{preset.badge}</span>}</div>
                {canEdit && <div className="mt-3 flex gap-1">
                  <Button size="sm" variant="ghost" aria-label={`Editar ${preset.name}`} onClick={() => { setEditingPreset(preset); setPresetForm({ code: preset.code, name: preset.name, description: preset.description ?? '', imageUrl: preset.imageUrl ?? '', badge: preset.badge ?? '', isFeatured: preset.isFeatured, isActive: preset.isActive, optionIds: preset.selections.map((item) => item.optionId) }); setPresetOpen(true); }}><Pencil className="size-4" /></Button>
                  <Button size="sm" variant="ghost" isLoading={busy === `preset-toggle-${preset.id}`} onClick={() => void run(`preset-toggle-${preset.id}`, () => commercialApi.updatePreset(preset.id, { isActive: !preset.isActive }), preset.isActive ? 'Recomendación ocultada' : 'Recomendación publicada')}>{preset.isActive ? 'Ocultar' : 'Publicar'}</Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    aria-label={`Eliminar ${preset.name}`}
                    isLoading={busy === `preset-del-${preset.id}`}
                    onClick={async () => {
                      const { confirmed } = await confirm({
                        title: `Eliminar "${preset.name}"`,
                        message: 'La recomendación desaparece del inicio del constructor y no se puede recuperar. Si solo quieres dejar de mostrarla, usa "Ocultar".',
                        confirmLabel: 'Eliminar',
                        tone: 'danger',
                      });
                      if (!confirmed) return;
                      void run(`preset-del-${preset.id}`, () => commercialApi.deletePreset(preset.id), 'Recomendación eliminada');
                    }}
                  ><Trash2 className="size-4" /></Button>
                </div>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {canEdit && selectedOptions.length > 0 && (
        <div className="sticky top-20 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 p-3 shadow-e3">
          <span className="mr-auto text-sm font-bold text-brand-800">{selectedOptions.length} seleccionadas</span>
          {(['ACTIVE', 'OUT_OF_STOCK', 'INACTIVE'] as const).map((status) => (
            <Button key={status} size="sm" variant="outline" onClick={() => void run(`bulk-${status}`, () => commercialApi.bulkUpdateOptions(selectedOptions, status), 'Estados actualizados')}>{status === 'ACTIVE' ? 'Activar' : status === 'OUT_OF_STOCK' ? 'Agotar' : 'Ocultar'}</Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setSelectedOptions([])}>Cancelar</Button>
        </div>
      )}

      <div className="grid gap-5">
        {config.groups.map((group, index) => (
          <Card key={group.id} draggable={canEdit} onDragStart={() => setDragging({ kind: 'group', id: group.id })} onDragOver={(event) => event.preventDefault()} onDrop={() => dropEntity('group', group.id)}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 font-semibold text-ink">
                  {canEdit && <GripVertical className="size-4 cursor-grab text-ink-muted" aria-hidden="true" />}{index + 1}. {group.name}
                </p>
                <p className="text-xs text-ink-muted">
                  {group.code} · {group.selectionType === 'SINGLE' ? 'una opcion' : 'varias opciones'}
                </p>
              </div>

              {canEdit && (
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" disabled={index === 0} aria-label="Subir paso" onClick={() => moveGroup(index, index - 1)}><ArrowUp className="size-4" /></Button>
                  <Button size="sm" variant="ghost" disabled={index === config.groups.length - 1} aria-label="Bajar paso" onClick={() => moveGroup(index, index + 1)}><ArrowDown className="size-4" /></Button>
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={<Plus className="size-4" />}
                  onClick={() => {
                    setOptionForm(NEW_OPTION);
                    setAddingTo(group);
                  }}
                >
                  Agregar opcion
                </Button>
                </div>
              )}
            </div>

            {/* Reglas del paso */}
            {canEdit && (
              <div className="mt-4 rounded-xl border border-line bg-surface-muted p-3">
                <div className="grid gap-3 sm:grid-cols-4">
                  <Input
                    label="Minimo"
                    type="number"
                    min="0"
                    value={rulesOf(group).minSelection}
                    onChange={(e) => patchRules(group, { minSelection: Number(e.target.value) })}
                  />
                  <Input
                    label="Maximo"
                    type="number"
                    min="1"
                    value={rulesOf(group).maxSelection}
                    onChange={(e) => patchRules(group, { maxSelection: Number(e.target.value) })}
                  />
                  <Input
                    label="Incluidas"
                    type="number"
                    min="0"
                    value={rulesOf(group).freeQuantity}
                    onChange={(e) => patchRules(group, { freeQuantity: Number(e.target.value) })}
                    hint="Sin costo"
                  />
                  <div className="flex items-end">
                    <Button
                      size="sm"
                      className="w-full"
                      isLoading={busy === `group-${group.id}`}
                      disabled={!isRulesDirty(group)}
                      onClick={() =>
                        run(
                          `group-${group.id}`,
                          async () => {
                            await commercialApi.updateGroup(group.id, rulesOf(group));
                            // Guardado el paso, su borrador sobra; los de los demas
                            // pasos siguen vivos y sobreviven al `load()`.
                            setRuleDrafts((current) => {
                              const next = { ...current };
                              delete next[group.id];
                              return next;
                            });
                          },
                          'Reglas actualizadas',
                        )
                      }
                    >
                      Guardar reglas
                    </Button>
                  </div>
                </div>
                {isRulesDirty(group) && (
                  <p className="mt-2 text-xs font-semibold text-accent-700">
                    Cambios sin guardar en este paso.
                  </p>
                )}
              </div>
            )}

            {/* Opciones */}
            <div className="mt-4 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                  <tr>
                    {canEdit && <th scope="col" className="w-8 pb-2"><span className="sr-only">Seleccionar</span></th>}
                    <th scope="col" className="pb-2">Opcion</th>
                    <th scope="col" className="pb-2 text-right">Precio</th>
                    <th scope="col" className="pb-2 text-center">Suplemento</th>
                    <th scope="col" className="pb-2 text-right">Kcal</th>
                    {/* Sin esta columna, una opcion enlazada a un insumo con cantidad
                        0 era invisible: ni descuenta ni se agota nunca. */}
                    <th scope="col" className="pb-2">Insumo</th>
                    <th scope="col" className="pb-2">Estado</th>
                    <th scope="col" className="pb-2">No combina con</th>
                    <th scope="col" className="pb-2"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>

                <tbody>
                  {group.options.map((option, optionIndex) => (
                    <tr key={option.id} draggable={canEdit} onDragStart={(event) => { event.stopPropagation(); setDragging({ kind: 'option', id: option.id }); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.stopPropagation(); dropEntity('option', option.id, group); }} className="border-b border-line last:border-0">
                      {canEdit && <td className="py-2"><input type="checkbox" checked={selectedOptions.includes(option.id)} onChange={(event) => setSelectedOptions((current) => event.target.checked ? [...current, option.id] : current.filter((id) => id !== option.id))} className="size-4 accent-brand-600" aria-label={`Seleccionar ${option.name}`} /></td>}
                      <td className="py-2 font-medium text-ink">
                        <div className="flex items-center gap-2.5">
                          <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface-muted ring-1 ring-line">
                            {option.imageUrl ? (
                              <img src={option.imageUrl} alt="" className="size-full object-cover" />
                            ) : (
                              <ImageIcon className="size-4 text-ink-muted" />
                            )}
                          </span>
                          {canEdit && <GripVertical className="size-4 cursor-grab text-ink-muted" aria-hidden="true" />}<span>{option.name}</span>
                        </div>
                      </td>
                      <td className="py-2 text-right">
                        {option.priceDelta === 0 ? (
                          <span className="text-brand-700">Incluido</span>
                        ) : (
                          formatCurrency(option.priceDelta)
                        )}
                      </td>
                      <td className="py-2 text-center">
                        {option.chargeAlways ? (
                          <span
                            title="Se cobra siempre, aunque el paso incluya opciones gratis"
                            className="rounded-pill bg-accent-400/15 px-2 py-0.5 text-xs font-medium text-accent-700"
                          >
                            siempre
                          </span>
                        ) : (
                          <span className="text-xs text-ink-muted">-</span>
                        )}
                      </td>
                      <td className="py-2 text-right text-ink-muted">{option.calories}</td>
                      <td className="py-2 text-xs">{renderInventory(option)}</td>
                      <td className="py-2">
                        <span
                          className={cn(
                            'rounded-pill px-2 py-0.5 text-xs',
                            option.status === 'ACTIVE'
                              ? 'bg-brand-50 text-brand-700'
                              : 'bg-red-50 text-red-700',
                          )}
                        >
                          {option.status === 'ACTIVE' ? 'activa' : 'agotada'}
                        </span>
                      </td>
                      <td className="py-2 text-xs text-ink-muted">
                        {option.incompatibleWith.length === 0
                          ? '-'
                          : option.incompatibleWith
                              .map(
                                (id) =>
                                  allOptions.find((entry) => entry.id === id)?.name ?? `#${id}`,
                              )
                              .join(', ')}
                      </td>
                      <td className="py-2">
                        <div className="flex justify-end gap-1">
                          {canEdit && (
                            <>
                              <Button size="sm" variant="ghost" disabled={optionIndex === 0} aria-label="Subir opción" onClick={() => moveOption(group, optionIndex, optionIndex - 1)}><ArrowUp className="size-4" /></Button>
                              <Button size="sm" variant="ghost" disabled={optionIndex === group.options.length - 1} aria-label="Bajar opción" onClick={() => moveOption(group, optionIndex, optionIndex + 1)}><ArrowDown className="size-4" /></Button>
                            </>
                          )}
                          {canOpenOption && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => openOptionEditor(option)}
                              aria-label={canEdit ? `Editar ${option.name}` : `Editar nutrición de ${option.name}`}
                            >
                              <Pencil className="size-4" />
                            </Button>
                          )}
                          {canEdit && (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                isLoading={busy === `copy-${option.id}`}
                                onClick={() => void run(`copy-${option.id}`, () => commercialApi.duplicateOption(option.id), 'Opción duplicada como borrador')}
                                aria-label="Duplicar opción"
                              ><Copy className="size-4" /></Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => { setScheduling(option); setScheduleForm({ branchId: config.branches[0]?.id ?? '', isAvailable: true, priceOverride: '', availableFrom: '', availableUntil: '' }); }}
                                aria-label="Programar disponibilidad"
                              ><CalendarClock className="size-4" /></Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setLinking(option)}
                                aria-label="Prohibir combinacion"
                              >
                                <Ban className="size-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                isLoading={busy === `del-${option.id}`}
                                onClick={async () => {
                                  const { confirmed } = await confirm({
                                    title: `Eliminar "${option.name}"`,
                                    message: 'Se borra del constructor con sus combinaciones prohibidas y su programación por sucursal. Los bowls ya pedidos no cambian. Si solo quieres retirarla del menú, ponla en "Ocultar".',
                                    confirmLabel: 'Eliminar',
                                    tone: 'danger',
                                  });
                                  if (!confirmed) return;
                                  void run(
                                    `del-${option.id}`,
                                    () => commercialApi.deleteOption(option.id),
                                    'Opcion eliminada',
                                  );
                                }}
                                aria-label="Eliminar opcion"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid gap-3 md:hidden">
              {group.options.map((option, optionIndex) => (
                <article key={option.id} className="min-w-0 rounded-card border border-line bg-white p-3 shadow-e1">
                  <div className="flex min-w-0 items-start gap-3">
                    {canEdit && <input type="checkbox" checked={selectedOptions.includes(option.id)} onChange={(event) => setSelectedOptions((current) => event.target.checked ? [...current, option.id] : current.filter((id) => id !== option.id))} className="mt-3 size-4 shrink-0 accent-brand-600" aria-label={`Seleccionar ${option.name}`} />}
                    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-card bg-surface-muted ring-1 ring-line">
                      {option.imageUrl ? <img src={option.imageUrl} alt="" className="size-full object-cover" /> : <ImageIcon className="size-5 text-ink-muted" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="min-w-0 font-bold text-ink">{option.name}</p>
                        <span className={cn('shrink-0 rounded-pill px-2 py-0.5 text-[10px] font-bold', option.status === 'ACTIVE' ? 'bg-brand-50 text-brand-700' : 'bg-red-50 text-red-700')}>{option.status === 'ACTIVE' ? 'Activa' : 'Agotada'}</span>
                      </div>
                      <p className="mt-1 text-xs text-ink-muted">{option.priceDelta === 0 ? 'Incluida' : formatCurrency(option.priceDelta)} · {option.calories} kcal{option.chargeAlways ? ' · suplemento fijo' : ''}</p>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-2 rounded-card bg-surface-muted p-3 text-xs">
                    <div className="min-w-0"><span className="font-bold text-ink">Insumo: </span><span className="text-ink-muted">{renderInventory(option)}</span></div>
                    <div className="min-w-0 break-words"><span className="font-bold text-ink">No combina con: </span><span className="text-ink-muted">{option.incompatibleWith.length === 0 ? 'Sin restricciones' : option.incompatibleWith.map((id) => allOptions.find((entry) => entry.id === id)?.name ?? `#${id}`).join(', ')}</span></div>
                  </div>

                  {(canEdit || canOpenOption) && <div className="mt-3 flex flex-wrap items-center gap-1 border-t border-line pt-3">
                    {canEdit && <>
                      <Button size="sm" variant="ghost" disabled={optionIndex === 0} aria-label="Subir opción" onClick={() => moveOption(group, optionIndex, optionIndex - 1)}><ArrowUp className="size-4" /></Button>
                      <Button size="sm" variant="ghost" disabled={optionIndex === group.options.length - 1} aria-label="Bajar opción" onClick={() => moveOption(group, optionIndex, optionIndex + 1)}><ArrowDown className="size-4" /></Button>
                    </>}
                    {canOpenOption && <Button className="ml-auto" size="sm" variant="outline" onClick={() => openOptionEditor(option)}><Pencil className="size-4" /> {canEdit ? 'Editar' : 'Nutrición'}</Button>}
                    {canEdit && <>
                      <Button size="sm" variant="ghost" isLoading={busy === `copy-${option.id}`} onClick={() => void run(`copy-${option.id}`, () => commercialApi.duplicateOption(option.id), 'Opción duplicada como borrador')} aria-label="Duplicar opción"><Copy className="size-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => { setScheduling(option); setScheduleForm({ branchId: config.branches[0]?.id ?? '', isAvailable: true, priceOverride: '', availableFrom: '', availableUntil: '' }); }} aria-label="Programar disponibilidad"><CalendarClock className="size-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => setLinking(option)} aria-label="Prohibir combinación"><Ban className="size-4" /></Button>
                      <Button size="sm" variant="ghost" isLoading={busy === `del-${option.id}`} onClick={async () => {
                        const { confirmed } = await confirm({ title: `Eliminar "${option.name}"`, message: 'Se borra del constructor con sus combinaciones prohibidas y su programación por sucursal. Los bowls ya pedidos no cambian. Si solo quieres retirarla del menú, ponla en "Ocultar".', confirmLabel: 'Eliminar', tone: 'danger' });
                        if (!confirmed) return;
                        void run(`del-${option.id}`, () => commercialApi.deleteOption(option.id), 'Opción eliminada');
                      }} aria-label="Eliminar opción"><Trash2 className="size-4" /></Button>
                    </>}
                  </div>}
                </article>
              ))}
            </div>
          </Card>
        ))}
      </div>

      {/* `disableBackdropClose`: son ~8 campos mas la lista de ingredientes, y un
          toque fuera del dialogo se los llevaba todos sin preguntar. */}
      <Modal isOpen={presetOpen} onClose={() => setPresetOpen(false)} title={editingPreset ? 'Editar recomendación' : 'Nueva recomendación'} description="Elige una combinación válida que sirva como punto de partida." maxWidth="lg" disableBackdropClose>
        <div className="grid gap-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Nombre" value={presetForm.name} onChange={(event) => setPresetForm((current) => ({ ...current, name: event.target.value }))} placeholder="Favorito de la casa" />
            <Input label="Código interno" value={presetForm.code} disabled={editingPreset !== null} onChange={(event) => setPresetForm((current) => ({ ...current, code: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }))} placeholder="favorito_casa" />
          </div>
          <Input label="Descripción" value={presetForm.description} onChange={(event) => setPresetForm((current) => ({ ...current, description: event.target.value }))} />
          <Input label="Insignia" value={presetForm.badge} onChange={(event) => setPresetForm((current) => ({ ...current, badge: event.target.value }))} placeholder="Más pedido" hint="El orden de las recomendaciones se cambia arrastrando las tarjetas." />
          <MediaPicker value={presetForm.imageUrl} altText={presetForm.name} category="builder-presets" label="Imagen de la recomendación" onChange={(image) => setPresetForm((current) => ({ ...current, imageUrl: image.url }))} />
          <div>
            <p className="mb-2 text-sm font-medium text-ink">Ingredientes</p>
            <div className="grid max-h-72 gap-3 overflow-y-auto rounded-xl border border-line p-3">
              {config.groups.map((group) => <div key={group.id}><p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-muted">{group.name}</p><div className="grid gap-1 sm:grid-cols-2">{group.options.filter((option) => option.status !== 'INACTIVE').map((option) => <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-muted"><input type="checkbox" checked={presetForm.optionIds.includes(option.id)} onChange={(event) => setPresetForm((current) => ({ ...current, optionIds: event.target.checked ? [...current.optionIds, option.id] : current.optionIds.filter((id) => id !== option.id) }))} className="size-4 accent-brand-600" />{option.name}</label>)}</div></div>)}
            </div>
          </div>
          <div className="flex gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={presetForm.isFeatured} onChange={(event) => setPresetForm((current) => ({ ...current, isFeatured: event.target.checked }))} className="size-4 accent-brand-600" /> Destacada</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={presetForm.isActive} onChange={(event) => setPresetForm((current) => ({ ...current, isActive: event.target.checked }))} className="size-4 accent-brand-600" /> Publicada</label></div>
          <Button className="w-full" isLoading={busy === 'save-preset'} disabled={!presetForm.name || !presetForm.code || presetForm.optionIds.length === 0} onClick={() => void run('save-preset', async () => {
            const input = { name: presetForm.name, description: presetForm.description || null, imageUrl: presetForm.imageUrl || null, badge: presetForm.badge || null, isFeatured: presetForm.isFeatured, isActive: presetForm.isActive, selections: presetForm.optionIds.map((optionId) => ({ optionId, quantity: 1 })) };
            // Al editar no se manda `sortOrder`: lo decide el arrastre, no este formulario.
            if (editingPreset) await commercialApi.updatePreset(editingPreset.id, input);
            else await commercialApi.createPreset(config.product.id, { ...input, code: presetForm.code, sortOrder: config.presets.length });
            setPresetOpen(false);
          }, editingPreset ? 'Recomendación actualizada' : 'Recomendación creada')}>Guardar recomendación</Button>
        </div>
      </Modal>

      {/* Ficha del ingrediente. `disableBackdropClose` porque son ~15 campos y un
          clic fuera se los llevaba enteros sin preguntar. */}
      <Modal
        isOpen={addingTo !== null || editingOption !== null}
        onClose={() => {
          setAddingTo(null);
          setEditingOption(null);
        }}
        title={editingOption ? `Editar ${editingOption.name}` : `Nueva opción en ${addingTo?.name ?? ''}`}
        description={canEdit
          ? "Si marcas 'suplemento', se cobra siempre aunque el paso incluya opciones gratis."
          : 'Nutrición, alérgenos y etiquetas del ingrediente. El precio y la disponibilidad los gestiona el catálogo.'}
        maxWidth="md"
        disableBackdropClose
      >
        <div className="grid gap-5 md:grid-cols-[1fr_210px]">
          <div className="grid gap-3">
          {canEdit && (
            <>
              <Input
                label="Nombre"
                value={optionForm.name}
                onChange={(e) => setOptionForm((c) => ({ ...c, name: e.target.value }))}
                placeholder="Pulpo al olivo"
              />

              <Input
                label="Descripción corta"
                value={optionForm.description}
                onChange={(e) => setOptionForm((c) => ({ ...c, description: e.target.value }))}
                placeholder="Sabor, textura o preparación"
                hint="Se mostrará al cliente al elegir el ingrediente"
              />

              <MediaPicker
                value={optionForm.imageUrl}
                altText={optionForm.imageAlt}
                onChange={(image) => setOptionForm((current) => ({ ...current, imageUrl: image.url, imageAlt: image.altText }))}
              />

              <Input
                label="Texto alternativo"
                value={optionForm.imageAlt}
                onChange={(e) => setOptionForm((c) => ({ ...c, imageAlt: e.target.value }))}
                placeholder="Describe lo que aparece en la foto"
                hint="Importante para accesibilidad."
              />

              <div className="grid gap-3 sm:grid-cols-2">
                <Select id="spice" label="Nivel de picante" value={optionForm.spiceLevel} onChange={(e) => setOptionForm((c) => ({ ...c, spiceLevel: e.target.value }))}>
                  <SelectOption value="0">Sin picante</SelectOption><SelectOption value="1">Suave</SelectOption><SelectOption value="2">Medio</SelectOption><SelectOption value="3">Intenso</SelectOption>
                </Select>
                <Input label="Máximo de porciones" type="number" min="1" max="10" value={optionForm.maxPerItem} onChange={(e) => setOptionForm((c) => ({ ...c, maxPerItem: e.target.value }))} hint="Habilita controles +/− en el builder." />
              </div>

              <Input
                label="Precio extra"
                type="number"
                step="0.10"
                value={optionForm.priceDelta}
                onChange={(e) => setOptionForm((c) => ({ ...c, priceDelta: e.target.value }))}
              />
            </>
          )}

          {(canEdit || canEditTags) && (
            <Input label="Etiquetas dietarias" value={optionForm.dietaryTags} onChange={(e) => setOptionForm((c) => ({ ...c, dietaryTags: e.target.value }))} placeholder="vegano, sin gluten" hint="Separadas por comas." />
          )}

          {(canEdit || canEditAllergens) && (
            <div>
              <p className="mb-1.5 text-sm font-medium text-ink">Alérgenos</p>
              <p className="mb-2 text-xs text-ink-muted">
                Se eligen del maestro: el motor los cruza con las preferencias del cliente
                comparando el código, así que un alérgeno tecleado a mano no avisa a nadie.
              </p>
              {allergenMaster.length === 0 ? (
                <p className="text-sm text-red-700">
                  No pudimos cargar el maestro de alérgenos. Los que ya tiene el ingrediente se conservan.
                </p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {allergenMaster.map((allergen) => {
                    const active = optionForm.allergens.includes(allergen.code);
                    return (
                      <button
                        key={allergen.id}
                        type="button"
                        aria-pressed={active}
                        onClick={() =>
                          setOptionForm((c) => ({
                            ...c,
                            allergens: active
                              ? c.allergens.filter((code) => code !== allergen.code)
                              : [...c.allergens, allergen.code],
                          }))
                        }
                        className={cn(
                          'min-h-9 rounded-pill border px-3 text-xs font-semibold transition-colors',
                          'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600',
                          active
                            ? 'border-red-500 bg-red-500 text-white'
                            : 'border-line text-ink-muted hover:border-red-300 hover:text-red-700',
                        )}
                      >
                        {allergen.name}
                      </button>
                    );
                  })}
                </div>
              )}
              {strayAllergens.length > 0 && (
                <p className="mt-2 text-xs font-semibold text-accent-700">
                  Fuera del maestro y sin efecto: {strayAllergens.join(', ')}. Se quitarán al guardar.
                </p>
              )}
            </div>
          )}

          {(canEdit || canEditNutrition) && (
            <div className="grid gap-3 sm:grid-cols-4">
              <Input
                label="Calorias"
                type="number"
                value={optionForm.calories}
                onChange={(e) => setOptionForm((c) => ({ ...c, calories: e.target.value }))}
              />
              <Input
                label="Proteina"
                type="number"
                value={optionForm.protein}
                onChange={(e) => setOptionForm((c) => ({ ...c, protein: e.target.value }))}
              />
              <Input
                label="Carbos"
                type="number"
                value={optionForm.carbs}
                onChange={(e) => setOptionForm((c) => ({ ...c, carbs: e.target.value }))}
              />
              <Input
                label="Grasas"
                type="number"
                value={optionForm.fat}
                onChange={(e) => setOptionForm((c) => ({ ...c, fat: e.target.value }))}
              />
            </div>
          )}

          {canEdit && (
            <>
              <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-line p-3 text-sm">
                <input
                  type="checkbox"
                  checked={optionForm.chargeAlways}
                  onChange={(e) => setOptionForm((c) => ({ ...c, chargeAlways: e.target.checked }))}
                  className="mt-0.5 size-4 accent-brand-600"
                />
                <span>
                  <span className="font-medium text-ink">Es un suplemento</span>
                  <span className="block text-xs text-ink-muted">
                    Se cobra siempre y no consume las unidades incluidas del paso (como el salmon en
                    &quot;1 proteina incluida&quot;).
                  </span>
                </span>
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  id="inv"
                  label="Insumo que descuenta"
                  value={optionForm.inventoryItemId}
                  onChange={(e) =>
                    setOptionForm((c) => ({
                      ...c,
                      inventoryItemId: e.target.value === '' ? '' : Number(e.target.value),
                      // Al desenlazar, la cantidad deja de significar nada.
                      consumptionQuantity: e.target.value === '' ? '0' : c.consumptionQuantity,
                    }))
                  }
                >
                  <SelectOption value="">Ninguno</SelectOption>
                  {config.inventoryItems.map((item) => (
                    <SelectOption key={item.id} value={item.id}>
                      {item.name} ({item.unit})
                    </SelectOption>
                  ))}
                </Select>

                <Input
                  label="Cantidad por unidad"
                  type="number"
                  min="0"
                  step="0.01"
                  disabled={optionForm.inventoryItemId === ''}
                  value={optionForm.consumptionQuantity}
                  error={inventoryQuantityError}
                  onChange={(e) =>
                    setOptionForm((c) => ({ ...c, consumptionQuantity: e.target.value }))
                  }
                  hint={optionForm.inventoryItemId === '' ? 'Enlaza un insumo para usarla' : `En ${selectedInventoryUnit}`}
                />
              </div>
            </>
          )}

          <Button
            className="w-full"
            isLoading={busy === 'save-option'}
            onClick={() => {
              if ((!addingTo && !editingOption) || (canEdit && !optionForm.name)) {
                toast.error('Ponle un nombre a la opcion');
                return;
              }

              // Un insumo enlazado con cantidad 0 no descuenta nada y no agota
              // nunca la opcion: el hueco quedaba invisible hasta el inventario.
              if (canEdit && inventoryQuantityError) {
                toast.error(inventoryQuantityError);
                return;
              }

              void run(
                'save-option',
                async () => {
                  const nutrition = {
                    calories: Number(optionForm.calories),
                    protein: Number(optionForm.protein),
                    carbs: Number(optionForm.carbs),
                    fat: Number(optionForm.fat),
                  };
                  const dietaryTags = optionForm.dietaryTags.split(',').map((value) => value.trim()).filter(Boolean);

                  if (editingOption && !canEdit) {
                    // Solo lo que el rol puede tocar: el servidor rechaza el resto
                    // campo por campo, asi que mandar de mas seria un 403 seguro.
                    await commercialApi.updateOption(editingOption.id, {
                      ...(canEditNutrition ? nutrition : {}),
                      ...(canEditAllergens ? { allergens: allergensForPayload } : {}),
                      ...(canEditTags ? { dietaryTags } : {}),
                    });
                    setEditingOption(null);
                    return;
                  }

                  const payload = {
                    name: optionForm.name,
                    description: optionForm.description || null,
                    imageUrl: optionForm.imageUrl || null,
                    imageAlt: optionForm.imageAlt || null,
                    imagePosition: optionForm.imagePosition,
                    dietaryTags,
                    allergens: allergensForPayload,
                    spiceLevel: Number(optionForm.spiceLevel),
                    priceDelta: Number(optionForm.priceDelta),
                    chargeAlways: optionForm.chargeAlways,
                    ...nutrition,
                    maxPerItem: Number(optionForm.maxPerItem),
                    inventoryItemId:
                      optionForm.inventoryItemId === '' ? null : optionForm.inventoryItemId,
                    consumptionQuantity: Number(optionForm.consumptionQuantity),
                  };

                  if (editingOption) {
                    await commercialApi.updateOption(editingOption.id, payload);
                  } else if (addingTo) {
                    await commercialApi.createOption(addingTo.id, payload);
                  }
                  setAddingTo(null);
                  setEditingOption(null);
                },
                editingOption ? 'Opción actualizada' : 'Opción creada',
              );
            }}
          >
            {editingOption ? 'Guardar cambios' : 'Crear opción'}
          </Button>
          </div>

          <aside className="rounded-2xl border border-line bg-surface-muted/45 p-3">
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-ink-muted">Vista previa</p>
            <div className="aspect-square overflow-hidden rounded-xl bg-white ring-1 ring-line">
              {optionForm.imageUrl ? (
                <img src={optionForm.imageUrl} alt={optionForm.imageAlt || 'Vista previa'} className="size-full object-cover" style={{ objectPosition: optionForm.imagePosition }} />
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-2 text-center text-xs text-ink-muted">
                  <ImageIcon className="size-8 text-brand-300" />
                  Agrega una ruta para ver la imagen
                </div>
              )}
            </div>
            <p className="mt-3 text-sm font-semibold text-ink">{optionForm.name || 'Nombre del ingrediente'}</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">{optionForm.description || 'La descripción ayuda a elegir con confianza.'}</p>
          </aside>
        </div>
      </Modal>

      <Modal isOpen={scheduling !== null} onClose={() => setScheduling(null)} title={`Disponibilidad de ${scheduling?.name ?? ''}`} description="Define stock, precio especial y una ventana opcional por sucursal." maxWidth="md" disableBackdropClose>
        <div className="grid gap-4">
          <Select id="schedule-branch" label="Sucursal" value={scheduleForm.branchId} onChange={(event) => scheduling && scheduleForBranch(scheduling, Number(event.target.value))}>
            {config.branches.map((branch) => <SelectOption key={branch.id} value={branch.id}>{branch.name}</SelectOption>)}
          </Select>
          <label className="flex items-center gap-2 rounded-xl border border-line p-3 text-sm"><input type="checkbox" checked={scheduleForm.isAvailable} onChange={(event) => setScheduleForm((current) => ({ ...current, isAvailable: event.target.checked }))} className="size-4 accent-brand-600" /> Disponible durante esta ventana</label>
          <Input label="Precio especial (opcional)" type="number" min="0" step="0.1" value={scheduleForm.priceOverride} onChange={(event) => setScheduleForm((current) => ({ ...current, priceOverride: event.target.value }))} />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Disponible desde" type="datetime-local" value={scheduleForm.availableFrom} onChange={(event) => setScheduleForm((current) => ({ ...current, availableFrom: event.target.value }))} />
            <Input label="Disponible hasta" type="datetime-local" value={scheduleForm.availableUntil} onChange={(event) => setScheduleForm((current) => ({ ...current, availableUntil: event.target.value }))} />
          </div>
          <Button className="w-full" disabled={!scheduleForm.branchId || !scheduling} isLoading={busy === 'schedule'} onClick={() => {
            if (!scheduling || !scheduleForm.branchId) return;
            void run('schedule', () => commercialApi.setOptionSchedule(scheduling.id, {
              branchId: Number(scheduleForm.branchId), isAvailable: scheduleForm.isAvailable,
              priceOverride: scheduleForm.priceOverride === '' ? null : Number(scheduleForm.priceOverride),
              availableFrom: scheduleForm.availableFrom ? new Date(scheduleForm.availableFrom).toISOString() : null,
              availableUntil: scheduleForm.availableUntil ? new Date(scheduleForm.availableUntil).toISOString() : null,
            }).then(() => setScheduling(null)), 'Disponibilidad programada');
          }}>Guardar programación</Button>
        </div>
      </Modal>

      <Modal isOpen={historyOpen} onClose={() => setHistoryOpen(false)} title="Historial del constructor" description="Registro de cambios con responsable y valores anteriores/posteriores." maxWidth="xl">
        <div className="grid max-h-[65vh] gap-3 overflow-y-auto pr-1">
          {history.length ? history.map((entry) => <article key={entry.id} className="rounded-2xl border border-line p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold text-ink">{entry.action.replace('builder.', '').replaceAll('_', ' ')}</p><p className="text-xs text-ink-muted">{entry.actor ? `${entry.actor.firstName} ${entry.actor.lastName} · ${entry.actor.email}` : 'Sistema'} · <span title={formatDate(entry.createdAt)}>{formatRelative(entry.createdAt)}</span></p></div><span className="rounded-pill bg-surface-muted px-2 py-1 text-[10px] font-bold text-ink-muted">{entry.entity} #{entry.entityId}</span></div>{(entry.before || entry.after) && <div className="mt-3 grid gap-3 md:grid-cols-2"><div className="rounded-xl bg-red-50/60 p-3"><p className="mb-1 text-[10px] font-bold uppercase text-red-700">Antes</p><pre className="overflow-x-auto whitespace-pre-wrap text-[11px] text-ink-muted">{JSON.stringify(entry.before ?? {}, null, 2)}</pre></div><div className="rounded-xl bg-brand-50 p-3"><p className="mb-1 text-[10px] font-bold uppercase text-brand-700">Después</p><pre className="overflow-x-auto whitespace-pre-wrap text-[11px] text-ink-muted">{JSON.stringify(entry.after ?? {}, null, 2)}</pre></div></div>}</article>) : <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-ink-muted">Aún no hay cambios registrados.</p>}
        </div>
      </Modal>

      {/* Incompatibilidades */}
      <Modal
        isOpen={linking !== null}
        onClose={() => setLinking(null)}
        title={`Combinaciones prohibidas con ${linking?.name ?? ''}`}
        description="El motor rechazara cualquier bowl que junte estas dos opciones (RN-006)."
      >
        <div className="grid max-h-80 gap-1 overflow-y-auto">
          {allOptions
            .filter((option) => option.id !== linking?.id)
            .map((option) => {
              const blocked = linking?.incompatibleWith.includes(option.id) ?? false;

              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={busy !== null}
                  onClick={() => {
                    if (!linking) return;

                    void run(
                      `inc-${option.id}`,
                      async () => {
                        if (blocked) {
                          await commercialApi.removeIncompatibility(linking.id, option.id);
                        } else {
                          await commercialApi.addIncompatibility(linking.id, option.id);
                        }
                        setLinking(null);
                      },
                      blocked ? 'Combinacion permitida de nuevo' : 'Combinacion prohibida',
                    );
                  }}
                  className={cn(
                    'flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-surface-muted',
                    blocked && 'bg-red-50 text-red-700',
                  )}
                >
                  <span>{option.name}</span>
                  {blocked && <Ban className="size-4" />}
                </button>
              );
            })}
        </div>
      </Modal>
    </div>
  );
};

export default BuilderAdminPage;
