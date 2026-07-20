import { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Ban, BarChart3, CalendarClock, Copy, ExternalLink, GripVertical, History, ImageIcon, Pencil, Plus, Sliders, Trash2, TrendingUp } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card, CardDescription } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Select, SelectOption } from '@components/ui/Select';
import { Modal } from '@components/ui/Modal';
import { PageLoader } from '@components/common/PageLoader';
import { PageHeader } from '@components/common/PageHeader';
import { getApiErrorMessage } from '@services/api/client';
import { usePermissions } from '@hooks/usePermissions';
import { PERM } from '@constants/permissions';
import { formatCurrency } from '@lib/format';
import { cn } from '@lib/cn';
import { MediaPicker } from '../components/MediaPicker';
import { catalogAdminApi } from '../services/catalogAdmin.service';
import {
  commercialApi,
  type BuilderConfig,
  type BuilderGroup,
  type BuilderOption,
  type BuilderPreset,
  type BuilderAnalytics,
  type BuilderHistoryEntry,
} from '../services/commercialAdmin.service';

const NEW_OPTION = {
  name: '',
  description: '',
  imageUrl: '',
  imageAlt: '',
  imagePosition: '50% 50%',
  dietaryTags: '',
  allergens: '',
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

const NEW_PRESET = { code: '', name: '', description: '', imageUrl: '', badge: '', isFeatured: false, isActive: true, sortOrder: '0', optionIds: [] as number[] };

/**
 * ABM del constructor de bowls.
 *
 * Aqui se cambian las REGLAS que usa el motor de cotizacion: cuantas opciones se
 * eligen en cada paso, cuantas van incluidas, que cuesta cada extra y que
 * combinaciones se prohiben. Nada de esto vive ya en el codigo.
 */
const BuilderAdminPage = () => {
  const { can } = usePermissions();
  const canEdit = can(PERM.CATALOG_CUSTOMIZATION_WRITE);

  const [productId, setProductId] = useState<number | null>(null);
  const [config, setConfig] = useState<BuilderConfig | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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

  const load = useCallback(async (id: number) => {
    try {
      const data = await commercialApi.builder(id);
      setConfig(data);
      void Promise.all([
        commercialApi.builderAnalytics(id).then(setAnalytics),
        commercialApi.builderHistory(id).then(setHistory),
      ]).catch(() => undefined);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  // El constructor pertenece al producto personalizable ("Arma tu bowl").
  useEffect(() => {
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
        toast.error(getApiErrorMessage(error));
        setIsLoading(false);
      });
  }, [load]);

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
    } finally {
      setBusy(null);
    }
  };

  const patchGroup = (groupId: number, patch: Partial<BuilderGroup>) => {
    setConfig((current) =>
      current
        ? {
            ...current,
            groups: current.groups.map((group) =>
              group.id === groupId ? { ...group, ...patch } : group,
            ),
          }
        : current,
    );
  };

  if (isLoading) return <PageLoader />;

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

  const dropEntity = (kind: 'group' | 'option' | 'preset', targetId: number, group?: BuilderGroup) => {
    if (!dragging || dragging.kind !== kind || dragging.id === targetId) return;
    if (kind === 'group') {
      const source = config.groups.find((entry) => entry.id === dragging.id);
      const target = config.groups.find((entry) => entry.id === targetId);
      if (source && target) void run('drag-group', async () => { await Promise.all([commercialApi.updateGroup(source.id, { sortOrder: target.sortOrder }), commercialApi.updateGroup(target.id, { sortOrder: source.sortOrder })]); }, 'Orden de pasos actualizado');
    } else if (kind === 'option' && group) {
      const source = group.options.find((entry) => entry.id === dragging.id);
      const target = group.options.find((entry) => entry.id === targetId);
      if (source && target) void run('drag-option', async () => { await Promise.all([commercialApi.updateOption(source.id, { sortOrder: target.sortOrder }), commercialApi.updateOption(target.id, { sortOrder: source.sortOrder })]); }, 'Orden de ingredientes actualizado');
    } else if (kind === 'preset') {
      const source = config.presets.find((entry) => entry.id === dragging.id);
      const target = config.presets.find((entry) => entry.id === targetId);
      if (source && target) void run('drag-preset', async () => { await Promise.all([commercialApi.updatePreset(source.id, { sortOrder: target.sortOrder }), commercialApi.updatePreset(target.id, { sortOrder: source.sortOrder })]); }, 'Orden de recomendaciones actualizado');
    }
    setDragging(null);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Configuración"
        title="Constructor de bowls"
        description="Gestiona las reglas del motor de precios. Los cambios se aplican a bowls nuevos, nunca a pedidos ya realizados."
        icon={Sliders}
      />

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-white p-3 shadow-sm">
        <div>
          <p className="text-sm font-bold text-ink">Vista del cliente</p>
          <p className="text-xs text-ink-muted">Revisa el constructor publicado en otra pestaña.</p>
        </div>
        <div className="flex gap-2"><Button variant="outline" onClick={() => setHistoryOpen(true)}><History className="size-4" /> Historial ({history.length})</Button><Button variant="outline" onClick={() => window.open('/arma-tu-bowl', '_blank', 'noopener,noreferrer')}><ExternalLink className="size-4" /> Abrir vista previa</Button></div>
      </div>

      {analytics && (
        <Card className="mb-5 overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="flex items-center gap-2 font-bold text-ink"><BarChart3 className="size-4 text-brand-600" /> Rendimiento del constructor</p><p className="text-xs text-ink-muted">Embudo de los últimos {analytics.range.days} días.</p></div><span className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700"><TrendingUp className="size-3.5" /> {analytics.funnel.conversionRate}% conversión</span></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[['Visitas', analytics.funnel.viewed], ['Iniciaron', analytics.funnel.started], ['Completaron', analytics.funnel.completed], ['Al carrito', analytics.funnel.addedToCart]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-surface-muted p-3"><p className="text-xs text-ink-muted">{label}</p><p className="mt-1 text-2xl font-black text-ink">{value}</p></div>)}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-3"><div><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Más seleccionados</p>{analytics.topSelectedOptions.slice(0, 5).map((item) => <div key={item.id} className="mt-2 flex justify-between text-sm"><span>{item.name}</span><b>{item.count}</b></div>)}</div><div><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Presets utilizados</p>{analytics.presetUsage.slice(0, 5).map((item) => <div key={item.id} className="mt-2 flex justify-between text-sm"><span>{item.name}</span><b>{item.count}</b></div>)}</div><div><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Señales de calidad</p><div className="mt-2 space-y-2 text-sm"><p className="flex justify-between"><span>Abandono</span><b>{analytics.funnel.abandonmentRate}%</b></p><p className="flex justify-between"><span>Conflictos resueltos</span><b>{analytics.interactions.conflictsResolved}</b></p><p className="flex justify-between"><span>Errores de cotización</span><b>{analytics.interactions.quoteErrors}</b></p></div></div></div>
        </Card>
      )}

      <Card className="mb-5">
        <div className="flex items-start justify-between gap-3"><div><p className="flex items-center gap-2 font-bold text-ink"><CalendarClock className="size-4 text-brand-600" /> Calendario de disponibilidad</p><p className="text-xs text-ink-muted">{scheduledRows.length ? `${scheduledRows.length} reglas especiales activas o programadas.` : 'No hay ventanas especiales; aplica la disponibilidad global.'}</p></div></div>
        {scheduledRows.length > 0 && <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{scheduledRows.map((row) => <button key={`${row.option.id}-${row.branchId}`} type="button" onClick={() => { setScheduling(row.option); scheduleForBranch(row.option, row.branchId); }} className="rounded-xl border border-line p-3 text-left transition hover:border-brand-300"><div className="flex justify-between gap-2"><span className="font-bold text-ink">{row.option.name}</span><span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', row.isAvailable ? 'bg-brand-50 text-brand-700' : 'bg-red-50 text-red-700')}>{row.isAvailable ? 'Disponible' : 'Bloqueado'}</span></div><p className="mt-1 text-xs text-ink-muted">{config.branches.find((branch) => branch.id === row.branchId)?.name ?? `Sucursal #${row.branchId}`}</p><p className="mt-2 text-xs text-ink-muted">{row.availableFrom ? new Date(row.availableFrom).toLocaleString('es-PE') : 'Desde ahora'} → {row.availableUntil ? new Date(row.availableUntil).toLocaleString('es-PE') : 'Sin vencimiento'}{row.priceOverride !== null ? ` · ${formatCurrency(row.priceOverride)}` : ''}</p></button>)}</div>}
      </Card>

      <Card className="mb-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="font-bold text-ink">Combinaciones recomendadas</p><p className="text-xs text-ink-muted">Atajos que aparecen al inicio del constructor.</p></div>
          {canEdit && <Button size="sm" onClick={() => { setEditingPreset(null); setPresetForm({ ...NEW_PRESET, sortOrder: String(config.presets.length) }); setPresetOpen(true); }}><Plus className="size-4" /> Nueva recomendación</Button>}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {config.presets.map((preset) => (
            <div key={preset.id} draggable={canEdit} onDragStart={() => setDragging({ kind: 'preset', id: preset.id })} onDragOver={(event) => event.preventDefault()} onDrop={() => dropEntity('preset', preset.id)} className={cn('overflow-hidden rounded-2xl border bg-white', preset.isActive ? 'border-line' : 'border-dashed border-line opacity-60', canEdit && 'cursor-grab active:cursor-grabbing')}>
              {preset.imageUrl && <img src={preset.imageUrl} alt="" className="h-24 w-full object-cover" />}
              <div className="p-3">
                <div className="flex items-start justify-between gap-2"><div><p className="font-bold text-ink">{preset.name}</p><p className="text-xs text-ink-muted">{preset.selections.length} ingredientes</p></div>{preset.badge && <span className="rounded-full bg-accent-100 px-2 py-0.5 text-[10px] font-bold text-accent-700">{preset.badge}</span>}</div>
                {canEdit && <div className="mt-3 flex gap-1">
                  <Button size="sm" variant="ghost" onClick={() => { setEditingPreset(preset); setPresetForm({ code: preset.code, name: preset.name, description: preset.description ?? '', imageUrl: preset.imageUrl ?? '', badge: preset.badge ?? '', isFeatured: preset.isFeatured, isActive: preset.isActive, sortOrder: String(preset.sortOrder), optionIds: preset.selections.map((item) => item.optionId) }); setPresetOpen(true); }}><Pencil className="size-4" /></Button>
                  <Button size="sm" variant="ghost" onClick={() => void run(`preset-toggle-${preset.id}`, () => commercialApi.updatePreset(preset.id, { isActive: !preset.isActive }), preset.isActive ? 'Recomendación ocultada' : 'Recomendación publicada')}>{preset.isActive ? 'Ocultar' : 'Publicar'}</Button>
                  <Button size="sm" variant="ghost" onClick={() => void run(`preset-del-${preset.id}`, () => commercialApi.deletePreset(preset.id), 'Recomendación eliminada')}><Trash2 className="size-4" /></Button>
                </div>}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {selectedOptions.length > 0 && (
        <div className="sticky top-20 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 p-3 shadow-lg">
          <span className="mr-auto text-sm font-bold text-brand-800">{selectedOptions.length} seleccionadas</span>
          {(['ACTIVE', 'OUT_OF_STOCK', 'INACTIVE'] as const).map((status) => (
            <Button key={status} size="sm" variant="outline" onClick={() => void run(`bulk-${status}`, () => commercialApi.bulkUpdateOptions(selectedOptions, status), 'Estados actualizados')}>{status === 'ACTIVE' ? 'Activar' : status === 'OUT_OF_STOCK' ? 'Agotar' : 'Ocultar'}</Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setSelectedOptions([])}>Cancelar</Button>
        </div>
      )}

      <div className="space-y-5">
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
                  <Button size="sm" variant="ghost" disabled={index === 0} aria-label="Subir paso" onClick={() => {
                    const previous = config.groups[index - 1];
                    void run(`up-${group.id}`, async () => { await Promise.all([commercialApi.updateGroup(group.id, { sortOrder: previous.sortOrder }), commercialApi.updateGroup(previous.id, { sortOrder: group.sortOrder })]); }, 'Orden actualizado');
                  }}><ArrowUp className="size-4" /></Button>
                  <Button size="sm" variant="ghost" disabled={index === config.groups.length - 1} aria-label="Bajar paso" onClick={() => {
                    const next = config.groups[index + 1];
                    void run(`down-${group.id}`, async () => { await Promise.all([commercialApi.updateGroup(group.id, { sortOrder: next.sortOrder }), commercialApi.updateGroup(next.id, { sortOrder: group.sortOrder })]); }, 'Orden actualizado');
                  }}><ArrowDown className="size-4" /></Button>
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
              <div className="mt-4 grid gap-3 rounded-xl border border-line bg-surface-muted p-3 sm:grid-cols-4">
                <Input
                  label="Minimo"
                  type="number"
                  min="0"
                  value={group.minSelection}
                  onChange={(e) => patchGroup(group.id, { minSelection: Number(e.target.value) })}
                />
                <Input
                  label="Maximo"
                  type="number"
                  min="1"
                  value={group.maxSelection}
                  onChange={(e) => patchGroup(group.id, { maxSelection: Number(e.target.value) })}
                />
                <Input
                  label="Incluidas"
                  type="number"
                  min="0"
                  value={group.freeQuantity}
                  onChange={(e) => patchGroup(group.id, { freeQuantity: Number(e.target.value) })}
                  hint="Sin costo"
                />
                <div className="flex items-end">
                  <Button
                    size="sm"
                    className="w-full"
                    isLoading={busy === `group-${group.id}`}
                    onClick={() =>
                      run(
                        `group-${group.id}`,
                        () =>
                          commercialApi.updateGroup(group.id, {
                            minSelection: group.minSelection,
                            maxSelection: group.maxSelection,
                            freeQuantity: group.freeQuantity,
                          }),
                        'Reglas actualizadas',
                      )
                    }
                  >
                    Guardar reglas
                  </Button>
                </div>
              </div>
            )}

            {/* Opciones */}
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[680px] text-sm">
                <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                  <tr>
                    <th className="w-8 pb-2"><span className="sr-only">Seleccionar</span></th>
                    <th className="pb-2">Opcion</th>
                    <th className="pb-2 text-right">Precio</th>
                    <th className="pb-2 text-center">Suplemento</th>
                    <th className="pb-2 text-right">Kcal</th>
                    <th className="pb-2">Estado</th>
                    <th className="pb-2">No combina con</th>
                    <th className="pb-2"></th>
                  </tr>
                </thead>

                <tbody>
                  {group.options.map((option, optionIndex) => (
                    <tr key={option.id} draggable={canEdit} onDragStart={(event) => { event.stopPropagation(); setDragging({ kind: 'option', id: option.id }); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.stopPropagation(); dropEntity('option', option.id, group); }} className="border-b border-line last:border-0">
                      <td className="py-2"><input type="checkbox" checked={selectedOptions.includes(option.id)} onChange={(event) => setSelectedOptions((current) => event.target.checked ? [...current, option.id] : current.filter((id) => id !== option.id))} className="size-4 accent-brand-600" aria-label={`Seleccionar ${option.name}`} /></td>
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
                            className="rounded-full bg-accent-400/15 px-2 py-0.5 text-xs font-medium text-accent-500"
                          >
                            siempre
                          </span>
                        ) : (
                          <span className="text-xs text-ink-muted">-</span>
                        )}
                      </td>
                      <td className="py-2 text-right text-ink-muted">{option.calories}</td>
                      <td className="py-2">
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-xs',
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
                        {canEdit && (
                          <div className="flex justify-end gap-1">
                            <Button size="sm" variant="ghost" disabled={optionIndex === 0} aria-label="Subir opción" onClick={() => {
                              const previous = group.options[optionIndex - 1];
                              void run(`option-up-${option.id}`, async () => { await Promise.all([commercialApi.updateOption(option.id, { sortOrder: previous.sortOrder }), commercialApi.updateOption(previous.id, { sortOrder: option.sortOrder })]); }, 'Orden actualizado');
                            }}><ArrowUp className="size-4" /></Button>
                            <Button size="sm" variant="ghost" disabled={optionIndex === group.options.length - 1} aria-label="Bajar opción" onClick={() => {
                              const next = group.options[optionIndex + 1];
                              void run(`option-down-${option.id}`, async () => { await Promise.all([commercialApi.updateOption(option.id, { sortOrder: next.sortOrder }), commercialApi.updateOption(next.id, { sortOrder: option.sortOrder })]); }, 'Orden actualizado');
                            }}><ArrowDown className="size-4" /></Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setOptionForm({
                                  name: option.name,
                                  description: option.description ?? '',
                                  imageUrl: option.imageUrl ?? '',
                                  imageAlt: option.imageAlt ?? '',
                                  imagePosition: option.imagePosition,
                                  dietaryTags: option.dietaryTags.join(', '),
                                  allergens: option.allergens.join(', '),
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
                              }}
                              aria-label={`Editar ${option.name}`}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
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
                              onClick={() =>
                                run(
                                  `del-${option.id}`,
                                  () => commercialApi.deleteOption(option.id),
                                  'Opcion eliminada',
                                )
                              }
                              aria-label="Eliminar opcion"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>

      <Modal isOpen={presetOpen} onClose={() => setPresetOpen(false)} title={editingPreset ? 'Editar recomendación' : 'Nueva recomendación'} description="Elige una combinación válida que sirva como punto de partida." maxWidth="lg">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Nombre" value={presetForm.name} onChange={(event) => setPresetForm((current) => ({ ...current, name: event.target.value }))} placeholder="Favorito de la casa" />
            <Input label="Código interno" value={presetForm.code} disabled={editingPreset !== null} onChange={(event) => setPresetForm((current) => ({ ...current, code: event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }))} placeholder="favorito_casa" />
          </div>
          <Input label="Descripción" value={presetForm.description} onChange={(event) => setPresetForm((current) => ({ ...current, description: event.target.value }))} />
          <div className="grid gap-3 sm:grid-cols-2"><Input label="Insignia" value={presetForm.badge} onChange={(event) => setPresetForm((current) => ({ ...current, badge: event.target.value }))} placeholder="Más pedido" /><Input label="Orden" type="number" min="0" value={presetForm.sortOrder} onChange={(event) => setPresetForm((current) => ({ ...current, sortOrder: event.target.value }))} /></div>
          <MediaPicker value={presetForm.imageUrl} altText={presetForm.name} category="builder-presets" label="Imagen de la recomendación" onChange={(image) => setPresetForm((current) => ({ ...current, imageUrl: image.url }))} />
          <div>
            <p className="mb-2 text-sm font-medium text-ink">Ingredientes</p>
            <div className="max-h-72 space-y-3 overflow-y-auto rounded-xl border border-line p-3">
              {config.groups.map((group) => <div key={group.id}><p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-muted">{group.name}</p><div className="grid gap-1 sm:grid-cols-2">{group.options.filter((option) => option.status !== 'INACTIVE').map((option) => <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-muted"><input type="checkbox" checked={presetForm.optionIds.includes(option.id)} onChange={(event) => setPresetForm((current) => ({ ...current, optionIds: event.target.checked ? [...current.optionIds, option.id] : current.optionIds.filter((id) => id !== option.id) }))} className="size-4 accent-brand-600" />{option.name}</label>)}</div></div>)}
            </div>
          </div>
          <div className="flex gap-4"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={presetForm.isFeatured} onChange={(event) => setPresetForm((current) => ({ ...current, isFeatured: event.target.checked }))} className="size-4 accent-brand-600" /> Destacada</label><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={presetForm.isActive} onChange={(event) => setPresetForm((current) => ({ ...current, isActive: event.target.checked }))} className="size-4 accent-brand-600" /> Publicada</label></div>
          <Button className="w-full" isLoading={busy === 'save-preset'} disabled={!presetForm.name || !presetForm.code || presetForm.optionIds.length === 0} onClick={() => void run('save-preset', async () => {
            const input = { name: presetForm.name, description: presetForm.description || null, imageUrl: presetForm.imageUrl || null, badge: presetForm.badge || null, isFeatured: presetForm.isFeatured, isActive: presetForm.isActive, sortOrder: Number(presetForm.sortOrder), selections: presetForm.optionIds.map((optionId) => ({ optionId, quantity: 1 })) };
            if (editingPreset) await commercialApi.updatePreset(editingPreset.id, input);
            else await commercialApi.createPreset(config.product.id, { ...input, code: presetForm.code });
            setPresetOpen(false);
          }, editingPreset ? 'Recomendación actualizada' : 'Recomendación creada')}>Guardar recomendación</Button>
        </div>
      </Modal>

      {/* Nueva opcion */}
      <Modal
        isOpen={addingTo !== null || editingOption !== null}
        onClose={() => {
          setAddingTo(null);
          setEditingOption(null);
        }}
        title={editingOption ? `Editar ${editingOption.name}` : `Nueva opción en ${addingTo?.name ?? ''}`}
        description="Si marcas 'suplemento', se cobra siempre aunque el paso incluya opciones gratis."
        maxWidth="md"
      >
        <div className="grid gap-5 md:grid-cols-[1fr_210px]">
          <div className="space-y-3">
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
            <Input label="Etiquetas dietarias" value={optionForm.dietaryTags} onChange={(e) => setOptionForm((c) => ({ ...c, dietaryTags: e.target.value }))} placeholder="vegano, sin gluten" />
            <Input label="Alérgenos" value={optionForm.allergens} onChange={(e) => setOptionForm((c) => ({ ...c, allergens: e.target.value }))} placeholder="soya, sésamo" />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Select id="spice" label="Nivel de picante" value={optionForm.spiceLevel} onChange={(e) => setOptionForm((c) => ({ ...c, spiceLevel: e.target.value }))}>
              <SelectOption value="0">Sin picante</SelectOption><SelectOption value="1">Suave</SelectOption><SelectOption value="2">Medio</SelectOption><SelectOption value="3">Intenso</SelectOption>
            </Select>
            <Input label="Máximo de porciones" type="number" min="1" max="10" value={optionForm.maxPerItem} onChange={(e) => setOptionForm((c) => ({ ...c, maxPerItem: e.target.value }))} hint="Habilita controles +/− en el builder." />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Precio extra"
              type="number"
              step="0.10"
              value={optionForm.priceDelta}
              onChange={(e) => setOptionForm((c) => ({ ...c, priceDelta: e.target.value }))}
            />
            <Input
              label="Calorias"
              type="number"
              value={optionForm.calories}
              onChange={(e) => setOptionForm((c) => ({ ...c, calories: e.target.value }))}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
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
              value={optionForm.consumptionQuantity}
              onChange={(e) =>
                setOptionForm((c) => ({ ...c, consumptionQuantity: e.target.value }))
              }
              hint="En la unidad del insumo"
            />
          </div>

          <Button
            className="w-full"
            isLoading={busy === 'save-option'}
            onClick={() => {
              if ((!addingTo && !editingOption) || !optionForm.name) {
                toast.error('Ponle un nombre a la opcion');
                return;
              }

              void run(
                'save-option',
                async () => {
                  const payload = {
                    name: optionForm.name,
                    description: optionForm.description || null,
                    imageUrl: optionForm.imageUrl || null,
                    imageAlt: optionForm.imageAlt || null,
                    imagePosition: optionForm.imagePosition,
                    dietaryTags: optionForm.dietaryTags.split(',').map((value) => value.trim()).filter(Boolean),
                    allergens: optionForm.allergens.split(',').map((value) => value.trim()).filter(Boolean),
                    spiceLevel: Number(optionForm.spiceLevel),
                    priceDelta: Number(optionForm.priceDelta),
                    chargeAlways: optionForm.chargeAlways,
                    calories: Number(optionForm.calories),
                    protein: Number(optionForm.protein),
                    carbs: Number(optionForm.carbs),
                    fat: Number(optionForm.fat),
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

      <Modal isOpen={scheduling !== null} onClose={() => setScheduling(null)} title={`Disponibilidad de ${scheduling?.name ?? ''}`} description="Define stock, precio especial y una ventana opcional por sucursal." maxWidth="md">
        <div className="space-y-4">
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
        <div className="max-h-[65vh] space-y-3 overflow-y-auto pr-1">
          {history.length ? history.map((entry) => <article key={entry.id} className="rounded-2xl border border-line p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold text-ink">{entry.action.replace('builder.', '').replaceAll('_', ' ')}</p><p className="text-xs text-ink-muted">{entry.actor ? `${entry.actor.firstName} ${entry.actor.lastName} · ${entry.actor.email}` : 'Sistema'} · {new Date(entry.createdAt).toLocaleString('es-PE')}</p></div><span className="rounded-full bg-surface-muted px-2 py-1 text-[10px] font-bold text-ink-muted">{entry.entity} #{entry.entityId}</span></div>{(entry.before || entry.after) && <div className="mt-3 grid gap-3 md:grid-cols-2"><div className="rounded-xl bg-red-50/60 p-3"><p className="mb-1 text-[10px] font-bold uppercase text-red-700">Antes</p><pre className="overflow-x-auto whitespace-pre-wrap text-[11px] text-ink-muted">{JSON.stringify(entry.before ?? {}, null, 2)}</pre></div><div className="rounded-xl bg-brand-50 p-3"><p className="mb-1 text-[10px] font-bold uppercase text-brand-700">Después</p><pre className="overflow-x-auto whitespace-pre-wrap text-[11px] text-ink-muted">{JSON.stringify(entry.after ?? {}, null, 2)}</pre></div></div>}</article>) : <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-ink-muted">Aún no hay cambios registrados.</p>}
        </div>
      </Modal>

      {/* Incompatibilidades */}
      <Modal
        isOpen={linking !== null}
        onClose={() => setLinking(null)}
        title={`Combinaciones prohibidas con ${linking?.name ?? ''}`}
        description="El motor rechazara cualquier bowl que junte estas dos opciones (RN-006)."
      >
        <div className="max-h-80 space-y-1 overflow-y-auto">
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
