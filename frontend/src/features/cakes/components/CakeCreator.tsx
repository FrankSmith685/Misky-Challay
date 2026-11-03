import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CakeSlice, Plus } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { Modal } from '@components/ui/Modal';
import { ROUTES } from '@constants/routes';
import { PERM } from '@constants/permissions';
import { usePermissions } from '@hooks/usePermissions';
import { catalogAdminApi, type AdminProduct } from '@features/admin/services/catalogAdmin.service';
import { getApiErrorMessage } from '@services/api/client';
import { MediaPicker } from '@features/admin/components/MediaPicker';
import { formatCurrency } from '@lib/format';
import { cakesApi, type AvailableCakeGroup, type CakeCategory, type CakeProfile, type NewCakeGroup, type RecipeInventoryItem, type Station } from '../cakes.service';

type Line = { inventoryItemId: number; quantity: number; wastePercent: number };
const blankLine = (): Line => ({ inventoryItemId: 0, quantity: 0, wastePercent: 0 });
const blankGroup = (): NewCakeGroup => ({
  name: '', selectionType: 'SINGLE', maxSelection: 1,
  options: [{ name: '', priceDelta: 0, inventoryItemId: null, consumptionQuantity: 0 }],
});
const stations: Array<[Station, string]> = [
  ['DESIGN', 'Diseño'], ['BAKING', 'Horneado'], ['COOLING', 'Enfriado'],
  ['FILLING', 'Relleno'], ['DECORATING', 'Decoración'], ['QA', 'Calidad'], ['DISPATCH', 'Despacho'],
];
const initialEffort = (): Partial<Record<Station, number>> => ({ BAKING: 60, COOLING: 30, FILLING: 30, DECORATING: 60, QA: 15, DISPATCH: 10 });
const field = 'mt-1 w-full rounded-lg border border-line bg-white p-2 font-normal';

export const CakeCreator = ({ onCreated }: { onCreated: () => Promise<void> }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedProductId = Number(searchParams.get('producto'));
  const prefilledRef = useRef(false);
  const { can } = usePermissions();
  const canCreateCategory = can(PERM.CATALOG_CATEGORY_WRITE);
  const canRepairAllergens = can(PERM.ALLERGEN_WRITE);
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [items, setItems] = useState<RecipeInventoryItem[]>([]);
  const [groups, setGroups] = useState<AvailableCakeGroup[]>([]);
  const [categories, setCategories] = useState<CakeCategory[]>([]);
  const [existingProducts, setExistingProducts] = useState<AdminProduct[]>([]);
  const [configuredProduct, setConfiguredProduct] = useState<AdminProduct | null>(null);
  const [existingProductId, setExistingProductId] = useState(0);
  const [allergenOptionCount, setAllergenOptionCount] = useState<number | null>(null);
  const [repairingAllergens, setRepairingAllergens] = useState(false);
  const [categoryId, setCategoryId] = useState(0);
  const [categoryName, setCategoryName] = useState('');
  const [categoryImageUrl, setCategoryImageUrl] = useState('');
  const [categoryBusy, setCategoryBusy] = useState(false);
  const [categoryError, setCategoryError] = useState('');
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imageAlt, setImageAlt] = useState('');
  const [saleMode, setSaleMode] = useState<CakeProfile['saleMode']>('SEMI_CUSTOM');
  const [variantName, setVariantName] = useState('12 porciones');
  const [servings, setServings] = useState(12);
  const [yieldQuantity, setYieldQuantity] = useState(1);
  const [selectedGroups, setSelectedGroups] = useState<number[]>([]);
  const [newGroups, setNewGroups] = useState<NewCakeGroup[]>([]);
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [leadHours, setLeadHours] = useState(48);
  const [price, setPrice] = useState(0);
  const [effort, setEffort] = useState<Partial<Record<Station, number>>>(initialEffort);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const chooseExistingProduct = useCallback((product: AdminProduct | undefined) => {
    setStep(0);
    setExistingProductId(product?.id ?? 0);
    setName(product?.name ?? '');
    setDescription(product?.description ?? '');
    setImageUrl(product?.imageUrl ?? '');
    setImageAlt(product?.imageAlt ?? '');
    setCategoryId(product?.category?.id ?? 0);
    setSaleMode(product?.type === 'FIXED' ? 'STANDARD' : 'SEMI_CUSTOM');
    setVariantName(product?.variants[0]?.name ?? '12 porciones');
    setPrice(product?.variants[0]?.basePrice ?? 0);
    setServings(12);
    setYieldQuantity(1);
    setLines([blankLine()]);
    setSelectedGroups([]);
    setNewGroups([]);
    setLeadHours(48);
    setEffort(initialEffort());
    setError('');
  }, []);

  useEffect(() => {
    if (Number.isInteger(requestedProductId) && requestedProductId > 0) setOpen(true);
  }, [requestedProductId]);

  const refreshOptions = useCallback(async () => {
    setLoadingOptions(true);
    try {
      const [data, available, setup, catalogProducts] = await Promise.all([cakesApi.recipes(), cakesApi.availableGroups(), cakesApi.creationSetup(), catalogAdminApi.products().catch(() => [])]);
      const activeCategories = setup.categories;
      const convertible = catalogProducts.filter((product) => product.status === 'DRAFT' && !product.cakeProfile && product.variants.length === 1);
      const configured = catalogProducts.find((product) => product.cakeProfile && (product.cakeProfile.saleMode === 'SEMI_CUSTOM' || product.cakeProfile.saleMode === 'ADVANCED')) ?? null;
      setItems(data.inventoryItems); setGroups(available); setCategories(activeCategories); setExistingProducts(convertible); setConfiguredProduct(configured); setAllergenOptionCount(setup.allergenOptionCount);
      setError('');
      if (!prefilledRef.current) {
        const requested = requestedProductId > 0 ? convertible.find((product) => product.id === requestedProductId) : undefined;
        if (requested) chooseExistingProduct(requested);
        else if (requestedProductId > 0) setError('Este producto ya no es un borrador de una sola presentación sin perfil. Revisa su ficha en Catálogo.');
        else if (!configured && convertible.length === 1) chooseExistingProduct(convertible[0]);
        prefilledRef.current = true;
      }
      setCategoryId((current) => {
        if (activeCategories.some((category) => category.id === current)) return current;
        const exact = activeCategories.find((category) => category.slug === 'tortas');
        const cakeCategories = activeCategories.filter((category) => /tortas?/i.test(category.name));
        return exact?.id ?? (cakeCategories.length === 1 ? cakeCategories[0].id : 0);
      });
      setCategoryError('');
    } catch (cause) { setError(getApiErrorMessage(cause)); }
    finally { setLoadingOptions(false); }
  }, [chooseExistingProduct, requestedProductId]);
  useEffect(() => { if (open) void refreshOptions(); }, [open, refreshOptions]);

  const repairAllergens = async () => {
    setRepairingAllergens(true);
    try {
      const count = await catalogAdminApi.initializeAllergens();
      setAllergenOptionCount(count);
      setError('');
      toast.success('Opciones disponibles. Clasifica los insumos en Inventario antes de publicar la torta.');
    } catch (cause) { setError(getApiErrorMessage(cause)); }
    finally { setRepairingAllergens(false); }
  };

  const createCategory = async () => {
    const requestedName = categoryName.trim();
    if (requestedName.length < 3 || requestedName.length > 80) {
      setCategoryError('Escribe un nombre de 3 a 80 caracteres.');
      return;
    }
    setCategoryBusy(true); setCategoryError('');
    try {
      const created = await catalogAdminApi.createCategory({ name: requestedName, imageUrl: categoryImageUrl || null });
      setCategories((current) => [...current, { id: created.id, name: requestedName, slug: '' }]);
      setCategoryId(created.id); setCategoryName(''); setCategoryImageUrl(''); setError('');
      toast.success(`Categoría «${requestedName}» creada y seleccionada.`);
    } catch (cause) { setCategoryError(getApiErrorMessage(cause)); }
    finally { setCategoryBusy(false); }
  };

  const estimate = useMemo(() => lines.reduce((sum, line) => {
    const item = items.find((entry) => entry.id === line.inventoryItemId);
    return sum + line.quantity * (1 + line.wastePercent / 100) / Math.max(1, yieldQuantity) * Number(item?.unitCost ?? 0);
  }, 0), [items, lines, yieldQuantity]);
  const missingCosts = lines.some((line) => line.inventoryItemId > 0 && Number(items.find((item) => item.id === line.inventoryItemId)?.unitCost ?? 0) <= 0);
  const reset = () => {
    setStep(0); setName(''); setDescription(''); setImageUrl(''); setImageAlt(''); setSaleMode('SEMI_CUSTOM');
    setCategories([]); setExistingProducts([]); setConfiguredProduct(null); setExistingProductId(0); setCategoryId(0); setCategoryName(''); setCategoryImageUrl(''); setCategoryError(''); setAllergenOptionCount(null);
    setVariantName('12 porciones'); setServings(12); setYieldQuantity(1); setSelectedGroups([]); setNewGroups([]);
    setLines([blankLine()]); setLeadHours(48); setPrice(0); setEffort(initialEffort()); setError('');
    prefilledRef.current = false;
  };
  const clearRequestedProduct = () => {
    if (!searchParams.has('producto')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('producto');
    setSearchParams(next, { replace: true });
  };
  const close = () => {
    if (busy || categoryBusy || repairingAllergens) return;
    if ((name.trim() || price || lines.some((line) => line.inventoryItemId) || newGroups.length) && !window.confirm('¿Cerrar sin guardar? Se perderán los datos escritos en este asistente.')) return;
    setOpen(false); reset(); clearRequestedProduct();
  };
  const patchGroup = (index: number, patch: Partial<NewCakeGroup>) => {
    setNewGroups((current) => current.map((group, i) => i === index ? { ...group, ...patch } : group));
  };
  const patchOption = (groupIndex: number, optionIndex: number, patch: Partial<NewCakeGroup['options'][number]>) => {
    setNewGroups((current) => current.map((group, i) => i === groupIndex ? {
      ...group, options: group.options.map((option, j) => j === optionIndex ? { ...option, ...patch } : option),
    } : group));
  };
  const validate = (current: number): string => {
    if (current === 0) {
      if (!categories.some((category) => category.id === categoryId)) return 'Elige una categoría activa para esta torta antes de continuar.';
      if (name.trim().length < 3) return 'Escribe un nombre de al menos 3 caracteres.';
      if (name.trim().length > 120 || description.trim().length > 2000 || variantName.trim().length > 80) return 'Usa hasta 120 caracteres en el nombre, 2000 en la descripción y 80 en la presentación.';
      if (!variantName.trim()) return 'Indica la primera presentación.';
      if (!Number.isInteger(servings) || servings < 1 || servings > 500) return 'Indica entre 1 y 500 porciones.';
      if (saleMode === 'SEMI_CUSTOM' && !selectedGroups.length && !newGroups.length) return 'Selecciona un grupo existente o crea uno con opciones para esta torta.';
      if (selectedGroups.length > 20 || newGroups.length > 5) return 'Puedes reutilizar hasta 20 grupos y crear hasta 5 nuevos.';
      if (new Set(newGroups.map((group) => group.name.trim().toLowerCase())).size !== newGroups.length) return 'Cada grupo nuevo debe tener un nombre distinto.';
      for (const group of newGroups) {
        if (group.name.trim().length < 2 || group.name.trim().length > 80) return 'Cada grupo necesita un nombre de 2 a 80 caracteres.';
        if (!group.options.length || group.options.length > 20) return 'Cada grupo necesita entre 1 y 20 opciones.';
        if (!Number.isInteger(group.maxSelection) || group.maxSelection < 1 || group.maxSelection > Math.min(10, group.options.length)) return 'El máximo de elecciones no puede superar el número de opciones del grupo.';
        if (group.selectionType === 'SINGLE' && group.maxSelection !== 1) return 'Un grupo de elección única solo puede permitir una opción.';
        if (group.options.some((option) => option.name.trim().length < 2 || option.name.trim().length > 80 || !Number.isFinite(option.priceDelta) || option.priceDelta < 0 || option.priceDelta > 100000 || (option.inventoryItemId !== null && (!Number.isFinite(option.consumptionQuantity) || option.consumptionQuantity <= 0 || option.consumptionQuantity > 100000)))) return 'Completa cada opción: nombre, precio adicional válido y consumo positivo si enlazas un insumo.';
        if (new Set(group.options.map((option) => option.name.trim().toLowerCase())).size !== group.options.length) return 'No repitas nombres de opciones dentro de un mismo grupo.';
      }
    }
    if (current === 1) {
      if (!Number.isInteger(yieldQuantity) || yieldQuantity < 1 || yieldQuantity > 1000) return 'El rendimiento debe ser de 1 a 1000 tortas.';
      if (!lines.length || lines.length > 100 || lines.some((line) => !line.inventoryItemId || !Number.isFinite(line.quantity) || line.quantity <= 0 || line.quantity > 100000 || !Number.isFinite(line.wastePercent) || line.wastePercent < 0 || line.wastePercent > 100)) return 'Usa de 1 a 100 insumos con cantidad mayor que cero y hasta 100 000, y merma entre 0 y 100 %.';
      if (new Set(lines.map((line) => line.inventoryItemId)).size !== lines.length) return 'Cada insumo debe aparecer una sola vez. Suma las cantidades repetidas.';
    }
    if (current === 2) {
      if (!Number.isInteger(leadHours) || leadHours < 0 || leadHours > 720) return 'La anticipación debe ser de 0 a 720 horas.';
      if (!Number.isFinite(price) || price <= 0 || price > 100000) return 'Indica un precio positivo de hasta S/ 100 000.';
      if (stations.some(([id]) => !Number.isInteger(effort[id] ?? 0) || (effort[id] ?? 0) < 0 || (effort[id] ?? 0) > 1440) || !Object.values(effort).some((value) => value > 0)) return 'Indica minutos válidos y al menos una etapa con tiempo de trabajo.';
    }
    return '';
  };
  const next = () => {
    if (categoryBusy || repairingAllergens || loadingOptions) return;
    if (configuredProduct) {
      setStep(0);
      setError(`Ya existe la torta personalizable «${configuredProduct.name}». Edita ese producto desde Producción de tortas o Catálogo antes de crear otro.`);
      return;
    }
    const problem = validate(step);
    if (problem) { setError(problem); return; }
    setError(''); setStep((value) => value + 1);
  };
  const save = async () => {
    if (categoryBusy || repairingAllergens || loadingOptions) return;
    if (configuredProduct) {
      setStep(0);
      setError(`Ya existe la torta personalizable «${configuredProduct.name}». Edita ese producto desde Producción de tortas o Catálogo antes de crear otro.`);
      return;
    }
    const invalidStep = [0, 1, 2].find((candidate) => Boolean(validate(candidate)));
    if (invalidStep !== undefined) { setStep(invalidStep); setError(validate(invalidStep)); return; }
    setBusy(true); setError('');
    try {
      await cakesApi.createCake({
        ...(existingProductId ? { existingProductId } : {}),
        name: name.trim(), categoryId, description: description.trim(), imageUrl: imageUrl || null, imageAlt: imageUrl ? imageAlt.trim() || name.trim() : null, saleMode, minLeadHours: leadHours,
        variantName: variantName.trim(), servings, basePrice: price, yieldQuantity,
        groupIds: saleMode === 'SEMI_CUSTOM' ? selectedGroups : [],
        newGroups: saleMode === 'SEMI_CUSTOM' ? newGroups.map((group) => ({ ...group, name: group.name.trim(), options: group.options.map((option) => ({ ...option, name: option.name.trim() })) })) : [],
        effort, items: lines,
      });
    } catch (cause) {
      const message = getApiErrorMessage(cause);
      if (message.includes('categoría seleccionada')) { setStep(0); setCategoryId(0); }
      else if (message.includes('Ya existe una torta') || message.includes('grupos') || message.includes('opción')) setStep(0);
      setError(message); setBusy(false); return;
    }
    const converted = Boolean(existingProductId);
    setOpen(false); reset(); clearRequestedProduct(); setBusy(false);
    toast.success(converted ? 'Perfil y receta guardados. Clasifica los insumos y publica desde Catálogo.' : 'Borrador creado. Revisa sus opciones en Constructor y publica desde Catálogo.');
    try { await onCreated(); }
    catch (cause) { toast.error(`El borrador se creó, pero no se pudo actualizar la lista: ${getApiErrorMessage(cause)}`); }
  };

  return <>
    <Card className="flex flex-wrap items-center justify-between gap-4 p-5">
      <div><p className="text-xs font-black uppercase tracking-wider text-brand-700">Primero, configura la torta</p><h3 className="mt-1 text-lg font-black">Crear o completar una torta</h3><p className="mt-1 max-w-2xl text-sm text-ink-muted">Crea una nueva o completa un producto en borrador de Catálogo con perfil, receta, precio y tiempos. Clasifica sus insumos en Inventario y publícala.</p></div>
      <Button leftIcon={<Plus className="size-4" />} onClick={() => setOpen(true)}>Crear o completar torta</Button>
    </Card>
    <Modal isOpen={open} onClose={close} disableBackdropClose maxWidth="lg" icon={CakeSlice} eyebrow={`TORTA · PASO ${step + 1} DE 3`} title={configuredProduct ? 'Torta personalizable ya configurada' : existingProductId ? 'Completar producto como torta' : 'Crear borrador de torta'} description="Completa cada paso. La torta no aparecerá al cliente hasta que revises sus datos y la publiques en Catálogo." actions={<><Button variant="outline" onClick={close} disabled={busy || categoryBusy || repairingAllergens}>Cancelar</Button>{step > 0 && <Button variant="outline" onClick={() => { setError(''); setStep((value) => value - 1); }} disabled={busy || categoryBusy || repairingAllergens}>Atrás</Button>}{step < 2 ? <Button onClick={next} disabled={busy || categoryBusy || repairingAllergens || loadingOptions || Boolean(configuredProduct)}>Continuar</Button> : <Button onClick={() => void save()} isLoading={busy} disabled={busy || categoryBusy || repairingAllergens || loadingOptions || Boolean(configuredProduct)}>{existingProductId ? 'Guardar perfil y receta' : 'Crear borrador'}</Button>}</>}> 
      <nav aria-label="Pasos para crear la torta" className="grid grid-cols-3 gap-2 text-center text-xs font-bold">{['1. Producto', '2. Receta', '3. Venta y tiempos'].map((label, index) => <span key={label} className={`rounded-lg p-2 ${index === step ? 'bg-brand-700 text-white' : 'bg-surface-muted text-ink-muted'}`}>{label}</span>)}</nav>
      {error && <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {!loadingOptions && allergenOptionCount === 0 && <div role="status" className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        <p className="font-semibold">Faltan las opciones básicas de alérgenos.</p>
        <p className="mt-1">Puedes preparar el borrador, pero no publicarlo hasta cargar las opciones y clasificar sus insumos en Inventario. La categoría no necesita alérgenos.</p>
        {canRepairAllergens ? <Button size="sm" variant="outline" className="mt-3" isLoading={repairingAllergens} disabled={repairingAllergens} onClick={() => void repairAllergens()}>Cargar opciones básicas</Button> : <p className="mt-2 text-xs">Pide a una persona con permiso de catálogo que cargue las opciones básicas.</p>}
      </div>}
      {loadingOptions && <p className="mt-4 text-sm text-ink-muted">Cargando categorías, insumos y opciones…</p>}
      {(step === 0 || step === 1) && <Button size="sm" variant="outline" className="mt-4" disabled={loadingOptions || categoryBusy || repairingAllergens} onClick={() => void refreshOptions()}>Actualizar categorías, insumos y opciones</Button>}
      {step === 0 && <div className="mt-5 space-y-4">
        {configuredProduct && <div role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-bold">Ya existe una torta personalizable configurada</p>
          <p className="mt-1">«{configuredProduct.name}» ya tiene perfil y reglas de producción. Crear otra aquí duplicaría el producto y no estará permitido.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" component={Link} to={ROUTES.adminCakes} onClick={close}>Abrir Producción de tortas</Button>
            <Button size="sm" variant="outline" component={Link} to={`${ROUTES.adminCatalog}?producto=${configuredProduct.id}`} onClick={close}>Abrir ficha en Catálogo</Button>
          </div>
          {existingProducts.length > 0 && <p className="mt-3 text-xs font-semibold">También hay borradores sin perfil. Elimínalos desde Catálogo si son duplicados.</p>}
        </div>}
        {existingProducts.length > 0 && <div className="rounded-xl border border-brand-200 bg-brand-50 p-4">
          <label className="block text-sm font-bold" htmlFor="existing-cake-product">¿Ya creaste el producto en Catálogo?</label>
          <p className="mt-1 text-xs text-ink-muted">Selecciónalo para agregarle perfil de torta y receta. Se conserva el mismo producto y su foto; seguirá en borrador hasta que lo publiques.</p>
          <select id="existing-cake-product" className={field} value={existingProductId || ''} onChange={(event) => chooseExistingProduct(existingProducts.find((product) => product.id === Number(event.target.value)))} disabled={Boolean(configuredProduct)}>
            <option value="">Crear una torta nueva</option>
            {existingProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
          {existingProductId > 0 && <p className="mt-2 text-xs font-semibold text-brand-900">Revisa porciones, receta y tiempos: los valores precargados son orientativos. Al guardar, no se duplicará el producto.</p>}
        </div>}
        <div><h3 className="font-bold">¿Qué podrá pedir el cliente?</h3><p className="mt-1 text-sm text-ink-muted">La clásica se compra tal como está; la personalizable usa grupos de opciones; el diseño especial pasa por cotización.</p></div>
        <div className="rounded-xl border border-line bg-surface-muted p-4">
          <label className="block text-sm font-semibold" htmlFor="cake-category">Categoría del catálogo</label>
          <p className="mt-1 text-xs text-ink-muted">Agrupa esta torta en el catálogo. Puedes usar una categoría existente aunque su nombre sea distinto de «Tortas».</p>
          <select id="cake-category" className={field} value={categoryId || ''} onChange={(event) => { setCategoryId(Number(event.target.value)); setError(''); }} disabled={loadingOptions || categoryBusy}>
            <option value="">Selecciona una categoría activa</option>
            {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
          </select>
          {!loadingOptions && !categories.length && <p className="mt-2 text-sm text-amber-800">Aún no hay categorías activas. Crea una aquí o pide a quien administra Catálogo que active una.</p>}
          {!loadingOptions && categories.length > 0 && !categoryId && <p className="mt-2 text-xs text-amber-800">Elige la categoría que corresponda antes de preparar la receta.</p>}
          {canCreateCategory && <details className="mt-3 rounded-lg border border-line bg-white p-3">
            <summary className="cursor-pointer text-sm font-semibold">¿No aparece la categoría? Crear una nueva</summary>
            <p className="mt-2 text-xs text-ink-muted">La categoría se guarda ahora y quedará seleccionada para esta torta. El borrador de la torta se creará al terminar los tres pasos.</p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <label className="min-w-48 flex-1 text-xs font-semibold">Nombre de la categoría<input className={field} maxLength={80} value={categoryName} onChange={(event) => { setCategoryName(event.target.value); setCategoryError(''); }} placeholder="Ej.: Tortas de temporada" disabled={categoryBusy} /></label>
              <Button size="sm" variant="outline" onClick={() => void createCategory()} isLoading={categoryBusy} disabled={loadingOptions || categoryBusy}>Crear categoría</Button>
            </div>
            <div className="mt-3">
              <MediaPicker
                label="Imagen de esta categoría (opcional)"
                value={categoryImageUrl}
                altText={categoryName}
                category="categories"
                imagePurpose="category"
                subjectName={categoryName}
                aspect={4 / 3}
                hint="Se mostrará en el menú cuando la categoría tenga tortas publicadas. Puedes subir una foto o generar una propuesta con IA."
                onChange={(image) => setCategoryImageUrl(image.url)}
              />
            </div>
            {categoryError && <p role="alert" className="mt-2 text-sm text-red-800">{categoryError}</p>}
          </details>}
          {!canCreateCategory && !categories.length && <p className="mt-2 text-xs text-ink-muted">Necesitas el permiso para administrar categorías; tus datos del asistente se conservarán mientras esta ventana siga abierta.</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="text-sm font-semibold">Nombre de la torta<input className={field} value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej.: Torta de chocolate" /></label>
          <label className="text-sm font-semibold">Modo de venta<select className={field} value={saleMode} onChange={(event) => setSaleMode(event.target.value as CakeProfile['saleMode'])}><option value="STANDARD">Clásica</option><option value="SEMI_CUSTOM">Personalizable</option><option value="ADVANCED">Diseño especial</option></select></label>
          <label className="text-sm font-semibold sm:col-span-2">Descripción para el cliente<textarea className={field} rows={2} value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Sabor, cobertura y detalles útiles" /></label>
          <label className="text-sm font-semibold">Primera presentación<input className={field} value={variantName} onChange={(event) => setVariantName(event.target.value)} placeholder="Ej.: 12 porciones" /><span className="mt-1 block text-xs font-normal text-ink-muted">Puedes agregar más presentaciones en Catálogo.</span></label>
          <label className="text-sm font-semibold">Porciones de esta presentación<input type="number" min="1" max="500" className={field} value={servings} onChange={(event) => setServings(Number(event.target.value))} /></label>
        </div>
        <div className="rounded-xl border border-line bg-white p-4">
          <MediaPicker
            label="Imagen de referencia de la torta"
            value={imageUrl}
            altText={imageAlt}
            category="products"
            imagePurpose="cake"
            subjectName={name}
            subjectDescription={description}
            aspect={4 / 3}
            hint="Aparecerá en el menú cuando publiques la torta. Puedes subir una foto, elegir una existente o generar una propuesta con IA. Comprueba que represente lo que puedes elaborar."
            onChange={(image) => { setImageUrl(image.url); setImageAlt(image.altText); }}
          />
          <p className="mt-2 text-xs leading-5 text-ink-muted">Es opcional. Una imagen generada es ilustrativa; el resultado final depende de las opciones y de la preparación.</p>
        </div>
        {saleMode === 'SEMI_CUSTOM' && <section className="space-y-4 rounded-xl border border-line p-4">
          <div><h4 className="text-sm font-bold">Opciones que el cliente podrá elegir</h4><p className="mt-1 text-xs text-ink-muted">Crea aquí un grupo como «Relleno» y agrega las opciones concretas. Se guardará junto con la torta. Después, en Constructor, puedes dar a cada opción una imagen pública: subirla, elegirla o generarla con IA.</p></div>
          {newGroups.map((group, groupIndex) => <div key={groupIndex} className="space-y-3 rounded-xl border border-brand-100 bg-brand-50/40 p-4">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-sm font-bold">Grupo nuevo {groupIndex + 1}</p><p className="text-xs text-ink-muted">Un grupo es una pregunta para el cliente; cada opción es una respuesta posible.</p></div><Button size="sm" variant="outline" onClick={() => setNewGroups((current) => current.filter((_, i) => i !== groupIndex))}>Quitar grupo</Button></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-xs font-semibold">Nombre del grupo<input className={field} value={group.name} onChange={(event) => patchGroup(groupIndex, { name: event.target.value })} placeholder="Ej.: Relleno" /></label>
              <label className="text-xs font-semibold">¿Cuántas opciones puede elegir?<select className={field} value={group.selectionType} onChange={(event) => patchGroup(groupIndex, { selectionType: event.target.value as NewCakeGroup['selectionType'], maxSelection: 1 })}><option value="SINGLE">Solo una</option><option value="MULTIPLE">Varias</option></select></label>
              {group.selectionType === 'MULTIPLE' && <label className="text-xs font-semibold">Máximo de opciones<input type="number" min="1" max={Math.min(10, group.options.length)} className={field} value={group.maxSelection} onChange={(event) => patchGroup(groupIndex, { maxSelection: Number(event.target.value) })} /></label>}
            </div>
            <div className="space-y-2"><p className="text-xs font-bold">Respuestas disponibles</p>{group.options.map((option, optionIndex) => <div key={optionIndex} className="grid gap-2 rounded-lg border border-line bg-white p-3 sm:grid-cols-[1fr_120px_auto] sm:items-end">
              <label className="text-xs font-semibold">Nombre de la opción<input className={field} value={option.name} onChange={(event) => patchOption(groupIndex, optionIndex, { name: event.target.value })} placeholder="Ej.: Manjar blanco" /></label>
              <label className="text-xs font-semibold">Precio extra (S/)<input type="number" min="0" max="100000" step="0.01" className={field} value={option.priceDelta} onChange={(event) => patchOption(groupIndex, optionIndex, { priceDelta: Number(event.target.value) })} /></label>
              <Button size="sm" variant="outline" onClick={() => setNewGroups((current) => current.map((entry, i) => i === groupIndex ? { ...entry, options: entry.options.filter((_, j) => j !== optionIndex), maxSelection: Math.min(entry.maxSelection, Math.max(1, entry.options.length - 1)) } : entry))}>Quitar</Button>
              <label className="text-xs font-semibold sm:col-span-2">Insumo que consume (opcional)<select className={field} value={option.inventoryItemId ?? ''} onChange={(event) => patchOption(groupIndex, optionIndex, { inventoryItemId: event.target.value ? Number(event.target.value) : null, consumptionQuantity: 0 })}><option value="">Sin insumo adicional</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}</select></label>
              {option.inventoryItemId !== null && <label className="text-xs font-semibold">Cantidad por elección ({items.find((item) => item.id === option.inventoryItemId)?.unit ?? 'unidad del insumo'})<input type="number" min="0.01" max="100000" step="0.01" className={field} value={option.consumptionQuantity} onChange={(event) => patchOption(groupIndex, optionIndex, { consumptionQuantity: Number(event.target.value) })} /></label>}
            </div>)}</div>
            <Button size="sm" variant="outline" leftIcon={<Plus className="size-4" />} disabled={group.options.length >= 20} onClick={() => patchGroup(groupIndex, { options: [...group.options, { name: '', priceDelta: 0, inventoryItemId: null, consumptionQuantity: 0 }] })}>Agregar opción</Button>
          </div>)}
          <Button size="sm" variant="outline" leftIcon={<Plus className="size-4" />} disabled={newGroups.length >= 5} onClick={() => setNewGroups((current) => [...current, blankGroup()])}>Crear grupo para esta torta</Button>
          {groups.length > 0 && <details className="rounded-lg border border-line bg-white p-3"><summary className="cursor-pointer text-sm font-bold">O reutiliza un grupo existente</summary><p className="mt-2 text-xs text-ink-muted">Selecciona solo grupos cuyas opciones correspondan a esta torta. Los grupos existentes pueden estar compartidos con otros productos.</p><div className="mt-3 grid gap-2 sm:grid-cols-2">{groups.map((group) => <label key={group.id} className="flex items-start gap-2 rounded-lg border border-line px-3 py-2 text-sm"><input className="mt-1" type="checkbox" checked={selectedGroups.includes(group.id)} onChange={(event) => setSelectedGroups((current) => event.target.checked ? [...current, group.id] : current.filter((id) => id !== group.id))} /><span><strong>{group.name}</strong><span className="mt-1 block text-xs text-ink-muted">{group.options.map((option) => option.name).join(', ')}</span></span></label>)}</div></details>}
          {!newGroups.length && !selectedGroups.length && <p className="text-xs font-semibold text-amber-800">Crea un grupo con opciones o selecciona uno existente para continuar.</p>}
        </section>}
      </div>}
      {step === 1 && <div className="mt-5 space-y-4">
        <div><h3 className="font-bold">¿Qué insumos usa y para cuántas tortas alcanza?</h3><p className="mt-1 text-sm text-ink-muted">La receta calcula reservas y consumo de Inventario. Escribe cantidades en la unidad mostrada junto a cada insumo; la merma suma pérdidas previstas.</p></div>
        <label className="block max-w-xs text-sm font-semibold">Rendimiento de la receta (tortas)<input type="number" min="1" max="1000" className={field} value={yieldQuantity} onChange={(event) => setYieldQuantity(Number(event.target.value))} /></label>
        {!items.length && !loadingOptions && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">No hay insumos disponibles. <Link className="font-bold underline" to={ROUTES.adminInventory} target="_blank" rel="noopener noreferrer">Regístralos en Inventario</Link> para crear una receta.</p>}
        <div className="space-y-3">{lines.map((line, index) => <div key={index} className="grid gap-2 rounded-xl border border-line p-3 sm:grid-cols-[1fr_110px_110px_auto] sm:items-end"><label className="text-xs font-semibold">Insumo<select className={field} value={line.inventoryItemId} onChange={(event) => setLines((current) => current.map((entry, i) => i === index ? { ...entry, inventoryItemId: Number(event.target.value) } : entry))}><option value="0">Seleccionar</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}</select></label><label className="text-xs font-semibold">Cantidad<input type="number" min="0" step="0.01" className={field} value={line.quantity} onChange={(event) => setLines((current) => current.map((entry, i) => i === index ? { ...entry, quantity: Number(event.target.value) } : entry))} /></label><label className="text-xs font-semibold">Merma %<input type="number" min="0" max="100" step="0.1" className={field} value={line.wastePercent} onChange={(event) => setLines((current) => current.map((entry, i) => i === index ? { ...entry, wastePercent: Number(event.target.value) } : entry))} /></label><Button size="sm" variant="outline" onClick={() => setLines((current) => current.filter((_, i) => i !== index))}>Quitar</Button></div>)}</div>
        <Button size="sm" variant="outline" leftIcon={<Plus className="size-4" />} onClick={() => setLines((current) => [...current, blankLine()])}>Agregar insumo</Button>
        <div className="rounded-lg bg-surface-muted p-3 text-sm"><strong>Costo estimado de insumos por torta: {formatCurrency(estimate)}</strong>{missingCosts && <p className="mt-1 text-amber-800">Hay insumos sin costo registrado; esta estimación aún no es confiable.</p>}</div>
      </div>}
      {step === 2 && <div className="mt-5 space-y-4">
        <div><h3 className="font-bold">¿Cuándo y a qué precio puedes venderla?</h3><p className="mt-1 text-sm text-ink-muted">La anticipación limita las fechas de pedido. Los minutos por estación alimentan la capacidad de producción; cero significa que esa etapa no se usa.</p></div>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Anticipación mínima (horas)<input type="number" min="0" max="720" className={field} value={leadHours} onChange={(event) => setLeadHours(Number(event.target.value))} /></label><label className="text-sm font-semibold">Precio al cliente (S/)<input type="number" min="0.01" max="100000" step="0.01" className={field} value={price} onChange={(event) => setPrice(Number(event.target.value))} /></label></div>
        <fieldset><legend className="text-sm font-bold">Minutos necesarios por estación</legend><div className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-4">{stations.map(([id, label]) => <label key={id} className="text-xs font-semibold">{label}<input type="number" min="0" max="1440" className={field} value={effort[id] ?? 0} onChange={(event) => setEffort((current) => ({ ...current, [id]: Number(event.target.value) }))} /></label>)}</div></fieldset>
        <div className="rounded-xl border border-line p-4 text-sm"><p><strong>Categoría:</strong> {categories.find((category) => category.id === categoryId)?.name ?? 'Sin seleccionar'}</p><p className="mt-1"><strong>Precio:</strong> {formatCurrency(price)} · <strong>Insumos estimados:</strong> {formatCurrency(estimate)}</p><p className="mt-1 text-ink-muted">También influyen mano de obra, empaque, pagos y otros gastos. Podrás revisar el resultado en Costos y gastos.</p>{price > 0 && estimate > price && <p className="mt-2 rounded-lg bg-amber-50 p-2 font-semibold text-amber-900">El precio no cubre los insumos estimados. Revisa precio y receta antes de publicar.</p>}{missingCosts && <p className="mt-2 text-amber-800">Hay insumos sin costo registrado; el costo estimado puede ser mayor.</p>}</div>
        <p className="rounded-lg bg-brand-50 p-3 text-sm text-brand-900"><strong>Después de crear:</strong> {saleMode === 'SEMI_CUSTOM' && 'revisa el insumo, precio y alérgenos de cada opción en Constructor. '}Clasifica los insumos de la receta en Inventario y publícala desde Catálogo. El borrador aún no se ofrece al cliente.</p>
      </div>}
    </Modal>
  </>;
};
