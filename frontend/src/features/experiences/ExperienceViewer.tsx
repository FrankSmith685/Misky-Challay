import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import {
  ArrowUpRight,
  Box,
  Camera,
  Check,
  Copy,
  Download,
  Image as ImageIcon,
  MessageCircle,
  Play,
  QrCode,
  ScanLine,
  Share2,
  Volume2,
} from 'lucide-react';
import { Button } from '@components/ui/Button';
import toast from '@components/mui/MuiToast';
import { CAKE_AR_TARGET } from '../cakes/ar/cakeAr';
import { createCakeArCard } from '../cakes/ar/createCakeArCard';
import type { ExperienceScene } from './experiences.service';
import type { SceneMedia } from './scene';
const ExperienceCanvas = lazy(() => import('./ExperienceCanvas'));
import { ExperienceCamera } from './ExperienceCamera';
import { ExperiencePanel } from './ExperienceUI';

const imageFrom = (src: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('No se pudo preparar la imagen.'));
    img.src = src;
  });
const download = (url: string, name: string) => {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
};
const qrDataUrl = async (url: string, settings: { dark: string; light: string; logo?: 'BRAND' | 'NONE'; background?: 'SOLID' | 'SOFT' }) => {
  const base = await QRCode.toDataURL(url, {
    width: 520,
    margin: 4,
    errorCorrectionLevel: 'H',
    color: { dark: settings.dark, light: settings.light },
  });
  if (settings.logo !== 'BRAND') return base;
  const [qrImage, logo] = await Promise.all([imageFrom(base), imageFrom('/brand/misky-mark.png')]);
  const canvas = document.createElement('canvas');
  canvas.width = 520;
  canvas.height = 520;
  const context = canvas.getContext('2d');
  if (!context) return base;
  context.drawImage(qrImage, 0, 0, 520, 520);
  context.fillStyle = settings.background === 'SOFT' ? '#ffffff' : settings.light;
  context.beginPath();
  context.roundRect(195, 195, 130, 130, 18);
  context.fill();
  context.drawImage(logo, 215, 215, 90, 90);
  return canvas.toDataURL('image/png');
};
export function ExperienceViewer({
  scene,
  media,
  url,
  expiresAt,
  mode = 'AR',
  layout = 'compact',
}: {
  scene: ExperienceScene;
  media: SceneMedia;
  url?: string;
  expiresAt?: string | null;
  mode?: 'AR' | 'VIDEO';
  layout?: 'showcase' | 'compact';
}) {
  const [camera, setCamera] = useState(false);
  const closeCamera = useCallback(() => setCamera(false), []);
  const [busy, setBusy] = useState(false);
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const layers = scene.layers ?? [];
  const qrSettings = useMemo(() => scene.qr ?? { dark: '#003a60', light: '#ffffff', frame: 'LIGHT' as const, label: 'Escanea y descubre', logo: 'BRAND' as const, background: 'SOFT' as const }, [scene.qr]);
  const runLayerAction = async (action: NonNullable<(typeof layers)[number]>['action']) => {
    if (action === 'PLAY_VIDEO') {
      if (!videoRef.current) return toast('Este saludo todavía no tiene un video cargado.');
      await videoRef.current.play().catch(() => undefined);
      videoRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (action === 'PLAY_AUDIO') {
      if (!audioRef.current) return toast('Esta experiencia todavía no tiene audio cargado.');
      await audioRef.current.play().catch(() => undefined);
      audioRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (action === 'SHARE') {
      if (!url) return toast('Comparte la experiencia cuando tenga un enlace publicado.');
      try {
        if (navigator.share) await navigator.share({ title: scene.title, url });
        else {
          await navigator.clipboard.writeText(url);
          toast.success('Enlace copiado');
        }
      } catch {
        // El usuario puede cerrar el diálogo nativo de compartir sin completar la acción.
      }
    }
  };
  useEffect(() => {
    let active = true;
    setQr('');
    if (url)
      void qrDataUrl(url, qrSettings)
        .then((value) => {
          if (active) setQr(value);
        })
        .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [qrSettings, url]);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);
  const input = useMemo(() => ({ snapshot: scene, media, expiresAt }), [scene, media, expiresAt]);
  const saveCard = async () => {
    if (!url) return;
    setBusy(true);
    try {
      if (!media.image && mode === 'AR') {
        download(await createCakeArCard(url, expiresAt ?? undefined, scene.recognitionLabel ?? 'la tarjeta'), 'mi-experiencia-qr.png');
        return;
      }
      const canvas = document.createElement('canvas');
      canvas.width = 1800;
      canvas.height = 1400;
      const ctx = canvas.getContext('2d')!;
      ctx.fillStyle = '#f5faff';
      ctx.fillRect(0, 0, 1800, 1400);
      ctx.fillStyle = '#17324d';
      ctx.font = 'bold 48px Arial';
      ctx.fillText('Misky Challay · Tu experiencia QR', 70, 100);
      if (mode === 'AR') {
        const target = await imageFrom(media.image ?? CAKE_AR_TARGET);
        const fit = Math.min(1040 / target.width, 990 / target.height);
        ctx.drawImage(
          target,
          70 + (1040 - target.width * fit) / 2,
          170 + (990 - target.height * fit) / 2,
          target.width * fit,
          target.height * fit,
        );
      }
      const qr = await imageFrom(await qrDataUrl(url, qrSettings));
      ctx.drawImage(qr, 1160, 240, 500, 500);
      ctx.font = '30px Arial';
      ctx.fillText(`1. ${qrSettings.label || 'Escanea el QR'}`, 1160, 820);
      ctx.fillText(mode === 'AR' ? '2. Activa la cámara' : '2. Reproduce el video', 1160, 880);
       if (mode === 'AR') {
         ctx.fillText('3. Espera mientras carga', 1160, 940);
         ctx.fillText(`4. Enfoca ${scene.recognitionLabel ?? 'la tarjeta'}`, 1160, 1000);
         ctx.fillText('5. Disfruta la experiencia AR', 1160, 1060);
       }
      ctx.font = '26px Arial';
      ctx.fillText(
        expiresAt
          ? `Disponible hasta ${new Date(expiresAt).toLocaleDateString('es-PE')}.`
          : 'Demostración · sin pedidos ni cobros.',
        70,
        1280,
      );
      download(canvas.toDataURL('image/png'), 'mi-experiencia-qr.png');
    } catch {
      toast.error('No se pudo descargar la tarjeta. Vuelve a intentarlo.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="exp-viewer" data-layout={layout}>
      <header className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="exp-kicker mb-2">Hecho para tu celebración</p>
          <h2 className="text-xl font-extrabold text-ink sm:text-2xl">{scene.title}</h2>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-pill border border-line bg-white px-3 py-1.5 text-xs text-ink-muted">
          {mode === 'AR' ? <Box size={13} /> : <Play size={13} />}
          {mode === 'AR' ? 'Experiencia interactiva' : 'Video personalizado'}
        </span>
      </header>
      <div className={scene.content === 'VIDEO' ? 'grid gap-5' : 'exp-viewer__media'}>
        {scene.content !== 'VIDEO' && (
          <ExperiencePanel
            icon={Box}
            title="Explora tu escena"
            description="Un pequeño detalle, visto desde todos los ángulos."
            className="exp-panel--stage"
            action={
              <span className="exp-live">
                <span />
                En movimiento
              </span>
            }
          >
            <Suspense
              fallback={
                <div
                  className="grid h-[360px] place-items-center bg-surface-muted text-sm text-ink-muted"
                  role="status"
                >
                  Preparando la escena 3D…
                </div>
              }
            >
              <ExperienceCanvas scene={scene} media={media} large={layout === 'showcase'} />
            </Suspense>
          </ExperiencePanel>
        )}
        <div className="grid min-w-0 content-start gap-5">
          {media.video && (
            <ExperiencePanel
              icon={Play}
              title="Tu video"
              description="Un saludo para disfrutar una y otra vez."
              className="exp-panel--video"
            >
              <video
                ref={videoRef}
                controls
                playsInline
                preload="metadata"
                poster={media.poster}
                src={media.video}
                className="block aspect-video w-full bg-brand-900 object-contain"
                aria-label="Video personalizado"
              />
            </ExperiencePanel>
          )}
          <section className="exp-dedication">
            <MessageCircle size={18} className="mb-3 text-brand-600" aria-hidden="true" />
            <p className="exp-kicker mb-2">Una dedicatoria para ti</p>
            <p className="whitespace-pre-line break-words text-sm leading-7 text-ink">
              {scene.message || 'Un recuerdo especial para acompañar tu celebración.'}
            </p>
            {media.audio && (
              <div className="mt-4 border-t border-line pt-4">
                <p className="mb-2 text-xs font-semibold text-ink-muted">Escucha tu mensaje</p>
                <audio
                  ref={audioRef}
                  controls
                  preload="metadata"
                  src={media.audio}
                  className="w-full"
                  aria-label="Dedicatoria en audio"
                />
              </div>
            )}
            {layers.filter((layer) => layer.kind === 'TEXT' && layer.visible).map((layer) => (
              <p
                key={layer.id}
                className="mt-4 rounded-field border border-brand-100 bg-brand-50 px-4 py-3 text-xs font-semibold leading-relaxed text-brand-900"
              >
                {layer.text}
              </p>
            ))}
            {layers.filter((layer) => layer.kind === 'HOTSPOT' && layer.visible).map((layer) => (
              <p key={layer.id} className="mt-3 flex items-start gap-2 rounded-field border border-accent-100 bg-accent-50 px-4 py-3 text-xs leading-relaxed text-accent-900">
                <span className="mt-0.5 size-2 shrink-0 rounded-full bg-accent-500" />
                <span><strong>{layer.name}:</strong> {layer.text}</span>
              </p>
            ))}
            {layers.filter((layer) => layer.kind === 'BUTTON' && layer.visible).length > 0 && (
              <div className="mt-4 grid gap-2 border-t border-line pt-4 sm:grid-cols-2">
                {layers
                  .filter((layer) => layer.kind === 'BUTTON' && layer.visible)
                  .map((layer) => (
                    <Button
                      key={layer.id}
                      variant="outline"
                      leftIcon={
                        layer.action === 'PLAY_AUDIO' ? (
                          <Volume2 size={15} />
                        ) : layer.action === 'PLAY_VIDEO' ? (
                          <Play size={15} />
                        ) : (
                          <Share2 size={15} />
                        )
                      }
                      onClick={() => void runLayerAction(layer.action)}
                    >
                      {layer.text || layer.name}
                    </Button>
                  ))}
              </div>
            )}
          </section>
        </div>
      </div>
      <div className="exp-viewer__actions mt-5">
        {mode === 'AR' && (
          <ExperiencePanel
            icon={ScanLine}
            title="Dale vida a tu tarjeta"
            description="En tu celular, la escena aparece sobre la imagen impresa."
          >
            <ol className="mb-5 grid gap-3 text-xs leading-relaxed text-ink-muted">
              {[
                'Apoya la tarjeta en una mesa bien iluminada.',
                'Permite la cámara y enfoca toda la fotografía.',
                'Acércate suavemente para descubrir los detalles.',
              ].map((step, index) => (
                <li key={step} className="flex items-start gap-2.5">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full bg-brand-50 text-[10px] font-bold text-brand-700">
                    {index + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <p className="mb-4 rounded-field border border-brand-100 bg-brand-50 px-3 py-2 text-[11px] leading-relaxed text-brand-900">
              La cámara puede tardar hasta 20 segundos en preparar el reconocimiento. Si no funciona, puedes continuar con la vista 3D.
            </p>
            <div className="grid gap-2">
              <Button leftIcon={<Camera size={16} />} onClick={() => setCamera(true)}>
                Activar realidad aumentada
              </Button>
              <Button
                variant="ghost"
                component="a"
                href={media.image ?? CAKE_AR_TARGET}
                target="_blank"
                rel="noopener noreferrer"
                leftIcon={<ImageIcon size={15} />}
              >
                Ver imagen para enfocar <ArrowUpRight size={13} className="ml-1" />
              </Button>
            </div>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-ink-muted">
              La imagen para enfocar es independiente del logo y del QR. Usa la tarjeta descargada o la imagen de referencia.
            </p>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-ink-muted">
              La cámara requiere una conexión HTTPS. La vista 3D y el video funcionan sin cámara.
            </p>
          </ExperiencePanel>
        )}
        {url && (
          <ExperiencePanel
            icon={QrCode}
            title="Un recuerdo para compartir"
            description={
              expiresAt
                ? 'El mismo QR conserva el acceso durante su vigencia.'
                : 'Descarga la tarjeta y prueba la experiencia desde otro dispositivo.'
            }
          >
            <div className="mb-5 flex items-center gap-4">
              <div className="exp-qr-preview">
                {qr ? (
                  <img src={qr} alt="QR para abrir esta experiencia" />
                ) : (
                  <QrCode size={50} className="text-brand-200" aria-hidden="true" />
                )}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold text-ink">Escanea y descubre</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                  {expiresAt
                    ? 'Guarda la tarjeta o compártela con tus invitados.'
                    : 'Una demostración gratuita, sin pedidos ni cobros.'}
                </p>
                {expiresAt && (
                  <p className="mt-2 text-[11px] font-semibold text-brand-700">
                    Vigente hasta{' '}
                    {new Date(expiresAt).toLocaleDateString('es-PE', { timeZone: 'America/Lima' })}
                  </p>
                )}
              </div>
            </div>
            <div className="grid gap-2">
              <Button
                variant="outline"
                leftIcon={<Download size={16} />}
                isLoading={busy}
                onClick={() => void saveCard()}
              >
                Descargar tarjeta con QR
              </Button>
              <Button
                variant="ghost"
                leftIcon={copied ? <Check size={15} /> : <Copy size={15} />}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(url);
                    setCopied(true);
                    toast.success('Enlace copiado');
                  } catch {
                    toast.error('No se pudo copiar el enlace.');
                  }
                }}
              >
                Copiar enlace
              </Button>
              <Button
                variant="ghost"
                leftIcon={<Share2 size={15} />}
                onClick={() => void runLayerAction('SHARE')}
              >
                Compartir experiencia
              </Button>
            </div>
          </ExperiencePanel>
        )}
      </div>
      {camera && <ExperienceCamera input={input} onClose={closeCamera} />}
    </div>
  );
}
