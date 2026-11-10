import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CakeSlice, Clock3, RefreshCw } from 'lucide-react';
import { ROUTES } from '@constants/routes';
import { getApiErrorMessage } from '@services/api/client';
import { cakePreviewApi, type CakePreviewSnapshot } from '../cakePreview.service';
import { cakePreviewDestination, cakePreviewUrl } from '../utils/cakePreviewLinks';
import { cakePreviewDesign, type CakeVisualDesign } from '../utils/cakeVisualDesign';
import { cakeVisualDraftKey, writeCakeVisualDraft } from '../utils/cakeVisualDraft';

const Cake3dExperience = lazy(() => import('../components/Cake3dExperience').then((module) => ({ default: module.Cake3dExperience })));

const CakeSharedPreviewPage = () => {
  const { token = '' } = useParams<{ token: string }>();
  const [data, setData] = useState<{ snapshot: CakePreviewSnapshot; expiresAt: string } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const [preview, setPreview] = useState<{ design: CakeVisualDesign; reference: string | null } | null>(null);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setData(null);
    setPreview(null);
    cakePreviewApi.get(token).then((result) => { if (active) { setData(result); setPreview({ design: cakePreviewDesign(result.snapshot.visualDesign), reference: result.snapshot.referenceImageDataUrl ?? null }); } })
      .catch((cause) => { if (active) setError(getApiErrorMessage(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [token, retry]);
  useEffect(() => {
    document.title = data ? `${data.snapshot.themeName ?? data.snapshot.productName} en 3D | Misky Challay` : 'Vista compartida de torta | Misky Challay';
  }, [data]);
  const snapshot = data?.snapshot;
  const destination = snapshot ? cakePreviewDestination(snapshot, token) : ROUTES.customCake;
  const url = cakePreviewUrl(token);
  return <div className="container-shell py-6 sm:py-10">
    <Link to={ROUTES.customCake} className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-brand-700"><ArrowLeft className="size-4" /> Crea tu torta</Link>
    {loading ? <div role="status" className="mt-5 rounded-2xl border border-line bg-white p-8"><div className="h-64 animate-pulse rounded-xl bg-surface-muted" /><p className="mt-4 text-center text-sm text-ink-muted">Cargando la vista compartida…</p></div> : error || !snapshot || !data ? <section className="mx-auto mt-8 max-w-lg rounded-2xl border border-line bg-white p-6"><h1 className="text-2xl font-bold">Vista no disponible</h1><p className="mt-2 text-sm leading-6 text-ink-muted">{error || 'El enlace venció o ya no existe.'}</p><div className="mt-5 flex flex-wrap gap-3"><button type="button" onClick={() => setRetry((value) => value + 1)} className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-line px-3 text-sm font-semibold"><RefreshCw className="size-4" /> Volver a intentar</button><Link to={ROUTES.customCake} className="inline-flex min-h-10 items-center rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white">Crear mi torta</Link></div></section> : <>
      <header className="mt-5 flex items-start gap-3"><span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-700"><CakeSlice className="size-6" /></span><div><p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Una idea para compartir</p><h1 className="mt-1 text-2xl font-bold text-ink sm:text-3xl">{snapshot.themeName ?? snapshot.productName}</h1><p className="mt-1 text-sm text-ink-muted">{snapshot.variantName}{snapshot.servings ? ` · ${snapshot.servings} porciones` : ''}</p></div></header>
      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 rounded-2xl border border-line bg-white p-4 sm:p-6"><Suspense fallback={<p role="status" className="py-24 text-center text-sm text-ink-muted">Preparando el visor 3D…</p>}><Cake3dExperience key={token} config={snapshot} existingShare={{ token, url, expiresAt: data.expiresAt }} visualDesign={preview?.design} onDesignChange={(design) => setPreview((current) => ({ design, reference: current?.reference ?? null }))} referenceDataUrl={preview?.reference ?? null} allowShare={false} /></Suspense></div>
        <aside className="space-y-4 rounded-2xl border border-line bg-white p-5 lg:sticky lg:top-24"><h2 className="text-base font-bold text-ink">Esta combinación</h2>
          <p className="rounded-field border border-brand-100 bg-brand-50/70 px-3 py-3 text-xs leading-5 text-brand-900">La tarjeta AR se habilita después de confirmar tu pedido, cuando la combinación ya está definida.</p>
          {snapshot.options.length ? <dl className="space-y-3">{snapshot.options.map((entry, index) => <div key={`${entry.groupName}-${entry.optionName}-${index}`}><dt className="text-[11px] font-semibold text-ink-muted">{entry.groupName}</dt><dd className="mt-0.5 text-sm font-medium text-ink">{entry.optionName}{entry.quantity > 1 ? ` × ${entry.quantity}` : ''}</dd></div>)}</dl> : <p className="text-sm text-ink-muted">Aún no se habían elegido opciones.</p>}
          <div className="border-t border-line pt-4"><Link to={destination} onClick={() => { if (snapshot.configuration && preview) writeCakeVisualDraft(cakeVisualDraftKey(snapshot.productSlug, snapshot.themeSlug, token), preview.design, preview.reference); }} className="flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand-700 px-4 text-sm font-semibold text-white">{snapshot.configuration ? 'Continuar con estas opciones' : 'Crear una torta similar'}<ArrowRight className="size-4 shrink-0" /></Link><p className="mt-2 text-xs leading-5 text-ink-muted">{snapshot.configuration ? 'Recuperaremos la presentación y tu combinación para que puedas seguir personalizando. El precio y la disponibilidad se revisan al abrirla.' : 'La pastelería revisa los diseños a medida antes de confirmar precio y fecha.'}</p></div>
          <p className="flex items-start gap-2 text-[11px] leading-4 text-ink-muted"><Clock3 className="mt-0.5 size-3.5 shrink-0" /><span>Vista disponible hasta el {new Date(data.expiresAt).toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'long', year: 'numeric' })}.</span></p>
        </aside>
      </div>
    </>}
  </div>;
};

export default CakeSharedPreviewPage;
