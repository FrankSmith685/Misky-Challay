import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpRight,
  Box,
  Camera,
  CalendarDays,
  Play,
  QrCode,
  RefreshCw,
  ScanLine,
  Sparkles,
} from 'lucide-react';
import { ExperienceEmpty } from './ExperienceUI';
import { Button } from '@components/ui/Button';
import { publicCakeWebOrigin } from '../cakes/utils/cakePreviewLinks';
import { demoScene, experiencesApi, type ExperienceScene } from './experiences.service';
import { useExperienceMedia } from './useExperienceMedia';
import { ExperienceViewer } from './ExperienceViewer';
import { ExperienceCamera } from './ExperienceCamera';
import { trackUxEvent } from '@services/analytics';

export default function ExperiencePage() {
  const { token } = useParams();
  const [searchParams] = useSearchParams();
  const demo = token === 'demo';
  const cameraRequested = searchParams.get('camera') === '1';
  const [cameraOpen, setCameraOpen] = useState(false);
  const cameraAutoOpenKey = useRef('');
  const closeCamera = () => setCameraOpen(false);
  const [data, setData] = useState<{
    key: string;
    scene: ExperienceScene;
    expiresAt?: string;
  } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    void trackUxEvent('AR_QR_OPEN', { source: demo ? 'demo' : 'shared' });
    let active = true;
    setError('');
    const refresh = () => {
      if (!demo && token)
        void experiencesApi
          .public(token)
          .then((value) => {
            if (active) {
              setError('');
              setData((previous) =>
                JSON.stringify(previous) === JSON.stringify({ ...value, key: token })
                  ? previous
                  : { ...value, key: token },
              );
            }
          })
          .catch(() => {
            if (active)
              setError(
                'Esta experiencia no está disponible. Puede estar en revisión, pausada o haber vencido.',
              );
          });
    };
    refresh();
    const timer = !demo ? window.setInterval(refresh, 15000) : undefined;
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [demo, token]);
  const current = demo
    ? { scene: demoScene, expiresAt: undefined }
    : data?.key === token
      ? data
      : null;
  const {
    media,
    loading,
    error: mediaError,
  } = useExperienceMedia(current?.scene ?? null, `/experiences/public/${token}`, demo);
  const cameraAvailable = window.isSecureContext && Boolean(navigator.mediaDevices?.getUserMedia);
  const cameraTargetKey = current ? (token ?? 'demo') : '';
  useEffect(() => {
    if (!cameraRequested) {
      cameraAutoOpenKey.current = '';
      return;
    }
    if (!cameraTargetKey || loading || mediaError || !cameraAvailable) return;
    if (cameraAutoOpenKey.current === cameraTargetKey) return;
    cameraAutoOpenKey.current = cameraTargetKey;
    setCameraOpen(true);
  }, [cameraAvailable, cameraRequested, cameraTargetKey, loading, mediaError]);
  const url = `${publicCakeWebOrigin()}/experiencias/${encodeURIComponent(token ?? '')}?camera=1`;
  return (
    <section className="container-shell py-6 sm:py-9" aria-label="Experiencia QR">
      <div className="mx-auto w-full max-w-[88rem]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link
            to="/empresas"
            className="inline-flex min-h-10 items-center gap-2 text-xs font-semibold text-ink-muted hover:text-brand-700"
          >
            <ArrowLeft size={14} />
            Para empresas
          </Link>
          <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-ink-muted">
            <Sparkles size={13} className="text-accent-600" />
            Un detalle que cobra vida
          </span>
        </div>
        <header className="exp-hero mb-7 flex items-center justify-between gap-6">
          <div className="max-w-2xl">
            <p className="exp-kicker mb-3">
              {demo ? 'Demostración QR · Misky Challay' : 'Una experiencia para tu celebración'}
            </p>
            <h1 className="text-3xl font-extrabold leading-tight sm:text-4xl">
              {demo ? 'Una torta que cobra vida' : 'Tu experiencia personalizada'}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-white/75">
              {demo
                ? 'Una torta 3D, una dedicatoria y un saludo especial. Todo desde una tarjeta con QR.'
                : 'Abre tu dedicatoria, disfruta cada detalle y comparte este recuerdo con quienes celebran contigo.'}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {[
                { icon: Box, text: 'Escena 3D', visible: current?.scene.content !== 'VIDEO' },
                { icon: Play, text: 'Video personalizado', visible: Boolean(media?.video) },
                { icon: Camera, text: 'Realidad aumentada', visible: current?.scene.content !== 'VIDEO' },
              ]
                .filter((item) => item.visible)
                .map(({ icon: Icon, text }) => (
                  <span
                    key={text}
                    className="inline-flex items-center gap-1.5 rounded-field border border-white/15 bg-white/5 px-2.5 py-1.5 text-[11px] text-white/85"
                  >
                    <Icon size={13} />
                    {text}
                  </span>
                ))}
            </div>
          </div>
          <div className="hidden w-64 shrink-0 overflow-hidden rounded-2xl border border-white/20 bg-white p-2 shadow-e3 sm:block">
            <img
              src="/brand/misky-challay-tech-web.webp"
              alt="Misky Challay, pastelería artesanal con IA y realidad aumentada"
              width="1024"
              height="683"
              loading="lazy"
              className="block aspect-[3/2] w-full rounded-xl object-cover"
            />
          </div>
        </header>
        {demo && (
          <div className="mb-7 flex items-start gap-3 rounded-field border border-line bg-white px-4 py-3">
            <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
              <Sparkles size={12} />
            </span>
            <p className="text-xs leading-relaxed text-ink-muted">
              <span className="font-bold text-ink">Explora la demostración gratis.</span> No crea
              pedidos ni realiza cobros. La ilustración es referencial.
            </p>
          </div>
        )}
        <ol className="mb-7 grid gap-3 sm:grid-cols-3" aria-label="Cómo funciona la experiencia QR">
          {[
            { icon: QrCode, title: 'Escanea el QR', text: 'Abre esta experiencia desde tu celular.' },
            { icon: Camera, title: 'Activa la cámara', text: 'Solo la necesitas para probar AR.' },
            { icon: ScanLine, title: 'Enfoca y descubre', text: 'La escena aparece sobre tu tarjeta.' },
          ].map(({ icon: Icon, title, text }) => (
            <li key={title} className="flex items-start gap-3 rounded-card border border-line bg-white p-4">
              <span className="grid size-9 shrink-0 place-items-center rounded-field bg-brand-50 text-brand-700"><Icon className="size-4" aria-hidden="true" /></span>
              <span><strong className="block text-sm text-ink">{title}</strong><span className="mt-1 block text-xs leading-5 text-ink-muted">{text}</span></span>
            </li>
          ))}
        </ol>
        <p className="-mt-3 mb-7 text-center text-xs text-ink-muted">No necesitas instalar una aplicación. La vista 3D, la dedicatoria y el QR funcionan desde el navegador.</p>
        {error || mediaError ? (
          <div role="alert" className="exp-panel">
            <ExperienceEmpty
              icon={QrCode}
              title="Esta experiencia no está disponible"
              description={error || mediaError}
              action={
                <>
                  <Button
                    variant="outline"
                    leftIcon={<RefreshCw size={15} />}
                    onClick={() => window.location.reload()}
                  >
                    Volver a intentar
                  </Button>
                  <Button component={Link} to="/empresas" variant="ghost">
                    Volver a Para empresas
                  </Button>
                </>
              }
            />
          </div>
        ) : !current || loading ? (
          <div
            role="status"
            aria-label="Preparando tu experiencia"
            className="grid gap-5 lg:grid-cols-[1.2fr_.8fr]"
          >
            <div className="h-[430px] animate-pulse rounded-card bg-brand-50" />
            <div className="grid content-start gap-4">
              <div className="h-52 animate-pulse rounded-card bg-surface-muted" />
              <p className="text-sm text-ink-muted">Preparando tu experiencia…</p>
            </div>
          </div>
        ) : (
          <ExperienceViewer
            scene={current.scene}
            media={media}
            expiresAt={current.expiresAt}
            url={url}
            mode={current.scene.content === 'VIDEO' ? 'VIDEO' : 'AR'}
            layout="showcase"
          />
        )}
        {!demo && current?.expiresAt && (
          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs font-semibold text-brand-700">
            <CalendarDays size={14} aria-hidden="true" />
            Experiencia vigente hasta {new Date(current.expiresAt).toLocaleDateString('es-PE', { timeZone: 'America/Lima' })}
          </p>
        )}
        <section className="mt-7 flex flex-wrap items-center justify-between gap-4 rounded-card border border-brand-200 bg-brand-50/70 p-5 sm:p-6" aria-labelledby="experience-business-cta">
          <div><h2 id="experience-business-cta" className="text-lg font-extrabold text-ink">¿Quieres añadir esta experiencia a tu torta?</h2><p className="mt-1 text-sm leading-6 text-ink-muted">Solicita una propuesta y coordinaremos el diseño, la tarjeta y el contenido de tu QR.</p></div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row"><Button component={Link} to="/empresas#solicitar-propuesta" size="sm">Solicitar propuesta</Button><Button component={Link} to="/empresas" variant="outline" size="sm">Ver diseños</Button></div>
        </section>
        <footer className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5 text-xs text-ink-muted">
          <span>Un momento especial, preparado por Misky Challay.</span>
          <Link
            to="/empresas"
            className="inline-flex min-h-10 items-center gap-1.5 font-semibold text-brand-700"
          >
            Descubre nuestros diseños
            <ArrowUpRight size={13} />
          </Link>
        </footer>
        {cameraOpen && current && !mediaError && (
          <ExperienceCamera
            input={{ snapshot: current.scene, media, expiresAt: current.expiresAt }}
            onClose={closeCamera}
          />
        )}
      </div>
    </section>
  );
}
