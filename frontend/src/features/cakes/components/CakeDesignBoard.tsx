import { describeCakeVisualDesign } from '../utils/cakeVisualDesign';
import { CakeThemeReference } from './CakeThemeBanner';
import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, FileText, Palette, Search } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Badge } from '@components/ui/Badge';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { Modal } from '@components/ui/Modal';
import { Pagination } from '@components/ui/Pagination';
import { formatCurrency, formatDate } from '@lib/format';
import { getApiErrorMessage } from '@services/api/client';
import { cakesApi, type DesignRequest, type RecipeInventoryItem, type RecipeVariant, type Station } from '../cakes.service';

type Extra = { inventoryItemId: number; quantity: number };
const stations: Array<[Station, string]> = [
  ['DESIGN', 'Diseño'], ['BAKING', 'Horneado'], ['COOLING', 'Enfriado'],
  ['FILLING', 'Relleno'], ['DECORATING', 'Decoración'], ['QA', 'Calidad'], ['DISPATCH', 'Despacho'],
];
const field = 'mt-1 w-full rounded-lg border border-line bg-white p-2 font-normal';
const statusLabels: Record<string, string> = { ACCEPTED: 'Aceptada', REJECTED: 'Rechazada', QUOTED: 'Cotizada', PENDING: 'Pendiente', PROPOSED: 'Propuesta', SUPERSEDED: 'Reemplazada' };
const defaultTerms = 'El precio incluye la elaboración del diseño y acabado descritos. Los cambios posteriores requieren una nueva cotización.';
const defaultEffort = (): Partial<Record<Station, number>> => ({ DESIGN: 30, BAKING: 60, COOLING: 30, FILLING: 30, DECORATING: 60, QA: 15, DISPATCH: 15 });
const PAGE_SIZE = 6;

export const CakeDesignBoard = ({ designs, branchId, initialRequestId, onReference, onRefresh }: {
  designs: DesignRequest[];
  initialRequestId?: number;
  branchId: number | null;
  onReference: (request: DesignRequest, referenceId?: number) => Promise<void>;
  onRefresh: () => Promise<void>;
}) => {
  const [selected, setSelected] = useState<number | null>(null);
  const [price, setPrice] = useState('');
  const [labor, setLabor] = useState('0');
  const [packaging, setPackaging] = useState('0');
  const [proposedAt, setProposedAt] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [terms, setTerms] = useState(defaultTerms);
  const [flavor, setFlavor] = useState('');
  const [filling, setFilling] = useState('');
  const [finish, setFinish] = useState('');
  const [inscription, setInscription] = useState('');
  const [notes, setNotes] = useState('');
  const [effort, setEffort] = useState<Partial<Record<Station, number>>>(defaultEffort);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [inventory, setInventory] = useState<RecipeInventoryItem[]>([]);
  const [variants, setVariants] = useState<RecipeVariant[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState(initialRequestId ? String(initialRequestId) : '');
  useEffect(() => { if (initialRequestId) { setQuery(String(initialRequestId)); setStatusFilter('ALL'); } }, [initialRequestId]);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(1);
  useEffect(() => {
    void cakesApi.recipes().then((data) => { setInventory(data.inventoryItems); setVariants(data.variants); })
      .catch((cause) => setError(getApiErrorMessage(cause)));
  }, []);
  const request = designs.find((entry) => entry.id === selected);
  const filteredDesigns = useMemo(() => designs.filter((design) => {
    const term = query.trim().toLocaleLowerCase('es');
    const searchable = `${design.id} ${design.description} ${design.brief?.occasion ?? ''} ${design.brief?.theme ?? ''}`.toLocaleLowerCase('es');
    return (!term || searchable.includes(term)) && (statusFilter === 'ALL' || design.status === statusFilter);
  }), [designs, query, statusFilter]);
  const totalPages = Math.max(1, Math.ceil(filteredDesigns.length / PAGE_SIZE));
  const pageDesigns = filteredDesigns.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  useEffect(() => { setPage(1); }, [query, statusFilter]);
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const estimate = useMemo(() => {
    const variant = variants.find((entry) => entry.id === request?.variantId);
    const cost = (id: number) => Number(inventory.find((item) => item.id === id)?.unitCost ?? 0);
    const base = request?.requestKind === 'FREEFORM' ? 0 : variant?.recipe?.items.reduce((sum, line) => sum + line.quantity * (1 + line.wastePercent / 100) / Math.max(1, variant.recipe?.yieldQuantity ?? 1) * cost(line.inventoryItemId), 0) ?? 0;
    const additional = extras.reduce((sum, line) => sum + line.quantity * cost(line.inventoryItemId), 0);
    const missingCosts = request?.requestKind === 'FREEFORM' ? !extras.length || extras.some((line) => cost(line.inventoryItemId) <= 0) : !variant?.recipe?.items.length || [...(variant?.recipe?.items ?? []), ...extras].some((line) => cost(line.inventoryItemId) <= 0);
    return { base, additional, missingCosts, margin: Number(price || 0) * 0.85 - base - additional - Number(labor || 0) - Number(packaging || 0) };
  }, [request?.variantId, request?.requestKind, variants, inventory, extras, price, labor, packaging]);
  const close = () => {
    if (busy) return;
    if ((price || proposedAt || expiresAt || extras.length) && !window.confirm('¿Cerrar la cotización sin enviarla? Se perderán los datos de esta propuesta.')) return;
    setSelected(null); setError(''); setPrice(''); setLabor('0'); setPackaging('0');
    setProposedAt(''); setExpiresAt(''); setExtras([]); setTerms(defaultTerms); setEffort(defaultEffort());
    setFlavor(''); setFilling(''); setFinish(''); setInscription(''); setNotes('');
  };
  const propose = async () => {
    if (!branchId || !request) return;
    const delivery = new Date(proposedAt);
    const deadline = new Date(expiresAt);
    if (!Number.isFinite(Number(price)) || Number(price) <= 0 || Number(price) > 100000) { setError('Indica un precio entre S/ 0.01 y S/ 100 000.'); return; }
    if (!Number.isFinite(delivery.getTime()) || delivery <= new Date() || !Number.isFinite(deadline.getTime()) || deadline <= new Date()) { setError('Elige una entrega y una vigencia futuras.'); return; }
    if (deadline >= delivery) { setError('La cotización debe vencer antes de la entrega propuesta.'); return; }
    if (terms.trim().length < 5) { setError('Describe las condiciones con al menos 5 caracteres.'); return; }
    if (flavor.trim().length < 2 || filling.trim().length < 2 || finish.trim().length < 15) { setError('Confirma sabor, relleno y el diseño final con suficiente detalle antes de cotizar.'); return; }
    if (![labor, packaging].every((value) => Number.isFinite(Number(value)) && Number(value) >= 0)) { setError('Mano de obra y empaque deben ser importes no negativos.'); return; }
    if (extras.some((line) => !line.inventoryItemId || !Number.isFinite(line.quantity) || line.quantity <= 0)) { setError('Completa cada material adicional o quita la fila vacía.'); return; }
    if (request.requestKind === 'FREEFORM' && !extras.length) { setError('La torta a medida necesita una lista completa de insumos y cantidades.'); return; }
    if (new Set(extras.map((line) => line.inventoryItemId)).size !== extras.length) { setError('Cada material debe aparecer una sola vez.'); return; }
    if (stations.some(([station]) => !Number.isInteger(effort[station] ?? 0) || (effort[station] ?? 0) < 0 || (effort[station] ?? 0) > 1440)) { setError('Los minutos por estación deben estar entre 0 y 1440.'); return; }
    setBusy(true); setError('');
    try {
      await cakesApi.propose(request.id, {
        branchId, requestUpdatedAt: request.updatedAt, price: Number(price), effort, proposedAt: delivery.toISOString(),
        expiresAt: deadline.toISOString(), terms: terms.trim(),
        specification: { flavor: flavor.trim(), filling: filling.trim(), finish: finish.trim(), inscription: inscription.trim(), notes: notes.trim() },
        materialExtras: extras,
        estimatedLaborCost: Number(labor), estimatedPackagingCost: Number(packaging),
      });
      toast.success('Cotización enviada al cliente');
      setSelected(null); setExtras([]); setPrice(''); setProposedAt(''); setExpiresAt('');
      await onRefresh();
    } catch (cause) { setError(getApiErrorMessage(cause)); }
    finally { setBusy(false); }
  };

  return <section className="space-y-4">
    <Card className="border-brand-200 bg-gradient-to-br from-brand-50/90 via-white to-white p-4 sm:p-5">
      <div className="flex items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-brand-700 shadow-sm"><Palette className="size-5" /></span><div><p className="text-[11px] font-black uppercase tracking-[.14em] text-brand-700">Cómo funciona</p><h2 className="mt-1 text-base font-black text-ink">De una idea del cliente a una cotización</h2><p className="mt-1 text-sm leading-5 text-ink-muted">Este módulo atiende tortas que necesitan una propuesta manual antes de venderse.</p></div></div>
      <ol className="mt-4 grid gap-2 text-sm sm:grid-cols-2 xl:grid-cols-4">{[
        ['1', 'Recibir', 'El cliente envía ocasión, porciones, fecha, descripción y referencias.'],
        ['2', 'Revisar', 'Abre las referencias y confirma que el encargo se puede producir.'],
        ['3', 'Cotizar', 'Define precio, costos, materiales extra, tiempos, entrega y vigencia.'],
        ['4', 'Esperar aprobación', 'El cliente acepta la propuesta antes de pagar y convertirla en pedido.'],
      ].map(([number, title, detail]) => <li key={number} className="flex items-start gap-2 rounded-xl border border-brand-100 bg-white/80 p-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-black text-brand-700">{number}</span><span><strong className="text-ink">{title}</strong><span className="mt-1 block text-xs leading-5 text-ink-muted">{detail}</span></span></li>)}</ol>
      <div className="mt-4 flex items-start gap-2 rounded-xl border border-brand-100 bg-white p-3 text-xs leading-5 text-ink-muted"><FileText className="mt-0.5 size-4 shrink-0 text-brand-700" /><p><strong className="text-ink">Importante:</strong> preparar una cotización no crea un pedido ni descuenta inventario. La cotización se vincula al pedido cuando el cliente la acepta y completa el pago.</p></div>
    </Card>
    {error && !selected && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    {!designs.length && <Card className="border-dashed border-brand-200 bg-brand-50/30 p-6 sm:p-8"><div className="mx-auto max-w-2xl text-center"><span className="mx-auto grid size-12 place-items-center rounded-full bg-white text-brand-700 shadow-sm"><CheckCircle2 className="size-6" /></span><p className="mt-4 text-[11px] font-black uppercase tracking-[.14em] text-brand-700">Sin solicitudes todavía</p><h3 className="mt-1 text-lg font-black text-ink">Esta sucursal está lista para recibir diseños especiales</h3><p className="mt-2 text-sm leading-6 text-ink-muted">Las solicitudes aparecerán aquí cuando un cliente envíe una idea personalizada desde la web. No debes crear una solicitud manualmente desde este panel.</p><div className="mt-5 grid gap-2 text-left sm:grid-cols-3"><div className="rounded-xl border border-line bg-white p-3"><strong className="text-sm text-ink">El cliente envía</strong><p className="mt-1 text-xs leading-5 text-ink-muted">Brief, referencias, porciones y fecha deseada.</p></div><div className="rounded-xl border border-line bg-white p-3"><strong className="text-sm text-ink">Tú cotizas</strong><p className="mt-1 text-xs leading-5 text-ink-muted">Precio, costos, tiempos, materiales extra y vigencia.</p></div><div className="rounded-xl border border-line bg-white p-3"><strong className="text-sm text-ink">Se convierte en pedido</strong><p className="mt-1 text-xs leading-5 text-ink-muted">Solo después de que el cliente acepta y paga.</p></div></div></div></Card>}
    {designs.length > 0 && <Card className="p-4">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_220px] md:items-end">
        <label className="text-xs font-bold text-ink-muted">Buscar solicitud<span className="relative mt-1 block"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Número, ocasión, tema o descripción" className="h-11 w-full rounded-lg border border-line bg-white pl-9 pr-3 text-sm font-normal text-ink" /></span></label>
        <label className="text-xs font-bold text-ink-muted">Estado<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="mt-1 h-11 w-full rounded-lg border border-line bg-white px-3 text-sm font-normal text-ink"><option value="ALL">Todos</option>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      </div>
      <p className="mt-3 text-xs text-ink-muted">Mostrando {filteredDesigns.length ? (page - 1) * PAGE_SIZE + 1 : 0}–{Math.min(page * PAGE_SIZE, filteredDesigns.length)} de {filteredDesigns.length} solicitudes</p><p className="mt-2 text-xs leading-5 text-ink-muted"><strong className="text-ink">Estados:</strong> pendiente o propuesta requiere revisión; cotizada espera respuesta; aceptada o rechazada ya cerró la decisión del cliente.</p>
    </Card>}
    {designs.length > 0 && filteredDesigns.length === 0 && <Card className="p-5 text-sm text-ink-muted">No hay solicitudes que coincidan con los filtros actuales.</Card>}
    <div className="grid gap-4 md:grid-cols-2">{pageDesigns.map((design) => <Card key={design.id} className="min-w-0 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-black">Solicitud #{design.id}</h3><p className="mt-1 text-sm text-ink-muted">Entrega solicitada: {formatDate(design.desiredAt)} · {design.brief?.servings ?? 'Sin dato'} porciones</p></div><Badge variant={design.status === 'ACCEPTED' ? 'success' : 'warning'}>{statusLabels[design.status] ?? design.status}</Badge></div>
      <p className="mt-3 text-sm">{design.description || 'Sin descripción adicional.'}</p>
      {design.brief?.visualDesign && <p className="mt-2 rounded-lg bg-brand-50 p-3 text-xs leading-5 text-ink">{describeCakeVisualDesign(design.brief.visualDesign, design.hasReference)}</p>}
      {design.brief && <p className="mt-2 text-xs text-ink-muted">Ocasión: {design.brief.occasion || 'Sin dato'} · Tema: {design.brief.theme || 'Sin dato'} · Sabor: {design.brief.flavor || 'Por confirmar'} · Relleno: {design.brief.filling || 'Por confirmar'}</p>}
      {design.themeSnapshotJson && <CakeThemeReference theme={design.themeSnapshotJson} />}<div className="mt-3 flex flex-wrap gap-2">{design.hasReference && <Button size="sm" variant="outline" onClick={() => void onReference(design)}>Ver referencia 1</Button>}{design.referenceIds.map((id, index) => <Button key={id} size="sm" variant="outline" onClick={() => void onReference(design, id)}>Ver referencia {index + 2}</Button>)}</div>
      {design.quotes.length > 0 && <div className="mt-4 border-t border-line pt-3"><p className="text-xs font-bold">Cotizaciones enviadas</p>{design.quotes.map((quote) => <p key={quote.id} className="mt-1 text-sm">Versión {quote.version}: <strong>{formatCurrency(quote.price)}</strong> · {statusLabels[quote.status] ?? quote.status}</p>)}</div>}
      {design.status !== 'ACCEPTED' && design.status !== 'REJECTED' && <Button size="sm" className="mt-4" onClick={() => { setSelected(design.id); setError(''); setPrice(''); setLabor('0'); setPackaging('0'); setProposedAt(''); setExpiresAt(''); setExtras([]); setTerms(defaultTerms); setEffort(defaultEffort()); setFlavor(design.brief?.flavor ?? ''); setFilling(design.brief?.filling ?? ''); setFinish(design.description.startsWith('Me gustar') ? '' : design.description); setInscription(design.brief?.message ?? ''); setNotes(design.brief?.notes ?? ''); }}>Preparar cotización</Button>}
    </Card>)}</div>
    {filteredDesigns.length > 0 && <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4"><p className="text-xs text-ink-muted">Página {page} de {totalPages}</p><Pagination page={page} totalPages={totalPages} onChange={setPage} /></div>}
    <Modal isOpen={Boolean(request)} onClose={close} disableBackdropClose maxWidth="lg" icon={Palette} eyebrow={request?.requestKind === 'FREEFORM' ? 'TORTA A MEDIDA' : 'DISEÑO ESPECIAL'} title={request ? `Cotizar solicitud #${request.id}` : 'Cotizar diseño'} description="Revisa el encargo, calcula los costos y envía una propuesta con fecha disponible. El cliente decidirá si la acepta." actions={<><Button variant="outline" onClick={close} disabled={busy}>Cancelar</Button><Button onClick={() => void propose()} isLoading={busy} disabled={busy}>Enviar cotización</Button></>}>
      {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {request?.themeSnapshotJson && <CakeThemeReference theme={request.themeSnapshotJson} />}{request && <div className="mb-5 space-y-1 rounded-lg bg-brand-50 p-3 text-sm"><p><strong>Entrega solicitada:</strong> {formatDate(request.desiredAt)}</p>{request.brief?.servings && <p><strong>Porciones solicitadas:</strong> {request.brief.servings}</p>}<p><strong>Encargo:</strong> {request.description || 'Sin descripción adicional'}</p>{request.brief?.flavor && <p><strong>Bizcocho solicitado:</strong> {request.brief.flavor}</p>}{request.brief?.filling && <p><strong>Relleno solicitado:</strong> {request.brief.filling}</p>}{request.brief?.message && <p><strong>Texto solicitado:</strong> {request.brief.message}</p>}{request.brief?.notes && <p><strong>Notas del cliente:</strong> {request.brief.notes}</p>}{Boolean(request.brief?.selectedOptions?.length) && <p><strong>Opciones elegidas:</strong> {request.brief?.selectedOptions?.map((entry) => `${entry.group}: ${entry.option}${entry.quantity > 1 ? ` x${entry.quantity}` : ''}`).join(' · ')}</p>}<div className="flex flex-wrap gap-2 pt-2">{request.hasReference && <Button size="sm" variant="outline" onClick={() => void onReference(request)}>Ver referencia principal</Button>}{request.referenceIds.map((id, index) => <Button size="sm" variant="outline" key={id} onClick={() => void onReference(request, id)}>Ver referencia {index + 2}</Button>)}</div></div>}
      <div className="space-y-5">
        <section className="rounded-xl border border-brand-200 bg-brand-50/50 p-4"><h3 className="font-bold">Diseño que recibirá el cliente</h3><p className="mt-1 text-xs leading-5 text-ink-muted">Confirma aquí los detalles finales. Se guardarán junto al precio y pasarán al pedido de Producción. Si falta un dato en una solicitud antigua, acláralo con el cliente antes de enviar la propuesta.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Sabor del bizcocho<input type="text" maxLength={80} className={field} value={flavor} onChange={(event) => setFlavor(event.target.value)} placeholder="Ej. vainilla" /></label><label className="text-sm font-semibold">Relleno<input type="text" maxLength={80} className={field} value={filling} onChange={(event) => setFilling(event.target.value)} placeholder="Ej. fudge casero" /></label></div><label className="mt-3 block text-sm font-semibold">Diseño y acabado final<textarea rows={4} maxLength={1200} className={field} value={finish} onChange={(event) => setFinish(event.target.value)} placeholder="Colores, forma, decoraciones y cambios frente al modelo de referencia" /></label><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Texto en la torta (opcional)<input type="text" maxLength={160} className={field} value={inscription} onChange={(event) => setInscription(event.target.value)} /></label><label className="text-sm font-semibold">Detalles acordados (opcional)<textarea rows={2} maxLength={600} className={field} value={notes} onChange={(event) => setNotes(event.target.value)} /></label></div></section>
        <section><h3 className="font-bold">1. Precio y costos estimados</h3><p className="mt-1 text-xs text-ink-muted">Incluye materiales, mano de obra y empaque al fijar el precio.</p><div className="mt-3 grid gap-3 sm:grid-cols-3"><label className="text-sm font-semibold">Precio al cliente (S/)<input type="number" min="0.01" max="100000" step="0.01" className={field} value={price} onChange={(event) => setPrice(event.target.value)} /></label><label className="text-sm font-semibold">Mano de obra (S/)<input type="number" min="0" step="0.01" className={field} value={labor} onChange={(event) => setLabor(event.target.value)} /></label><label className="text-sm font-semibold">Empaque (S/)<input type="number" min="0" step="0.01" className={field} value={packaging} onChange={(event) => setPackaging(event.target.value)} /></label></div><p className="mt-2 text-xs text-ink-muted">{request?.requestKind === 'FREEFORM' ? 'Insumos completos estimados' : 'Receta base y extras estimados'}: {formatCurrency(estimate.base + estimate.additional)} · contribución estimada antes de pasarela y gastos generales: <strong>{formatCurrency(estimate.margin)}</strong>.</p>{estimate.missingCosts && <p className="mt-2 text-xs font-semibold text-amber-800">Faltan insumos o hay materiales sin costo registrado. La contribución estimada aún no es confiable.</p>}</section>
        <section className="border-t border-line pt-5"><h3 className="font-bold">{request?.requestKind === 'FREEFORM' ? '2. Insumos de toda la torta' : '2. Materiales adicionales'}</h3><p className="mt-1 text-xs text-ink-muted">{request?.requestKind === 'FREEFORM' ? 'Registra todos los insumos y cantidades para las porciones solicitadas. Estos serán la receta completa del pedido.' : 'Agrega solo insumos específicos de este diseño; la receta base ya está incluida.'}</p>{extras.map((line, index) => <div key={index} className="mt-3 grid gap-2 sm:grid-cols-[1fr_120px_auto] sm:items-end"><label className="text-xs font-semibold">Insumo<select className={field} value={line.inventoryItemId} onChange={(event) => setExtras((current) => current.map((entry, i) => i === index ? { ...entry, inventoryItemId: Number(event.target.value) } : entry))}><option value="0">Seleccionar</option>{inventory.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.unit})</option>)}</select></label><label className="text-xs font-semibold">Cantidad<input type="number" min="0" step="0.01" className={field} value={line.quantity} onChange={(event) => setExtras((current) => current.map((entry, i) => i === index ? { ...entry, quantity: Number(event.target.value) } : entry))} /></label><Button size="sm" variant="outline" onClick={() => setExtras((current) => current.filter((_, i) => i !== index))}>Quitar</Button></div>)}<Button size="sm" variant="outline" className="mt-3" onClick={() => setExtras((current) => [...current, { inventoryItemId: 0, quantity: 0 }])}>Agregar material</Button></section>
        <section className="border-t border-line pt-5"><h3 className="font-bold">3. Entrega y vigencia</h3><p className="mt-1 text-xs text-ink-muted">La entrega debe coincidir exactamente con el inicio de una franja activa. La propuesta debe vencer antes de esa fecha.</p><div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="text-sm font-semibold">Entrega propuesta<input type="datetime-local" className={field} value={proposedAt} onChange={(event) => setProposedAt(event.target.value)} /></label><label className="text-sm font-semibold">Cotización válida hasta<input type="datetime-local" className={field} value={expiresAt} onChange={(event) => setExpiresAt(event.target.value)} /></label></div></section>
        <section className="border-t border-line pt-5"><h3 className="font-bold">4. Trabajo y condiciones</h3><p className="mt-1 text-xs text-ink-muted">Estos minutos reservan capacidad en cada estación. Cero significa que esa etapa no se usa.</p><div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">{stations.map(([station, label]) => <label key={station} className="text-xs font-semibold">{label}<input type="number" min="0" max="1440" className={field} value={effort[station] ?? 0} onChange={(event) => setEffort((current) => ({ ...current, [station]: Number(event.target.value) }))} /></label>)}</div><label className="mt-4 block text-sm font-semibold">Condiciones para el cliente<textarea rows={3} className={field} value={terms} onChange={(event) => setTerms(event.target.value)} /></label></section>
      </div>
    </Modal>
  </section>;
};
