import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ImagePlus, Library, Link2, Loader2, Search, Sparkles, Trash2, Upload } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { LoadError } from '@components/common/LoadError';
import { Button } from '@components/ui/Button';
import { Dropzone } from '@components/ui/Dropzone';
import { Input } from '@components/ui/Input';
import { Modal } from '@components/ui/Modal';
import { Pagination } from '@components/ui/Pagination';
import { Select, SelectOption } from '@components/ui/Select';
import { cn } from '@lib/cn';
import { getApiErrorMessage } from '@services/api/client';
import { mediaAdminApi, optimizeImage, type MediaAsset } from '../services/mediaAdmin.service';
import { AiImageGenerator, type ImagePurpose } from './AiImageGenerator';

/** Lo que acepta el backend (media.service.ts) y lo que se puede optimizar en canvas. */
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
/** El original puede pesar mas: se recorta y recomprime antes de enviarlo. */
const MAX_SOURCE_MB = 12;
/** Limite real del servidor sobre el archivo ya optimizado. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Espejo de las categorias de la biblioteca (MediaLibraryPage). */
const CATEGORIES = ['ingredients', 'products', 'categories', 'builder-presets', 'marketing'];
const CATEGORY_LABELS: Record<string, string> = {
  ingredients: 'Ingredientes',
  products: 'Productos',
  categories: 'Categorías',
  'builder-presets': 'Opciones del constructor',
  marketing: 'Promociones',
};
/** Doce miniaturas: tres filas completas en el ancho habitual del dialogo. */
const PAGE_SIZE = 12;
type MediaTab = 'library' | 'upload' | 'url' | 'ai';

const ASPECTS = [
  { value: 1, label: 'Cuadrada 1:1 · ingredientes' },
  { value: 4 / 3, label: 'Horizontal 4:3 · productos' },
  { value: 16 / 9, label: 'Panoramica 16:9 · banners' },
];

interface MediaPickerProps {
  value: string;
  altText?: string;
  label?: string;
  category?: string;
  imagePurpose?: ImagePurpose;
  subjectName?: string;
  subjectDescription?: string;
  /** Apila controles cuando el selector vive en una columna lateral estrecha. */
  layout?: 'inline' | 'stacked';
  /** Proporcion sugerida del recorte. El admin puede cambiarla al subir. */
  aspect?: number;
  /** Texto de ayuda bajo el control (p. ej. el criterio editorial de la foto). */
  hint?: string;
  error?: string;
  disabled?: boolean;
  onChange: (image: { url: string; altText: string }) => void;
}

/**
 * Selector de imagen del panel.
 *
 * Las imagenes NO se referencian por URL externa: se suben al servidor, que las
 * guarda en disco y las sirve desde /api/v1/media/files. Pegar un enlace de fuera
 * significaba que el catalogo se rompia el dia que ese dominio caia o cambiaba la
 * ruta, y que nadie podia saber que fotos estaban en uso.
 *
 * Permite reutilizar, subir, importar o generar una imagen. El resultado se
 * selecciona en la ficha; esta se guarda por separado.
 */
export const MediaPicker = ({
  value,
  altText = '',
  label = 'Imagen',
  category = 'ingredients',
  imagePurpose,
  subjectName = '',
  subjectDescription = '',
  layout = 'inline',
  aspect = 1,
  hint,
  error,
  disabled = false,
  onChange,
}: MediaPickerProps) => {
  const [open, setOpen] = useState(false);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  /** Categoria que se esta OJEANDO. Vacia = todas. Arranca en la del contexto. */
  const [browseCategory, setBrowseCategory] = useState(category);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingUrl, setPendingUrl] = useState('');
  const [pendingAlt, setPendingAlt] = useState(altText);
  const [pendingUrlAlt, setPendingUrlAlt] = useState('');
  const [pendingAspect, setPendingAspect] = useState(aspect);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<MediaTab>('library');
  const [dialogSession, setDialogSession] = useState(0);
  const loadRequestId = useRef(0);

  /** Buscar en otra carpeta no cambia dónde se guardará la imagen de esta ficha. */
  const uploadCategory = category;

  const load = useCallback(async () => {
    const requestId = ++loadRequestId.current;
    setIsFetching(true);
    try {
      const { items, total: count } = await mediaAdminApi.list({
        category: browseCategory || undefined,
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
      });
      if (requestId === loadRequestId.current) {
        setAssets(items);
        setTotal(count);
        setLoadError('');
      }
    } catch (requestError) {
      if (requestId === loadRequestId.current) {
        setAssets([]);
        setTotal(0);
        setLoadError(getApiErrorMessage(requestError));
      }
    } finally {
      if (requestId === loadRequestId.current) setIsFetching(false);
    }
  }, [browseCategory, page, search]);

  useEffect(() => {
    if (open) void load();
  }, [open, load]);

  // Buscar consulta al SERVIDOR (la biblioteca ya no cabe entera en el cliente),
  // asi que se espera a que el admin deje de teclear.
  useEffect(() => {
    const timer = setTimeout(() => { setSearch(query.trim()); setPage(1); }, 350);
    return () => clearTimeout(timer);
  }, [query]);

  // La URL del objeto se libera al cambiar de archivo o al desmontar: sin esto,
  // cada previsualizacion deja el blob retenido durante toda la sesion.
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const chooseFile = (file: File) => {
    if (preview) URL.revokeObjectURL(preview);
    setPendingFile(file);
    setPreview(URL.createObjectURL(file));
    setUploadError('');
    setPendingAlt('');
  };

  const closeModal = () => {
    loadRequestId.current += 1;
    setOpen(false);
    setActiveTab('library');
    setPendingFile(null);
    setPendingUrl('');
    setPendingUrlAlt('');
    setPreview(null);
    setUploadError('');
  };

  const upload = async () => {
    if (!pendingFile) return;
    if (!pendingAlt.trim()) {
      setUploadError('Describe la imagen: es lo que leen los lectores de pantalla.');
      return;
    }

    setLoading(true);
    setUploadError('');
    try {
      const optimized = await optimizeImage(pendingFile, pendingAspect);
      // El dataUrl viaja en base64 (~4/3 del binario); se comprueba el tamaño real.
      const bytes = Math.floor((optimized.dataUrl.length - optimized.dataUrl.indexOf(',') - 1) * 0.75);
      if (bytes > MAX_UPLOAD_BYTES) {
        setUploadError('Incluso optimizada la imagen supera 5 MB. Prueba con uno de menor resolucion.');
        return;
      }

      const asset = await mediaAdminApi.upload({
        ...optimized,
        altText: pendingAlt.trim(),
        category: uploadCategory,
      });
      onChange({ url: asset.url, altText: asset.altText ?? pendingAlt.trim() });
      toast.success('Imagen optimizada y guardada');
      closeModal();
    } catch (requestError) {
      setUploadError(getApiErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  const importRemote = async () => {
    if (!pendingUrl.trim()) return;
    if (!pendingUrlAlt.trim()) {
      setUploadError('Describe la imagen: es lo que leen los lectores de pantalla.');
      return;
    }
    try {
      if (new URL(pendingUrl.trim()).protocol !== 'https:') {
        setUploadError('Usa una dirección pública que empiece por https://.');
        return;
      }
    } catch {
      setUploadError('Escribe una dirección HTTPS válida.');
      return;
    }
    setLoading(true);
    setUploadError('');
    try {
      const asset = await mediaAdminApi.importFromUrl({
        sourceUrl: pendingUrl.trim(),
        altText: pendingUrlAlt.trim(),
        category: uploadCategory,
      });
      onChange({ url: asset.url, altText: asset.altText ?? pendingUrlAlt.trim() });
      toast.success('Imagen importada y guardada');
      closeModal();
    } catch (requestError) {
      setUploadError(getApiErrorMessage(requestError));
    } finally {
      setLoading(false);
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const categoryOptions = CATEGORIES.includes(category) ? CATEGORIES : [...CATEGORIES, category];

  return (
    <>
      <div className="min-w-0 w-full max-w-full">
        <p className="mb-1.5 text-sm font-medium text-ink">{label}</p>
        <div
          className={cn(
            'min-w-0 w-full max-w-full overflow-hidden rounded-card border bg-white p-2.5',
            layout === 'stacked' ? 'grid gap-3' : 'flex flex-wrap items-center gap-3',
            error ? 'border-red-300' : 'border-line',
          )}
        >
          <div className={cn('min-w-0', layout === 'stacked' ? 'grid w-full gap-2.5' : 'flex flex-1 items-center gap-3')}>
            <span className={cn('grid shrink-0 place-items-center overflow-hidden rounded-card bg-surface-muted', layout === 'stacked' ? 'aspect-4/3 w-full' : 'size-16')}>
              {value ? (
                <img src={value} alt={altText} className="size-full object-cover" />
              ) : (
                <ImagePlus className={cn('text-brand-500', layout === 'stacked' ? 'size-10' : 'size-6')} />
              )}
            </span>

            <div className="min-w-0 flex-1">
              <p className={cn('text-sm font-semibold text-ink', layout === 'stacked' ? 'break-words' : 'truncate')}>
                {value ? altText || 'Imagen seleccionada' : 'Sin imagen seleccionada'}
              </p>
              <p className={cn('text-xs leading-5 text-ink-muted', layout === 'stacked' ? 'break-words' : 'truncate')}>
                {hint ?? 'Se sube al servidor y se convierte a WebP · hasta 5 MB'}
              </p>
            </div>
          </div>

          <div className={cn('flex w-full gap-2', layout === 'inline' && 'sm:w-auto sm:shrink-0')}>
            <Button
              size="sm"
              variant="outline"
              className={cn('min-w-0 flex-1', layout === 'inline' && 'sm:flex-none')}
              disabled={disabled}
              onClick={() => {
                // Al reemplazar una foto no se hereda su descripción: una
                // imagen distinta necesita un texto alternativo propio.
                setPendingAlt('');
                setPendingAspect(aspect);
                // Cada apertura arranca limpia: en la categoria del contexto,
                // sin busqueda previa y en la primera pagina.
                setBrowseCategory(category);
                setQuery('');
                setSearch('');
                setPage(1);
                setActiveTab('library');
                setDialogSession((current) => current + 1);
                setOpen(true);
              }}
            >
              {value ? 'Cambiar imagen' : 'Elegir imagen'}
            </Button>
            {value && (
              <Button
                size="sm"
                variant="ghost"
                className="shrink-0"
                disabled={disabled}
                aria-label="Quitar imagen"
                onClick={() => onChange({ url: '', altText: '' })}
              >
                <Trash2 className="size-4" />
              </Button>
            )}
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-1.5 text-xs font-semibold text-red-600">
            {error}
          </p>
        )}
      </div>

      <Modal
        isOpen={open}
        onClose={() => { if (!loading) closeModal(); }}
        title="Elegir imagen"
        description="Elige una imagen guardada, sube una foto, importa una URL o genera una propuesta con IA."
        icon={Library}
        eyebrow="Contenido visual"
        maxWidth="lg"
        disableBackdropClose
      >
        <div className="mb-4 rounded-field border border-brand-100 bg-brand-50/50 px-3 py-2 text-xs leading-5 text-ink-muted">
          {subjectName.trim() && <span className="font-bold text-ink">Para {subjectName.trim()}. </span>}
          La imagen se asociará cuando guardes la ficha.
        </div>
        <div role="group" aria-label="Formas de elegir una imagen" className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {([
            { id: 'library', label: 'Biblioteca', Icon: Library },
            { id: 'upload', label: 'Subir foto', Icon: Upload },
            { id: 'url', label: 'Desde URL', Icon: Link2 },
            { id: 'ai', label: 'Generar con IA', Icon: Sparkles },
          ] as const).map(({ id, label: tabLabel, Icon }) => (
            <button
              key={id}
              type="button"
              aria-pressed={activeTab === id}
              disabled={loading}
              onClick={() => { setActiveTab(id); setUploadError(''); }}
              className={cn(
                'flex min-h-11 items-center justify-center gap-2 rounded-field border px-2 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                activeTab === id ? 'border-brand-700 bg-brand-700 text-white' : 'border-line bg-white text-ink hover:border-brand-400 hover:bg-brand-50',
              )}
            >
              <Icon className="size-4 shrink-0" /> {tabLabel}
            </button>
          ))}
        </div>

        {activeTab === 'library' && (
          <section aria-label="Biblioteca de imágenes" className="grid gap-4">
            <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_190px]">
              <div className="flex min-w-0 items-center gap-2 rounded-field border border-line bg-white px-3">
                <Search className="size-4 shrink-0 text-ink-muted" />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar por nombre o descripción"
                  aria-label="Buscar en la biblioteca"
                  className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none"
                />
              </div>
              <Select
                id="media-picker-category"
                value={browseCategory}
                aria-label="Categoría de la biblioteca"
                onChange={(event) => { setBrowseCategory(event.target.value); setPage(1); }}
              >
                <SelectOption value="">Todas las categorías</SelectOption>
                {categoryOptions.map((option) => (
                  <SelectOption key={option} value={option}>{CATEGORY_LABELS[option] ?? option}</SelectOption>
                ))}
              </Select>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
              <span className="inline-flex items-center gap-1"><Library className="size-4" /> {isFetching ? 'Buscando…' : total + ' ' + (total === 1 ? 'imagen' : 'imágenes')}</span>
              {totalPages > 1 && <Pagination page={page} totalPages={totalPages} onChange={setPage} />}
            </div>
            {loadError ? (
              <LoadError message={loadError} onRetry={() => void load()} />
            ) : isFetching ? (
              <div className="flex min-h-50 items-center justify-center"><Loader2 className="size-6 animate-spin text-brand-600" /></div>
            ) : assets.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {assets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
                    disabled={loading}
                    onClick={() => {
                      onChange({ url: asset.url, altText: asset.altText ?? asset.originalName });
                      closeModal();
                    }}
                    className={cn(
                      'group overflow-hidden rounded-card border bg-white text-left transition hover:border-brand-400 hover:shadow-e2',
                      value === asset.url ? 'border-brand-600 ring-1 ring-brand-600' : 'border-line',
                    )}
                  >
                    <span className="relative block aspect-square overflow-hidden bg-surface-muted">
                      <img src={asset.url} alt={asset.altText ?? ''} loading="lazy" className="size-full object-cover transition group-hover:scale-105" />
                      {value === asset.url && <span className="absolute right-2 top-2 rounded-pill bg-brand-600 p-1 text-white"><Check className="size-3" /></span>}
                    </span>
                    <span className="block truncate p-2 text-xs font-medium text-ink">{asset.altText ?? asset.originalName}</span>
                  </button>
                ))}
              </div>
            ) : (
              <div className="grid justify-items-center gap-3 rounded-card border border-dashed border-line bg-surface-muted/35 px-4 py-8 text-center">
                <ImagePlus className="size-8 text-brand-400" />
                <div>
                  <p className="text-sm font-bold text-ink">{search ? 'No encontramos coincidencias' : 'Aún no hay imágenes en esta carpeta'}</p>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">Puedes buscar en otras carpetas o añadir una imagen para esta ficha.</p>
                </div>
                <div className="flex flex-wrap justify-center gap-2">
                  {(search || browseCategory) && <Button size="sm" variant="outline" onClick={() => { setQuery(''); setSearch(''); setBrowseCategory(''); setPage(1); }}>Ver todas</Button>}
                  <Button size="sm" variant="outline" onClick={() => setActiveTab('upload')}>Subir foto</Button>
                  <Button size="sm" onClick={() => setActiveTab('ai')} leftIcon={<Sparkles className="size-4" />}>Generar con IA</Button>
                </div>
              </div>
            )}
          </section>
        )}

        {activeTab === 'upload' && (
          <section aria-label="Subir foto" className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="grid content-start gap-3">
              <Dropzone
                accept={ACCEPTED}
                maxSizeMb={MAX_SOURCE_MB}
                disabled={loading}
                onSelect={chooseFile}
                hint={'JPG, PNG o WebP · hasta ' + MAX_SOURCE_MB + ' MB; se optimiza al subir'}
              />
              {pendingFile && <p className="text-xs font-semibold text-ink" role="status">Archivo elegido: {pendingFile.name}</p>}
              {preview && (
                <div className="mx-auto w-full max-w-80 overflow-hidden rounded-card bg-white ring-1 ring-line" style={{ aspectRatio: pendingAspect }}>
                  <img src={preview} alt="Vista previa del recorte central" className="size-full object-cover" />
                </div>
              )}
            </div>
            <div className="grid content-start gap-4">
              <Select
                id="media-picker-aspect"
                label="Formato del recorte"
                value={String(pendingAspect)}
                disabled={loading}
                onChange={(event) => setPendingAspect(Number(event.target.value))}
              >
                {ASPECTS.map((option) => <SelectOption key={option.label} value={String(option.value)}>{option.label}</SelectOption>)}
              </Select>
              <Input
                label="Texto alternativo"
                value={pendingAlt}
                onChange={(event) => { setPendingAlt(event.target.value); setUploadError(''); }}
                placeholder="Ej. Torta de chocolate con fresas"
                hint="Describe lo que realmente se ve en la foto."
              />
              <p className="text-xs leading-5 text-ink-muted">Se guardará en <strong className="text-ink">{CATEGORY_LABELS[uploadCategory] ?? uploadCategory}</strong>. El recorte se hace desde el centro.</p>
              {uploadError && <p role="alert" className="text-xs font-semibold leading-5 text-red-600">{uploadError}</p>}
              <Button disabled={!pendingFile || !pendingAlt.trim()} isLoading={loading} onClick={() => void upload()}>Optimizar y elegir foto</Button>
            </div>
          </section>
        )}

        {activeTab === 'url' && (
          <section aria-label="Importar desde URL" className="mx-auto grid max-w-xl gap-4">
            <p className="text-sm leading-6 text-ink-muted">Importa una imagen pública con dirección HTTPS. Se guardará en tu biblioteca para que siga disponible aunque cambie el sitio de origen.</p>
            <Input
              label="URL pública HTTPS"
              type="url"
              value={pendingUrl}
              onChange={(event) => { setPendingUrl(event.target.value); setUploadError(''); }}
              placeholder="https://sitio.com/imagen.jpg"
            />
            <Input
              label="Texto alternativo"
              value={pendingUrlAlt}
              onChange={(event) => { setPendingUrlAlt(event.target.value); setUploadError(''); }}
              placeholder="Describe lo que muestra la imagen"
              hint="Ayuda a lectores de pantalla y búsquedas."
            />
            <p className="text-xs text-ink-muted">Carpeta de destino: <strong className="text-ink">{CATEGORY_LABELS[uploadCategory] ?? uploadCategory}</strong>.</p>
            {uploadError && <p role="alert" className="text-xs font-semibold leading-5 text-red-600">{uploadError}</p>}
            <Button disabled={!pendingUrl.trim() || !pendingUrlAlt.trim()} isLoading={loading} leftIcon={<Link2 className="size-4" />} onClick={() => void importRemote()}>Importar y elegir imagen</Button>
          </section>
        )}

        <div aria-label="Generar con IA" className={activeTab === 'ai' ? '' : 'hidden'}>
          <AiImageGenerator
            key={dialogSession}
            category={uploadCategory}
            contextCategory={category}
            purpose={imagePurpose}
            subjectName={subjectName}
            subjectDescription={subjectDescription}
            saveLabel="Guardar y elegir imagen"
            onSaved={(asset) => {
              onChange({ url: asset.url, altText: asset.altText ?? '' });
              closeModal();
            }}
          />
        </div>
      </Modal>
    </>
  );
};
