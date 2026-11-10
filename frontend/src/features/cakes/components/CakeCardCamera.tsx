import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Camera, ChevronDown, ChevronUp, RotateCcw, ScanLine, X } from 'lucide-react';
import { CAKE_AR_CHANNEL, type CakeArInput, type CakeArStatus } from '../ar/cakeAr';
import { trackUxEvent } from '@services/analytics';

export const CakeCardCamera = ({ input, onClose }: { input: CakeArInput; onClose: () => void }) => {
  const frame = useRef<HTMLIFrameElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const [status, setStatus] = useState<CakeArStatus>('loading');
  const [error, setError] = useState('');
  const [frameKey, setFrameKey] = useState(0);
  const [found, setFound] = useState(false);
  const send = (action: string, value?: number) => frame.current?.contentWindow?.postMessage({ channel: CAKE_AR_CHANNEL, action, ...(value === undefined ? {} : { value }) }, window.location.origin);
  const retry = () => { setError(''); setFound(false); setStatus('loading'); setFrameKey((value) => value + 1); };
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden'; close.current?.focus();
    void trackUxEvent('AR_CAMERA_REQUEST', { marker: 'la tarjeta' });
    const message = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow || event.data?.channel !== CAKE_AR_CHANNEL) return;
      if (event.data.ready) frame.current?.contentWindow?.postMessage({ channel: CAKE_AR_CHANNEL, action: 'start', input }, window.location.origin);
      if (['loading', 'scanning', 'found', 'lost', 'error'].includes(event.data.status)) {
        setStatus(event.data.status);
        setFound(event.data.status === 'found');
        if (event.data.status === 'error') setError(event.data.message || 'No se pudo iniciar la cámara.');
      }
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key !== 'Tab') return;
      const buttons = [...(dialog.current?.querySelectorAll<HTMLButtonElement>('button') ?? [])];
      const first = buttons[0]; const last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    };
    window.addEventListener('message', message); window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('message', message); window.removeEventListener('keydown', key);
      document.body.style.overflow = overflow; previous?.focus();
    };
  }, [input, onClose]);
  useEffect(() => {
    if (status === 'found') void trackUxEvent('AR_TARGET_FOUND', { marker: 'la tarjeta' });
    if (status === 'lost') void trackUxEvent('AR_TARGET_LOST', { marker: 'la tarjeta' });
    if (status === 'error') void trackUxEvent('AR_CAMERA_ERROR', { marker: 'la tarjeta', message: error.slice(0, 200) });
    if (status === 'scanning') void trackUxEvent('AR_CAMERA_READY', { marker: 'la tarjeta' });
  }, [error, status]);
  return createPortal(<div ref={dialog} role="dialog" aria-modal="true" aria-label="Tu torta sobre la tarjeta" className="fixed inset-0 z-[1600] bg-ink text-white">
    <iframe key={frameKey} ref={frame} src="/ar-camera.html" title="Cámara de realidad aumentada" allow="camera" tabIndex={-1} className="absolute inset-0 h-full w-full border-0" />
    <div className="absolute inset-x-0 top-0 flex items-center gap-3 bg-ink/80 p-4 pt-[max(1rem,env(safe-area-inset-top))]">
      <Camera className="size-5 shrink-0" /><div className="min-w-0 flex-1"><h2 className="text-sm font-bold">Tu torta sobre la tarjeta</h2><p className="mt-1 text-xs text-white/80">Apóyala en una mesa y enfoca toda la fotografía.</p></div>
      <button ref={close} type="button" onClick={onClose} aria-label="Cerrar cámara" className="grid size-11 shrink-0 place-items-center rounded-field border border-white/30 bg-ink"><X className="size-5" /></button>
    </div>
    {found && <div className="absolute inset-x-4 top-24 mx-auto flex max-w-lg items-center justify-center gap-2 rounded-2xl border border-white/15 bg-ink/85 p-2 shadow-xl backdrop-blur">
      <button type="button" onClick={() => send('scale', -0.1)} className="grid size-11 place-items-center rounded-xl bg-white/10" aria-label="Alejar torta"><ChevronDown className="size-5" /></button>
      <span className="min-w-24 text-center text-[11px] font-semibold">Ajusta tu torta</span>
      <button type="button" onClick={() => send('scale', 0.1)} className="grid size-11 place-items-center rounded-xl bg-white/10" aria-label="Acercar torta"><ChevronUp className="size-5" /></button>
      <button type="button" onClick={() => send('rotate', -15)} className="grid size-11 place-items-center rounded-xl bg-white/10" aria-label="Girar torta"><RotateCcw className="size-4" /></button>
      <button type="button" onClick={() => send('reset')} className="rounded-xl bg-white px-3 py-2.5 text-[11px] font-bold text-ink">Restablecer</button>
    </div>}
    <div role={status === 'error' ? 'alert' : 'status'} aria-live="polite" className="absolute inset-x-4 bottom-6 mx-auto max-w-lg rounded-card bg-ink/90 p-4 text-center text-sm">
      {status === 'error' ? <><p>{error}</p><button type="button" onClick={retry} className="mt-3 min-h-10 rounded-field bg-white px-4 font-semibold text-ink">Reintentar cámara</button><button type="button" onClick={onClose} className="mt-3 min-h-10 rounded-field border border-white/25 px-4 font-semibold text-white">Volver a la experiencia</button></> : <><ScanLine className="mx-auto mb-2 size-5" /><p>{status === 'loading' ? 'Preparando la cámara y el modelo…' : status === 'found' ? 'Tarjeta reconocida. Muévete suavemente para ver los lados.' : status === 'lost' ? 'Vuelve a enfocar toda la fotografía de la tarjeta.' : 'Buscando la fotografía. Acércate y evita los reflejos.'}</p></>}
    </div>
  </div>, document.body);
};
