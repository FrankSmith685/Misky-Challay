import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Camera, Download, ScanLine } from 'lucide-react';
import { ROUTES } from '@constants/routes';
import { getApiErrorMessage } from '@services/api/client';
import { cakePreviewApi } from '../cakePreview.service';
import { cakePreviewUrl, isLocalPreviewUrl } from '../utils/cakePreviewLinks';
import { CAKE_AR_TARGET, cakeArDemo, cakeArPath, type CakeArInput } from '../ar/cakeAr';
import { createCakeArCard } from '../ar/createCakeArCard';

const CakeCardCamera = lazy(() => import('../components/CakeCardCamera').then((module) => ({ default: module.CakeCardCamera })));

const CakeCardArPage = () => {
  const [params] = useSearchParams();
  const token = params.get('vista') || '';
  const [loaded, setLoaded] = useState<{ token: string; input?: CakeArInput; error?: string } | null>(null);
  const [retry, setRetry] = useState(0);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [expired, setExpired] = useState(false);
  const closeCamera = useCallback(() => setCameraOpen(false), []);
  useEffect(() => {
    document.title = 'Una torta en tu mundo | Misky Challay';
    setCameraOpen(false);
    if (!token) return;
    let active = true;
    setLoaded(null);
    if (!/^[A-Za-z0-9_-]{24}$/.test(token)) { setLoaded({ token, error: 'El enlace de la torta no es válido.' }); return; }
    void cakePreviewApi.get(token).then((result) => {
      if (active) setLoaded({ token, input: { snapshot: result.snapshot, expiresAt: result.expiresAt } });
    }).catch((error) => { if (active) setLoaded({ token, error: getApiErrorMessage(error) }); });
    return () => { active = false; };
  }, [token, retry]);
  const input = useMemo<CakeArInput | undefined>(() => token ? loaded?.token === token ? loaded.input : undefined : { snapshot: cakeArDemo }, [loaded, token]);
  const error = loaded?.token === token ? loaded.error : '';
  useEffect(() => {
    const expiry = input?.expiresAt ? new Date(input.expiresAt).getTime() : null;
    setExpired(expiry !== null && expiry <= Date.now());
    if (expiry === null) return;
    const timer = window.setTimeout(() => { setExpired(true); setCameraOpen(false); }, Math.max(0, expiry - Date.now()));
    return () => window.clearTimeout(timer);
  }, [input]);
  const ready = Boolean(input && !expired);
  const url = new URL(cakeArPath(token || undefined), new URL(cakePreviewUrl('card')).origin).toString();
  const local = isLocalPreviewUrl(url);
  const secure = window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia);
  const download = async () => {
    if (!ready || busy) return;
    setBusy(true); setDownloadError('');
    try {
      const href = await createCakeArCard(url, input?.expiresAt);
      const link = document.createElement('a'); link.href = href; link.download = 'tarjeta-ar-misky-challay.png'; link.click();
    } catch (cause) { setDownloadError(cause instanceof Error ? cause.message : 'No se pudo descargar la tarjeta.'); }
    finally { setBusy(false); }
  };
  const button = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-field px-4 text-sm font-semibold disabled:opacity-50';
  return <div className="container-shell py-6 sm:py-10">
    <Link to={token ? ROUTES.cakePreview(token) : ROUTES.customCake} className="inline-flex min-h-10 items-center gap-2 text-sm font-semibold text-brand-700"><ArrowLeft className="size-4" />{token ? 'Volver al visor 3D' : 'Crea tu torta'}</Link>
    <div className="mt-5 grid items-center gap-8 rounded-card border border-line bg-white p-5 sm:p-8 lg:grid-cols-[1.05fr_1fr] lg:gap-12">
      <section>
        <span className="inline-flex items-center gap-2 rounded-pill bg-brand-50 px-3 py-1.5 text-xs font-semibold text-brand-700"><ScanLine className="size-4" /> Experiencia AR · piloto</span>
        <h1 className="mt-5 text-3xl font-bold leading-tight text-ink sm:text-4xl">Una torta que cobra vida<br /><span className="text-brand-700">en tu mundo.</span></h1>
        <p className="mt-4 max-w-lg text-sm leading-7 text-ink-muted">Escanea el QR, activa la cámara y enfoca la fotografía de nuestra tarjeta. La torta aparecerá sobre ella: acerca el celular y descubre sus lados.</p>
        <ol className="my-6 space-y-3 text-sm text-ink">{['Descarga e imprime la tarjeta en papel mate.', 'Apóyala en una mesa, con buena luz y sin reflejos.', 'Activa la cámara y mantén toda la foto a la vista.'].map((step, index) => <li key={step} className="flex items-center gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-pill bg-brand-50 text-xs font-bold text-brand-700">0{index + 1}</span>{step}</li>)}</ol>
        {error || expired ? <div role="alert" className="rounded-card border border-line bg-surface-muted p-4 text-sm"><p>{error || 'Esta vista compartida venció. Solicita un enlace nuevo.'}</p><button type="button" onClick={() => setRetry((value) => value + 1)} className={`${button} mt-3 border border-line bg-white`}>Volver a intentar</button></div> : !input ? <p role="status" className="py-4 text-sm text-ink-muted">Cargando tu torta compartida…</p> : <>
          <div className="flex flex-wrap gap-3"><button type="button" disabled={!secure || !ready} onClick={() => setCameraOpen(true)} className={`${button} bg-brand-700 text-white`}><Camera className="size-4" /> Activar cámara AR</button><button type="button" disabled={busy || !ready} onClick={() => void download()} className={`${button} border border-line bg-white text-ink`}><Download className="size-4" />{busy ? 'Preparando tarjeta…' : 'Descargar tarjeta'}</button></div>
          {!secure && <p role="status" className="mt-3 text-xs leading-5 text-ink-muted">La cámara necesita HTTPS y un navegador con acceso a la cámara. Puedes abrir el visor 3D desde el enlace de arriba.</p>}
          {downloadError && <p role="alert" className="mt-3 text-sm text-red-700">{downloadError}</p>}
          <p className="mt-4 text-xs leading-5 text-ink-muted">La cámara se activa con tu permiso. El reconocimiento ocurre en tu navegador y no envía el video al servidor.</p>
        </>}
      </section>
      <section className="min-w-0 overflow-hidden rounded-card border border-line bg-surface-muted" aria-label="Fotografía de la tarjeta AR">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-white px-4 py-3"><img src="/brand/misky-challay-wordmark.png" alt="Misky Challay" className="h-12 w-40 object-contain" /><span className="text-[10px] font-semibold uppercase tracking-widest text-brand-700">Tu momento dulce</span></div>
        <img src={CAKE_AR_TARGET} alt="Torta de chocolate y frambuesas: fotografía que debe reconocer la cámara" className="aspect-[3/2] w-full object-contain" />
        <div className="space-y-2 p-4 text-xs leading-5 text-ink-muted"><p className="font-semibold text-ink">Enfoca esta fotografía en la tarjeta descargada.</p><p>{token ? `Modelo: ${input?.snapshot.productName ?? 'tu torta compartida'}. ${input?.snapshot.visualDesign?.reconstruction ? 'Se usa la reconstrucción incluida en el enlace.' : 'Se usa una torta ilustrativa con las opciones compartidas.'}` : 'El piloto muestra una torta ilustrativa en 3D; la fotografía impresa sirve para reconocer la tarjeta.'}</p>{input?.expiresAt && <p>Este QR vence el {new Date(input.expiresAt).toLocaleString('es-PE', { timeZone: 'America/Lima' })}. Genera otro enlace si necesitas más tiempo.</p>}<p>Escala orientativa, ligada al tamaño impreso de la tarjeta.</p></div>
      </section>
    </div>
    {local && <p role="status" className="mt-4 rounded-card border border-line bg-white p-4 text-xs leading-5 text-ink-muted">Estás en una dirección local. Para que el QR abra en otro celular, descarga la tarjeta desde el dominio HTTPS público de la web.</p>}
    <div className="mt-6 flex flex-wrap items-center justify-between gap-3 text-sm"><p className="text-ink-muted">No necesitas instalar una aplicación ni registrarte.</p><Link to={ROUTES.customCake} className="inline-flex min-h-10 items-center gap-2 font-semibold text-brand-700">Diseñar mi torta <ArrowRight className="size-4" /></Link></div>
    {cameraOpen && input && <Suspense fallback={<p role="status" className="mt-3 text-sm">Preparando la experiencia AR…</p>}><CakeCardCamera input={input} onClose={closeCamera} /></Suspense>}
  </div>;
};
export default CakeCardArPage;
