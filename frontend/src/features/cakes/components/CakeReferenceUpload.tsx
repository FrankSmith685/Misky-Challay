import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Trash2 } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { Dropzone } from '@components/ui/Dropzone';
import { CakeReferenceQuality } from './CakeReferenceQuality';

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_BYTES = 5_000_000;

export const CakeReferenceUpload = ({ file, onChange, disabled = false, existingDataUrl }: { file: File | null; onChange: (file: File | null) => void; disabled?: boolean; existingDataUrl?: string | null }) => {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState('');
  const [error, setError] = useState('');
  useEffect(() => {
    if (!file) { setPreview(''); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);
  const select = (next: File) => {
    if (!ACCEPT.includes(next.type) || next.size === 0 || next.size > MAX_BYTES) {
      setError('Elige una imagen JPG, PNG o WebP de hasta 5 MB.');
      return;
    }
    setError('');
    onChange(next);
  };

  return <div className="min-w-0">
    {(file || existingDataUrl) ? <div className="overflow-hidden rounded-field border border-line bg-white">
      <div className="flex min-w-0 items-start gap-3 p-4">
        {(preview || existingDataUrl) && <img src={preview || existingDataUrl || undefined} alt="Imagen de referencia seleccionada" className="size-20 shrink-0 rounded-lg border border-line bg-surface-muted object-contain" />}
        <div className="min-w-0 flex-1"><p className="break-all text-sm font-medium leading-5 text-ink">{file?.name ?? 'Foto de tu torta guardada'}</p>{file && <p className="mt-1 text-xs text-ink-muted">{file.size >= 1_000_000 ? `${(file.size / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1000))} KB`}</p>}<p className="mt-2 text-xs leading-5 text-ink-muted">La IA usará esta foto para conservar el estilo y adaptar la propuesta a tus sabores y relleno. También acompaña tu solicitud. Puedes explorar el 3D de forma opcional.</p></div>
      </div>
      <div className="px-4 pb-3"><CakeReferenceQuality source={preview || existingDataUrl} /></div>
      <div className="flex flex-wrap gap-2 border-t border-line p-3">
        <Button type="button" size="sm" variant="outline" leftIcon={<ImagePlus className="size-4" />} onClick={() => input.current?.click()} disabled={disabled}>Cambiar imagen</Button>
        <Button type="button" size="sm" variant="ghost" leftIcon={<Trash2 className="size-4" />} onClick={() => { onChange(null); setError(''); }} disabled={disabled}>Quitar imagen</Button>
      </div>
      <input ref={input} type="file" aria-label="Cambiar imagen de referencia" accept={ACCEPT.join(',')} disabled={disabled} className="hidden" onChange={(event) => { const next = event.target.files?.[0]; if (next) select(next); event.target.value = ''; }} />
    </div> : <Dropzone accept={ACCEPT} maxSizeMb={5} disabled={disabled} label="Añade una imagen de referencia" hint="Arrastra aquí o haz clic para elegir. JPG, PNG o WebP · hasta 5 MB." onSelect={select} />}
    {error && <p role="alert" className="mt-2 text-xs leading-5 text-red-700">{error}</p>}
  </div>;
};
