import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, CameraOff, ScanLine, X } from 'lucide-react';
import { type CakeArStatus } from '../cakes/ar/cakeAr';
import type { ExperienceScene } from './experiences.service';
import type { SceneMedia } from './scene';
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
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    close.current?.focus();
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
  }, [input, onClose]);
  return createPortal(
    <div
      ref={dialog}
      role="dialog"
      aria-modal="true"
      aria-label="Tu experiencia sobre la tarjeta"
      className="fixed inset-0 z-[1600] bg-ink text-white"
    >
      <iframe
        ref={frame}
        src="/experience-camera.html"
        title="Cámara de realidad aumentada"
        allow="camera"
        tabIndex={-1}
        className="absolute inset-0 h-full w-full border-0"
      />
      <div className="absolute inset-x-0 top-0 flex items-center gap-3 border-b border-white/10 bg-[#251923]/90 px-4 py-4 pt-[max(1rem,env(safe-area-inset-top))] backdrop-blur sm:px-6">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg border border-white/15 bg-white/5">
          <Camera className="size-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold">Tu experiencia sobre la tarjeta</h2>
          <p className="mt-1 text-xs text-white/80">
            Apóyala en una mesa y enfoca toda la fotografía.
          </p>
        </div>
        <button
          ref={close}
          type="button"
          onClick={onClose}
          aria-label="Cerrar cámara"
          className="grid size-11 shrink-0 place-items-center rounded-lg border border-white/20 bg-white/5 transition hover:bg-white/15"
        >
          <X className="size-5" />
        </button>
      </div>
      {status !== 'error' && status !== 'found' && (
        <div
          className="pointer-events-none absolute inset-0 grid place-items-center"
          aria-hidden="true"
        >
          <div className="relative h-52 w-64 max-w-[75vw] rounded-2xl border border-white/30 shadow-[0_0_0_200vmax_rgba(0,0,0,.12)]">
            <span className="absolute -left-px -top-px size-7 rounded-tl-2xl border-l-2 border-t-2 border-white" />
            <span className="absolute -right-px -top-px size-7 rounded-tr-2xl border-r-2 border-t-2 border-white" />
            <span className="absolute -bottom-px -left-px size-7 rounded-bl-2xl border-b-2 border-l-2 border-white" />
            <span className="absolute -bottom-px -right-px size-7 rounded-br-2xl border-b-2 border-r-2 border-white" />
          </div>
        </div>
      )}
      <div
        role={status === 'error' ? 'alert' : 'status'}
        aria-live="polite"
        className="absolute inset-x-4 bottom-[max(1.5rem,env(safe-area-inset-bottom))] mx-auto max-w-lg rounded-xl border border-white/15 bg-[#251923]/95 p-5 text-center text-sm shadow-2xl backdrop-blur"
      >
        {status === 'error' ? (
          <>
            <CameraOff className="mx-auto mb-3 size-6 text-[#e0c39c]" aria-hidden="true" />
            <p>{error}</p>
            <button
              type="button"
              onClick={onClose}
              className="mt-4 min-h-11 rounded-field bg-white px-5 text-xs font-bold text-ink transition hover:bg-brand-50"
            >
              Volver a la experiencia
            </button>
          </>
        ) : (
          <>
            <ScanLine className="mx-auto mb-2 size-5" />
            <p>
              {status === 'loading'
                ? 'Preparando la cámara y la experiencia…'
                : status === 'found'
                  ? 'Tarjeta reconocida. Muévete suavemente para ver los lados.'
                  : status === 'lost'
                    ? 'Vuelve a enfocar toda la fotografía de la tarjeta.'
                    : 'Buscando la fotografía. Acércate y evita los reflejos.'}
            </p>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
};
