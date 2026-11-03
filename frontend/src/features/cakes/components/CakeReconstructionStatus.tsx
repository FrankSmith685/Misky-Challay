import { useEffect, useState } from 'react';
import { Box, Clock3, Loader2, RefreshCw } from 'lucide-react';
import type { CakeReconstructionJob } from '../cakeReconstruction.service';

const stages = { queued: 'Esperando al generador', preparing: 'Preparando el generador 3D', background: 'Separando la torta del fondo', shape: 'Construyendo el volumen de la torta', texture: 'Añadiendo colores y detalles', download: 'Preparando el modelo para el visor', ready: 'Modelo listo', failed: 'No se pudo convertir la foto' };
export const CakeReconstructionStatus = ({ reference, job, error, working, unavailable, canRegenerate, retryAt, compact, onRetry, onExpand }: {
  reference: string; job: CakeReconstructionJob | null; error: string; working: boolean; unavailable: boolean; canRegenerate: boolean; retryAt?: number | null; compact?: boolean; onRetry: () => void; onExpand?: () => void;
}) => {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (!retryAt || retryAt <= Date.now()) return;
    setNow(Date.now());
    const timer = window.setInterval(() => { const time = Date.now(); setNow(time); if (time >= retryAt) window.clearInterval(timer); }, 1000);
    return () => window.clearInterval(timer);
  }, [retryAt]);
  const remaining = Math.max(0, Math.ceil(((retryAt ?? 0) - now) / 1000));
  const wait = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;
  return <div className="rounded-card border border-brand-100 bg-surface-muted p-4" aria-label="Conversión de la foto a 3D">
  <div className={`flex flex-col items-center justify-center gap-3 text-center ${compact ? 'min-h-52' : 'min-h-56 md:min-h-80'}`}>
    <div className="relative"><img src={reference} alt="Foto que se utilizará para reconstruir la torta" className="size-20 rounded-card border border-line bg-white object-contain" /><span className="absolute -bottom-2 -right-2 grid size-8 place-items-center rounded-full bg-brand-700 text-white">{working ? <Loader2 className="size-4 animate-spin" /> : <Box className="size-4" />}</span></div>
    <div role="status" aria-live="polite" className="max-w-sm"><p className="text-xs font-bold text-ink">{error ? 'Tu referencia está guardada' : job ? stages[job.stage] : 'Preparando tu torta en 3D'}</p><p className="mt-1 text-[11px] leading-5 text-ink-muted">{error || 'La foto se está convirtiendo en una forma con volumen. La vista aparecerá aquí cuando termine.'}</p></div>
    {working && <div className="w-full max-w-52"><div role="progressbar" aria-label="Progreso de conversión a 3D" aria-valuemin={0} aria-valuemax={100} aria-valuenow={job?.progress ?? undefined} className="h-1.5 overflow-hidden rounded-pill bg-brand-100"><div className={`h-full rounded-pill bg-brand-600 ${job?.progress === null || !job ? 'w-1/3 animate-pulse' : ''}`} style={job?.progress != null ? { width: `${job.progress}%` } : undefined} /></div><p className="mt-2 text-[10px] text-ink-muted">{job?.progress != null ? `${Math.round(job.progress)}% · ` : ''}La generación puede tardar varios minutos.</p></div>}
    {!working && error && <button type="button" disabled={remaining > 0} onClick={onRetry} className="inline-flex min-h-10 items-center gap-2 rounded-field border border-line bg-white px-3 text-xs font-semibold text-brand-800 disabled:cursor-wait disabled:opacity-70">{remaining ? <Clock3 className="size-3.5" /> : <RefreshCw className="size-3.5" />}{remaining ? `Volver a intentar en ${wait}` : unavailable ? 'Comprobar disponibilidad' : canRegenerate ? 'Convertir otra vez' : job ? 'Reanudar conversión' : 'Reintentar conversión'}</button>}
    {onExpand && <button type="button" onClick={onExpand} className="min-h-9 text-xs font-semibold text-brand-700 underline underline-offset-4">Abrir editor y referencia</button>}
  </div>
</div>;
};
