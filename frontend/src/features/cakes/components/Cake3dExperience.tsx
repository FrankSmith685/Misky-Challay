import { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Link } from 'react-router-dom';
import { Box, Check, Copy, Download, ImagePlus, Link2, QrCode, Share2 } from 'lucide-react';
import { Modal } from '@components/ui/Modal';
import { getApiErrorMessage } from '@services/api/client';
import { cakePreviewApi, type CakePreviewShareInput, type CakePreviewSnapshot } from '../cakePreview.service';
import { cakePreviewUrl, isLocalPreviewUrl } from '../utils/cakePreviewLinks';
import { Cake3dViewer } from './Cake3dViewer';
import { cakeDesignForNewReference, cakePreviewDesign, type CakeVisualDesign } from '../utils/cakeVisualDesign';
import { compactCakeReference, prepareCakeReference } from '../utils/prepareCakeReference';
import { useCakeReconstruction } from '../hooks/useCakeReconstruction';
import { CakeReconstructionStatus } from './CakeReconstructionStatus';
import { cakeArPath } from '../ar/cakeAr';

interface ShareLink { token: string; url: string; qr: string; expiresAt: string }

export const Cake3dExperience = ({ config, shareInput, existingShare, visualDesign, onDesignChange, referenceDataUrl, onReferenceChange, compact = false, viewerOpen, onViewerOpenChange, modalOnly = false }: {
  config: CakePreviewSnapshot;
  shareInput?: CakePreviewShareInput;
  existingShare?: { token: string; url: string; expiresAt: string };
  visualDesign?: CakeVisualDesign;
  onDesignChange?: (design: CakeVisualDesign) => void;
  referenceDataUrl?: string | null;
  onReferenceChange?: (dataUrl: string | null) => void;
  compact?: boolean;
  viewerOpen?: boolean;
  onViewerOpenChange?: (open: boolean) => void;
  modalOnly?: boolean;
}) => {
  const [shared, setShared] = useState<ShareLink | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [localExpanded, setLocalExpanded] = useState(false);
  const expanded = viewerOpen ?? localExpanded;
  const setExpanded = (open: boolean) => { setLocalExpanded(open); onViewerOpenChange?.(open); };
  const [shareOpen, setShareOpen] = useState(false);
  const compactUpload = useRef<HTMLInputElement>(null);
  const [interior, setInterior] = useState(false);
  const [localDesign, setLocalDesign] = useState(() => cakePreviewDesign(config.visualDesign));
  const [localReference, setLocalReference] = useState<string | null>(config.referenceImageDataUrl ?? null);
  const [referenceBusy, setReferenceBusy] = useState(false);
  const [referenceError, setReferenceError] = useState('');
  const [includeReference, setIncludeReference] = useState(false);
  const referenceRequest = useRef(0);
  const savedDesign = visualDesign ?? localDesign;
  const design = useMemo(() => cakePreviewDesign(savedDesign), [savedDesign]);
  const designRef = useRef(design);
  designRef.current = design;
  const reference = referenceDataUrl !== undefined ? referenceDataUrl : localReference;
  const preview = { ...config, visualDesign: design, referenceImageDataUrl: undefined };
  const unchanged = JSON.stringify([design, reference, includeReference]) === JSON.stringify([cakePreviewDesign(config.visualDesign), config.referenceImageDataUrl ?? null, Boolean(config.referenceImageDataUrl)]);
  const signature = JSON.stringify([shareInput ?? existingShare ?? null, design, reference, includeReference]);
  const signatureRef = useRef(signature);
  signatureRef.current = signature;
  const requestRef = useRef(0);
  useEffect(() => { setIncludeReference(false); setInterior(false); }, [reference]);
  useEffect(() => () => { referenceRequest.current += 1; }, []);
  const applyDesign = (next: CakeVisualDesign) => { setLocalDesign(next); onDesignChange?.(next); };
  const reconstruction = useCakeReconstruction(reference, design, applyDesign, !modalOnly || expanded || shareOpen);
  useEffect(() => {
    if (JSON.stringify(savedDesign) === JSON.stringify(design)) return;
    setLocalDesign(design);
    onDesignChange?.(design);
  }, [savedDesign, design, onDesignChange]);
  const selectReference = async (file: File) => {
    const request = ++referenceRequest.current;
    setReferenceBusy(true);
    setReferenceError('');
    try {
      const dataUrl = await prepareCakeReference(file);
      if (request !== referenceRequest.current) return;
      setLocalReference(dataUrl);
      onReferenceChange?.(dataUrl);
      setIncludeReference(false);
      setInterior(false);
      const currentDesign = designRef.current;
      applyDesign(cakeDesignForNewReference(currentDesign));
    } catch (cause) { if (request === referenceRequest.current) setReferenceError(cause instanceof Error ? cause.message : 'No se pudo preparar la imagen.'); }
    finally { if (request === referenceRequest.current) setReferenceBusy(false); }
  };
  useEffect(() => {
    requestRef.current += 1;
    setShared(null);
    setBusy(false);
    setError('');
    setCopied(false);
    return () => { requestRef.current += 1; };
  }, [signature]);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2500);
    return () => window.clearTimeout(timer);
  }, [copied]);
  useEffect(() => {
    if (!shared) return;
    const timer = window.setTimeout(() => { setShared(null); setError('El enlace venció. Genera uno nuevo para compartir.'); }, Math.max(0, new Date(shared.expiresAt).getTime() - Date.now()));
    return () => window.clearTimeout(timer);
  }, [shared]);

  const share = async () => {
    if ((!shareInput && !existingShare) || busy) return;
    const request = ++requestRef.current;
    const expectedSignature = signature;
    const current = () => request === requestRef.current && expectedSignature === signatureRef.current;
    setBusy(true);
    setError('');
    try {
      const visual = { visualDesign: design, includeReferenceImage: includeReference && Boolean(reference),
        ...(includeReference && reference ? { referenceImageDataUrl: reference.length <= 300_000 ? reference : await compactCakeReference(reference) } : {}) };
      if (!current()) return;
      const result = existingShare && unchanged ? existingShare : existingShare
        ? await cakePreviewApi.copy(existingShare.token, visual)
        : await cakePreviewApi.create({ ...shareInput!, ...visual });
      if (!current()) return;
      const url = existingShare && unchanged ? existingShare.url : cakePreviewUrl(result.token);
      const qr = await QRCode.toDataURL(url, { width: 480, margin: 3, errorCorrectionLevel: 'M', color: { dark: '#43332d', light: '#ffffff' } });
      if (current()) setShared({ token: result.token, url, qr, expiresAt: result.expiresAt });
    } catch (cause) { if (current()) setError(getApiErrorMessage(cause)); }
    finally { if (current()) setBusy(false); }
  };
  const copy = async () => {
    if (!shared) return;
    try { await navigator.clipboard.writeText(shared.url); setCopied(true); setError(''); }
    catch { setError('Selecciona y copia el enlace de abajo. El navegador no permitió copiarlo automáticamente.'); }
  };
  const nativeShare = async () => {
    if (!shared) return;
    try { await navigator.share({ title: `${config.themeName ?? config.productName} en 3D`, text: 'Mira esta idea de torta en 3D', url: shared.url }); }
    catch (cause) { if (!(cause instanceof DOMException && cause.name === 'AbortError')) setError('No se pudo compartir. Puedes copiar el enlace.'); }
  };
  const actionClass = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-lg border border-brand-200 bg-white px-3 text-xs font-semibold text-brand-800';
  const sharePanel = (shareInput || existingShare) && <div>
    {reference && <label className="mb-3 flex cursor-pointer items-start gap-2 rounded-lg border border-line bg-white p-3 text-xs leading-5 text-ink"><input type="checkbox" checked={includeReference} onChange={(event) => setIncludeReference(event.target.checked)} className="mt-1 size-4 shrink-0 accent-brand-700" /><span><strong>Incluir mi imagen en el QR{reconstruction.enabled ? ' y su reconstrucción 3D' : ''}.</strong> Cualquier persona con el enlace podrá verla. Sin esta opción se comparte la torta base.</span></label>}
    {includeReference && reconstruction.enabled && !reconstruction.token && <p role="status" className="mb-3 text-xs leading-5 text-ink-muted">Espera a que termine la conversión para compartir el modelo de tu foto.</p>}
    {!shared ? <button type="button" disabled={busy || referenceBusy || includeReference && reconstruction.enabled && !reconstruction.token} onClick={() => void share()} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 text-xs font-semibold text-brand-800 disabled:opacity-60"><QrCode className="size-4" />{busy ? 'Preparando enlace…' : 'Ver en mi celular y compartir'}</button> : <div className="space-y-3 rounded-xl bg-brand-50 p-3 text-center">
      <p className="text-xs font-semibold text-brand-900">Escanea desde otro celular o comparte el enlace</p>
      <img src={shared.qr} alt="Código QR para abrir esta vista 3D" className="mx-auto size-44 rounded-lg bg-white p-1" />
      <div className="flex flex-wrap justify-center gap-2">
        {typeof navigator.share === 'function' && <button type="button" onClick={() => void nativeShare()} className={actionClass}><Share2 className="size-3.5" /> Compartir</button>}
        <button type="button" onClick={() => void copy()} className={actionClass}>{copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copied ? 'Copiado' : 'Copiar enlace'}</button>
        <a href={shared.qr} download={`qr-torta-${config.productSlug}.png`} className={actionClass}><Download className="size-3.5" /> Guardar QR</a>
        <a href={shared.url} target="_blank" rel="noreferrer" className={actionClass}><Link2 className="size-3.5" /> Abrir</a>
      </div>
      <input aria-label="Enlace de la vista 3D" readOnly value={shared.url} onFocus={(event) => event.currentTarget.select()} className="w-full rounded-lg border border-brand-200 bg-white px-2 py-2 text-xs" />
      <Link to={cakeArPath(shared.token)} onClick={() => setShareOpen(false)} className={`${actionClass} w-full`}><Box className="size-4" /> Ver sobre tarjeta y descargar tarjeta AR</Link>
      <p className="text-[11px] text-ink-muted">Disponible hasta el {new Date(shared.expiresAt).toLocaleDateString('es-PE', { timeZone: 'America/Lima', day: 'numeric', month: 'long' })}. Comparte una copia de estas opciones.</p>
      {isLocalPreviewUrl(shared.url) && <p role="status" className="rounded-lg bg-amber-50 p-2 text-left text-xs leading-5 text-amber-900">Este enlace apunta a esta computadora. Para abrirlo desde otro celular, entra a la web usando su dirección pública.</p>}
    </div>}
    <span role="status" className="sr-only">{copied ? 'Enlace copiado' : ''}</span>
    {error && <p role="alert" className="mt-2 text-xs text-red-700">{error}</p>}
  </div>;

  const viewer = (large = false) => <div className="space-y-3">
    {reconstruction.enabled && !reconstruction.token && reference
    ? <CakeReconstructionStatus reference={reference} job={reconstruction.job} error={reconstruction.error} unavailable={reconstruction.unavailable} working={reconstruction.working} canRegenerate={reconstruction.canRegenerate} retryAt={reconstruction.retryAt} compact={compact && !large} onRetry={reconstruction.retry} onExpand={large ? undefined : () => setExpanded(true)} />
    : <Cake3dViewer config={preview} referenceDataUrl={reconstruction.enabled ? null : reference} sourceReference={reconstruction.enabled ? reference : null} modelToken={reconstruction.token} compact={compact && !large} large={large} interiorValue={interior} onInteriorChange={setInterior} onExpand={large ? undefined : () => setExpanded(true)} />}
  </div>;
  const canChoosePhoto = Boolean(onReferenceChange) && !existingShare;
  const shareButton = sharePanel && <button type="button" onClick={() => { setExpanded(false); setShareOpen(true); }} className={`${actionClass} px-2`} aria-label="Compartir mi torta por QR"><QrCode className="size-4" />{compact ? 'QR' : 'Compartir por QR'}</button>;
  return <section className="space-y-3" aria-label="Vista 3D de tu torta">
    {!expanded && !modalOnly && <>{viewer()}
      <div className="flex gap-2">
        {canChoosePhoto && <button type="button" disabled={referenceBusy} onClick={() => compactUpload.current?.click()} className={`${actionClass} min-w-0 flex-1 px-2`}><ImagePlus className="size-4 shrink-0" /><span className="truncate">{referenceBusy ? 'Preparando…' : reference ? 'Cambiar foto' : 'Añadir foto'}</span></button>}
        {shareButton}
      </div>
      {canChoosePhoto && <input ref={compactUpload} type="file" accept="image/jpeg,image/png,image/webp" aria-label="Subir foto de referencia de la torta" className="sr-only" disabled={referenceBusy} onChange={(event) => { const file = event.currentTarget.files?.[0]; event.currentTarget.value = ''; if (file) void selectReference(file); }} />}
      {referenceError && <p role="alert" className="text-xs text-red-700">{referenceError}</p>}
    </>}
    {expanded && !modalOnly && <div className="flex aspect-[3/2] flex-col items-center justify-center gap-3 rounded-card bg-surface-muted p-5 text-center"><Box className="size-8 text-brand-600" /><p className="text-sm font-semibold text-ink">Tu torta está abierta en el visor</p><button type="button" onClick={() => setExpanded(false)} className={actionClass}>Volver al resumen</button></div>}
    <Modal isOpen={expanded} onClose={() => setExpanded(false)} title="Tu torta en 3D" description="Gira, amplía y compara con la foto original." icon={Box} maxWidth="lg" actions={<>{shareButton}<button type="button" onClick={() => setExpanded(false)} className={actionClass}>Volver al resumen</button></>}>
      {expanded && viewer(true)}
    </Modal>
    <Modal isOpen={shareOpen} onClose={() => setShareOpen(false)} title="Comparte tu torta" description="Abre esta vista en otro celular con un código QR." icon={QrCode} maxWidth="sm">
      {sharePanel}
    </Modal>
  </section>;
};
