import { useCallback, useEffect, useState } from 'react';
import { Check, ImagePlus, Library, Loader2, Search, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { Button } from '@components/ui/Button';
import { FileInput } from '@components/ui/FileInput';
import { Input } from '@components/ui/Input';
import { Modal } from '@components/ui/Modal';
import { cn } from '@lib/cn';
import { getApiErrorMessage } from '@services/api/client';
import { mediaAdminApi, optimizeImage, type MediaAsset } from '../services/mediaAdmin.service';

interface MediaPickerProps {
  value: string;
  altText?: string;
  label?: string;
  category?: string;
  onChange: (image: { url: string; altText: string }) => void;
}

export const MediaPicker = ({
  value,
  altText = '',
  label = 'Imagen',
  category = 'ingredients',
  onChange,
}: MediaPickerProps) => {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [query, setQuery] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingAlt, setPendingAlt] = useState(altText);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setAssets(await mediaAdminApi.list(category));
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [category]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  const chooseFile = (file: File | null) => {
    if (preview) URL.revokeObjectURL(preview);
    setPendingFile(file);
    setPreview(file ? URL.createObjectURL(file) : null);
    if (file && !pendingAlt) setPendingAlt(file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
  };

  const upload = async () => {
    if (!pendingFile) return;
    setLoading(true);
    try {
      const optimized = await optimizeImage(pendingFile, 1);
      const asset = await mediaAdminApi.upload({ ...optimized, altText: pendingAlt, category });
      onChange({ url: asset.url, altText: asset.altText ?? pendingAlt });
      toast.success('Imagen optimizada y guardada');
      setOpen(false);
      setPendingFile(null);
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  const filtered = assets.filter((asset) =>
    `${asset.originalName} ${asset.altText ?? ''}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <>
      <div>
        <p className="mb-1.5 text-sm font-medium text-ink">{label}</p>
        <button
          type="button"
          onClick={() => { setPendingAlt(altText); setOpen(true); }}
          className="group flex w-full items-center gap-3 rounded-xl border border-line bg-white p-2 text-left transition hover:border-brand-300"
        >
          <span className="flex size-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-surface-muted">
            {value ? <img src={value} alt={altText} className="size-full object-cover" /> : <ImagePlus className="size-6 text-brand-500" />}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-ink">{value ? 'Cambiar imagen' : 'Elegir o subir imagen'}</span>
            <span className="block truncate text-xs text-ink-muted">WebP automático · recorte cuadrado · máximo 5 MB</span>
          </span>
        </button>
      </div>

      <Modal isOpen={open} onClose={() => setOpen(false)} title="Biblioteca de imágenes" description="Sube una foto o reutiliza un recurso existente. Las imágenes se optimizan automáticamente." maxWidth="xl">
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <section className="space-y-4 rounded-2xl border border-line bg-surface-muted/35 p-4">
            <div className="flex items-center gap-2 font-bold text-ink"><Upload className="size-4 text-brand-600" /> Nueva imagen</div>
            <FileInput accept="image/jpeg,image/png,image/webp" label="JPG, PNG o WebP" onChange={chooseFile} />
            {preview && <img src={preview} alt="Previsualización" className="aspect-square w-full rounded-xl object-cover ring-1 ring-line" />}
            <Input label="Texto alternativo" value={pendingAlt} onChange={(event) => setPendingAlt(event.target.value)} placeholder="Ej. Palta fresca en cubos" hint="Describe la imagen para accesibilidad y buscadores." />
            <Button className="w-full" disabled={!pendingFile || !pendingAlt.trim()} isLoading={loading} onClick={() => void upload()}>
              Optimizar y usar
            </Button>
          </section>

          <section>
            <div className="mb-4 flex items-center gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-line bg-white px-3">
                <Search className="size-4 text-ink-muted" />
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre o descripción" className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" />
              </div>
              <span className="hidden items-center gap-1 text-xs text-ink-muted sm:flex"><Library className="size-4" /> {assets.length} recursos</span>
            </div>
            {loading && !assets.length ? (
              <div className="flex h-64 items-center justify-center"><Loader2 className="size-6 animate-spin text-brand-600" /></div>
            ) : filtered.length ? (
              <div className="grid max-h-[520px] grid-cols-2 gap-3 overflow-y-auto pr-1 sm:grid-cols-3 xl:grid-cols-4">
                {filtered.map((asset) => (
                  <button key={asset.id} type="button" onClick={() => { onChange({ url: asset.url, altText: asset.altText ?? asset.originalName }); setOpen(false); }} className={cn('group overflow-hidden rounded-xl border bg-white text-left transition hover:border-brand-400 hover:shadow-md', value === asset.url ? 'border-brand-600 ring-1 ring-brand-600' : 'border-line')}>
                    <span className="relative block aspect-square overflow-hidden bg-surface-muted">
                      <img src={asset.url} alt={asset.altText ?? ''} loading="lazy" className="size-full object-cover transition group-hover:scale-105" />
                      {value === asset.url && <span className="absolute right-2 top-2 rounded-full bg-brand-600 p-1 text-white"><Check className="size-3" /></span>}
                    </span>
                    <span className="block truncate p-2 text-xs font-medium text-ink">{asset.altText ?? asset.originalName}</span>
                  </button>
                ))}
              </div>
            ) : <p className="rounded-xl border border-dashed border-line p-8 text-center text-sm text-ink-muted">No hay imágenes que coincidan.</p>}
          </section>
        </div>
      </Modal>
    </>
  );
};
