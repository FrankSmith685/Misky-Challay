import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import Menu from '@mui/material/Menu';
import MenuItem from '@mui/material/MenuItem';
import { ArrowDown, ArrowUp, Ban, BarChart3, CalendarClock, ChevronDown, Copy, ExternalLink, GripVertical, History, ImageIcon, MoreHorizontal, Pencil, Plus, Search, Sliders, Trash2, TrendingUp } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Card, CardDescription } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Select, SelectOption } from '@components/ui/Select';
import { Modal } from '@components/ui/Modal';
import { Pagination } from '@components/ui/Pagination';
import { useConfirm } from '@components/ui/ConfirmDialog';
import { LoadError } from '@components/common/LoadError';
import { PageLoader } from '@components/common/PageLoader';
import { PageHeader } from '@components/common/PageHeader';
import { ROUTES } from '@constants/routes';
import { api, getApiErrorMessage } from '@services/api/client';
import { usePermissions } from '@hooks/usePermissions';
import { PERM } from '@constants/permissions';
import { formatCurrency, formatDate, formatRelative } from '@lib/format';
import { cn } from '@lib/cn';
import { MediaPicker } from '../components/MediaPicker';
import { catalogAdminApi, type AdminProduct, type CatalogMeta } from '../services/catalogAdmin.service';
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
  cakeScaleWithServings: true,
  inventoryItemId: '' as number | '',
  consumptionQuantity: '0',
  maxPerItem: '1',
};

/* Sin campo de orden: el orden se cambia arrastrando y lo renumera el servidor.
 * Un numero tecleado a mano es justo lo que volvia a crear los empates. */
const NEW_PRESET = { code: '', name: '', description: '', imageUrl: '', badge: '', isFeatured: false, isActive: true, optionIds: [] as number[] };
type Section = 'groups' | 'presets' | 'calendar' | 'analytics';
const SECTIONS: Array<{ id: Section; label: string; icon: typeof Sliders }> = [
  { id: 'groups', label: 'Grupos y opciones', icon: Sliders },
  { id: 'presets', label: 'Recomendaciones', icon: TrendingUp },
  { id: 'calendar', label: 'Disponibilidad', icon: CalendarClock },
  { id: 'analytics', label: 'Rendimiento', icon: BarChart3 },
];
const OPTION_PAGE_SIZE = 6;
const CARD_PAGE_SIZE = 8;
const optionStatusLabel = (status: BuilderOption['status']) => status === 'ACTIVE' ? 'Activa' : status === 'OUT_OF_STOCK' ? 'Agotada' : 'Oculta';

/** Datos de un paso mientras se teclean, antes de guardarlos. */
interface GroupRules {
  name: string;
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
  const canEditAllergens = can(PERM.ALLERGEN_WRITE);
  const canEditTags = can(PERM.DIETARY_TAG_WRITE);
  const canEditFood = canEditAllergens || canEditTags;
  const canOpenOption = canEdit || canEditFood;
  const [searchParams, setSearchParams] = useSearchParams();

  const [productId, setProductId] = useState<number | null>(null);
  const [products, setProducts] = useState<AdminProduct[]>([]);
  const [config, setConfig] = useState<BuilderConfig | null>(null);
  const [allergenMaster, setAllergenMaster] = useState<CatalogMeta['allergens']>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const [addingTo, setAddingTo] = useState<BuilderGroup | null>(null);
  const [editingOption, setEditingOption] = useState<BuilderOption | null>(null);
  const [optionActions, setOptionActions] = useState<{ option: BuilderOption; anchor: HTMLElement } | null>(null);
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
  const [groupOpen, setGroupOpen] = useState(false);
  const [groupForm, setGroupForm] = useState({ name: '', description: '', selectionType: 'SINGLE' as 'SINGLE' | 'MULTIPLE', minSelection: 1, maxSelection: 1, freeQuantity: 0 });
  const [section, setSection] = useState<Section>('groups');
  const [activeVariantId, setActiveVariantId] = useState<number | 'shared' | null>(null);
  const [groupQuery, setGroupQuery] = useState('');
  const [activeGroupId, setActiveGroupId] = useState<number | null>(null);
  const [optionPages, setOptionPages] = useState<Record<number, number>>({});
  const [presetPage, setPresetPage] = useState(1);
  const [schedulePage, setSchedulePage] = useState(1);

  useEffect(() => {
    setSelectedOptions([]);
    setRuleDrafts({});
    setOptionActions(null);
    setAnalytics(null);
    setHistory([]);
    setOptionPages({});
    setActiveGroupId(null);
    setActiveVariantId(null);
    setPresetPage(1);
    setSchedulePage(1);
    setGroupQuery('');
  }, [productId]);

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

  // El constructor pertenece al producto elegido, incluidos los borradores de torta.
  const loadProduct = useCallback(() => {
    setIsLoading(true);
    setLoadError(null);
    catalogAdminApi
      .products()
      .then((products) => {
        const customizable = products.filter((product) => product.type === 'CUSTOMIZABLE');
        setProducts(customizable);
        const requested = Number(searchParams.get('productId'));
        const target = customizable.find((product) => product.id === requested) ?? customizable[0];
        if (!target) {
          setProductId(null);
          setConfig(null);
          setIsLoading(false);
          return;
        }
        setProductId(target.id);
        void load(target.id);
      })
      .catch((error) => {
        setLoadError(getApiErrorMessage(error));
        setIsLoading(false);
      });
  }, [load, searchParams]);

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

  const refresh = () => productId ? load(productId) : Promise.resolve();

  const run = async (key: string, action: () => Promise<void>, message: string) => {
    setBusy(key);
    try {
      await action();
      toast.success(message);
      await refresh();
      return true;
    } catch (error) {
      toast.error(getApiErrorMessage(error));
      // Tambien se recarga al fallar: si el rechazo viene de que otro
      // administrador cambio la lista (el orden se rechaza cuando no coincide con
      // la de ahora), reintentar sobre datos viejos volveria a fallar siempre.
      void refresh();
      return false;
    } finally {
      setBusy(null);
    }
  };
  const createGroup = async () => {
    if (!productId) return;
    const name = groupForm.name.trim();
    if (name.length < 2 || name.length > 80 || groupForm.description.length > 255
      || !Number.isInteger(groupForm.minSelection) || groupForm.minSelection < 0
      || !Number.isInteger(groupForm.maxSelection) || groupForm.maxSelection < Math.max(1, groupForm.minSelection) || groupForm.maxSelection > 20
      || !Number.isInteger(groupForm.freeQuantity) || groupForm.freeQuantity < 0 || groupForm.freeQuantity > groupForm.maxSelection
      || (groupForm.selectionType === 'SINGLE' && groupForm.maxSelection !== 1)) {
      toast.error('Revisa nombre, selección mínima y máxima, y cantidad incluida.');
      return;
    }
    let createdGroupId: number | null = null;
    const created = await run('create-group', async () => {
      const group = await commercialApi.createGroup(productId, {
        code: `p_${productId}_${Date.now().toString(36)}`,
        name, description: groupForm.description.trim(), variantId: selectedVariantId === 'shared' ? null : selectedVariantId,
        selectionType: groupForm.selectionType,
        minSelection: groupForm.minSelection, maxSelection: groupForm.maxSelection,
        freeQuantity: groupForm.freeQuantity, sortOrder: Math.max(0, ...scopeGroups.map((group) => group.sortOrder + 1)),
      });
      createdGroupId = group.id;
      setGroupQuery('');
      setGroupOpen(false);
      setGroupForm({ name: '', description: '', selectionType: 'SINGLE', minSelection: 1, maxSelection: 1, freeQuantity: 0 });
    }, 'Grupo creado. Ahora agrega sus opciones.');
    if (created && createdGroupId) {
      setActiveGroupId(createdGroupId);
      document.getElementById('builder-groups')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const inventoryById = useMemo(
    () => new Map((config?.inventoryItems ?? []).map((item) => [item.id, item])),
    [config],
  );

  /** Reglas efectivas de un paso: lo tecleado si lo hay, si no lo del servidor. */
  const rulesOf = (group: BuilderGroup): GroupRules =>
    ruleDrafts[group.id] ?? {
      name: group.name,
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
      draft.name !== group.name
      || draft.minSelection !== group.minSelection
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
      <div className="space-y-5"><PageHeader eyebrow="Configuración" title="Constructor de opciones" description="Configura las elecciones disponibles para cada producto personalizable." icon={Sliders} /><Card className="mx-auto max-w-3xl border-dashed p-8 text-center">
        <h2 className="text-lg font-bold">Aún no hay productos personalizables</h2>
        <CardDescription className="mt-2">
          Crea una torta personalizable desde Producción de tortas o un producto personalizable desde Catálogo. Luego vuelve para configurar sus grupos y opciones.
        </CardDescription>
        <div className="mt-4 flex flex-wrap justify-center gap-2"><Button component={Link} to={ROUTES.adminCakes}>Crear torta</Button><Button component={Link} to={ROUTES.adminCatalog} variant="outline">Abrir Catálogo</Button></div>
      </Card></div>
    );
  }

  const selectedProduct = products.find((product) => product.id === config.product.id);
  const isPastry = Boolean(selectedProduct?.cakeProfile);
  const isCake = isPastry && (!selectedProduct?.family || selectedProduct.family === 'CAKE');
  const defaultVariantId = config.variants.find((variant) => variant.isDefault && config.groups.some((group) => group.variantId === variant.id))?.id
    ?? config.variants.find((variant) => config.groups.some((group) => group.variantId === variant.id))?.id
    ?? (config.groups.some((group) => group.variantId === null) ? 'shared' : config.variants[0]?.id);
  const selectedVariantId = activeVariantId === 'shared' || config.variants.some((variant) => variant.id === activeVariantId)
    ? activeVariantId
    : defaultVariantId ?? 'shared';
  const selectedVariant = config.variants.find((variant) => variant.id === selectedVariantId);
  const scopeGroups = config.groups.filter((group) => group.variantId === (selectedVariantId === 'shared' ? null : selectedVariantId));
  const sharedGroups = config.groups.filter((group) => group.variantId === null);
  const scopeOptionCount = scopeGroups.reduce((count, group) => count + group.options.length, 0);
  const variantLabel = (variantId: number | null) => variantId === null
    ? 'Todos los tamaños'
    : config.variants.find((variant) => variant.id === variantId)?.name ?? `Presentación #${variantId}`;
  const allOptions = config.groups.flatMap((group) => group.options);
  const scheduledRows = config.groups.flatMap((group) => group.options.flatMap((option) =>
    option.branchAvailability.filter((row) => row.availableFrom || row.availableUntil || row.priceOverride !== null || !row.isAvailable).map((row) => ({ ...row, option, group })),
  ));
  const filteredGroups = scopeGroups.filter((group) => {
    const term = groupQuery.trim().toLocaleLowerCase('es');
    return !term || group.name.toLocaleLowerCase('es').includes(term)
      || group.options.some((option) => option.name.toLocaleLowerCase('es').includes(term));
  });
  const activeGroup = filteredGroups.find((group) => group.id === activeGroupId) ?? filteredGroups[0] ?? null;
  const visibleGroups = activeGroup ? [activeGroup] : [];
  const presetTotalPages = Math.max(1, Math.ceil(config.presets.length / CARD_PAGE_SIZE));
  const currentPresetPage = Math.min(presetPage, presetTotalPages);
  const visiblePresets = config.presets.slice((currentPresetPage - 1) * CARD_PAGE_SIZE, currentPresetPage * CARD_PAGE_SIZE);
  const scheduleTotalPages = Math.max(1, Math.ceil(scheduledRows.length / CARD_PAGE_SIZE));
  const currentSchedulePage = Math.min(schedulePage, scheduleTotalPages);
  const visibleSchedules = scheduledRows.slice((currentSchedulePage - 1) * CARD_PAGE_SIZE, currentSchedulePage * CARD_PAGE_SIZE);
  const listedOptionsFor = (group: BuilderGroup) => {
    const term = groupQuery.trim().toLocaleLowerCase('es');
    const options = group.options.map((option, index) => ({ option, index }));
    return !term || group.name.toLocaleLowerCase('es').includes(term)
      ? options
      : options.filter(({ option }) => option.name.toLocaleLowerCase('es').includes(term));
  };
  const optionPageFor = (group: BuilderGroup) => Math.min(optionPages[group.id] ?? 1, Math.max(1, Math.ceil(listedOptionsFor(group).length / OPTION_PAGE_SIZE)));
  const visibleOptionsFor = (group: BuilderGroup) => listedOptionsFor(group)
    .slice((optionPageFor(group) - 1) * OPTION_PAGE_SIZE, optionPageFor(group) * OPTION_PAGE_SIZE);

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
    if (groupQuery.trim()) return;
    const ordered = moveInList(scopeGroups, from, to);
    if (ordered === scopeGroups) return;
    let position = 0;
    const ids = config.groups.map((group) => group.variantId === (selectedVariantId === 'shared' ? null : selectedVariantId)
      ? ordered[position++].id
      : group.id);
    void run(
      'order-groups',
      () => builderOrderApi.groups(config.product.id, ids),
      'Orden de pasos actualizado',
    );
  };

  const moveOption = (group: BuilderGroup, from: number, to: number) => {
    const ordered = moveInList(group.options, from, to);
    if (ordered === group.options) return;
    void run(
      `order-options-${group.id}`,
      () => builderOrderApi.options(group.id, ordered.map((entry) => entry.id)),
      'Orden de opciones actualizado',
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
      cakeScaleWithServings: option.cakeScaleWithServings,
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

    const list = kind === 'group' ? scopeGroups : kind === 'preset' ? config.presets : group?.options;
    if (!list) return;

    const from = list.findIndex((entry) => entry.id === draggedId);
    const to = list.findIndex((entry) => entry.id === targetId);
    if (from < 0 || to < 0) return;

    if (kind === 'group') moveGroup(from, to);
    else if (kind === 'preset') movePreset(from, to);
    else if (group) moveOption(group, from, to);
  };

  return (
    <div className="min-w-0 space-y-5">
      <PageHeader
        eyebrow="Configuración"
        title="Constructor de opciones"
        description="Configura los grupos que podrá elegir el cliente en cada producto personalizable. Los cambios afectan pedidos nuevos."
        icon={Sliders}
      />

      <Card className="border-brand-200 bg-gradient-to-br from-brand-50/80 via-white to-white p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[.14em] text-brand-700">Producto en edición</p>
            <div className="mt-3 w-full sm:w-80">
              <Select
                label="Producto a configurar"
                value={productId ?? ''}
                onChange={(event) => { setIsLoading(true); setConfig(null); setSearchParams({ productId: String(event.target.value) }); }}
              >
                {products.map((product) => <SelectOption key={product.id} value={product.id}>{product.name}{product.family ? ` · ${{ CAKE: 'Torta', DESSERT: 'Postre', NOUGAT: 'Turrón', BITES: 'Bocaditos' }[product.family]}` : ''}</SelectOption>)}
              </Select>
            </div>
            <p className="mt-2 max-w-2xl text-xs leading-5 text-ink-muted">Los cambios se aplican a los pedidos nuevos de este producto. Los pedidos anteriores conservan sus elecciones.</p>
          </div>
          <div className="flex flex-wrap gap-2">{canEdit && <Button size="sm" variant="outline" leftIcon={<History className="size-4" />} onClick={() => setHistoryOpen(true)}>Historial ({history.length})</Button>}{isPastry ? <Button size="sm" variant="outline" component={Link} to={ROUTES.adminCatalog}>Abrir Catálogo</Button> : <Button size="sm" variant="outline" onClick={() => window.open('/arma-tu-bowl', '_blank', 'noopener,noreferrer')}><ExternalLink className="size-4" /> Vista del cliente</Button>}{canEdit && <Button size="sm" leftIcon={<Plus className="size-4" />} onClick={() => { setSection('groups'); setGroupOpen(true); }}>Crear grupo</Button>}</div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-brand-100 pt-4 text-sm sm:grid-cols-4">{[['Grupos de esta presentación', scopeGroups.length], ['Opciones de esta presentación', scopeOptionCount], ['Recomendaciones', config.presets.length], ['Reglas por sucursal', scheduledRows.length]].map(([label, value]) => <div key={String(label)} className="rounded-xl border border-brand-100 bg-white/80 p-3"><p className="text-xs text-ink-muted">{label}</p><p className="mt-1 text-xl font-black text-ink">{value}</p></div>)}</div>
        {isPastry && <p className="mt-4 rounded-xl border border-brand-100 bg-white/80 p-3 text-xs leading-5 text-ink-muted"><strong className="text-ink">Para este producto:</strong> crea grupos como «Relleno», define sus opciones y revisa precio, insumo y alérgenos. El producto aparecerá al cliente cuando la publiques desde Catálogo.</p>}
      </Card>

      {isCake && <Card className="p-4 text-sm text-ink-muted"><strong className="text-ink">Porciones libres:</strong> {config.customServings?.enabled ? `activas de ${config.customServings.minServings} a ${config.customServings.maxServings}; S/ ${config.customServings.pricePerExtraServing} por porción adicional.` : 'pendientes de configurar en la ficha del Catálogo.'} Cada opción puede escalar su precio, insumo y tiempo desde este Constructor.</Card>}
      <Card className="p-2"><label className="block px-2 pb-2 text-xs font-bold uppercase tracking-wide text-ink-muted sm:hidden" htmlFor="builder-section-select">Sección de trabajo</label><select id="builder-section-select" value={section} onChange={(event) => setSection(event.target.value as Section)} className="h-11 w-full rounded-lg border border-line bg-white px-3 text-sm font-bold sm:hidden">{SECTIONS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select><div className="hidden flex-wrap gap-2 sm:flex" role="tablist" aria-label="Áreas del constructor">{SECTIONS.map(({ id, label, icon: Icon }) => <button key={id} type="button" role="tab" aria-selected={section === id} onClick={() => setSection(id)} className={cn('flex min-h-11 items-center gap-2 rounded-lg px-4 py-2 text-sm font-bold transition', section === id ? 'bg-brand-700 text-white shadow-sm' : 'text-ink-muted hover:bg-brand-50 hover:text-brand-800')}><Icon className="size-4" />{label}</button>)}</div></Card>

      {section === 'analytics' && (analytics ? (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="flex items-center gap-2 font-bold text-ink"><BarChart3 className="size-4 text-brand-600" /> Rendimiento del constructor</p><p className="text-xs text-ink-muted">Embudo de los últimos {analytics.range.days} días.</p></div><span className="inline-flex items-center gap-1 rounded-pill bg-brand-50 px-3 py-1 text-xs font-bold text-brand-700"><TrendingUp className="size-3.5" /> {analytics.funnel.conversionRate}% conversión</span></div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[['Visitas', analytics.funnel.viewed], ['Iniciaron', analytics.funnel.started], ['Completaron', analytics.funnel.completed], ['Al carrito', analytics.funnel.addedToCart]].map(([label, value]) => <div key={String(label)} className="rounded-xl bg-surface-muted p-3"><p className="text-xs text-ink-muted">{label}</p><p className="mt-1 text-2xl font-black text-ink">{value}</p></div>)}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-3"><div><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Más seleccionadas</p>{analytics.topSelectedOptions.slice(0, 5).map((item) => <div key={item.id} className="mt-2 flex justify-between text-sm"><span>{item.name}</span><b>{item.count}</b></div>)}{analytics.topSelectedOptions.length === 0 && <p className="mt-2 text-sm text-ink-muted">Aún no hay opciones elegidas.</p>}</div><div><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Recomendaciones utilizadas</p>{analytics.presetUsage.slice(0, 5).map((item) => <div key={item.id} className="mt-2 flex justify-between text-sm"><span>{item.name}</span><b>{item.count}</b></div>)}{analytics.presetUsage.length === 0 && <p className="mt-2 text-sm text-ink-muted">Aún no hay recomendaciones utilizadas.</p>}</div><div><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Señales de calidad</p><div className="mt-2 grid gap-2 text-sm"><p className="flex justify-between"><span>Abandono</span><b>{analytics.funnel.abandonmentRate}%</b></p><p className="flex justify-between"><span>Conflictos resueltos</span><b>{analytics.interactions.conflictsResolved}</b></p><p className="flex justify-between"><span>Errores de cotización</span><b>{analytics.interactions.quoteErrors}</b></p></div></div></div>
        </Card>
      ) : <Card className="p-8 text-center text-sm text-ink-muted">Todavía no hay datos de uso disponibles para este producto.</Card>)}

      {section === 'calendar' && <Card>
        <div className="flex items-start justify-between gap-3"><div><p className="flex items-center gap-2 font-bold text-ink"><CalendarClock className="size-4 text-brand-600" /> Calendario de disponibilidad</p><p className="text-xs text-ink-muted">{scheduledRows.length ? `${scheduledRows.length} reglas especiales activas o programadas.` : 'No hay ventanas especiales; aplica la disponibilidad global.'}</p></div></div>
        {scheduledRows.length > 0 ? <><div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">{visibleSchedules.map((row) => <button key={`${row.option.id}-${row.branchId}`} type="button" onClick={() => { setScheduling(row.option); scheduleForBranch(row.option, row.branchId); }} className="rounded-xl border border-line p-3 text-left transition hover:border-brand-300"><div className="flex justify-between gap-2"><span className="font-bold text-ink">{row.option.name}</span><span className={cn('rounded-pill px-2 py-0.5 text-[10px] font-bold', row.isAvailable ? 'bg-brand-50 text-brand-700' : 'bg-red-50 text-red-700')}>{row.isAvailable ? 'Disponible' : 'Bloqueado'}</span></div><p className="mt-1 text-xs text-ink-muted">{row.group.name} · {variantLabel(row.group.variantId)} · {config.branches.find((branch) => branch.id === row.branchId)?.name ?? `Sucursal #${row.branchId}`}</p><p className="mt-2 text-xs text-ink-muted">{row.availableFrom ? formatDate(row.availableFrom) : 'Desde ahora'} → {row.availableUntil ? formatDate(row.availableUntil) : 'Sin vencimiento'}{row.priceOverride !== null ? ` · ${formatCurrency(row.priceOverride)}` : ''}</p></button>)}</div><div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><p className="text-xs text-ink-muted">{scheduledRows.length} reglas · página {currentSchedulePage} de {scheduleTotalPages}</p><Pagination page={currentSchedulePage} totalPages={scheduleTotalPages} onChange={setSchedulePage} /></div></> : <p className="mt-4 rounded-xl border border-dashed border-line p-5 text-sm text-ink-muted">Las opciones usan su disponibilidad general. Para añadir una excepción, abre una opción en «Grupos y opciones» y selecciona «Programar disponibilidad».</p>}
      </Card>}

      {section === 'presets' && <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><p className="font-bold text-ink">Combinaciones recomendadas</p><p className="text-xs text-ink-muted">Atajos que aparecen al inicio del constructor.</p></div>
          {canEdit && <Button size="sm" onClick={() => { setEditingPreset(null); setPresetForm(NEW_PRESET); setPresetOpen(true); }}><Plus className="size-4" /> Nueva recomendación</Button>}
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {visiblePresets.map((preset) => (
            <div key={preset.id} draggable={canEdit} onDragStart={() => setDragging({ kind: 'preset', id: preset.id })} onDragOver={(event) => event.preventDefault()} onDrop={() => dropEntity('preset', preset.id)} className={cn('overflow-hidden rounded-2xl border bg-white', preset.isActive ? 'border-line' : 'border-dashed border-line opacity-60', canEdit && 'cursor-grab active:cursor-grabbing')}>
              {preset.imageUrl && <img src={preset.imageUrl} alt="" className="h-24 w-full object-cover" />}
              <div className="p-3">
                <div className="flex items-start justify-between gap-2"><div><p className="font-bold text-ink">{preset.name}</p><p className="text-xs text-ink-muted">{preset.selections.length} opciones</p></div>{preset.badge && <span className="rounded-pill bg-accent-100 px-2 py-0.5 text-[10px] font-bold text-accent-700">{preset.badge}</span>}</div>
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
        {config.presets.length === 0 ? <p className="mt-4 rounded-xl border border-dashed border-line p-5 text-sm text-ink-muted">Aún no hay recomendaciones. Crea una combinación para ayudar al cliente a empezar a personalizar.</p> : <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><p className="text-xs text-ink-muted">{config.presets.length} recomendaciones · página {currentPresetPage} de {presetTotalPages}</p><Pagination page={currentPresetPage} totalPages={presetTotalPages} onChange={setPresetPage} /></div>}
      </Card>}

      {section === 'groups' && canEdit && selectedOptions.length > 0 && (
        <div className="sticky top-20 z-20 mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand-200 bg-brand-50 p-3 shadow-e3">
          <span className="mr-auto text-sm font-bold text-brand-800">{selectedOptions.length} seleccionadas</span>
          {(['ACTIVE', 'OUT_OF_STOCK', 'INACTIVE'] as const).map((status) => (
            <Button key={status} size="sm" variant="outline" onClick={() => void run(`bulk-${status}`, () => commercialApi.bulkUpdateOptions(selectedOptions, status), 'Estados actualizados')}>{status === 'ACTIVE' ? 'Activar' : status === 'OUT_OF_STOCK' ? 'Agotar' : 'Ocultar'}</Button>
          ))}
          <Button size="sm" variant="ghost" onClick={() => setSelectedOptions([])}>Cancelar</Button>
        </div>
      )}

      {section === 'groups' && <div className="space-y-4">
      <Card className="p-4">
        <p className="text-sm font-black text-ink">Presentación que estás configurando</p>
        <p className="mt-1 text-xs text-ink-muted">Cada tamaño tiene sus propios grupos, opciones, precios e insumos. Los grupos comunes se aplican a todas las presentaciones.</p>
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Presentación del producto">
          {config.variants.map((variant) => <button key={variant.id} type="button" aria-pressed={selectedVariantId === variant.id} onClick={() => { setActiveVariantId(variant.id); setActiveGroupId(null); setGroupQuery(''); setSelectedOptions([]); }} className={cn('shrink-0 rounded-lg border px-4 py-2 text-sm font-bold transition', selectedVariantId === variant.id ? 'border-brand-700 bg-brand-700 text-white' : 'border-line bg-white text-ink hover:border-brand-300')}>{variant.name}{!variant.isActive ? ' · Inactiva' : ''}</button>)}
          {(config.groups.some((group) => group.variantId === null) || canEdit || config.variants.length === 0) && <button type="button" aria-pressed={selectedVariantId === 'shared'} onClick={() => { setActiveVariantId('shared'); setActiveGroupId(null); setGroupQuery(''); setSelectedOptions([]); }} className={cn('shrink-0 rounded-lg border px-4 py-2 text-sm font-bold transition', selectedVariantId === 'shared' ? 'border-brand-700 bg-brand-700 text-white' : 'border-line bg-white text-ink hover:border-brand-300')}>Todos los tamaños</button>}
        </div>
        {selectedVariantId !== 'shared' && sharedGroups.length > 0 && <div className="mt-3 rounded-xl border border-brand-100 bg-brand-50/60 px-3 py-3 text-xs text-ink-muted">
          <p className="font-semibold text-ink">Grupos que también aparecen en este tamaño</p>
          <p className="mt-1">Se gestionan una sola vez y se aplican a todas las presentaciones.</p>
          <div className="mt-3 flex flex-wrap gap-2">{sharedGroups.map((group) => <button key={group.id} type="button" className="min-h-9 rounded-lg border border-brand-200 bg-white px-3 font-bold text-brand-700 transition hover:border-brand-500 hover:bg-brand-50" onClick={() => { setActiveVariantId('shared'); setActiveGroupId(group.id); setGroupQuery(''); setSelectedOptions([]); }}>{`Gestionar ${group.name}`}</button>)}</div>
        </div>}
      </Card>
      <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 className="font-black text-ink">Grupos y opciones · {selectedVariant?.name ?? 'Todos los tamaños'}</h2><p className="mt-1 text-xs text-ink-muted">{selectedVariantId === 'shared' ? 'Estos grupos se aplican a todas las presentaciones.' : 'Elige un grupo de este tamaño para editar sus reglas y opciones.'}</p></div>
        <label className="relative block w-full sm:w-72"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" /><span className="sr-only">Buscar grupo u opción</span><input value={groupQuery} onChange={(event) => { setGroupQuery(event.target.value); setOptionPages({}); setSelectedOptions([]); }} placeholder="Buscar grupo u opción" className="h-11 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm text-ink" /></label>
      </Card>
      {scopeGroups.length === 0 && <Card className="border-dashed p-8 text-center"><h3 className="font-black text-ink">Aún no hay grupos en {selectedVariant?.name ?? 'Todos los tamaños'}</h3><p className="mt-2 text-sm text-ink-muted">Crea un grupo, por ejemplo «Relleno», y después agrega las opciones que podrá elegir el cliente en esta presentación.</p>{canEdit && <Button className="mt-4" size="sm" onClick={() => setGroupOpen(true)}>Crear primer grupo</Button>}</Card>}
      {scopeGroups.length > 0 && filteredGroups.length === 0 && <Card className="border-dashed p-8 text-center text-sm text-ink-muted">No hay grupos ni opciones que coincidan con la búsqueda. <button type="button" className="font-bold text-brand-700 underline" onClick={() => setGroupQuery('')}>Limpiar búsqueda</button></Card>}
      {filteredGroups.length > 0 && <div id="builder-groups" className="grid scroll-mt-24 gap-4 lg:grid-cols-[260px_minmax(0,1fr)] lg:items-start">
        <Card className="hidden p-2 lg:sticky lg:top-20 lg:block">
          <div className="border-b border-line px-3 py-2"><p className="text-xs font-black uppercase tracking-wide text-ink-muted">{selectedVariant?.name ?? 'Todos los tamaños'}</p><p className="mt-1 text-xs text-ink-muted">{filteredGroups.length} de {scopeGroups.length} grupos</p></div>
          <div className="max-h-[calc(100vh-13rem)] space-y-1 overflow-y-auto py-2">
            {filteredGroups.map((group) => <button key={group.id} type="button" draggable={canEdit && !groupQuery.trim()} onDragStart={() => setDragging({ kind: 'group', id: group.id })} onDragOver={(event) => event.preventDefault()} onDrop={() => dropEntity('group', group.id)} onClick={() => { setActiveGroupId(group.id); setSelectedOptions([]); }} aria-current={activeGroup?.id === group.id ? 'true' : undefined} className={cn('flex w-full min-w-0 items-start gap-2 rounded-xl p-3 text-left transition', activeGroup?.id === group.id ? 'bg-brand-50 text-brand-800 ring-1 ring-brand-200' : 'text-ink hover:bg-surface-muted')}>
              {canEdit && <GripVertical className="mt-0.5 size-4 shrink-0 cursor-grab text-ink-muted" aria-hidden="true" />}
              <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold">{scopeGroups.findIndex((entry) => entry.id === group.id) + 1}. {group.name}</span><span className="mt-1 block text-xs text-ink-muted">{group.options.length} {group.options.length === 1 ? 'opción' : 'opciones'} · {group.selectionType === 'SINGLE' ? 'una elección' : 'varias elecciones'}</span></span>
              {isRulesDirty(group) && <span className="mt-1 size-2 shrink-0 rounded-full bg-accent-500" title="Reglas sin guardar" />}
            </button>)}
          </div>
        </Card>
        <label className="block text-sm font-bold text-ink lg:hidden">Grupo a editar<select value={activeGroup?.id ?? ''} onChange={(event) => { setActiveGroupId(Number(event.target.value)); setSelectedOptions([]); }} className="mt-1 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm font-normal">{filteredGroups.map((group) => <option key={group.id} value={group.id}>{scopeGroups.findIndex((entry) => entry.id === group.id) + 1}. {group.name} · {group.options.length} opciones</option>)}</select></label>
      <div className="min-w-0">
        {visibleGroups.map((group) => {
          const index = scopeGroups.findIndex((entry) => entry.id === group.id);
          const draft = rulesOf(group);
          const groupValid = draft.name.trim().length >= 2 && draft.name.trim().length <= 80
            && Number.isInteger(draft.minSelection) && draft.minSelection >= 0 && draft.minSelection <= 20
            && Number.isInteger(draft.maxSelection) && draft.maxSelection >= 1 && draft.maxSelection <= 20
            && draft.maxSelection >= draft.minSelection
            && Number.isInteger(draft.freeQuantity) && draft.freeQuantity >= 0 && draft.freeQuantity <= draft.maxSelection;
          return (
          <Card key={group.id} className="min-w-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="flex items-center gap-2 font-semibold text-ink">
                  {index + 1}. {group.name}
                </p>
                <p className="text-xs text-ink-muted">
                  {group.options.length} {group.options.length === 1 ? 'opción' : 'opciones'} · {group.selectionType === 'SINGLE' ? 'una elección' : 'varias elecciones'}
                </p>
              </div>

              {canEdit && (
                <div className="flex items-center gap-1">
                  <Button size="sm" variant="ghost" disabled={index === 0 || Boolean(groupQuery.trim())} aria-label="Subir paso" onClick={() => moveGroup(index, index - 1)}><ArrowUp className="size-4" /></Button>
                  <Button size="sm" variant="ghost" disabled={index === scopeGroups.length - 1 || Boolean(groupQuery.trim())} aria-label="Bajar paso" onClick={() => moveGroup(index, index + 1)}><ArrowDown className="size-4" /></Button>
                <Button
                  size="sm"
                  variant="outline"
                  leftIcon={<Plus className="size-4" />}
                  onClick={() => {
                    setOptionForm(NEW_OPTION);
                    setAddingTo(group);
                  }}
                >
                  Agregar opción
                </Button>
                </div>
              )}
            </div>

            {/* Nombre y reglas del paso */}
            {canEdit && (
              <details className="group mt-5 overflow-hidden rounded-card border border-line bg-white shadow-e1">
                <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3.5 transition-colors hover:bg-brand-50/60 [&::-webkit-details-marker]:hidden sm:px-5">
                  <span className="grid size-9 shrink-0 place-items-center rounded-field bg-brand-50 text-brand-700"><Pencil className="size-4" /></span>
                  <span className="min-w-0 flex-1"><span className="block text-sm font-bold text-ink">Nombre y reglas</span><span className="mt-0.5 block text-xs text-ink-muted">{draft.minSelection} mínimo · {draft.maxSelection} máximo · {draft.freeQuantity} sin cargo</span></span>
                  <span className={cn('hidden rounded-pill px-2.5 py-1 text-[11px] font-bold sm:inline-flex', isRulesDirty(group) ? 'bg-accent-50 text-accent-700' : 'bg-brand-50 text-brand-700')}>{isRulesDirty(group) ? 'Sin guardar' : 'Editar grupo'}</span>
                  <ChevronDown className="size-4 shrink-0 text-ink-muted transition-transform group-open:rotate-180" />
                </summary>
                <div className="border-t border-line bg-surface-muted/45 p-4 sm:p-5">
                  <div className="mb-5"><h4 className="text-sm font-bold text-ink">Cómo verá el cliente este paso</h4><p className="mt-1 text-xs leading-5 text-ink-muted">Cambia el nombre y la cantidad de opciones que puede elegir. Se aplica a pedidos nuevos.</p></div>
                  <div className="max-w-2xl"><Input label="Nombre visible del grupo" value={draft.name} maxLength={80} onChange={(event) => patchRules(group, { name: event.target.value })} hint="Aparece en el configurador y en el resumen del cliente." error={draft.name.trim().length < 2 ? 'Escribe al menos 2 caracteres.' : undefined} /></div>
                  <div className="mt-5 grid gap-4 sm:grid-cols-3">
                    <Input label="Mínimo a elegir" type="number" min="0" max="20" value={draft.minSelection} onChange={(event) => patchRules(group, { minSelection: Number(event.target.value) })} error={draft.minSelection > draft.maxSelection ? 'No puede superar el máximo.' : undefined} />
                    <Input label="Máximo a elegir" type="number" min="1" max="20" value={draft.maxSelection} onChange={(event) => patchRules(group, { maxSelection: Number(event.target.value) })} error={draft.maxSelection < draft.minSelection ? 'Debe ser igual o mayor al mínimo.' : undefined} />
                    <Input label="Incluidas sin cargo" type="number" min="0" max={draft.maxSelection} value={draft.freeQuantity} onChange={(event) => patchRules(group, { freeQuantity: Number(event.target.value) })} error={draft.freeQuantity > draft.maxSelection ? 'No puede superar el máximo.' : undefined} />
                  </div>
                  <div className="mt-5 flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
                    <p className={cn('text-xs leading-5', isRulesDirty(group) ? 'font-semibold text-accent-700' : 'text-ink-muted')}>{isRulesDirty(group) ? 'Tienes cambios pendientes en este grupo.' : 'Los cambios guardados se muestran al cliente en pedidos nuevos.'}</p>
                    {isRulesDirty(group) && <Button size="sm" className="sm:min-w-36" isLoading={busy === `group-${group.id}`} disabled={!groupValid} onClick={() => run(`group-${group.id}`, async () => {
                      await commercialApi.updateGroup(group.id, { ...draft, name: draft.name.trim() });
                      setRuleDrafts((current) => { const next = { ...current }; delete next[group.id]; return next; });
                    }, 'Grupo actualizado')}>Guardar cambios</Button>}
                  </div>
                </div>
              </details>
            )}

            {/* Opciones */}
            <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2"><div><h3 className="text-sm font-black text-ink">Opciones de {group.name}</h3><p className="text-xs text-ink-muted">{group.options.length} registradas · se muestran {OPTION_PAGE_SIZE} por página</p></div></div>
            <div className="mt-4 hidden overflow-x-auto md:block">
              <table className="w-full min-w-[820px] text-sm">
                <thead className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-muted">
                  <tr>
                    {canEdit && <th scope="col" className="w-8 pb-2"><span className="sr-only">Seleccionar</span></th>}
                    <th scope="col" className="pb-2">Opción</th>
                    <th scope="col" className="pb-2 text-right">Precio</th>
                    <th scope="col" className="pb-2 text-center">Suplemento</th>
                    {/* Sin esta columna, una opcion enlazada a un insumo con cantidad
                        0 era invisible: ni descuenta ni se agota nunca. */}
                    <th scope="col" className="pb-2">Insumo</th>
                    <th scope="col" className="pb-2">Estado</th>
                    <th scope="col" className="pb-2">No combina con</th>
                    <th scope="col" className="pb-2"><span className="sr-only">Acciones</span></th>
                  </tr>
                </thead>

                <tbody>
                  {visibleOptionsFor(group).map(({ option, index: optionIndex }) => (
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
                          {optionStatusLabel(option.status)}
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
                              variant="outline"
                              onClick={() => openOptionEditor(option)}
                              aria-label={`Editar ${option.name}`}
                            >
                              <Pencil className="size-4" /><span className="ml-1 hidden xl:inline">Editar</span>
                            </Button>
                          )}
                          {canEdit && (
                            <Button size="sm" variant="ghost" aria-label={`Más acciones para ${option.name}`} onClick={(event) => setOptionActions({ option, anchor: event.currentTarget })}><MoreHorizontal className="size-4" /></Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-4 grid gap-3 md:hidden">
              {visibleOptionsFor(group).map(({ option, index: optionIndex }) => (
                <article key={option.id} className="min-w-0 rounded-card border border-line bg-white p-3 shadow-e1">
                  <div className="flex min-w-0 items-start gap-3">
                    {canEdit && <input type="checkbox" checked={selectedOptions.includes(option.id)} onChange={(event) => setSelectedOptions((current) => event.target.checked ? [...current, option.id] : current.filter((id) => id !== option.id))} className="mt-3 size-4 shrink-0 accent-brand-600" aria-label={`Seleccionar ${option.name}`} />}
                    <span className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-card bg-surface-muted ring-1 ring-line">
                      {option.imageUrl ? <img src={option.imageUrl} alt="" className="size-full object-cover" /> : <ImageIcon className="size-5 text-ink-muted" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <p className="min-w-0 font-bold text-ink">{option.name}</p>
                        <span className={cn('shrink-0 rounded-pill px-2 py-0.5 text-[10px] font-bold', option.status === 'ACTIVE' ? 'bg-brand-50 text-brand-700' : 'bg-red-50 text-red-700')}>{optionStatusLabel(option.status)}</span>
                      </div>
                      <p className="mt-1 text-xs text-ink-muted">{option.priceDelta === 0 ? 'Incluida' : formatCurrency(option.priceDelta)}{option.chargeAlways ? ' · suplemento fijo' : ''}</p>
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
                    {canOpenOption && <Button className="ml-auto" size="sm" variant="outline" onClick={() => openOptionEditor(option)}><Pencil className="size-4" /> Editar</Button>}
                    {canEdit && <Button size="sm" variant="ghost" aria-label={`Más acciones para ${option.name}`} onClick={(event) => setOptionActions({ option, anchor: event.currentTarget })}><MoreHorizontal className="size-4" /></Button>}
                  </div>}
                </article>
              ))}
            </div>
            {group.options.length === 0 && <p className="mt-4 rounded-xl border border-dashed border-line p-4 text-sm text-ink-muted">Este grupo aún no tiene opciones. Agrega la primera para que el cliente pueda elegir.</p>}
            {group.options.length > 0 && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><p className="text-xs text-ink-muted">{listedOptionsFor(group).length} {groupQuery ? 'opciones visibles' : 'opciones'} · página {optionPageFor(group)} de {Math.max(1, Math.ceil(listedOptionsFor(group).length / OPTION_PAGE_SIZE))}</p><Pagination page={optionPageFor(group)} totalPages={Math.max(1, Math.ceil(listedOptionsFor(group).length / OPTION_PAGE_SIZE))} onChange={(next) => setOptionPages((current) => ({ ...current, [group.id]: next }))} /></div>}
          </Card>
          );
        })}
      </div>
      </div>}
      </div>}

      <Menu anchorEl={optionActions?.anchor ?? null} open={Boolean(optionActions)} onClose={() => setOptionActions(null)} slotProps={{ paper: { sx: { minWidth: 235, mt: 1, borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-e3)' } } }}>
        {optionActions && [
          <MenuItem key="duplicate" disabled={busy !== null} onClick={() => { const option = optionActions.option; setOptionActions(null); void run(`copy-${option.id}`, () => commercialApi.duplicateOption(option.id), 'Opción duplicada como borrador'); }} sx={{ gap: 1.5 }}><Copy className="size-4" /> Duplicar opción</MenuItem>,
          <MenuItem key="schedule" onClick={() => { const option = optionActions.option; setOptionActions(null); setScheduling(option); setScheduleForm({ branchId: config.branches[0]?.id ?? '', isAvailable: true, priceOverride: '', availableFrom: '', availableUntil: '' }); }} sx={{ gap: 1.5 }}><CalendarClock className="size-4" /> Programar disponibilidad</MenuItem>,
          <MenuItem key="incompatible" onClick={() => { setLinking(optionActions.option); setOptionActions(null); }} sx={{ gap: 1.5 }}><Ban className="size-4" /> Revisar combinaciones</MenuItem>,
          <MenuItem key="delete" disabled={busy !== null} onClick={async () => { const option = optionActions.option; setOptionActions(null); const { confirmed } = await confirm({ title: `Eliminar "${option.name}"`, message: 'Se borra del constructor con sus combinaciones prohibidas y su programación por sucursal. Los pedidos anteriores no cambian. Si solo quieres dejar de mostrarla, usa «Ocultar».', confirmLabel: 'Eliminar', tone: 'danger' }); if (confirmed) void run(`del-${option.id}`, () => commercialApi.deleteOption(option.id), 'Opción eliminada'); }} sx={{ gap: 1.5, color: 'error.main', borderTop: '1px solid', borderColor: 'divider', mt: .5, pt: 1 }}><Trash2 className="size-4" /> Eliminar opción</MenuItem>,
        ]}
      </Menu>

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
          <MediaPicker value={presetForm.imageUrl} altText={presetForm.name} category="builder-presets" imagePurpose="preset" subjectName={presetForm.name} subjectDescription={[presetForm.description, config.groups.flatMap((group) => group.options.filter((option) => presetForm.optionIds.includes(option.id)).map((option) => option.name)).join(', ')].filter(Boolean).join('. ')} label="Imagen de la recomendación" onChange={(image) => setPresetForm((current) => ({ ...current, imageUrl: image.url }))} />
          <div>
            <p className="mb-2 text-sm font-medium text-ink">Opciones de la recomendación</p>
            <div className="grid max-h-72 gap-3 overflow-y-auto rounded-xl border border-line p-3">
              {config.groups.map((group) => <div key={group.id}><p className="mb-1 text-xs font-bold uppercase tracking-wide text-ink-muted">{group.name} · {variantLabel(group.variantId)}</p><div className="grid gap-1 sm:grid-cols-2">{group.options.filter((option) => option.status !== 'INACTIVE').map((option) => <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-muted"><input type="checkbox" checked={presetForm.optionIds.includes(option.id)} onChange={(event) => setPresetForm((current) => ({ ...current, optionIds: event.target.checked ? [...current.optionIds, option.id] : current.optionIds.filter((id) => id !== option.id) }))} className="size-4 accent-brand-600" />{option.name}</label>)}</div></div>)}
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
          : 'Alérgenos y etiquetas de esta opción. El precio y la disponibilidad los gestiona el catálogo.'}
        maxWidth="md"
        disableBackdropClose
      >
        <div className="grid min-w-0 gap-5 md:grid-cols-[minmax(0,1fr)_minmax(180px,210px)]">
          <div className="grid min-w-0 gap-3">
          {canEdit && (
            <>
              <Input
                label="Nombre"
                value={optionForm.name}
                onChange={(e) => setOptionForm((c) => ({ ...c, name: e.target.value }))}
                placeholder="Ej.: Ganache de chocolate"
              />

              <Input
                label="Descripción corta"
                value={optionForm.description}
                onChange={(e) => setOptionForm((c) => ({ ...c, description: e.target.value }))}
                placeholder="Sabor, textura o preparación"
                hint="Se mostrará al cliente al elegir esta opción"
              />

              <MediaPicker
                value={optionForm.imageUrl}
                altText={optionForm.imageAlt}
                imagePurpose="option"
                subjectName={optionForm.name}
                subjectDescription={optionForm.description}
                label="Imagen pública de esta opción"
                hint="El cliente la verá al personalizar. Puedes subir una foto o generar una propuesta con IA; revisa que represente la opción real. La imagen del insumo de Inventario no se copia automáticamente."
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
                {!isPastry && <Select id="spice" label="Nivel de picante" value={optionForm.spiceLevel} onChange={(e) => setOptionForm((c) => ({ ...c, spiceLevel: e.target.value }))}>
                  <SelectOption value="0">Sin picante</SelectOption><SelectOption value="1">Suave</SelectOption><SelectOption value="2">Medio</SelectOption><SelectOption value="3">Intenso</SelectOption>
                </Select>}
                <Input label={isPastry ? 'Máximo de unidades de esta opción' : 'Máximo de porciones'} type="number" min="1" max="10" value={optionForm.maxPerItem} onChange={(e) => setOptionForm((c) => ({ ...c, maxPerItem: e.target.value }))} hint="Límite que el cliente puede elegir de esta opción." />
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
                  No pudimos cargar el maestro de alérgenos. Los que ya tiene la opción se conservan.
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
                    Se cobra siempre y no consume las unidades incluidas del paso.
                  </span>
                </span>
              </label>
              {isCake && <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-line p-3 text-sm">
                <input type="checkbox" checked={optionForm.cakeScaleWithServings} onChange={(e) => setOptionForm((c) => ({ ...c, cakeScaleWithServings: e.target.checked }))} className="mt-0.5 size-4 accent-brand-600" />
                <span><span className="font-medium text-ink">Escalar con las porciones libres</span><span className="block text-xs text-ink-muted">Ajusta el recargo, el insumo y el tiempo de esta opción según las porciones solicitadas. Desactívalo para adornos de cantidad fija.</span></span>
              </label>}

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
                  const dietaryTags = optionForm.dietaryTags.split(',').map((value) => value.trim()).filter(Boolean);

                  if (editingOption && !canEdit) {
                    // Solo lo que el rol puede tocar: el servidor rechaza el resto
                    // campo por campo, asi que mandar de mas seria un 403 seguro.
                    await commercialApi.updateOption(editingOption.id, {
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
                    cakeScaleWithServings: optionForm.cakeScaleWithServings,
                    maxPerItem: Number(optionForm.maxPerItem),
                    inventoryItemId:
                      optionForm.inventoryItemId === '' ? null : optionForm.inventoryItemId,
                    consumptionQuantity: Number(optionForm.consumptionQuantity),
                  };

                  if (editingOption) {
                    await commercialApi.updateOption(editingOption.id, payload);
                  } else if (addingTo) {
                    await commercialApi.createOption(addingTo.id, payload);
                    setGroupQuery('');
                    setActiveGroupId(addingTo.id);
                    setOptionPages((current) => ({
                      ...current,
                      [addingTo.id]: Math.ceil((addingTo.options.length + 1) / OPTION_PAGE_SIZE),
                    }));
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
            <p className="mt-3 text-sm font-semibold text-ink">{optionForm.name || 'Nombre de la opción'}</p>
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
        description="El cliente no podrá elegir juntas las opciones marcadas aquí."
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
      <Modal
        isOpen={groupOpen}
        onClose={() => { if (!busy) setGroupOpen(false); }}
        disableBackdropClose
        eyebrow="CONSTRUCTOR"
        title={`Nuevo grupo · ${selectedVariant?.name ?? 'Todos los tamaños'}`}
        description={selectedVariantId === 'shared' ? 'Este grupo aparecerá en todas las presentaciones. Después de guardarlo agrega sus opciones.' : `Este grupo aparecerá solo en ${selectedVariant?.name ?? 'esta presentación'}. Después de guardarlo agrega sus opciones.`}
        actions={<><Button variant="outline" disabled={busy !== null} onClick={() => setGroupOpen(false)}>Cancelar</Button><Button disabled={busy !== null} isLoading={busy === 'create-group'} onClick={() => void createGroup()}>Crear grupo</Button></>}
      >
        <div className="space-y-4">
          <Input label="Nombre del grupo" value={groupForm.name} maxLength={80} onChange={(event) => setGroupForm((current) => ({ ...current, name: event.target.value }))} placeholder="Ej.: Relleno" hint="Así verá el cliente esta elección." />
          <Input label="Descripción (opcional)" value={groupForm.description} maxLength={255} onChange={(event) => setGroupForm((current) => ({ ...current, description: event.target.value }))} placeholder="Ej.: Elige el sabor del interior" />
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-sm font-semibold">Tipo de elección<select className="mt-1 w-full rounded-lg border border-line bg-white p-2" value={groupForm.selectionType} onChange={(event) => setGroupForm((current) => ({ ...current, selectionType: event.target.value as 'SINGLE' | 'MULTIPLE', maxSelection: 1 }))}><option value="SINGLE">Una opción</option><option value="MULTIPLE">Varias opciones</option></select></label>
            <Input label="Mínimo que debe elegir" type="number" min="0" max="20" value={groupForm.minSelection} onChange={(event) => setGroupForm((current) => ({ ...current, minSelection: Number(event.target.value) }))} hint="Usa 1 si la elección es obligatoria." />
            {groupForm.selectionType === 'MULTIPLE' && <Input label="Máximo que puede elegir" type="number" min="1" max="20" value={groupForm.maxSelection} onChange={(event) => setGroupForm((current) => ({ ...current, maxSelection: Number(event.target.value) }))} />}
            <Input label="Opciones incluidas sin costo" type="number" min="0" max={groupForm.maxSelection} value={groupForm.freeQuantity} onChange={(event) => setGroupForm((current) => ({ ...current, freeQuantity: Number(event.target.value) }))} hint="Si todas tienen precio extra, usa 0." />
          </div>
          <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900">El grupo se crea vacío. Agrega al menos una opción activa antes de publicar un producto personalizable.</p>
        </div>
      </Modal>
    </div>
  );
};

export default BuilderAdminPage;
