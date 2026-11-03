import { useCallback, useEffect, useMemo, useState } from 'react';
import { Tooltip } from '@mui/material';
import { ArchiveRestore, Crop, FileImage, ImagePlus, Link2, Pencil, Search, Sparkles, Trash2, Upload } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { LoadError } from '@components/common/LoadError';
import { PageHeader } from '@components/common/PageHeader';
import { Button } from '@components/ui/Button';
import { Card } from '@components/ui/Card';
import { useConfirm } from '@components/ui/ConfirmDialog';
import { Dropzone } from '@components/ui/Dropzone';
import { Input } from '@components/ui/Input';
import { Modal } from '@components/ui/Modal';
import { Pagination } from '@components/ui/Pagination';
import { Select, SelectOption } from '@components/ui/Select';
import { getApiErrorMessage } from '@services/api/client';
import { cn } from '@lib/cn';
import { formatRelative } from '@lib/format';
import { mediaAdminApi, optimizeImage, type MediaAsset, type MediaListParams } from '../services/mediaAdmin.service';
import { AiImageGenerator } from '../components/AiImageGenerator';

const CATEGORIES = ['ingredients', 'products', 'categories', 'builder-presets', 'marketing'];
/** Tamano de pagina del servidor. Cuatro columnas en xl: seis filas completas. */
const PAGE_SIZE = 24;

/**
 * El servidor ya entiende `sort` (recent | name); falta anadirlo a
 * `MediaListParams` (vive en el paquete de servicios). Hasta entonces se declara
 * aqui para no perder el orden por nombre en la consulta.
 */
type MediaQuery = MediaListParams & { sort?: 'recent' | 'name' };

const SORTS = [
  { value: 'recent', label: 'Más recientes' },
  { value: 'name', label: 'Por nombre' },
  // El uso se calcula cruzando tres tablas DESPUES de la consulta, asi que solo
  // puede reordenar lo que ya esta en pantalla. La etiqueta lo dice para que
  // nadie lea "la más usada de la biblioteca" donde pone "de esta página".
  { value: 'usage', label: 'Más usadas · en esta página' },
] as const;
type SortValue = (typeof SORTS)[number]['value'];

const usageCount = (asset: MediaAsset) =>
  asset.usage.products.length + asset.usage.options.length + asset.usage.presets.length + asset.usage.categories.length + (asset.usage.inventoryItems?.length ?? 0) + (asset.usage.themes?.length ?? 0);

const MediaLibraryPage = () => {
  const confirm = useConfirm();
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [editing, setEditing] = useState<MediaAsset | null>(null);
  const [editAlt, setEditAlt] = useState('');
  const [editCategory, setEditCategory] = useState('ingredients');
  const [replacing, setReplacing] = useState<MediaAsset | null>(null);
  const [replacementId, setReplacementId] = useState<number | ''>('');
  const [candidates, setCandidates] = useState<MediaAsset[]>([]);
  const [candidateQuery, setCandidateQuery] = useState('');
  const [sourceMode, setSourceMode] = useState<'file' | 'url' | 'ai'>('file');
  const [sourceUrl, setSourceUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploadAlt, setUploadAlt] = useState('');
  const [uploadCategory, setUploadCategory] = useState('ingredients');
  const [uploadAspect, setUploadAspect] = useState('1');
  const [focusX, setFocusX] = useState(50);
  const [focusY, setFocusY] = useState(50);
  const [previewUrl, setPreviewUrl] = useState('');
  const [sort, setSort] = useState<SortValue>('recent');
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState(false);
  /** Accion en curso sobre UNA tarjeta: solo esa fila muestra su spinner. */
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: MediaQuery = {
        category: category === 'all' ? undefined : category,
        includeDeleted,
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
        sort: sort === 'usage' ? 'recent' : sort,
      };
      const { items, total: count } = await mediaAdminApi.list(params);
      setAssets(items);
      setTotal(count);
      setLoadError('');
    } catch (error) {
      // La lista se vacia a proposito: dejar la pagina anterior en pantalla con
      // un error al lado hace creer que los datos siguen vigentes.
      setAssets([]);
      setTotal(0);
      setLoadError(getApiErrorMessage(error));
    } finally {
      setIsLoading(false);
    }
  }, [category, includeDeleted, page, search, sort]);
  useEffect(() => { void load(); }, [load]);

  // El buscador consulta al servidor: sin espera, cada tecla seria una peticion.
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(query.trim()); setPage(1); }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    if (!file) { setPreviewUrl(''); return undefined; }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // Al filtrar por una categoria, lo que se sube pertenece a esa categoria: dar
  // por bueno "ingredients" hacia que la foto recien subida desapareciera de la
  // rejilla que se estaba mirando.
  useEffect(() => { if (category !== 'all') setUploadCategory(category); }, [category]);

  // Candidatos a reemplazo: se buscan en el SERVIDOR y no entre lo que hay en
  // pantalla, porque la imagen buena casi nunca esta en la misma pagina.
  useEffect(() => {
    if (!replacing) return undefined;
    let alive = true;
    const timer = setTimeout(() => {
      void mediaAdminApi
        .list({ limit: 50, search: candidateQuery.trim() || undefined })
        .then(({ items }) => { if (alive) setCandidates(items.filter((asset) => asset.id !== replacing.id)); })
        .catch((error) => { if (alive) toast.error(getApiErrorMessage(error)); });
    }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [replacing, candidateQuery]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // Mandar a la papelera el ultimo recurso de la ultima pagina dejaba la rejilla
  // en blanco sobre un contador que seguia diciendo que habia resultados.
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);

  const visible = useMemo(
    () => (sort === 'usage' ? [...assets].sort((a, b) => usageCount(b) - usageCount(a)) : assets),
    [assets, sort],
  );
  const replacementAsset = candidates.find((asset) => asset.id === replacementId) ?? null;

  /** `assetId` marca la tarjeta que actua; sin el, el spinner va en la barra de subida. */
  const run = async (action: () => Promise<void>, message: string, assetId?: number) => {
    if (assetId) setBusyId(assetId); else setBusy(true);
    try { await action(); toast.success(message); await load(); }
    catch (error) { toast.error(getApiErrorMessage(error)); }
    finally { if (assetId) setBusyId(null); else setBusy(false); }
  };

  const upload = async () => {
    if (!file || !uploadAlt.trim()) return;
    await run(async () => {
      const optimized = await optimizeImage(file, Number(uploadAspect), 1200, { x: focusX, y: focusY });
      await mediaAdminApi.upload({ ...optimized, altText: uploadAlt.trim(), category: uploadCategory });
      setFile(null); setUploadAlt('');
    }, 'Imagen optimizada y agregada');
  };

  const importFromUrl = async () => {
    if (!sourceUrl.trim() || !uploadAlt.trim()) return;
    await run(async () => {
      await mediaAdminApi.importFromUrl({ sourceUrl: sourceUrl.trim(), altText: uploadAlt.trim(), category: uploadCategory });
      setSourceUrl(''); setUploadAlt('');
    }, 'Imagen importada y guardada en la biblioteca');
  };

  /**
   * El borrado es LOGICO y el archivo se sigue sirviendo, asi que las fichas ya
   * publicadas no se rompen. Aun asi se confirma: la imagen desaparece de la
   * biblioteca y quien la mando ahi rara vez avisa al resto del equipo.
   */
  const sendToTrash = async (asset: MediaAsset) => {
    const uses = usageCount(asset);
    const name = asset.altText || asset.originalName;
    const { confirmed } = await confirm({
      title: 'Enviar a la papelera',
      message: uses > 0
        ? `«${name}» se usa en ${uses} ${uses === 1 ? 'ficha publicada' : 'fichas publicadas'}. El archivo se seguirá sirviendo y nada se romperá, pero la imagen dejará de aparecer en la biblioteca. Puedes restaurarla desde «Mostrar papelera».`
        : `«${name}» dejará de aparecer en la biblioteca. Es un borrado lógico: puedes restaurarla desde «Mostrar papelera».`,
      confirmLabel: 'Enviar a la papelera',
      tone: 'danger',
    });
    if (!confirmed) return;
    await run(() => mediaAdminApi.remove(asset.id), 'Imagen enviada a la papelera', asset.id);
  };

  return (
    <div>
      <PageHeader eyebrow="Contenido visual" title="Biblioteca de imágenes" description="Gestiona recursos locales, accesibilidad, usos y papelera sin romper referencias." icon={FileImage} />

      <Card className="mb-5 overflow-hidden p-0">
        <div className="border-b border-line bg-gradient-to-r from-brand-50 to-white px-5 py-4">
          <p className="flex items-center gap-2 font-extrabold text-ink"><ImagePlus className="size-4 text-brand-700" /> Agregar una imagen</p>
          <p className="mt-1 text-xs text-ink-muted">Sube una foto, importa una URL o genera una propuesta visual. Revisa el resultado antes de usarlo en una ficha.</p>
        </div>
        <div className="flex flex-wrap gap-2 border-b border-line px-4 py-3 sm:px-5">
          <Button size="sm" variant={sourceMode === 'file' ? 'primary' : 'secondary'} leftIcon={<Upload className="size-4" />} onClick={() => setSourceMode('file')}>Desde archivo</Button>
          <Button size="sm" variant={sourceMode === 'url' ? 'primary' : 'secondary'} leftIcon={<Link2 className="size-4" />} onClick={() => setSourceMode('url')}>Desde URL</Button>
          <Button size="sm" variant={sourceMode === 'ai' ? 'primary' : 'secondary'} leftIcon={<Sparkles className="size-4" />} onClick={() => setSourceMode('ai')}>Generar con IA</Button>
        </div>
        {sourceMode === 'ai' ? (
          <div className="grid max-w-8xl gap-4 p-4 sm:p-5">
            <div className="max-w-xs">
              <Select id="ai-upload-category" label="Carpeta de la biblioteca" value={uploadCategory} onChange={(event) => setUploadCategory(event.target.value)}>
                {CATEGORIES.map((value) => <SelectOption key={value} value={value}>{value}</SelectOption>)}
              </Select>
            </div>
            <AiImageGenerator category={uploadCategory} onSaved={(asset) => {
              const alreadyShowingNewest = category === asset.category && !includeDeleted && sort === 'recent' && page === 1 && !query && !search;
              setQuery('');
              setSearch('');
              setCategory(asset.category);
              setIncludeDeleted(false);
              setSort('recent');
              setPage(1);
              if (alreadyShowingNewest) void load();
            }} />
          </div>
        ) : <div className="grid min-w-0 gap-5 p-4 sm:p-5 lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
          {sourceMode === 'file' ? <Dropzone
            className="min-w-0"
            accept={['image/jpeg', 'image/png', 'image/webp']}
            maxSizeMb={12}
            label="Arrastra o elige una imagen"
            hint="JPG, PNG o WebP · se convierte a WebP al subir"
            onSelect={(next) => {
              setFile(next);
              if (!uploadAlt) setUploadAlt(next.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
            }}
          /> : (
            <div className="grid content-center gap-3 rounded-card border border-dashed border-brand-300 bg-brand-50/45 p-5">
              <div className="flex size-11 items-center justify-center rounded-field bg-white text-brand-700 shadow-e1"><Link2 className="size-5" /></div>
              <Input label="URL pública de la imagen" value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://sitio.com/imagen.jpg" hint="HTTPS · JPG, PNG o WebP · máximo 5 MB" />
              <p className="text-xs leading-5 text-ink-muted">La descargamos y validamos antes de guardarla. Tus productos no dependerán de que el sitio externo siga disponible.</p>
            </div>
          )}
          <div className="grid min-w-0 content-start gap-4">
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_190px]">
              <Input label="Texto alternativo" value={uploadAlt} onChange={(event) => setUploadAlt(event.target.value)} placeholder="Ej. Bowl de pollo con palta" hint="Describe la imagen para accesibilidad y búsquedas." />
              <Select id="upload-category" label="Categoría" value={uploadCategory} onChange={(event) => setUploadCategory(event.target.value)}>{CATEGORIES.map((value) => <SelectOption key={value} value={value}>{value}</SelectOption>)}</Select>
            </div>
            <div className="flex flex-col gap-2 rounded-field border border-line bg-surface-muted/55 p-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs leading-5 text-ink-muted">Se optimiza a WebP, máximo 1200 px. Podrás reemplazarla sin romper los productos que la usan.</p>
              <Button
                className="shrink-0 sm:min-w-32"
                disabled={sourceMode === 'file' ? !file || !uploadAlt.trim() : !sourceUrl.trim() || !uploadAlt.trim()}
                isLoading={busy}
                leftIcon={sourceMode === 'file' ? <Upload className="size-4" /> : <Link2 className="size-4" />}
                onClick={() => void (sourceMode === 'file' ? upload() : importFromUrl())}
              >
                {sourceMode === 'file' ? 'Subir imagen' : 'Importar imagen'}
              </Button>
            </div>
          </div>
        </div>}
        {sourceMode === 'file' && previewUrl && (
          <div className="grid gap-5 border-t border-line bg-surface-muted/35 p-5 md:grid-cols-[240px_1fr]">
            <div className="overflow-hidden rounded-card bg-surface-muted shadow-inner" style={{ aspectRatio: uploadAspect }}>
              <img src={previewUrl} alt="Vista previa del recorte" className="size-full object-cover" style={{ objectPosition: `${focusX}% ${focusY}%` }} />
            </div>
            <div className="grid gap-4">
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

      <div className="mb-4 grid gap-3 rounded-card border border-line bg-white p-3 shadow-e1 sm:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_220px_220px_auto]">
        <div className="flex min-w-60 flex-1 items-center gap-2 rounded-field border border-line bg-white px-3"><Search className="size-4 text-ink-muted" /><input className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nombre o descripción" aria-label="Buscar imagen" /></div>
        <Select id="media-category" label="Categoría" value={category} onChange={(event) => { setCategory(event.target.value); setPage(1); }} aria-label="Filtrar por categoría"><SelectOption value="all">Todas las categorías</SelectOption>{CATEGORIES.map((value) => <SelectOption key={value} value={value}>{value}</SelectOption>)}</Select>
        <Select id="media-sort" value={sort} onChange={(event) => { setSort(event.target.value as SortValue); setPage(1); }} aria-label="Ordenar imágenes">{SORTS.map((option) => <SelectOption key={option.value} value={option.value}>{option.label}</SelectOption>)}</Select>
        <label className="flex min-h-11 items-center gap-2 rounded-field border border-line bg-white px-3 text-sm"><input type="checkbox" checked={includeDeleted} onChange={(event) => { setIncludeDeleted(event.target.checked); setPage(1); }} className="size-4 accent-brand-600" /> Mostrar papelera</label>
      </div>

      {/* Contador REAL: antes decia "{assets.length} recursos" sobre un listado
          cortado en 250, asi que a partir de ahi siempre mostraba el mismo 250. */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-muted">
        <p>
          {isLoading ? 'Cargando…' : `${total} ${total === 1 ? 'recurso' : 'recursos'}`}
          {!isLoading && search && ' que coinciden con la búsqueda'}
          {!isLoading && includeDeleted && ', papelera incluida'}
          {!isLoading && totalPages > 1 && ` · página ${page} de ${totalPages}`}
        </p>
        <Pagination page={page} totalPages={totalPages} onChange={setPage} />
      </div>

      {loadError ? <LoadError message={loadError} onRetry={() => void load()} /> : visible.length ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
        {visible.map((asset) => {
          const usage = usageCount(asset);
          const acting = busyId === asset.id;
          return <article key={asset.id} className={cn('group overflow-hidden rounded-card border bg-white shadow-e1', asset.deletedAt ? 'border-dashed border-red-200 opacity-65' : 'border-line')}>
            <div className="relative aspect-square overflow-hidden bg-surface-muted"><img src={asset.url} alt={asset.altText ?? ''} loading="lazy" width={700} height={700} className="size-full object-cover transition duration-300 group-hover:scale-[1.02]" />{asset.deletedAt ? <span className="absolute left-2 top-2 rounded-pill bg-red-600 px-2 py-1 text-[10px] font-bold text-white">Papelera</span> : asset.originalName.startsWith('flux-') ? <span className="absolute left-2 top-2 rounded-pill bg-brand-700 px-2 py-1 text-[10px] font-bold text-white">Generada con IA</span> : null}</div>
            <div className="p-3"><p className="truncate font-bold text-ink">{asset.altText || asset.originalName}</p><div className="mt-1 flex items-center justify-between text-xs text-ink-muted"><span className="truncate">{asset.category} · {formatRelative(asset.createdAt)}</span><span className="inline-flex shrink-0 items-center gap-1"><Link2 className="size-3" /> {usage} usos</span></div>
              {usage > 0 && <p className="mt-2 line-clamp-2 text-[11px] text-ink-muted">{[...asset.usage.products, ...asset.usage.options, ...asset.usage.presets, ...asset.usage.categories, ...(asset.usage.inventoryItems ?? []), ...(asset.usage.themes ?? [])].map((item) => item.name).join(', ')}</p>}
              {/* `flex-wrap`: en la columna xl las tres acciones suman ~281 px sobre
                  ~198 utiles, y la etiqueta "Reemplazar" acababa encima de la papelera. */}
              <div className="mt-3 flex flex-wrap gap-1">{asset.deletedAt
                ? <Button size="sm" variant="outline" isLoading={acting} leftIcon={<ArchiveRestore className="size-4" />} onClick={() => void run(() => mediaAdminApi.restore(asset.id), 'Imagen restaurada', asset.id)}>Restaurar</Button>
                : <>
                    <Tooltip title="Editar texto alternativo y categoría"><span className="inline-flex"><Button size="sm" variant="ghost" disabled={acting} onClick={() => { setEditing(asset); setEditAlt(asset.altText ?? ''); setEditCategory(asset.category); }} aria-label="Editar metadatos"><Pencil className="size-4" /></Button></span></Tooltip>
                    <Button size="sm" variant="ghost" disabled={acting || usage === 0} leftIcon={<Link2 className="size-4" />} onClick={() => { setReplacing(asset); setReplacementId(''); setCandidateQuery(''); setCandidates([]); }}>Reemplazar</Button>
                    <Tooltip title="Enviar a la papelera"><span className="inline-flex"><Button size="sm" variant="ghost" isLoading={acting} onClick={() => void sendToTrash(asset)} aria-label="Enviar a la papelera"><Trash2 className="size-4" /></Button></span></Tooltip>
                  </>}</div>
            </div>
          </article>;
        })}
      </div> : <div className="rounded-card border border-dashed border-line bg-white p-12 text-center"><ImagePlus className="mx-auto size-10 text-brand-400" /><p className="mt-3 font-bold text-ink">{isLoading ? 'Buscando imágenes…' : 'No encontramos imágenes'}</p><p className="text-sm text-ink-muted">Cambia los filtros o sube un recurso nuevo.</p></div>}

      {!loadError && totalPages > 1 && <div className="mt-6 flex justify-center"><Pagination page={page} totalPages={totalPages} onChange={setPage} /></div>}

      <Modal
        isOpen={editing !== null}
        onClose={() => setEditing(null)}
        title="Editar información de la imagen"
        description="Una descripción clara mejora la accesibilidad y ayuda a encontrar el recurso después."
        icon={Pencil}
        eyebrow="Contenido visual"
        maxWidth="sm"
        headerAside={editing && <img src={editing.url} alt="" className="hidden size-16 rounded-card border-2 border-white object-cover shadow-e2 sm:block" />}
        actions={<><Button variant="outline" disabled={busy} onClick={() => setEditing(null)}>Cancelar</Button><Button isLoading={busy} disabled={!editAlt.trim()} onClick={() => editing && void run(() => mediaAdminApi.update(editing.id, { altText: editAlt.trim(), category: editCategory }).then(() => setEditing(null)), 'Imagen actualizada')}>Guardar cambios</Button></>}
      >
        <div className="grid gap-5 sm:grid-cols-[130px_1fr]">
          <div className="overflow-hidden rounded-card border border-line bg-surface-muted shadow-e1"><div className="aspect-square">{editing && <img src={editing.url} alt={editAlt} className="size-full object-cover" />}</div><p className="truncate border-t border-line px-2 py-2 text-[10px] text-ink-muted">{editing?.originalName}</p></div>
          <div className="grid content-start gap-4"><Input label="Texto alternativo" value={editAlt} onChange={(event) => setEditAlt(event.target.value)} hint="Describe lo importante de la foto, sin comenzar con “imagen de”." /><Select id="edit-media-category" label="Categoría" value={editCategory} onChange={(event) => setEditCategory(event.target.value)}>{CATEGORIES.map((value) => <SelectOption key={value} value={value}>{value}</SelectOption>)}</Select></div>
        </div>
      </Modal>
      <Modal
        isOpen={replacing !== null}
        onClose={() => setReplacing(null)}
        title="Reemplazar referencias"
        description="Revisa visualmente el cambio antes de actualizar todos sus usos."
        icon={Link2}
        eyebrow={`${replacing ? usageCount(replacing) : 0} usos vinculados`}
        maxWidth="md"
        disableBackdropClose
        actions={<><Button variant="outline" disabled={busy} onClick={() => setReplacing(null)}>Cancelar</Button><Button disabled={!replacementId} isLoading={busy} onClick={() => replacing && replacementId && void run(() => mediaAdminApi.replace(replacing.id, Number(replacementId)).then(() => setReplacing(null)), 'Referencias reemplazadas')}>Reemplazar en todos los usos</Button></>}
      >
        <div className="grid gap-4">
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-card border border-line bg-surface-muted/50 p-3">
            <div className="min-w-0"><p className="mb-2 text-[10px] font-bold uppercase tracking-[.08em] text-ink-muted">Imagen actual</p><div className="aspect-[4/3] overflow-hidden rounded-field bg-white">{replacing && <img src={replacing.url} alt={replacing.altText ?? ''} className="size-full object-cover" />}</div><p className="mt-2 truncate text-xs font-semibold text-ink">{replacing?.altText || replacing?.originalName}</p></div>
            <div className="grid size-9 place-items-center rounded-full bg-white text-brand-700 shadow-e1"><ArchiveRestore className="size-4" /></div>
            <div className="min-w-0"><p className="mb-2 text-[10px] font-bold uppercase tracking-[.08em] text-ink-muted">Imagen nueva</p><div className="aspect-[4/3] overflow-hidden rounded-field border border-dashed border-line bg-white">{replacementAsset ? <img src={replacementAsset.url} alt={replacementAsset.altText ?? ''} className="size-full object-cover" /> : <span className="grid size-full place-items-center text-center text-xs text-ink-muted">Selecciona<br />un recurso</span>}</div><p className="mt-2 truncate text-xs font-semibold text-ink">{replacementAsset?.altText || replacementAsset?.originalName || 'Sin seleccionar'}</p></div>
          </div>
          {/* El sustituto se busca en el servidor: casi nunca esta en la misma
              pagina que la imagen que se quiere jubilar. */}
          <Input label="Buscar el recurso nuevo" value={candidateQuery} onChange={(event) => { setCandidateQuery(event.target.value); setReplacementId(''); }} placeholder="Nombre o descripción" hint="Se listan las 50 coincidencias más recientes." />
          <Select id="replacement" label="Imagen nueva" value={replacementId} onChange={(event) => setReplacementId(Number(event.target.value))}>
            <SelectOption value="">{candidates.length ? 'Selecciona un recurso' : 'Sin coincidencias'}</SelectOption>
            {candidates.map((asset) => <SelectOption key={asset.id} value={asset.id}>{asset.altText ?? asset.originalName}</SelectOption>)}
          </Select>
        </div>
      </Modal>
    </div>
  );
};

export default MediaLibraryPage;
