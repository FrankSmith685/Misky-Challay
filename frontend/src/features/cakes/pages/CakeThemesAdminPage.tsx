import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Building2, ExternalLink, Palette, Plus, Trash2 } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { PageHeader } from '@components/common/PageHeader';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Textarea } from '@components/ui/Textarea';
import { Select, SelectOption } from '@components/ui/Select';
import { Checkbox } from '@components/ui/Checkbox';
import { Modal } from '@components/ui/Modal';
import { FormGrid, FormStack, FormSection } from '@components/ui/FormSection';
import { useConfirm } from '@components/ui/ConfirmDialog';
import { MediaPicker } from '@features/admin/components/MediaPicker';
import { builderApi } from '@features/builder/services/builder.service';
import type { BuilderConfig } from '@features/builder/types';
import { usePermissions } from '@hooks/usePermissions';
import { PERM } from '@constants/permissions';
import { ROUTES } from '@constants/routes';
import { getApiErrorMessage } from '@services/api/client';
import { formatCurrency } from '@lib/format';
import { cakesApi, type CakeConfiguration, type RecipeInventoryItem } from '../cakes.service';
import { cakeThemesApi, type AdminCakeTheme, type CakeThemeDraft, type CakeThemeRule } from '../cakeThemes.service';

const empty = (productId = 0, lead = 72): CakeThemeDraft => ({ productId, name: '', theme: '', description: '', imageUrlsJson: [''], saleMode: 'CONFIGURED', minLeadHours: lead, minServings: 1, maxServings: 500, variantRulesJson: [], isActive: false, sortOrder: 0 });
const CakeThemesAdminPage = () => {
  const { can } = usePermissions();
  const canEdit = can(PERM.CATALOG_PRODUCT_WRITE) && can(PERM.CATALOG_CUSTOMIZATION_WRITE);
  const canPublish = can(PERM.CATALOG_PRODUCT_PUBLISH);
  const confirm = useConfirm();
  const [rows, setRows] = useState<AdminCakeTheme[]>([]);
  const [bases, setBases] = useState<CakeConfiguration[]>([]);
  const [inventory, setInventory] = useState<RecipeInventoryItem[]>([]);
  const [options, setOptions] = useState<BuilderConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ALL');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AdminCakeTheme | undefined>();
  const [draft, setDraft] = useState<CakeThemeDraft>(empty());
  const [baseline, setBaseline] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [themes, configuration, supplies] = await Promise.all([cakeThemesApi.admin(), canEdit ? cakesApi.configuration() : Promise.resolve([]), canEdit ? cakesApi.recipes() : Promise.resolve({ inventoryItems: [] })]);
      setRows(themes); setBases(configuration.filter((entry) => entry.product.family === 'CAKE' && entry.profile.saleMode === 'SEMI_CUSTOM'));
      setInventory(supplies.inventoryItems);
    } catch (cause) { setError(getApiErrorMessage(cause)); }
    finally { setLoading(false); }
  }, [canEdit]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    let active = true;
    setOptions(null);
    if (open && draft.productId) void builderApi.getConfig(draft.productId).then((result) => { if (active) setOptions(result); }).catch(() => { /* Una base retirada puede editarse como borrador. */ });
    return () => { active = false; };
  }, [open, draft.productId]);
  const base = bases.find((entry) => entry.product.id === draft.productId);
  const update = <K extends keyof CakeThemeDraft>(key: K, value: CakeThemeDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const updateRule = (variantId: number, change: Partial<CakeThemeRule>) => setDraft((current) => ({ ...current, variantRulesJson: current.variantRulesJson.map((rule) => rule.variantId === variantId ? { ...rule, ...change } : rule) }));
  const edit = (row?: AdminCakeTheme) => {
    const initial = row ? JSON.parse(JSON.stringify(row)) as CakeThemeDraft : empty(bases[0]?.product.id, bases[0]?.profile.minLeadHours);
    setEditing(row); setDraft(initial); setBaseline(JSON.stringify(initial)); setFormError(''); setOpen(true);
  };
  const close = async () => {
    if (busy) return;
    if (JSON.stringify(draft) !== baseline) {
      const result = await confirm({ title: 'Descartar cambios del diseño', message: 'Los cambios todavía no se guardaron.', confirmLabel: 'Descartar', cancelLabel: 'Seguir editando', tone: 'danger' });
      if (!result.confirmed) return;
    }
    setOpen(false);
  };
  const save = async () => {
    setFormError('');
    if (!draft.productId || draft.name.trim().length < 3 || draft.theme.trim().length < 2) { setFormError('Completa la torta base, el nombre y la temática.'); return; }
    setBusy(true);
    try {
      await cakeThemesApi.save({ ...draft, imageUrlsJson: draft.imageUrlsJson.filter(Boolean) }, editing);
      setOpen(false); toast.success('Diseño guardado'); await load();
    } catch (cause) { setFormError(getApiErrorMessage(cause)); }
    finally { setBusy(false); }
  };
  const toggle = async (row: AdminCakeTheme) => {
    const result = await confirm({ title: row.isActive ? 'Retirar diseño de Para empresas' : 'Publicar diseño', message: row.isActive ? 'Dejará de ofrecerse en Para empresas. Los pedidos y las solicitudes existentes conservan su información.' : 'Se comprobarán la torta base, las imágenes, los materiales y las reglas antes de ofrecerlo.', confirmLabel: row.isActive ? 'Retirar' : 'Publicar' });
    if (!result.confirmed) return;
    setBusy(true);
    try { if (row.isActive) await cakeThemesApi.archive(row); else await cakeThemesApi.save({ ...row, isActive: true }, row); await load(); }
    catch (cause) { setError(getApiErrorMessage(cause)); }
    finally { setBusy(false); }
  };
  const visible = rows.filter((row) => (status === 'ALL' || row.isActive === (status === 'ACTIVE')) && `${row.name} ${row.theme}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')));
  return <div>
    <PageHeader eyebrow="Para empresas" icon={Building2} title="Diseños para empresas" description="Gestiona los modelos de la sección Para empresas. Los diseños publicados conservan sus precios, materiales, opciones y tiempos de producción." action={<><Button component={Link} to={ROUTES.business} variant="outline" leftIcon={<ExternalLink className="size-4" />}>Ver página de empresas</Button><Button component={Link} to={ROUTES.adminCatalog} variant="outline" leftIcon={<ArrowLeft className="size-4" />}>Volver al catálogo</Button>{canEdit && <Button onClick={() => edit()} disabled={!bases.length || loading} leftIcon={<Plus className="size-4" />}>Nuevo diseño</Button>}</>} />
    {error && <div role="alert" className="mb-5 rounded-xl bg-red-50 p-4 text-sm text-red-800">{error}<Button onClick={() => void load()} className="ml-3" variant="outline" size="sm">Reintentar</Button></div>}
    <div className="mb-6 grid gap-4 rounded-card border border-line bg-white p-4 sm:grid-cols-[minmax(0,1fr)_240px]"><Input label="Buscar diseño o temática" value={search} onChange={(event) => setSearch(event.target.value)} /><Select label="Estado del diseño" value={status} onChange={(event) => setStatus(event.target.value)}><SelectOption value="ALL">Todos</SelectOption><SelectOption value="ACTIVE">Publicados</SelectOption><SelectOption value="DRAFT">No publicados</SelectOption></Select></div>
    {loading ? <p role="status">Cargando diseños…</p> : !visible.length ? <p className="rounded-card border border-line bg-white p-6 text-sm text-ink-muted">{rows.length ? 'No hay diseños con estos filtros.' : 'Crea un diseño, configura sus reglas y publícalo para mostrarlo en Para empresas.'}</p> : <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">{visible.map((row) => <article key={row.id} className="overflow-hidden rounded-card border border-line bg-white"><img src={row.imageUrlsJson[0] ?? '/images/cakes/custom.svg'} alt={row.name} className="aspect-[4/3] w-full bg-surface-muted object-cover" /><div className="p-5"><p className="text-xs font-semibold text-brand-700">{row.theme} · {row.isActive ? 'Publicado' : 'No publicado'}</p><h2 className="mt-2 text-lg font-bold">{row.name}</h2><p className="mt-1 text-sm text-ink-muted">{row.saleMode === 'CONFIGURED' ? 'Precio configurado por presentación' : 'Requiere cotización'} · {row.minLeadHours} h</p><div className="mt-4 flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={() => edit(row)} disabled={!canEdit || (row.isActive && !canPublish)}>Editar diseño</Button>{canEdit && canPublish && <Button size="sm" variant={row.isActive ? 'ghost' : 'primary'} disabled={busy} onClick={() => void toggle(row)}>{row.isActive ? 'Retirar' : 'Publicar'}</Button>}</div></div></article>)}</div>}

    <Modal isOpen={open} onClose={() => void close()} title={editing ? 'Editar diseño especial' : 'Nuevo diseño especial'} description="Cada modelo reutiliza la receta base y agrega sus propias reglas de decoración." icon={Palette} eyebrow="Para empresas" maxWidth="lg" disableBackdropClose actions={<><Button variant="outline" disabled={busy} onClick={() => void close()}>Cancelar</Button><Button isLoading={busy} onClick={() => void save()}>Guardar diseño</Button></>}>
      <FormStack spacing={3}>
        <FormSection title="Identidad y forma de venta" description="El cliente verá este nombre y las fotografías en Para empresas.">
          <FormStack><FormGrid>
            <Select label="Torta base" value={draft.productId || ''} onChange={(event) => { const next = bases.find((entry) => entry.product.id === Number(event.target.value)); setDraft((current) => ({ ...current, productId: Number(event.target.value), variantRulesJson: [], minLeadHours: next?.profile.minLeadHours ?? 72 })); }}>{bases.map((entry) => <SelectOption key={entry.product.id} value={entry.product.id}>{entry.product.name}</SelectOption>)}</Select>
            <Select label="Forma de venta del diseño" value={draft.saleMode} onChange={(event) => setDraft((current) => ({ ...current, saleMode: event.target.value as CakeThemeDraft['saleMode'], variantRulesJson: event.target.value === 'QUOTE' ? [] : current.variantRulesJson }))}><SelectOption value="CONFIGURED">Precio configurado</SelectOption><SelectOption value="QUOTE">Solicitar cotización</SelectOption></Select>
            <Input label="Nombre del diseño" value={draft.name} maxLength={120} onChange={(event) => update('name', event.target.value)} placeholder="Ej. Hombre Araña" />
            <Input label="Temática" value={draft.theme} maxLength={80} onChange={(event) => update('theme', event.target.value)} placeholder="Ej. Superhéroes" />
          </FormGrid><Textarea label="Descripción del diseño" value={draft.description} maxLength={2000} rows={3} onChange={(event) => update('description', event.target.value)} /><FormGrid><Input label="Anticipación mínima (horas)" type="number" min={0} max={720} value={draft.minLeadHours} onChange={(event) => update('minLeadHours', Number(event.target.value))} hint={`La torta base requiere ${base?.profile.minLeadHours ?? 0} h. Se aplicará el mayor plazo.`} /><Input label="Orden en la galería" type="number" min={0} max={10000} value={draft.sortOrder} onChange={(event) => update('sortOrder', Number(event.target.value))} /></FormGrid><Checkbox label="Publicar este diseño en Para empresas" checked={draft.isActive} disabled={!canPublish} onChange={(event) => update('isActive', event.target.checked)} /></FormStack>
        </FormSection>
        <FormSection title="Fotografías" description="Hasta cuatro imágenes. La primera se usa en la tarjeta de Para empresas.">
          <FormStack>{draft.imageUrlsJson.map((image, index) => <div key={index} className="flex min-w-0 items-start gap-2"><div className="min-w-0 flex-1"><MediaPicker value={image} category="products" subjectName={draft.name} label={index === 0 ? 'Imagen principal' : `Referencia ${index + 1}`} aspect={4 / 3} onChange={(next) => update('imageUrlsJson', draft.imageUrlsJson.map((url, i) => i === index ? next.url : url))} /></div>{draft.imageUrlsJson.length > 1 && <Button size="sm" variant="ghost" aria-label={`Quitar referencia ${index + 1}`} onClick={() => update('imageUrlsJson', draft.imageUrlsJson.filter((_, i) => i !== index))}><Trash2 className="size-4" /></Button>}</div>)}{draft.imageUrlsJson.length < 4 && <Button variant="outline" size="sm" onClick={() => update('imageUrlsJson', [...draft.imageUrlsJson, ''])}>Agregar otra referencia</Button>}</FormStack>
        </FormSection>
        <FormSection title={draft.saleMode === 'CONFIGURED' ? 'Presentaciones y decoración' : 'Porciones para solicitar'} description={draft.saleMode === 'CONFIGURED' ? 'El recargo se suma al precio de la presentación y sus opciones. Registra solo los materiales y minutos adicionales del diseño.' : 'La pastelería revisará cada solicitud y registrará los materiales, trabajo y precio en su propuesta.'}>
          <FormStack><FormGrid><Input label="Mínimo de porciones para cotizar" type="number" min={1} max={500} value={draft.minServings} onChange={(event) => update('minServings', Number(event.target.value))} /><Input label="Máximo de porciones para cotizar" type="number" min={1} max={500} value={draft.maxServings} onChange={(event) => update('maxServings', Number(event.target.value))} /></FormGrid>
          {draft.saleMode === 'CONFIGURED' && base?.variants.filter((variant) => variant.isActive).map((variant) => {
            const rule = draft.variantRulesJson.find((entry) => entry.variantId === variant.id);
            const groups = options?.groups.filter((group) => group.variantId === null || group.variantId === variant.id) ?? [];
            return <section key={variant.id} className="rounded-xl border border-line p-4 sm:p-5"><Checkbox label={<strong>{variant.name} · Base {formatCurrency(variant.basePrice)}</strong>} checked={Boolean(rule)} onChange={(event) => update('variantRulesJson', event.target.checked ? [...draft.variantRulesJson, { variantId: variant.id, priceDelta: 0, materials: [], effort: {}, excludedOptionIds: [], hiddenGroupIds: [] }] : draft.variantRulesJson.filter((entry) => entry.variantId !== variant.id))} />{rule && <div className="mt-4 space-y-5"><FormGrid><Input label={`Recargo del diseño · ${variant.name}`} type="number" min={0} step="0.01" value={rule.priceDelta} onChange={(event) => updateRule(variant.id, { priceDelta: Number(event.target.value) })} hint={`Desde ${formatCurrency(Number(variant.basePrice) + rule.priceDelta)} antes de extras.`} />{([['DESIGN', 'Diseño'], ['DECORATING', 'Decoración'], ['QA', 'Control de calidad']] as const).map(([station, label]) => <Input key={station} label={`${label} adicional (min)`} type="number" min={0} max={1440} value={rule.effort[station] ?? 0} onChange={(event) => updateRule(variant.id, { effort: { ...rule.effort, [station]: Number(event.target.value) } })} />)}</FormGrid>
              <div><h4 className="mb-3 text-sm font-semibold">Materiales adicionales por torta</h4><div className="space-y-3">{rule.materials.map((line, index) => <div key={index} className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_120px_44px]"><Select label="Artículo de inventario" value={line.inventoryItemId || ''} onChange={(event) => updateRule(variant.id, { materials: rule.materials.map((entry, i) => i === index ? { ...entry, inventoryItemId: Number(event.target.value) } : entry) })}>{inventory.map((item) => <SelectOption key={item.id} value={item.id}>{item.name} · {item.unit}</SelectOption>)}</Select><Input label="Cantidad" type="number" min={.01} step="0.01" value={line.quantity} onChange={(event) => updateRule(variant.id, { materials: rule.materials.map((entry, i) => i === index ? { ...entry, quantity: Number(event.target.value) } : entry) })} /><Button variant="ghost" aria-label="Quitar material" onClick={() => updateRule(variant.id, { materials: rule.materials.filter((_, i) => i !== index) })}><Trash2 className="size-4" /></Button></div>)}</div><Button variant="outline" size="sm" className="mt-3" onClick={() => updateRule(variant.id, { materials: [...rule.materials, { inventoryItemId: 0, quantity: 1 }] })}>Agregar material</Button></div>
              <details className="rounded-lg border border-line p-3"><summary className="cursor-pointer text-sm font-semibold">Opciones no compatibles ({rule.excludedOptionIds.length})</summary><p className="mt-2 text-xs leading-5 text-ink-muted">Marca las opciones que este acabado no admite. Los grupos obligatorios deben conservar suficientes opciones.</p><div className="mt-3 grid max-h-64 gap-1 overflow-y-auto sm:grid-cols-2">{groups.flatMap((group) => group.options.map((option) => <Checkbox key={`${group.id}-${option.id}`} label={`${group.name}: ${option.name}`} checked={rule.excludedOptionIds.includes(option.id)} onChange={(event) => updateRule(variant.id, { excludedOptionIds: event.target.checked ? [...rule.excludedOptionIds, option.id] : rule.excludedOptionIds.filter((id) => id !== option.id) })} />))}</div></details>
              <details className="rounded-lg border border-line p-3"><summary className="cursor-pointer text-sm font-semibold">Pasos definidos por este diseño ({rule.hiddenGroupIds?.length ?? 0})</summary><p className="mt-2 text-xs leading-5 text-ink-muted">Oculta un paso si el diseño ya incluye ese acabado. Registra sus materiales y tiempo arriba; el cliente no podrá elegir opciones de ese paso.</p><div className="mt-3 grid gap-1 sm:grid-cols-2">{groups.map((group) => <Checkbox key={group.id} label={group.name} checked={rule.hiddenGroupIds?.includes(group.id) ?? false} onChange={(event) => updateRule(variant.id, { hiddenGroupIds: event.target.checked ? [...(rule.hiddenGroupIds ?? []), group.id] : (rule.hiddenGroupIds ?? []).filter((id) => id !== group.id) })} />)}</div></details>
            </div>}</section>;
          })}</FormStack>
        </FormSection>
        {formError && <p role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-800">{formError}</p>}
      </FormStack>
    </Modal>
  </div>;
};
export default CakeThemesAdminPage;
