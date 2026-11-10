import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Camera, RefreshCw, ScanLine, ShieldCheck } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { ExperienceEmpty } from './ExperienceUI';
import { ExperienceViewer } from './ExperienceViewer';
import { ExperienceCamera } from './ExperienceCamera';
import { demoScene, experiencesApi, type ExperienceScene } from './experiences.service';
import { useExperienceMedia } from './useExperienceMedia';
import CakeCardArPage from '../cakes/pages/CakeCardArPage';
import { publicCakeWebOrigin } from '../cakes/utils/cakePreviewLinks';
import { trackUxEvent } from '@services/analytics';

/** Destino estable de la tarjeta impresa. Los enlaces de pedido siguen usando vista=:token. */
export default function ExperienceCampaignPage() {
  const [params] = useSearchParams();
  const hasToken = Boolean(params.get('vista'));
  const cameraRequested = params.get('camera') === '1';
  const [scene, setScene] = useState<ExperienceScene | null>(null);
  const [error, setError] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const cameraAutoOpenKey = useRef('');
  const closeCamera = useCallback(() => setCameraOpen(false), []);

  useEffect(() => {
    if (hasToken) return;
    document.title = 'Experiencia AR | Misky Challay';
    void trackUxEvent('AR_QR_OPEN', { source: 'stable-campaign' });
    let active = true;
    void experiencesApi.campaign().then((value) => {
      if (active) setScene(value.scene);
    }).catch(() => {
      if (active) setError('La experiencia estable todavía no está publicada. Puedes probar la demostración mientras el equipo la configura.');
    });
    return () => { active = false; };
  }, [hasToken]);

  const current = scene ?? (error ? demoScene : null);
  const media = useExperienceMedia(hasToken ? null : current, '/experiences/public/campaign', !scene);
  const cameraAvailable = window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia);

  useEffect(() => {
    if (!cameraRequested) {
      cameraAutoOpenKey.current = '';
      return;
    }
    if (!current || media.loading || media.error || !cameraAvailable) return;
    if (cameraAutoOpenKey.current === 'campaign') return;
    cameraAutoOpenKey.current = 'campaign';
    setCameraOpen(true);
  }, [cameraAvailable, cameraRequested, current, media.error, media.loading]);

  const url = `${publicCakeWebOrigin()}/experiencia-ar?camera=1`;
  if (hasToken) return <CakeCardArPage />;

  return (
    <section className="container-shell py-6 sm:py-9" aria-label="Experiencia AR estable">
      <div className="mx-auto w-full max-w-[88rem]">
        <header className="exp-hero mb-7 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="max-w-2xl">
            <p className="exp-kicker mb-3">Misky Challay · tarjeta impresa</p>
            <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">Una torta que cobra vida</h1>
            <p className="mt-3 text-sm leading-7 text-white/80">Escanea el QR de tu tarjeta, autoriza la cámara y enfoca el marcador configurado por nuestro equipo.</p>
          </div>
          <span className="inline-flex items-center gap-2 rounded-pill border border-white/20 bg-white/10 px-3 py-2 text-xs font-semibold text-white"><ShieldCheck size={14} /> Acceso seguro desde el navegador</span>
        </header>
        <ol className="mb-7 grid gap-3 sm:grid-cols-3" aria-label="Pasos para usar la tarjeta AR">
          {[
            ['01', 'Escanea el QR', 'Abre esta dirección estable desde tu celular.'],
            ['02', 'Autoriza la cámara', 'Acepta el permiso cuando el navegador lo solicite.'],
            ['03', 'Enfoca y disfruta', 'Espera la carga y apunta al marcador completo.'],
          ].map(([number, title, text]) => <li key={number} className="flex items-start gap-3 rounded-card border border-line bg-white p-4"><span className="grid size-9 shrink-0 place-items-center rounded-pill bg-brand-50 text-xs font-bold text-brand-700">{number}</span><span><strong className="block text-sm text-ink">{title}</strong><span className="mt-1 block text-xs leading-5 text-ink-muted">{text}</span></span></li>)}
        </ol>
        {error && <div className="exp-panel mb-5"><ExperienceEmpty icon={ScanLine} title="Modo demostración" description={error} action={<Button component="a" href="/experiencia-ar" leftIcon={<RefreshCw size={15} />}>Volver a intentar</Button>} /></div>}
        {!current || media.loading ? <div role="status" className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]"><div className="h-[430px] animate-pulse rounded-card bg-brand-50" /><div className="grid content-start gap-4"><div className="h-52 animate-pulse rounded-card bg-surface-muted" /><p className="text-sm text-ink-muted">Preparando la experiencia…</p></div></div> : <ExperienceViewer scene={current} media={media.media} url={url} mode={current.content === 'VIDEO' ? 'VIDEO' : 'AR'} layout="showcase" />}
        <p className="mt-5 flex items-center justify-center gap-2 text-center text-xs leading-5 text-ink-muted"><Camera size={14} /> La cámara necesita HTTPS. Si no está disponible, continúa con la vista 3D.</p>
        {cameraOpen && current && !media.error && <ExperienceCamera input={{ snapshot: current, media: media.media }} onClose={closeCamera} />}
      </div>
    </section>
  );
}
