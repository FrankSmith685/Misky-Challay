import { useSearchParams } from 'react-router-dom';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarDays, CheckCircle2, ChevronDown, ClipboardList, Factory, Info, LoaderCircle,
  MapPin, PackageCheck, RefreshCw, Settings2, Sparkles, WalletCards,
} from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { Pagination } from '@components/ui/Pagination';
import { PageHeader } from '@components/common/PageHeader';
import { useLiveRefresh } from '@services/realtime';
import { getApiErrorMessage } from '@services/api/client';
import { useActiveBranch } from '@features/admin/hooks/useActiveBranch';
import { BranchSelector } from '@features/admin/components/BranchSelector';
import { usePermissions } from '@hooks/usePermissions';
import { PERM } from '@constants/permissions';
import {
  cakesApi, type CakeCommissionReport, type CakeConfiguration, type DesignRequest,
  type ProductionTask, type Station, type StationCapacity,
} from '../cakes.service';
import RecipeEditor from '../components/RecipeEditor';
import { CakeOverview } from '../components/CakeOverview';
import { CakeProductPicker } from '../components/CakeProductPicker';
import { CommissionManager } from '../components/CommissionManager';
import { CakeFinanceBoard } from '../components/CakeFinanceBoard';
import { ProductionSettings } from '../components/ProductionSettings';
import { CakeProductionBoard } from '../components/CakeProductionBoard';
import { CakeDesignBoard } from '../components/CakeDesignBoard';

type Tab = 'overview' | 'recipes' | 'capacity' | 'designs' | 'production' | 'finances' | 'commissions';
const TABS: Array<{ id: Tab; label: string; icon: typeof Settings2 }> = [
  { id: 'overview', label: 'Productos y preparación', icon: Settings2 },
  { id: 'recipes', label: 'Recetas y tiempos', icon: PackageCheck },
  { id: 'capacity', label: 'Capacidad', icon: CalendarDays },
  { id: 'designs', label: 'Diseños especiales', icon: Sparkles },
  { id: 'production', label: 'Producción', icon: ClipboardList },
  { id: 'finances', label: 'Costos y gastos', icon: WalletCards },
  { id: 'commissions', label: 'Comisiones', icon: WalletCards },
];

const TAB_HELP: Record<Tab, { purpose: string; actions: string[]; result: string }> = {
  overview: {
    purpose: 'Define qué productos puedes ofrecer y cómo los compra el cliente.',
    actions: ['Crea una torta o completa un producto en borrador de Catálogo con perfil y receta.', 'Comprueba el modo de venta, el precio y la anticipación.', 'Clasifica sus insumos en Inventario y publica desde Catálogo cuando esté lista.'],
    result: 'El modo determina si el cliente compra una torta clásica, la personaliza o solicita una cotización.',
  },
  recipes: {
    purpose: 'Indica qué insumos consume cada presentación y cuánto tiempo requiere cada etapa.',
    actions: ['Elige una presentación y guarda su receta.', 'Ajusta los minutos base, por presentación y por opción.', 'Los alérgenos se actualizan al cambiar la receta.'],
    result: 'La receta conecta los pedidos con Inventario; los tiempos alimentan la capacidad y las tareas de cocina.',
  },
  capacity: {
    purpose: 'Define cuántos minutos de trabajo tiene cada estación en una sucursal y fecha.',
    actions: ['Selecciona sucursal, día y estación.', 'Consulta los minutos ya comprometidos.', 'Guarda una capacidad igual o mayor que lo reservado y confirmado.'],
    result: 'El sistema usa estos minutos para ofrecer fechas posibles y planificar nuevos productos.',
  },
  designs: {
    purpose: 'Convierte la idea del cliente en una cotización clara y aprobable.',
    actions: ['Revisa la solicitud, porciones, fecha y referencias.', 'Calcula materiales, mano de obra, empaque y minutos por etapa.', 'Envía precio, fecha de entrega, vigencia y condiciones.', 'El cliente acepta la propuesta antes de pagar.'],
    result: 'Al aceptar, la cotización se vincula al pedido y la operación puede planificar capacidad, producción e inventario.',
  },
  production: {
    purpose: 'Coordina las etapas de los productos encargados en la sucursal.',
    actions: ['Asigna una persona e inicia la tarea.', 'Registra materiales reales y completa control de calidad.', 'Marca la etapa como terminada o bloqueada según corresponda.'],
    result: 'El avance actualiza la operación y el consumo real corrige inventario y costos.',
  },
  finances: {
    purpose: 'Mide cuánto deja cada torta y mantiene conciliados sus gastos y pagos.',
    actions: ['Filtra la sucursal y el período que quieres revisar.', 'Compara ventas, materiales, gastos, tarifas y comisión.', 'Corrige los costos incompletos por pedido.', 'Registra gastos, pagos a proveedores y tarifas con su comprobante.'],
    result: 'El tablero muestra el margen de las tortas y el resultado operativo estimado con los movimientos registrados.',
  },
  commissions: {
    purpose: 'Consulta y liquida la comisión de los pedidos cobrados.',
    actions: ['Revisa la base y el saldo de cada pedido.', 'Registra un ajuste con motivo si corresponde.', 'Anota la transferencia y su referencia cuando se realice.'],
    result: 'La liquidación reduce el saldo pendiente y conserva el historial de transferencias.',
  },
};

const STATIONS: Station[] = ['DESIGN', 'BAKING', 'COOLING', 'FILLING', 'DECORATING', 'QA', 'DISPATCH'];
const CAPACITY_PAGE_SIZE = 10;
const STATION_LABELS: Record<Station, string> = {
  DESIGN: 'Diseño', BAKING: 'Horneado', COOLING: 'Enfriado', FILLING: 'Relleno',
  DECORATING: 'Decoración', QA: 'Calidad', DISPATCH: 'Despacho',
};
const DEFAULT_STATION_CAPACITY: Record<Station, number> = { DESIGN: 120, BAKING: 180, COOLING: 180, FILLING: 180, DECORATING: 180, QA: 90, DISPATCH: 90 };
const STATION_HELP: Record<Station, string> = {
  DESIGN: 'Revisión del diseño y preparación de referencias.',
  BAKING: 'Horneado de bizcochos y bases.',
  COOLING: 'Enfriado antes de rellenar o decorar.',
  FILLING: 'Relleno, armado y nivelado.',
  DECORATING: 'Cobertura, decoración y acabados.',
  QA: 'Control de calidad, empaque y revisión final.',
  DISPATCH: 'Preparación y entrega a reparto o recojo.',
};
const todayInLima = () => {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
};

const CakeAdminPage = () => {
  const [searchParams] = useSearchParams();
  const linkedProductId = Number(searchParams.get('producto')) || null;
  const linkedTab = searchParams.get('seccion');
  const linkedOrderNumber = searchParams.get('pedido') ?? '';
  const linkedBranchId = Number(searchParams.get('branchId')) || null;
  const appliedLinkedBranch = useRef<number | null>(null);
  const { can, canAny, isSuperAdmin } = usePermissions();
  const { branchId, branches, setBranchId, setGlobalScope, isLoadingBranches, branchesError, reloadBranches } = useActiveBranch({ allowAll: isSuperAdmin });
  const visibleTabs = TABS.filter(({ id }) => id === 'commissions'
    ? isSuperAdmin
    : id === 'finances'
      ? can(PERM.CAKE_FINANCE_READ)
      : id === 'overview'
        ? canAny(PERM.CATALOG_CUSTOMIZATION_WRITE, PERM.KITCHEN_READ)
        : id === 'designs'
          ? can(PERM.CATALOG_CUSTOMIZATION_WRITE)
          : id === 'capacity'
            ? canAny(PERM.KITCHEN_READ, PERM.GEO_READ)
            : id === 'production'
              ? can(PERM.KITCHEN_READ)
              : can(PERM.CATALOG_CUSTOMIZATION_WRITE));
  const [tab, setTab] = useState<Tab>(
    linkedTab && visibleTabs.some((entry) => entry.id === linkedTab)
      ? linkedTab as Tab
      : linkedProductId && visibleTabs.some((entry) => entry.id === 'recipes') ? 'recipes' : visibleTabs[0]?.id ?? 'overview',
  );
  const [selectedCakeId, setSelectedCakeId] = useState<number | null>(linkedProductId);
  const [config, setConfig] = useState<CakeConfiguration[]>([]);
  const [designs, setDesigns] = useState<DesignRequest[]>([]);
  const [capacities, setCapacities] = useState<StationCapacity[]>([]);
  const [tasks, setTasks] = useState<ProductionTask[]>([]);
  const [commissions, setCommissions] = useState<CakeCommissionReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [capacityDate, setCapacityDate] = useState(todayInLima);
  const [capacityStation, setCapacityStation] = useState<Station>('BAKING');
  const [capacityMinutes, setCapacityMinutes] = useState(480);
  const [recipePanel, setRecipePanel] = useState<'recipe' | 'timings'>('recipe');
  const capacityDirty = useRef(false);
  const capacitySource = `${branchId}:${capacityDate}:${capacityStation}`;
  const previousCapacitySource = useRef(capacitySource);
  const sequence = useRef(0);
  const sourceKey = `${branchId}:${tab}`;
  const currentSource = useRef(sourceKey); currentSource.current = sourceKey;
  const loadedSourceRef = useRef('');
  const [loadedSource, setLoadedSource] = useState('');
  const needsBranch = tab !== 'overview' && tab !== 'recipes' && tab !== 'commissions';

  useEffect(() => {
    if (!isLoadingBranches && linkedBranchId && appliedLinkedBranch.current !== linkedBranchId && branches.some((branch) => branch.id === linkedBranchId)) {
      appliedLinkedBranch.current = linkedBranchId;
      if (branchId !== linkedBranchId) setBranchId(linkedBranchId);
    }
  }, [branchId, branches, isLoadingBranches, linkedBranchId, setBranchId]);

  useEffect(() => {
    if (previousCapacitySource.current !== capacitySource) { previousCapacitySource.current = capacitySource; capacityDirty.current = false; }
    if (capacityDirty.current) return;
    const existing = capacities.find((row) => row.workDate === capacityDate && row.station === capacityStation);
    setCapacityMinutes(existing?.capacityMinutes ?? DEFAULT_STATION_CAPACITY[capacityStation]);
  }, [capacities, capacityDate, capacityStation, capacitySource]);

  useEffect(() => {
    if (!visibleTabs.some((item) => item.id === tab) && visibleTabs[0]) setTab(visibleTabs[0].id);
  }, [tab, visibleTabs]);

  const load = useCallback(async (background = false) => {
    if (needsBranch && !branchId) return;
    const request = ++sequence.current;
    const source = currentSource.current;
    const valid = () => request === sequence.current && source === currentSource.current;
    if (background && loadedSourceRef.current === source) setRefreshing(true);
    else setLoading(true);
    try {
      if (tab === 'overview' || tab === 'recipes') { const rows = await cakesApi.configuration(); if (valid()) setConfig(rows); }
      if (tab === 'designs' && branchId) { const rows = await cakesApi.designBoard(branchId); if (valid()) setDesigns(rows); }
      if (tab === 'capacity' && branchId) { const rows = await cakesApi.capacities(branchId); if (valid()) setCapacities(rows); }
      if (tab === 'production' && branchId) { const rows = await cakesApi.tasks(branchId); if (valid()) setTasks(rows); }
      if (tab === 'commissions') { const rows = await cakesApi.commissions(branchId ?? undefined); if (valid()) setCommissions(rows); }
      if (valid()) { setError(''); loadedSourceRef.current = source; setLoadedSource(source); }
    } catch (cause) { if (valid()) setError(getApiErrorMessage(cause)); }
    finally { if (valid()) { setLoading(false); setRefreshing(false); } }
  }, [branchId, needsBranch, tab]);
  useEffect(() => {
    if (!isLoadingBranches) void load();
    const cancelPendingReads = () => { sequence.current++; };
    return cancelPendingReads;
  }, [isLoadingBranches, load]);
  useLiveRefresh(['production', 'designs', 'availability', 'finance', 'catalog'], () => load(true), { enabled: !isLoadingBranches });

  const openReference = async (request: DesignRequest, referenceId?: number) => {
    try {
      const blob = referenceId
        ? await cakesApi.referenceAttachment(request.id, referenceId)
        : await cakesApi.reference(request.id);
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    }
  };

  const saveCapacity = async () => {
    if (!branchId || !can(PERM.GEO_WRITE)) return;
    try {
      await cakesApi.setCapacity({
        branchId, workDate: capacityDate, station: capacityStation, capacityMinutes,
      });
      capacityDirty.current = false;
      toast.success('Capacidad guardada para el día y la estación');
      await load();
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    }
  };
  const restoreCapacity = async () => {
    if (!branchId || !can(PERM.GEO_WRITE)) return;
    try {
      await cakesApi.restoreCapacity({ branchId, workDate: capacityDate, station: capacityStation });
      toast.success('Capacidad automática restaurada');
      await load();
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    }
  };

  const changeTask = async (task: ProductionTask, status: 'IN_PROGRESS' | 'BLOCKED' | 'DONE', incidentReason?: string) => {
    if (!branchId) return;
    try {
      await cakesApi.updateTask(task.id, { branchId, status, ...(incidentReason ? { incidentReason } : {}) });
      toast.success('Estado de la tarea actualizado');
      await load();
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    }
  };

  const help = TAB_HELP[tab];
  const activeTab = TABS.find((item) => item.id === tab);
  const content = (() => {
    if (needsBranch && !branchId) return <Card className="flex items-start gap-3 border-brand-200 bg-brand-50/60 p-5 text-sm text-brand-900"><MapPin className="mt-0.5 size-5 shrink-0 text-brand-700" /><div><p className="font-bold">Selecciona una sucursal para continuar</p><p className="mt-1 text-brand-800/80">Esta sección trabaja con capacidad, solicitudes y producción de una sede concreta.</p></div></Card>;
    if (loading && loadedSource !== sourceKey && ['overview', 'recipes', 'designs', 'capacity', 'production', 'commissions'].includes(tab)) return <Card className="flex items-center gap-3 p-5 text-sm text-ink-muted"><LoaderCircle className="size-5 animate-spin text-brand-700" /> Cargando {activeTab?.label.toLowerCase()}…</Card>;
    if (tab === 'overview') return <CakeOverview config={config} canCreate={can(PERM.CATALOG_PRODUCT_WRITE, PERM.CATALOG_CUSTOMIZATION_WRITE)} canEditRules={can(PERM.CATALOG_CUSTOMIZATION_WRITE)} canOpenCatalog={can(PERM.CATALOG_PRODUCT_READ)} onCreated={load} onRecipes={(productId, panel = 'recipe') => { setSelectedCakeId(productId); setRecipePanel(panel); setTab('recipes'); }} />;
    if (tab === 'recipes') {
      const productId = config.some((entry) => entry.product.id === selectedCakeId) ? selectedCakeId : null;
      return <div className="space-y-5"><CakeProductPicker products={config} selectedId={productId} onSelect={setSelectedCakeId} />{productId !== null && <div className="space-y-4"><div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-white p-2 shadow-e1" role="tablist" aria-label="Herramientas de receta"><button type="button" role="tab" aria-selected={recipePanel === 'recipe'} onClick={() => setRecipePanel('recipe')} className={`flex min-h-10 items-center rounded-lg px-4 py-2 text-sm font-bold transition ${recipePanel === 'recipe' ? 'bg-brand-700 text-white' : 'text-ink-muted hover:bg-brand-50 hover:text-brand-800'}`}>Receta e insumos</button><button type="button" role="tab" aria-selected={recipePanel === 'timings'} onClick={() => setRecipePanel('timings')} className={`flex min-h-10 items-center rounded-lg px-4 py-2 text-sm font-bold transition ${recipePanel === 'timings' ? 'bg-brand-700 text-white' : 'text-ink-muted hover:bg-brand-50 hover:text-brand-800'}`}>Tiempos y reglas</button></div>{recipePanel === 'recipe' ? <RecipeEditor selectedProductId={productId} /> : <ProductionSettings selectedProductId={productId} />}</div>}</div>;
    }
    if (tab === 'designs') return <CakeDesignBoard initialRequestId={Number(searchParams.get('solicitud')) || undefined} designs={designs} branchId={branchId} onReference={openReference} onRefresh={load} />;
    if (tab === 'capacity') return <fieldset disabled={!can(PERM.GEO_WRITE)}><CapacityBoard rows={capacities} date={capacityDate} station={capacityStation} minutes={capacityMinutes} onDate={setCapacityDate} onStation={setCapacityStation} onMinutes={(value) => { capacityDirty.current = value !== (capacities.find((row) => row.workDate === capacityDate && row.station === capacityStation)?.capacityMinutes ?? DEFAULT_STATION_CAPACITY[capacityStation]); setCapacityMinutes(value); }} onSave={() => void saveCapacity()} onRestore={() => void restoreCapacity()} /></fieldset>;
    if (tab === 'production') return <CakeProductionBoard tasks={tasks} branchId={branchId} initialOrderNumber={linkedOrderNumber || tasks.find((task) => task.id === Number(searchParams.get('tarea')))?.order?.orderNumber || ''} initialTaskId={Number(searchParams.get('tarea')) || undefined} onStatus={changeTask} onRefresh={load} />;
    if (tab === 'commissions') return <CommissionManager report={commissions} onRefresh={load} />;
    return <CakeFinanceBoard branchId={branchId} />;
  })();

  if (isLoadingBranches) return <main className="mx-auto max-w-8xl px-4 py-10 text-ink-muted">Cargando sucursales…</main>;
  return (
    <main className="mx-auto w-full max-w-8xl min-w-0 px-4 py-5 sm:px-6 sm:py-8 lg:px-8 lg:py-10">
      <PageHeader
        eyebrow="Operación de pastelería"
        title="Producción de pastelería"
        description="Configura la oferta, organiza los encargos y acompaña cada torta hasta su entrega."
        icon={Factory}
      />
      <Card shadow="e1" className="mb-6 border-brand-100 bg-white p-3 sm:p-4">
        <div className="flex min-w-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 items-center gap-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-card bg-brand-50 text-brand-700"><MapPin className="size-5" /></span>
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase tracking-[.14em] text-brand-700">Contexto de trabajo</p>
                <p className="mt-0.5 truncate text-sm font-bold text-ink">{tab === 'commissions' && isSuperAdmin && branchId === null ? 'Todas las sucursales' : 'Sucursal activa'}</p>
                <p className="text-xs text-ink-muted">Cambia de sede para consultar su capacidad y operación.</p>
              </div>
            </div>
            <div className="w-full min-w-0 sm:max-w-[300px]"><BranchSelector value={branchId} branches={branches} onChange={setBranchId} allowAll={isSuperAdmin} onSelectAll={setGlobalScope} hasError={Boolean(branchesError)} /></div>
          </div>
          <Button className="w-full shrink-0 sm:w-auto" size="sm" variant="outline" leftIcon={<RefreshCw className="size-4" />} onClick={() => void load()} isLoading={loading || refreshing} disabled={needsBranch && !branchId}>Actualizar sección</Button>
        </div>
      </Card>
      {branchesError && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-red-50 p-4 text-sm text-red-800"><span>{branchesError}</span><Button size="sm" variant="outline" onClick={() => void reloadBranches()}>Reintentar</Button></div>}
      <details className="group mb-6 overflow-hidden rounded-card border border-line bg-white shadow-e1">
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 bg-gradient-to-r from-brand-50 to-white px-4 py-3 text-sm font-black text-ink sm:px-5"><span className="flex items-center gap-2"><CheckCircle2 className="size-4 text-brand-700" /> Ruta del producto</span><span className="flex items-center gap-2 rounded-pill border border-brand-200 bg-white/80 px-3 py-1 text-xs font-semibold text-ink-muted">4 pasos <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" /></span></summary>
        <ol className="grid gap-0 border-t border-line sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['1', 'Definir', 'Crea el borrador y elige cómo se vende.'],
            ['2', 'Preparar', 'Completa receta, tiempos y revisión alimentaria.'],
            ['3', 'Ofrecer', 'Publica en Catálogo y configura capacidad por sucursal.'],
            ['4', 'Cumplir', 'Cotiza diseños, produce y registra costos.'],
          ].map(([number, title, detail]) => <li key={number} className="flex gap-3 border-b border-line p-4 last:border-b-0 md:border-b-0 md:border-r md:last:border-r-0"><span className="grid size-8 shrink-0 place-items-center rounded-full bg-brand-100 text-sm font-black text-brand-800">{number}</span><div><p className="text-sm font-bold">{title}</p><p className="mt-1 text-xs leading-5 text-ink-muted">{detail}</p></div></li>)}
        </ol>
      </details>
      <div className="mb-6 rounded-card border border-line bg-white p-2 shadow-e1">
        <label className="block px-2 pb-2 text-xs font-bold uppercase tracking-wide text-ink-muted sm:hidden" htmlFor="cakes-section-select">Sección de trabajo</label>
        <select id="cakes-section-select" value={tab} onChange={(event) => { setError(''); setTab(event.target.value as Tab); }} className="h-11 w-full rounded-xl border border-line bg-white px-3 text-sm font-bold text-ink sm:hidden">
          {visibleTabs.map(({ id, label }) => <option key={id} value={id}>{label}</option>)}
        </select>
        <div role="tablist" aria-label="Áreas de producción de tortas" className="hidden gap-2 overflow-x-auto pb-0.5 sm:flex">
          {visibleTabs.map(({ id, label, icon: Icon }) => <button type="button" role="tab" id={`cakes-tab-${id}`} aria-controls="cakes-tab-panel" aria-selected={tab === id} key={id} onClick={() => { setError(''); setTab(id); }} className={`flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-card px-4 py-2.5 text-left text-sm font-bold transition ${tab === id ? 'bg-brand-700 text-white shadow-sm' : 'text-ink-muted hover:bg-brand-50 hover:text-brand-800'}`}><Icon className="size-4 shrink-0" />{label}</button>)}
        </div>
      </div>
      <section role="tabpanel" id="cakes-tab-panel" aria-labelledby={`cakes-tab-${tab}`} className="min-w-0">
        {tab === 'overview' ? <Card className="border-brand-200 bg-gradient-to-br from-brand-50/90 via-white to-white p-4 sm:p-5">
          <div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-card bg-white text-brand-700 shadow-sm"><Info className="size-4" /></span><div><p className="text-[11px] font-black uppercase tracking-[.14em] text-brand-700">{activeTab?.label}</p><h2 className="mt-1 text-lg font-black text-ink">{help.purpose}</h2></div></div>
          <ol className="mt-4 grid gap-2 text-sm text-ink sm:grid-cols-3">{help.actions.map((action, index) => <li key={action} className="flex items-start gap-2 rounded-card border border-brand-100/80 bg-white/80 p-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-black text-brand-700">{index + 1}</span><span>{action}</span></li>)}</ol>
          <p className="mt-3 border-t border-brand-100 pt-3 text-xs leading-5 text-ink-muted"><strong>Resultado esperado:</strong> {help.result}</p>
        </Card> : <Card className="border-brand-200 bg-brand-50/60 p-4"><div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-card bg-white text-brand-700 shadow-sm"><Info className="size-4" /></span><div><p className="text-[11px] font-black uppercase tracking-[.14em] text-brand-700">{activeTab?.label}</p><h2 className="mt-1 text-base font-black text-ink">{help.purpose}</h2><p className="mt-1 text-xs leading-5 text-ink-muted">{help.result}</p></div></div></Card>}
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}</p>}
        <div className="mt-6 min-w-0" key={sourceKey}>{loadedSource === sourceKey ? content : loading ? <p>Cargando datos de la sucursal...</p> : null}</div>
      </section>
    </main>
  );
};

const CapacityBoard = ({ rows, date, station, minutes, onDate, onStation, onMinutes, onSave, onRestore }: {
  rows: StationCapacity[];
  date: string;
  station: Station;
  minutes: number;
  onDate: (value: string) => void;
  onStation: (value: Station) => void;
  onMinutes: (value: number) => void;
  onSave: () => void;
  onRestore: () => void;
}) => {
  const [page, setPage] = useState(1);
  const [scope, setScope] = useState<'selected' | 'upcoming'>('selected');
  const existing = rows.find((row) => row.workDate === date && row.station === station);
  const visibleRows = useMemo(() => scope === 'selected' ? rows.filter((row) => row.workDate === date) : rows, [date, rows, scope]);
  const totalPages = Math.max(1, Math.ceil(visibleRows.length / CAPACITY_PAGE_SIZE));
  const pageRows = visibleRows.slice((page - 1) * CAPACITY_PAGE_SIZE, page * CAPACITY_PAGE_SIZE);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const committed = (existing?.reservedMinutes ?? 0) + (existing?.confirmedMinutes ?? 0);
  const valid = Boolean(date) && Number.isInteger(minutes) && minutes >= committed && minutes <= 1440;
  const previewAvailable = Math.max(0, minutes - committed);
  const isClosed = minutes === 0;
  const savedCapacity = existing?.capacityMinutes ?? DEFAULT_STATION_CAPACITY[station];
  const dirty = minutes !== savedCapacity;
  return <section className="space-y-4">
    <Card className="border-brand-200 bg-brand-50/60 p-4"><div className="flex items-start gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-card bg-white text-brand-700 shadow-sm"><Info className="size-4" /></span><div><h2 className="text-base font-black text-ink">¿Qué significa esta pantalla?</h2><p className="mt-1 text-sm leading-5 text-ink-muted">Aquí defines cuántos minutos puede trabajar cada etapa de la cocina en un día. El sistema descuenta automáticamente los pedidos y te muestra cuánto queda disponible.</p></div></div><div className="mt-4 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-lg border border-brand-100 bg-white p-3"><strong className="text-ink">Capacidad planificada</strong><p className="mt-1 text-ink-muted">Minutos que decides ofrecer ese día. Este valor sí se puede editar.</p></div><div className="rounded-lg border border-brand-100 bg-white p-3"><strong className="text-ink">Reservado</strong><p className="mt-1 text-ink-muted">Minutos apartados temporalmente por pedidos en proceso de confirmación.</p></div><div className="rounded-lg border border-brand-100 bg-white p-3"><strong className="text-ink">Confirmado</strong><p className="mt-1 text-ink-muted">Minutos comprometidos por pedidos confirmados.</p></div><div className="rounded-lg border border-brand-100 bg-white p-3"><strong className="text-ink">Disponible</strong><p className="mt-1 text-ink-muted">Resultado automático: planificada menos reservado y confirmado.</p></div></div></Card>
    <Card className="p-5">
      <h2 className="text-lg font-black">Planifica el trabajo de una etapa</h2>
      <p className="mt-1 text-sm text-ink-muted">Elige un día y una etapa. Cambia solo la capacidad planificada; las reservas, confirmaciones y minutos libres se calculan automáticamente.</p>
      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <label className="text-sm font-bold">Día<input type="date" value={date} onChange={(event) => { onDate(event.target.value); setScope('selected'); setPage(1); }} className="mt-1 block w-full rounded-lg border border-line p-2 font-normal" /></label>
        <label className="text-sm font-bold">Etapa de producción<select value={station} onChange={(event) => onStation(event.target.value as Station)} className="mt-1 block w-full rounded-lg border border-line bg-white p-2 font-normal">{STATIONS.map((entry) => <option key={entry} value={entry}>{STATION_LABELS[entry]}</option>)}</select><span className="mt-1 block text-xs font-normal text-ink-muted">{STATION_HELP[station]}</span></label>
        <label className="text-sm font-bold">Capacidad planificada (minutos)<input type="number" min={committed} max="1440" value={minutes} disabled={isClosed} onChange={(event) => onMinutes(Number(event.target.value))} className="mt-1 block w-full rounded-lg border border-line p-2 font-normal disabled:cursor-not-allowed disabled:bg-surface-muted" /><span className="mt-1 block text-xs font-normal text-ink-muted">Máximo de minutos que ofreces para esta etapa ese día.</span></label>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 lg:col-span-3"><p className="text-xs leading-5 text-ink-muted">Los cambios se aplican a la etapa y fecha seleccionadas al guardarlos.</p><div className="flex flex-wrap gap-2"><Button leftIcon={<RefreshCw className="size-4" />} disabled={!valid || !dirty} onClick={onSave}>{isClosed ? 'Guardar cierre' : dirty ? 'Guardar cambios' : 'Guardar capacidad'}</Button><Button variant="outline" disabled={!existing || committed > 0 || dirty} onClick={onRestore}>Restaurar automático</Button>{dirty && <Button variant="ghost" onClick={() => onMinutes(savedCapacity)}>Descartar cambios</Button>}</div></div>
      </div>
      <label className="mt-4 flex items-start gap-3 rounded-xl border border-line bg-surface-muted/40 p-4 text-sm"><input type="checkbox" checked={isClosed} disabled={committed > 0} onChange={(event) => onMinutes(event.target.checked ? 0 : Math.max(committed, existing?.capacityMinutes || DEFAULT_STATION_CAPACITY[station], 1))} className="mt-0.5 size-4 accent-brand-600" /><span><strong>Cerrar esta etapa para nuevos pedidos</strong><span className="mt-1 block text-xs font-normal leading-5 text-ink-muted">Cero minutos bloquea pedidos nuevos en esta etapa. No puedes cerrarla si ya tiene minutos reservados o confirmados.</span></span></label>
      {dirty ? <div role="status" className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900"><strong>Cambio pendiente:</strong> la tabla conserva la capacidad guardada de {savedCapacity} min. Guarda los cambios para aplicar {minutes} min.</div> : <p className={`mt-3 text-xs ${minutes < committed ? 'font-semibold text-red-700' : 'text-ink-muted'}`}>{existing ? `Capacidad guardada: ${savedCapacity} min. Ya comprometidos: ${committed} min (reservados ${existing.reservedMinutes} + confirmados ${existing.confirmedMinutes}).` : `Se muestra el valor base automático de ${savedCapacity} min para esta fecha.`} {minutes < committed && 'No puedes reducirla por debajo de lo comprometido.'}</p>}
      <div className="mt-5 flex items-center justify-between gap-3 border-t border-line pt-4"><p className="text-sm font-bold text-ink">Resumen de disponibilidad</p><p className="text-xs text-ink-muted">{dirty ? 'Vista previa del cambio' : 'Valores guardados'}</p></div>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4"><div className={`rounded-xl border p-3 ${dirty ? 'border-amber-200 bg-amber-50' : 'border-line bg-white'}`}><p className="text-xs text-ink-muted">{dirty ? 'Nuevo plan' : 'Planificada'}</p><p className="mt-1 text-lg font-black text-ink">{minutes} min</p>{dirty && <p className="mt-1 text-[11px] text-amber-800">Sin guardar</p>}</div><div className="rounded-xl border border-line bg-white p-3"><p className="text-xs text-ink-muted">Reservada</p><p className="mt-1 text-lg font-black text-amber-800">{existing?.reservedMinutes ?? 0} min</p></div><div className="rounded-xl border border-line bg-white p-3"><p className="text-xs text-ink-muted">Confirmada</p><p className="mt-1 text-lg font-black text-brand-800">{existing?.confirmedMinutes ?? 0} min</p></div><div className="rounded-xl border border-brand-200 bg-brand-50 p-3"><p className="text-xs text-brand-800">Disponible estimada</p><p className="mt-1 text-lg font-black text-brand-900">{previewAvailable} min</p>{dirty && <p className="mt-1 text-[11px] text-brand-800">Al guardar</p>}</div></div>
    </Card>
    <Card className="p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface-muted/40 px-4 py-3"><div><p className="text-sm font-bold text-ink">Planificación de capacidad</p><p className="mt-0.5 text-xs text-ink-muted">La disponibilidad se calcula automáticamente con reservas y confirmaciones.</p></div><div className="flex rounded-lg border border-line bg-white p-1" role="group" aria-label="Alcance de la capacidad"><button type="button" onClick={() => { setScope('selected'); setPage(1); }} className={`rounded-md px-3 py-1.5 text-xs font-bold ${scope === 'selected' ? 'bg-brand-700 text-white' : 'text-ink-muted hover:bg-brand-50'}`}>Fecha seleccionada</button><button type="button" onClick={() => { setScope('upcoming'); setPage(1); }} className={`rounded-md px-3 py-1.5 text-xs font-bold ${scope === 'upcoming' ? 'bg-brand-700 text-white' : 'text-ink-muted hover:bg-brand-50'}`}>Próximos días</button></div></div>
      <div className="hidden overflow-x-auto md:block">
         <table className="w-full min-w-[640px] text-left text-sm"><caption className="sr-only">Capacidad planificada y disponibilidad por etapa</caption><thead className="bg-surface-muted text-xs uppercase text-ink-muted"><tr><th className="p-4">Fecha</th><th className="p-4">Etapa</th><th className="p-4">Planificada</th><th className="p-4">Reservada</th><th className="p-4">Confirmada</th><th className="p-4">Disponible</th></tr></thead><tbody>{pageRows.map((row) => <tr key={row.id} className="border-t border-line"><td className="p-4">{row.workDate}</td><td className="p-4 font-semibold">{STATION_LABELS[row.station]}</td><td className="p-4">{row.capacityMinutes} min</td><td className="p-4">{row.reservedMinutes} min</td><td className="p-4">{row.confirmedMinutes} min</td><td className="p-4 font-semibold">{Math.max(0, row.capacityMinutes - row.reservedMinutes - row.confirmedMinutes)} min</td></tr>)}</tbody></table>
      </div>
      <div className="grid gap-3 p-3 md:hidden">
        {pageRows.map((row) => <article key={row.id} className="rounded-xl border border-line bg-surface-muted/30 p-3">
          <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">{row.workDate}</p><h3 className="mt-1 font-bold text-ink">{STATION_LABELS[row.station]}</h3></div><span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-bold text-brand-800">{Math.max(0, row.capacityMinutes - row.reservedMinutes - row.confirmedMinutes)} min libres</span></div>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-xs"><div><dt className="text-ink-muted">Planificada</dt><dd className="font-semibold">{row.capacityMinutes} min</dd></div><div><dt className="text-ink-muted">Reservada</dt><dd className="font-semibold">{row.reservedMinutes} min</dd></div><div><dt className="text-ink-muted">Confirmada</dt><dd className="font-semibold">{row.confirmedMinutes} min</dd></div><div><dt className="text-ink-muted">Disponible</dt><dd className="font-semibold">{Math.max(0, row.capacityMinutes - row.reservedMinutes - row.confirmedMinutes)} min</dd></div></dl>
        </article>)}
      </div>
      {!rows.length && <p className="p-5 text-sm text-ink-muted">No hay capacidad registrada para esta sucursal. El sistema generará la planificación base automáticamente.</p>}
      {rows.length > 0 && !visibleRows.length && <p className="p-5 text-sm text-ink-muted">No hay capacidad para la fecha seleccionada. Cambia a “Próximos días” o guarda una excepción para este día.</p>}
      {visibleRows.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3"><p className="text-xs text-ink-muted">Mostrando {(page - 1) * CAPACITY_PAGE_SIZE + 1}–{Math.min(page * CAPACITY_PAGE_SIZE, visibleRows.length)} de {visibleRows.length} registros</p><Pagination page={page} totalPages={totalPages} onChange={setPage} /></div>}
    </Card>
  </section>;
};

export default CakeAdminPage;
