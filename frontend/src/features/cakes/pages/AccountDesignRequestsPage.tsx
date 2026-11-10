import { useLiveRefresh } from '@services/realtime';
import { describeCakeVisualDesign } from '../utils/cakeVisualDesign';
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Clock3, Gift, MessageCircle, Palette, RefreshCw } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { PageHeader } from '@components/common/PageHeader';
import { EmptyState } from '@components/common/EmptyState';
import { Skeleton } from '@components/ui/Skeleton';
import { Button } from '@components/ui/Button';
import { useAppDispatch, useAppSelector } from '@app/hooks';
import { useAppState } from '@context/AppStateContext';
import { addItem } from '@features/cart/cartSlice';
import { catalogApi } from '@features/catalog/services/catalog.service';
import { geoApi } from '@features/geo/services/geo.service';
import { formatCurrency, formatDate } from '@lib/format';
import { getApiErrorMessage } from '@services/api/client';
import { ROUTES } from '@constants/routes';
import { useBusinessInfo } from '@services/businessInfo';
import { whatsappLink } from '@lib/whatsapp';
import { CakeThemeReference } from '../components/CakeThemeBanner';
import { DesignRequestDetailsEditor } from '../components/DesignRequestDetailsEditor';
import { cakesApi, type DesignQuote, type DesignRequest } from '../cakes.service';

const requestStatus: Record<string, { label: string; className: string }> = {
  SUBMITTED: { label: 'En revisión', className: 'bg-amber-50 text-amber-800' },
  QUOTED: { label: 'Esperando tu respuesta', className: 'bg-brand-50 text-brand-800' },
  ACCEPTED: { label: 'Aceptada', className: 'bg-green-50 text-green-800' },
  REJECTED: { label: 'No disponible', className: 'bg-surface-muted text-ink-muted' },
};
const quoteStatus: Record<string, string> = {
  PROPOSED: 'Por aceptar', ACCEPTED: 'Aceptada', SUPERSEDED: 'Reemplazada', EXPIRED: 'Vencida',
};
const allergenLabels: Record<string, string> = {
  gluten: 'Gluten', lacteos: 'Lácteos', huevo: 'Huevo', 'frutos-secos': 'Frutos secos',
  mani: 'Maní', mariscos: 'Mariscos', pescado: 'Pescado', sesamo: 'Sésamo', soya: 'Soya', sulfitos: 'Sulfitos',
};

const AccountDesignRequestsPage = () => {
  const business = useBusinessInfo();
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const cartItems = useAppSelector((state) => state.cart.items);
  const { branchId, openLocationModal } = useAppState();
  const [requests, setRequests] = useState<DesignRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<number | null>(null);
  const [editingRequest, setEditingRequest] = useState<DesignRequest | null>(null);

  const refresh = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    setError('');
    try { setRequests(await cakesApi.myDesigns()); }
    catch (cause) { setError(getApiErrorMessage(cause)); }
    finally { if (showLoading) setLoading(false); }
  }, []);
  useLiveRefresh(['designs'], refresh);
  useEffect(() => { void refresh(true); }, [refresh]);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('solicitud');
    if (!loading && id && requests.some((request) => String(request.id) === id)) {
      document.getElementById(`solicitud-${id}`)?.scrollIntoView({ block: 'start' });
    }
  }, [loading, requests]);

  const openReference = async (load: () => Promise<Blob>) => {
    try {
      const url = URL.createObjectURL(await load());
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (cause) { setError(getApiErrorMessage(cause)); }
  };

  const accept = async (quote: DesignQuote) => {
    setBusy(quote.id); setError('');
    try { await cakesApi.acceptQuote(quote.id); toast.success('Cotización aceptada'); await refresh(); }
    catch (cause) { setError(getApiErrorMessage(cause)); }
    finally { setBusy(null); }
  };

  const addAccepted = async (request: DesignRequest, quote: DesignQuote) => {
    if (branchId !== request.branchId) {
      setError('Selecciona la misma sucursal o dirección que usaste en la solicitud.');
      openLocationModal();
      return;
    }
    setBusy(quote.id); setError('');
    try {
      const [products, slots] = await Promise.all([
        catalogApi.getProducts({ branchId }), geoApi.getSlots(branchId, 30),
      ]);
      const product = products.find((entry) => entry.id === request.productId);
      const slot = slots.find((entry) => new Date(entry.startsAt).getTime() === new Date(quote.proposedAt).getTime());
      if (!product || !slot) throw new Error('La franja propuesta ya no está disponible. Solicita una nueva cotización.');
      if (cartItems.some((item) => item.preferredSlotId && item.preferredSlotId !== slot.id)) throw new Error('Las tortas de un mismo pedido deben compartir fecha y franja.');
      if (cartItems.some((item) => item.designQuoteId === quote.id)) throw new Error('Esta cotización ya está en el carrito.');
      dispatch(addItem({
        id: crypto.randomUUID(), productId: request.productId, slug: product.slug, variantId: request.variantId,
        name: request.themeSnapshotJson?.name ?? product.name,
        variantName: request.requestKind === 'FREEFORM' ? `A medida · ${request.brief?.servings ?? '?'} porciones` : product.defaultVariantName ?? 'Diseño especial',
        imageUrl: request.themeSnapshotJson?.imageUrl ?? product.imageUrl,
        quantity: 1, unitPrice: quote.price, extrasTotal: 0, lineTotal: quote.price,
        selections: request.selectionsJson.map((selection) => {
          const chosen = request.brief?.selectedOptions?.find((entry) => entry.optionId === selection.optionId);
          return { groupId: 0, groupName: chosen?.group ?? 'Diseño', optionId: selection.optionId, optionName: chosen?.option ?? 'Elección aprobada', quantity: selection.quantity, priceDelta: 0 };
        }),
        designQuoteId: quote.id, approvedDesignSummary: quote.terms, preferredSlotId: slot.id,
        preparationMode: product.preparationMode,
        requiresScheduledDelivery: true,
        requiresCarDelivery: product.family === 'CAKE',
        minLeadHours: product.minLeadHours ?? 0,
      }));
      navigate(ROUTES.cart);
    } catch (cause) { setError(getApiErrorMessage(cause)); }
    finally { setBusy(null); }
  };

  const proposedCount = requests.reduce((count, request) => count + request.quotes.filter((quote) => quote.status === 'PROPOSED').length, 0);
  const acceptedCount = requests.filter((request) => request.status === 'ACCEPTED').length;

  return <div className="min-w-0">
    <PageHeader eyebrow="Pastelería a tu medida" icon={Gift} title="Mis diseños" description="Consulta tus solicitudes, revisa cada propuesta y confirma los detalles antes de comprar." action={<Link to={ROUTES.business} className="text-sm font-semibold text-brand-700 hover:underline">Ver diseños especiales</Link>} />

    {!loading && requests.length > 0 && <div className="mb-6 grid gap-3 sm:grid-cols-3" aria-label="Resumen de mis diseños">
      {[
        { label: 'Solicitudes', value: requests.length, icon: Palette },
        { label: 'Por responder', value: proposedCount, icon: Clock3 },
        { label: 'Aceptadas', value: acceptedCount, icon: Gift },
      ].map(({ label, value, icon: Icon }) => <div key={label} className="flex items-center gap-3 rounded-card border border-line bg-surface-muted/40 p-4"><span className="grid size-10 place-items-center rounded-xl bg-brand-50 text-brand-700"><Icon className="size-5" /></span><div><p className="text-xs font-semibold text-ink-muted">{label}</p><p className="text-xl font-black text-ink">{value}</p></div></div>)}
    </div>}

    {loading && <div className="space-y-4">{[0, 1].map((key) => <Skeleton key={key} className="h-56 rounded-card" />)}</div>}
    {!loading && error && requests.length === 0 && <EmptyState icon={RefreshCw} title="No pudimos cargar tus diseños" description={error} action={<Button onClick={() => void refresh(true)}>Reintentar</Button>} />}
    {!loading && error && requests.length > 0 && <div role="alert" className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><span>{error}</span><Button size="sm" variant="outline" onClick={() => void refresh()}>Actualizar</Button></div>}
    {!loading && !error && requests.length === 0 && <EmptyState icon={Gift} title="Aún no tienes diseños" description="Elige un modelo especial y cuéntanos cómo quieres adaptarlo. Te enviaremos una cotización antes de comprar." action={<Button component={Link} to={ROUTES.business}>Explorar diseños</Button>} />}

    {!loading && requests.length > 0 && <div className="space-y-5">
      {requests.map((request) => {
        const state = requestStatus[request.status] ?? { label: request.status, className: 'bg-surface-muted text-ink-muted' };
        return <article key={request.id} id={`solicitud-${request.id}`} className="min-w-0 scroll-mt-24 overflow-hidden rounded-card border border-line bg-white shadow-e2">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line bg-surface-muted/30 p-4 sm:p-5">
            <div className="min-w-0"><p className="text-[11px] font-bold uppercase tracking-wider text-brand-700">Solicitud #{request.id}</p><h2 className="mt-1 text-lg font-black text-ink">{request.themeSnapshotJson?.name || request.brief?.theme || 'Diseño a medida'}</h2><p className="mt-1 text-xs text-ink-muted">Fecha solicitada: {formatDate(request.desiredAt)}{request.brief?.servings ? ` · ${request.brief.servings} porciones` : ''}</p></div>
            <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-3 py-1 text-xs font-bold ${state.className}`}>{state.label}</span>{whatsappLink(business.whatsappPhone ?? business.phone, `Hola, tengo una consulta sobre mi solicitud de diseño #${request.id}.`) && <Button component="a" href={whatsappLink(business.whatsappPhone ?? business.phone, `Hola, tengo una consulta sobre mi solicitud de diseño #${request.id}.`) ?? undefined} target="_blank" rel="noopener noreferrer" size="sm" variant="outline" leftIcon={<MessageCircle className="size-4" />}>Consultar por WhatsApp</Button>}{request.whatsappOptInAt && <Button size="sm" variant="ghost" onClick={() => { void cakesApi.stopDesignWhatsapp(request.id).then(() => { setRequests((current) => current.map((entry) => entry.id === request.id ? { ...entry, whatsappOptInAt: null } : entry)); toast.success('Avisos por WhatsApp desactivados para esta solicitud'); }).catch((cause) => toast.error(getApiErrorMessage(cause))); }}>Dejar de recibir avisos</Button>}</div>
          </div>
          <div className="space-y-4 p-4 sm:p-5">
            {request.themeSnapshotJson && <CakeThemeReference theme={request.themeSnapshotJson} />}
            <div><p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Lo que solicitaste</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-ink">{request.description}</p></div>
            {request.brief && <dl className="grid gap-x-6 gap-y-2 rounded-xl border border-brand-100 bg-brand-50/50 p-4 text-xs sm:grid-cols-2">
              {request.brief.visualDesign && <div className="sm:col-span-2"><dt className="font-semibold text-ink-muted">Diseño visual 3D</dt><dd className="mt-0.5 text-ink">{describeCakeVisualDesign(request.brief.visualDesign, request.hasReference)}</dd></div>}
              <div><dt className="font-semibold text-ink-muted">Ocasión</dt><dd className="mt-0.5 text-ink">{request.brief.occasion}</dd></div>
              {request.brief.servings && <div><dt className="font-semibold text-ink-muted">Porciones</dt><dd className="mt-0.5 text-ink">{request.brief.servings}</dd></div>}
              {request.brief.flavor && <div><dt className="font-semibold text-ink-muted">Bizcocho</dt><dd className="mt-0.5 text-ink">{request.brief.flavor}</dd></div>}
              {request.brief.filling && <div><dt className="font-semibold text-ink-muted">Relleno</dt><dd className="mt-0.5 text-ink">{request.brief.filling}</dd></div>}
              {request.brief.message && <div><dt className="font-semibold text-ink-muted">Texto en la torta</dt><dd className="mt-0.5 text-ink">{request.brief.message}</dd></div>}
              {request.brief.notes && <div><dt className="font-semibold text-ink-muted">Indicaciones</dt><dd className="mt-0.5 text-ink">{request.brief.notes}</dd></div>}
              {Boolean(request.brief.selectedOptions?.length) && <div className="sm:col-span-2"><dt className="font-semibold text-ink-muted">Opciones elegidas</dt><dd className="mt-0.5 text-ink">{request.brief.selectedOptions?.map((entry) => `${entry.group}: ${entry.option}${entry.quantity > 1 ? ` x${entry.quantity}` : ''}`).join(' · ')}</dd></div>}
            </dl>}
            {(request.hasReference || request.referenceIds.length > 0 || request.status === 'SUBMITTED') && <div className="flex flex-wrap items-center gap-2">
              {request.hasReference && <Button size="sm" variant="outline" onClick={() => void openReference(() => cakesApi.reference(request.id))}>Ver referencia principal</Button>}
              {request.referenceIds.map((id, index) => <Button key={id} size="sm" variant="outline" onClick={() => void openReference(() => cakesApi.referenceAttachment(request.id, id))}>Ver referencia {index + 2}</Button>)}
              {request.status === 'SUBMITTED' && <Button size="sm" variant="outline" onClick={() => setEditingRequest(request)}>Completar detalles</Button>}
            </div>}
          </div>
          {request.quotes.length > 0 && <div className="space-y-3 border-t border-line bg-surface-muted/30 p-4 sm:p-5">
            <h3 className="text-sm font-bold text-ink">Cotizaciones</h3>
            {request.quotes.map((quote) => <section key={quote.id} className="rounded-xl border border-brand-100 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold text-ink">Versión {quote.version} · {formatCurrency(quote.price)}</p><p className="mt-1 text-xs text-ink-muted">Entrega: {formatDate(quote.proposedAt)} · Vigente hasta: {formatDate(quote.expiresAt)}</p></div><span className="rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800">{quoteStatus[quote.status] ?? quote.status}</span></div>
              <div className="mt-4 rounded-lg bg-brand-50/60 p-3"><p className="text-xs font-bold uppercase tracking-wide text-brand-800">Diseño y condiciones propuestos</p><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-ink">{quote.terms}</p></div>
              {quote.allergenCodesJson && <p className="mt-3 text-xs leading-5 text-ink-muted">{quote.allergenCodesJson.length ? `Alérgenos de los insumos cotizados: ${quote.allergenCodesJson.map((code) => allergenLabels[code] ?? code).join(', ')}.` : 'Los insumos cotizados no tienen alérgenos declarados de la lista.'} Consulta al equipo si tienes una alergia; no se garantiza ausencia de contacto cruzado.</p>}
              <div className="mt-4 flex flex-wrap gap-2">{quote.status === 'PROPOSED' && <Button onClick={() => void accept(quote)} isLoading={busy === quote.id}>Aceptar cotización</Button>}{quote.status === 'ACCEPTED' && !quote.orderId && <Button onClick={() => void addAccepted(request, quote)} isLoading={busy === quote.id}>Agregar al carrito</Button>}{quote.orderId && <p className="text-sm font-semibold text-green-800">Pedido #{quote.orderId} registrado</p>}</div>
            </section>)}
          </div>}
        </article>;
      })}
    </div>}
    {editingRequest && <DesignRequestDetailsEditor key={editingRequest.id} request={editingRequest} onClose={() => setEditingRequest(null)} onSaved={() => refresh()} />}
  </div>;
};

export default AccountDesignRequestsPage;
