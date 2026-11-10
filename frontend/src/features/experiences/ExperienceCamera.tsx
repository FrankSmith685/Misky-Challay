import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, CameraOff, ChevronDown, ChevronUp, RotateCcw, RotateCw, ScanLine, X } from 'lucide-react';
import { type CakeArStatus } from '../cakes/ar/cakeAr';
import type { ExperienceScene } from './experiences.service';
import type { SceneMedia } from './scene';
import { trackUxEvent } from '@services/analytics';
const CAKE_AR_CHANNEL = 'misky-experience-ar';
type CakeArInput = { snapshot: ExperienceScene; media: SceneMedia; expiresAt?: string | null };

export const ExperienceCamera = ({
  input,
  onClose,
}: {
  input: CakeArInput;
  onClose: () => void;
}) => {
  const frame = useRef<HTMLIFrameElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState<CakeArStatus>('loading');
  const [error, setError] = useState('');
  const [frameKey, setFrameKey] = useState(0);
  const [found, setFound] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const recognitionLabel = input.snapshot.recognitionLabel?.trim() || 'la tarjeta';
  const recognitionGender = /^la\b/i.test(recognitionLabel) ? 'reconocida' : 'reconocido';
  const send = (action: string, value?: number) => {
    frame.current?.contentWindow?.postMessage(
      { channel: CAKE_AR_CHANNEL, action, ...(value === undefined ? {} : { value }) },
      window.location.origin,
    );
  };
  const retry = () => {
    setError('');
    setFound(false);
    setStatus('loading');
    setFrameKey((value) => value + 1);
  };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    close.current?.focus();
    void trackUxEvent('AR_CAMERA_REQUEST', { marker: recognitionLabel });
    const message = (event: MessageEvent) => {
      if (
        event.origin !== window.location.origin ||
        event.source !== frame.current?.contentWindow ||
        event.data?.channel !== CAKE_AR_CHANNEL
      )
        return;
      if (event.data.ready)
        frame.current?.contentWindow?.postMessage(
          { channel: CAKE_AR_CHANNEL, action: 'start', input },
          window.location.origin,
        );
      if (['loading', 'scanning', 'found', 'lost', 'error'].includes(event.data.status)) {
        setStatus(event.data.status);
        setFound(event.data.status === 'found');
        if (event.data.status === 'error')
          setError(event.data.message || 'No se pudo iniciar la cámara.');
      }
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
      }
      if (event.key !== 'Tab') return;
      const buttons = [...(dialog.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
      const first = buttons[0];
      const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener('message', message);
    window.addEventListener('keydown', key, true);
    return () => {
      window.removeEventListener('message', message);
      window.removeEventListener('keydown', key, true);
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, [input, onClose, recognitionLabel]);
  useEffect(() => {
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [frameKey]);
  useEffect(() => {
    if (status === 'found') void trackUxEvent('AR_TARGET_FOUND', { marker: recognitionLabel });
    if (status === 'lost') void trackUxEvent('AR_TARGET_LOST', { marker: recognitionLabel });
    if (status === 'error') void trackUxEvent('AR_CAMERA_ERROR', { marker: recognitionLabel, message: error.slice(0, 200) });
    if (status === 'scanning') void trackUxEvent('AR_CAMERA_READY', { marker: recognitionLabel });
  }, [error, recognitionLabel, status]);
  return createPortal(
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label="Tu experiencia sobre la tarjeta"
      className="fixed inset-0 z-[1600] bg-ink text-white"
    >
      <iframe
        key={frameKey}
        ref={frame}
        src="/experience-camera.html"
        title="Cámara de realidad aumentada"
        allow="camera"
        tabIndex={-1}
        className="absolute inset-0 h-full w-full border-0"
      />
      <div className="absolute inset-x-0 top-0 flex items-center gap-2 border-b border-white/10 bg-brand-900/85 px-3 py-2.5 pt-[max(.75rem,env(safe-area-inset-top))] backdrop-blur sm:gap-3 sm:px-6 sm:py-4">
        <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-white/15 bg-white/5 sm:size-10">
          <Camera className="size-4 sm:size-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-xs font-bold sm:text-sm">Experiencia AR de Misky Challay</h2>
          <p className="mt-0.5 text-[11px] leading-4 text-white/80 sm:mt-1 sm:text-xs">
            Enfoca {recognitionLabel} completo, con buena luz y sin reflejos.
          </p>
        </div>
        <button
          ref={close}
          type="button"
          onClick={onClose}
          aria-label="Cerrar cámara"
          className="grid size-10 shrink-0 place-items-center rounded-lg border border-white/20 bg-white/5 transition hover:bg-white/15 sm:size-11"
        >
          <X className="size-5" />
        </button>
      </div>
      {status !== 'error' && !found && (
        <div
          className="pointer-events-none absolute inset-0 grid place-items-center"
          aria-hidden="true"
        >
          <div className="relative h-44 w-56 max-w-[75vw] rounded-2xl border border-white/30 shadow-[0_0_0_200vmax_rgba(0,0,0,.12)] sm:h-52 sm:w-64">
            <span className="absolute -left-px -top-px size-7 rounded-tl-2xl border-l-2 border-t-2 border-white" />
            <span className="absolute -right-px -top-px size-7 rounded-tr-2xl border-r-2 border-t-2 border-white" />
            <span className="absolute -bottom-px -left-px size-7 rounded-bl-2xl border-b-2 border-l-2 border-white" />
            <span className="absolute -bottom-px -right-px size-7 rounded-br-2xl border-b-2 border-r-2 border-white" />
          </div>
        </div>
      )}
      {found && (
        <div className="absolute inset-x-3 top-[max(5.5rem,env(safe-area-inset-top)+4.25rem)] mx-auto flex max-w-lg items-center justify-center gap-1.5 rounded-xl border border-white/15 bg-brand-900/80 p-1.5 shadow-xl backdrop-blur sm:inset-x-4 sm:gap-2 sm:rounded-2xl sm:p-2">
          <button type="button" onClick={() => send('scale', -0.1)} className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/10 text-white transition hover:bg-white/20 sm:size-11 sm:rounded-xl" aria-label="Alejar torta">
            <ChevronDown className="size-5" />
          </button>
          <span className="min-w-0 flex-1 text-center text-[10px] font-semibold text-white/85 sm:min-w-24 sm:text-[11px]">Ajusta tu torta</span>
          <button type="button" onClick={() => send('scale', 0.1)} className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/10 text-white transition hover:bg-white/20 sm:size-11 sm:rounded-xl" aria-label="Acercar torta">
            <ChevronUp className="size-5" />
          </button>
          <button type="button" onClick={() => send('rotate', -15)} className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/10 text-white transition hover:bg-white/20 sm:size-11 sm:rounded-xl" aria-label="Girar torta a la izquierda">
            <RotateCcw className="size-4" />
          </button>
          <button type="button" onClick={() => send('rotate', 15)} className="grid size-10 shrink-0 place-items-center rounded-lg bg-white/10 text-white transition hover:bg-white/20 sm:size-11 sm:rounded-xl" aria-label="Girar torta a la derecha">
            <RotateCw className="size-4" />
          </button>
          <button type="button" onClick={() => send('reset')} className="min-h-10 shrink-0 whitespace-nowrap rounded-lg bg-white px-2.5 py-2 text-[10px] font-bold text-ink transition hover:bg-brand-50 sm:rounded-xl sm:px-3 sm:py-2.5 sm:text-[11px]">Restablecer</button>
        </div>
      )}
      <div
        role={status === 'error' ? 'alert' : 'status'}
        aria-live="polite"
        className="absolute inset-x-3 bottom-[max(.75rem,env(safe-area-inset-bottom))] mx-auto max-w-lg rounded-xl border border-white/15 bg-brand-900/90 px-3 py-2.5 text-center text-xs leading-5 shadow-2xl backdrop-blur sm:inset-x-4 sm:bottom-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-5 sm:text-sm"
      >
        {status === 'error' ? (
          <>
            <CameraOff className="mx-auto mb-2 size-5 text-accent-200 sm:mb-3 sm:size-6" aria-hidden="true" />
            <p>{error}</p>
            <p className="mt-2 text-xs leading-5 text-white/75">Puedes cerrar esta ventana y continuar con la escena 3D, la dedicatoria y el QR sin usar la cámara.</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2 sm:mt-4">
              <button type="button" onClick={retry} className="min-h-10 rounded-field bg-white px-4 text-[11px] font-bold text-ink transition hover:bg-brand-50 sm:min-h-11 sm:px-5 sm:text-xs">
                Reintentar
              </button>
              <button type="button" onClick={onClose} className="min-h-10 rounded-field border border-white/20 px-4 text-[11px] font-bold text-white transition hover:bg-white/10 sm:min-h-11 sm:px-5 sm:text-xs">
                Volver a la experiencia
              </button>
            </div>
          </>
        ) : (
          <>
            <ScanLine className="mx-auto mb-1.5 size-4 sm:mb-2 sm:size-5" />
            <p>
              {status === 'loading'
                ? elapsedSeconds < 20
                  ? `Preparando la cámara… (${elapsedSeconds}s)`
                  : 'La preparación está tardando más de lo normal. Mantén la imagen completa y estable.'
                : status === 'found'
                  ? `${recognitionLabel} ${recognitionGender}. Desliza para girarla y verla en 360 grados.`
                  : status === 'lost'
                    ? `Vuelve a enfocar ${recognitionLabel} completo.`
                    : `Buscando ${recognitionLabel}. Acércate y evita los reflejos.`}
            </p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
};
