import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowUpRight,
  Box,
  Camera,
  Play,
  QrCode,
  RefreshCw,
  Sparkles,
} from 'lucide-react';
import { ExperienceEmpty } from './ExperienceUI';
import { Button } from '@components/ui/Button';
import { publicCakeWebOrigin } from '../cakes/utils/cakePreviewLinks';
import { demoScene, experiencesApi, type ExperienceScene } from './experiences.service';
import { useExperienceMedia } from './useExperienceMedia';
import { ExperienceViewer } from './ExperienceViewer';

export default function ExperiencePage() {
  const { token } = useParams();
  const demo = token === 'demo';
  const [data, setData] = useState<{
    key: string;
    scene: ExperienceScene;
    expiresAt?: string;
  } | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
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
  const url = `${publicCakeWebOrigin()}/experiencias/${encodeURIComponent(token ?? '')}`;
  return (
    <section className="container-shell py-6 sm:py-9" aria-label="Experiencia QR">
      <div className="mx-auto max-w-6xl">
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
              {demo ? 'Un invitado de otro planeta' : 'Tu experiencia personalizada'}
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-white/75">
              {demo
                ? 'Una dedicatoria, un saludo animado y un pequeño mundo por descubrir. Todo desde una tarjeta con QR.'
                : 'Abre tu dedicatoria, disfruta cada detalle y comparte este recuerdo con quienes celebran contigo.'}
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              {[
                { icon: Box, text: 'Escena 3D' },
                { icon: Play, text: 'Video personalizado' },
                { icon: Camera, text: 'Realidad aumentada' },
              ]
                .filter((item) => current?.scene.content !== 'VIDEO' || item.icon === Play)
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
          <div className="hidden shrink-0 rounded-2xl border border-white/15 bg-white/5 p-7 text-[#e0c39c] sm:block">
            <QrCode size={72} strokeWidth={1} aria-hidden="true" />
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
      </div>
    </section>
  );
}
