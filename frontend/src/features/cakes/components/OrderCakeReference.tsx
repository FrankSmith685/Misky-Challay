import { useEffect, useState } from 'react';
import { Image as ImageIcon, Loader2, X, ZoomIn } from 'lucide-react';
import { getApiErrorMessage } from '@services/api/client';
import { Modal } from '@components/ui/Modal';
import { cakesApi } from '../cakes.service';

export interface OrderDesignImage { id: number; kind: 'CUSTOMER_REFERENCE' | 'AI_PROPOSAL'; position: number }

function PrivateImage({ orderNumber, itemId, image }: { orderNumber: string; itemId: number; image: OrderDesignImage }) {
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const title = image.kind === 'AI_PROPOSAL' ? 'Propuesta con IA' : `Referencia del cliente${image.position ? ` ${image.position + 1}` : ''}`;
  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    setUrl(null); setError('');
    const request = image.id ? cakesApi.orderImage(orderNumber, itemId, image.id) : cakesApi.orderReference(orderNumber, itemId);
    void request.then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob); setUrl(objectUrl);
    }).catch((cause) => { if (active) setError(getApiErrorMessage(cause)); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [orderNumber, itemId, image.id, retry]);
  return <figure className="min-w-0 rounded-lg border border-line bg-white p-3">
    <figcaption className="mb-2 text-xs font-bold text-ink">{title}</figcaption>
    {url ? <button type="button" className="block w-full" onClick={() => setExpanded(true)} aria-label={`Ampliar ${title.toLocaleLowerCase('es')}`}><img src={url} alt={title} className="h-44 w-full rounded-md object-contain" /><span className="mt-2 inline-flex items-center gap-1 text-xs text-brand-700"><ZoomIn className="size-3.5" /> Ampliar imagen</span></button> : error ? <div role="alert" className="text-xs text-red-700"><p>{error}</p><button type="button" onClick={() => setRetry((value) => value + 1)} className="mt-2 min-h-9 font-semibold underline">Reintentar imagen</button></div> : <p role="status" className="flex items-center gap-2 py-8 text-xs text-ink-muted"><Loader2 className="size-4 animate-spin" /> Cargando imagen…</p>}
    {image.kind === 'AI_PROPOSAL' && <p className="mt-2 text-[11px] leading-5 text-ink-muted">Guía visual generada con IA. Preparar según los sabores, porciones e indicaciones del pedido; el acabado se confirma con el cliente.</p>}
    <Modal isOpen={expanded && Boolean(url)} onClose={() => setExpanded(false)} title={title} maxWidth="lg">{url && <img src={url} alt={title} className="max-h-[75vh] w-full object-contain" />}</Modal>
  </figure>;
}

export const OrderCakeReference = ({ orderNumber, itemId, images, hasReference = true }: { orderNumber: string; itemId: number; images?: OrderDesignImage[]; hasReference?: boolean }) => {
  const [open, setOpen] = useState(false);
  const entries = images?.length ? [...images].sort((a, b) => Number(a.kind === 'AI_PROPOSAL') - Number(b.kind === 'AI_PROPOSAL') || a.position - b.position) : hasReference ? [{ id: 0, kind: 'CUSTOMER_REFERENCE' as const, position: 0 }] : [];
  if (!entries.length) return null;
  return <div className="mt-3" aria-label="Imágenes del diseño del pedido">
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-xs font-semibold text-brand-700 hover:border-brand-300">{open ? <X className="size-4" /> : <ImageIcon className="size-4" />}{open ? 'Cerrar imágenes del diseño' : `Ver imágenes del diseño (${entries.length})`}</button>
    {open && <div className="mt-3 grid gap-3 sm:grid-cols-2">{entries.map((image) => <PrivateImage key={image.id} orderNumber={orderNumber} itemId={itemId} image={image} />)}</div>}
  </div>;
};
