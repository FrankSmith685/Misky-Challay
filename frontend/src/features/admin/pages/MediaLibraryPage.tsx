import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArchiveRestore, Crop, FileImage, ImagePlus, Link2, Pencil, Search, Trash2, Upload } from 'lucide-react';
import toast from 'react-hot-toast';
import { PageHeader } from '@components/common/PageHeader';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { FileInput } from '@components/ui/FileInput';
import { Input } from '@components/ui/Input';
import { Modal } from '@components/ui/Modal';
import { Select, SelectOption } from '@components/ui/Select';
import { getApiErrorMessage } from '@services/api/client';
import { cn } from '@lib/cn';
import { mediaAdminApi, optimizeImage, type MediaAsset } from '../services/mediaAdmin.service';

const CATEGORIES = ['ingredients', 'products', 'builder-presets', 'marketing'];

const MediaLibraryPage = () => {
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [editing, setEditing] = useState<MediaAsset | null>(null);
  const [editAlt, setEditAlt] = useState('');
  const [editCategory, setEditCategory] = useState('ingredients');
  const [replacing, setReplacing] = useState<MediaAsset | null>(null);
  const [replacementId, setReplacementId] = useState<number | ''>('');
  const [file, setFile] = useState<File | null>(null);
  const [uploadAlt, setUploadAlt] = useState('');
  const [uploadCategory, setUploadCategory] = useState('ingredients');
  const [uploadAspect, setUploadAspect] = useState('1');
  const [focusX, setFocusX] = useState(50);
  const [focusY, setFocusY] = useState(50);
  const [previewUrl, setPreviewUrl] = useState('');
  const [sort, setSort] = useState<'recent' | 'name' | 'usage'>('recent');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setAssets(await mediaAdminApi.list(category || undefined, includeDeleted)); }
    catch (error) { toast.error(getApiErrorMessage(error)); }
  }, [category, includeDeleted]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    if (!file) { setPreviewUrl(''); return undefined; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const filtered = useMemo(() => assets.filter((asset) =>
    `${asset.originalName} ${asset.altText ?? ''} ${asset.category}`.toLowerCase().includes(query.toLowerCase()),
  ).sort((a, b) => {
    if (sort === 'name') return (a.altText ?? a.originalName).localeCompare(b.altText ?? b.originalName);
    if (sort === 'usage') {
      const uses = (asset: MediaAsset) => asset.usage.products.length + asset.usage.options.length + asset.usage.presets.length;
      return uses(b) - uses(a);
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  }), [assets, query, sort]);

  const run = async (action: () => Promise<void>, message: string) => {
    setBusy(true);
    try { await action(); toast.success(message); await load(); }
    catch (error) { toast.error(getApiErrorMessage(error)); }
    finally { setBusy(false); }
  };

  const upload = async () => {
    if (!file || !uploadAlt.trim()) return;
    await run(async () => {
      const optimized = await optimizeImage(file, Number(uploadAspect), 1200, { x: focusX, y: focusY });
      await mediaAdminApi.upload({ ...optimized, altText: uploadAlt.trim(), category: uploadCategory });
      setFile(null); setUploadAlt('');
    }, 'Imagen optimizada y agregada');
  };

  return (
    <div>
      <PageHeader eyebrow="Contenido visual" title="Biblioteca de imágenes" description="Gestiona recursos locales, accesibilidad, usos y papelera sin romper referencias." icon={FileImage} />

      <Card className="mb-5">
        <div className="grid gap-4 lg:grid-cols-[260px_1fr_180px_auto] lg:items-end">
          <FileInput accept="image/jpeg,image/png,image/webp" label="Seleccionar imagen" onChange={(next) => { setFile(next); if (next && !uploadAlt) setUploadAlt(next.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' ')); }} />
          <Input label="Texto alternativo" value={uploadAlt} onChange={(event) => setUploadAlt(event.target.value)} placeholder="Describe el contenido visual" />
          <Select id="upload-category" label="Categoría" value={uploadCategory} onChange={(event) => setUploadCategory(event.target.value)}>{CATEGORIES.map((value) => <SelectOption key={value} value={value}>{value}</SelectOption>)}</Select>
          <Button disabled={!file || !uploadAlt.trim()} isLoading={busy} onClick={() => void upload()}><Upload className="size-4" /> Subir</Button>
        </div>
        {previewUrl && (
          <div className="mt-5 grid gap-5 border-t border-line pt-5 md:grid-cols-[240px_1fr]">
            <div className="overflow-hidden rounded-2xl bg-surface-muted shadow-inner" style={{ aspectRatio: uploadAspect }}>
              <img src={previewUrl} alt="Vista previa del recorte" className="size-full object-cover" style={{ objectPosition: `${focusX}% ${focusY}%` }} />
            </div>
            <div className="space-y-4">
              <p className="flex items-center gap-2 text-sm font-black text-ink"><Crop className="size-4 text-brand-700" /> Ajusta el recorte antes de subir</p>
              <Select id="upload-aspect" label="Formato" value={uploadAspect} onChange={(event) => setUploadAspect(event.target.value)}>
                <SelectOption value="1">Cuadrada · ingredientes</SelectOption><SelectOption value="1.333333">4:3 · productos</SelectOption><SelectOption value="1.777778">16:9 · banners</SelectOption>
              </Select>
              <label className="block text-xs font-semibold text-ink-muted">Enfoque horizontal<input aria-label="Enfoque horizontal" className="mt-2 w-full accent-brand-600" type="range" min="0" max="100" value={focusX} onChange={(event) => setFocusX(Number(event.target.value))} /></label>
              <label className="block text-xs font-semibold text-ink-muted">Enfoque vertical<input aria-label="Enfoque vertical" className="mt-2 w-full accent-brand-600" type="range" min="0" max="100" value={focusY} onChange={(event) => setFocusY(Number(event.target.value))} /></label>
              <p className="text-xs text-ink-muted">Se convertirá a WebP y se optimizará localmente antes de enviarse al servidor.</p>
            </div>
          </div>
        )}
      </Card>

      <div className="mb-5 flex flex-wrap gap-3">
        <div className="flex min-w-[240px] flex-1 items-center gap-2 rounded-xl border border-line bg-white px-3"><Search className="size-4 text-ink-muted" /><input className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar imagen" aria-label="Buscar imagen" /></div>
        <Select id="media-category" value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filtrar por categoría"><SelectOption value="">Todas las categorías</SelectOption>{CATEGORIES.map((value) => <SelectOption key={value} value={value}>{value}</SelectOption>)}</Select>
        <Select id="media-sort" value={sort} onChange={(event) => setSort(event.target.value as typeof sort)} aria-label="Ordenar imágenes"><SelectOption value="recent">Más recientes</SelectOption><SelectOption value="name">Por nombre</SelectOption><SelectOption value="usage">Más utilizadas</SelectOption></Select>
        <label className="flex items-center gap-2 rounded-xl border border-line bg-white px-3 text-sm"><input type="checkbox" checked={includeDeleted} onChange={(event) => setIncludeDeleted(event.target.checked)} className="size-4 accent-brand-600" /> Mostrar papelera</label>
      </div>

      {filtered.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {filtered.map((asset) => {
          const usage = asset.usage.products.length + asset.usage.options.length + asset.usage.presets.length;
          return <article key={asset.id} className={cn('group overflow-hidden rounded-2xl border bg-white shadow-sm', asset.deletedAt ? 'border-dashed border-red-200 opacity-65' : 'border-line')}>
            <div className="relative aspect-square overflow-hidden bg-surface-muted"><img src={asset.url} alt={asset.altText ?? ''} loading="lazy" width={700} height={700} className="size-full object-cover transition duration-300 group-hover:scale-[1.02]" />{asset.deletedAt && <span className="absolute left-2 top-2 rounded-full bg-red-600 px-2 py-1 text-[10px] font-bold text-white">Papelera</span>}</div>
            <div className="p-3"><p className="truncate font-bold text-ink">{asset.altText || asset.originalName}</p><div className="mt-1 flex items-center justify-between text-xs text-ink-muted"><span>{asset.category}</span><span className="inline-flex items-center gap-1"><Link2 className="size-3" /> {usage} usos</span></div>
              {usage > 0 && <p className="mt-2 line-clamp-2 text-[11px] text-ink-muted">{[...asset.usage.products, ...asset.usage.options, ...asset.usage.presets].map((item) => item.name).join(', ')}</p>}
              <div className="mt-3 flex gap-1">{asset.deletedAt ? <Button size="sm" variant="outline" onClick={() => void run(() => mediaAdminApi.restore(asset.id), 'Imagen restaurada')}><ArchiveRestore className="size-4" /> Restaurar</Button> : <><Button size="sm" variant="ghost" onClick={() => { setEditing(asset); setEditAlt(asset.altText ?? ''); setEditCategory(asset.category); }} aria-label="Editar metadatos"><Pencil className="size-4" /></Button><Button size="sm" variant="ghost" onClick={() => { setReplacing(asset); setReplacementId(''); }} disabled={usage === 0}><Link2 className="size-4" /> Reemplazar usos</Button><Button size="sm" variant="ghost" onClick={() => void run(() => mediaAdminApi.remove(asset.id), 'Imagen enviada a la papelera')} aria-label="Enviar a papelera"><Trash2 className="size-4" /></Button></>}</div>
            </div>
          </article>;
        })}
      </div> : <div className="rounded-2xl border border-dashed border-line bg-white p-12 text-center"><ImagePlus className="mx-auto size-10 text-brand-400" /><p className="mt-3 font-bold text-ink">No encontramos imágenes</p><p className="text-sm text-ink-muted">Cambia los filtros o sube un recurso nuevo.</p></div>}

      <Modal isOpen={editing !== null} onClose={() => setEditing(null)} title="Editar imagen" description="Actualiza los metadatos sin cambiar el archivo." maxWidth="sm"><div className="space-y-4"><Input label="Texto alternativo" value={editAlt} onChange={(event) => setEditAlt(event.target.value)} /><Select id="edit-media-category" label="Categoría" value={editCategory} onChange={(event) => setEditCategory(event.target.value)}>{CATEGORIES.map((value) => <SelectOption key={value} value={value}>{value}</SelectOption>)}</Select><Button className="w-full" isLoading={busy} onClick={() => editing && void run(() => mediaAdminApi.update(editing.id, { altText: editAlt, category: editCategory }).then(() => setEditing(null)), 'Imagen actualizada')}>Guardar cambios</Button></div></Modal>
      <Modal isOpen={replacing !== null} onClose={() => setReplacing(null)} title="Reemplazar referencias" description="Todos los productos, ingredientes y presets que usan esta imagen pasarán a la nueva." maxWidth="sm"><div className="space-y-4"><Select id="replacement" label="Imagen nueva" value={replacementId} onChange={(event) => setReplacementId(Number(event.target.value))}><SelectOption value="">Selecciona un recurso</SelectOption>{assets.filter((asset) => !asset.deletedAt && asset.id !== replacing?.id).map((asset) => <SelectOption key={asset.id} value={asset.id}>{asset.altText ?? asset.originalName}</SelectOption>)}</Select><Button className="w-full" disabled={!replacementId} isLoading={busy} onClick={() => replacing && replacementId && void run(() => mediaAdminApi.replace(replacing.id, Number(replacementId)).then(() => setReplacing(null)), 'Referencias reemplazadas')}>Reemplazar en todos los usos</Button></div></Modal>
    </div>
  );
};

export default MediaLibraryPage;
