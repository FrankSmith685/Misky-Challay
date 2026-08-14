import { useCallback, useEffect, useState } from 'react';
import { Check, ImagePlus, Library, Link2, Loader2, Search, Trash2, Upload } from 'lucide-react';
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

/** Lo que acepta el backend (media.service.ts) y lo que se puede optimizar en canvas. */
const ACCEPTED = ['image/jpeg', 'image/png', 'image/webp'];
/** El original puede pesar mas: se recorta y recomprime antes de enviarlo. */
const MAX_SOURCE_MB = 12;
/** Limite real del servidor sobre el archivo ya optimizado. */
const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Espejo de las categorias de la biblioteca (MediaLibraryPage). */
const CATEGORIES = ['ingredients', 'products', 'builder-presets', 'marketing'];
/** Doce miniaturas: tres filas completas en el ancho habitual del dialogo. */
const PAGE_SIZE = 12;

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
 * Dos caminos, uno solo por sesion de trabajo: subir una nueva (se recorta y
 * convierte a WebP en el navegador) o reutilizar una de la biblioteca.
 */
export const MediaPicker = ({
  value,
  altText = '',
  label = 'Imagen',
  category = 'ingredients',
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
  const [pendingAspect, setPendingAspect] = useState(aspect);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState('');
  const [loadError, setLoadError] = useState('');
  const [isFetching, setIsFetching] = useState(false);
  const [loading, setLoading] = useState(false);

  /**
   * La subida hereda la categoria que se esta ojeando: si el editor abrio el
   * dialogo en "ingredients" y el admin se movio a "products", subir a
   * "ingredients" dejaria la foto fuera de la rejilla que esta mirando. Con
   * "Todas" seleccionada se vuelve a la del contexto.
   */
  const uploadCategory = browseCategory || category;

  const load = useCallback(async () => {
    setIsFetching(true);
    try {
      const { items, total: count } = await mediaAdminApi.list({
        category: browseCategory || undefined,
        page,
        limit: PAGE_SIZE,
        search: search || undefined,
      });
      setAssets(items);
      setTotal(count);
      setLoadError('');
    } catch (requestError) {
      setAssets([]);
      setTotal(0);
      setLoadError(getApiErrorMessage(requestError));
    } finally {
      setIsFetching(false);
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
    if (!pendingAlt.trim()) {
      setPendingAlt(file.name.replace(/\.[^.]+$/, '').replace(/[-_]/g, ' '));
    }
  };

  const closeModal = () => {
    setOpen(false);
    setPendingFile(null);
    setPendingUrl('');
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
    if (!pendingAlt.trim()) {
      setUploadError('Describe la imagen: es lo que leen los lectores de pantalla.');
      return;
    }
    setLoading(true);
    setUploadError('');
    try {
      const asset = await mediaAdminApi.importFromUrl({
        sourceUrl: pendingUrl.trim(),
        altText: pendingAlt.trim(),
        category: uploadCategory,
      });
      onChange({ url: asset.url, altText: asset.altText ?? pendingAlt.trim() });
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
      <div>
        <p className="mb-1.5 text-sm font-medium text-ink">{label}</p>
        <div
          className={cn(
            'flex min-w-0 flex-wrap items-center gap-3 rounded-card border bg-white p-2.5',
            error ? 'border-red-300' : 'border-line',
          )}
        >
          <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-card bg-surface-muted">
            {value ? (
              <img src={value} alt={altText} className="size-full object-cover" />
            ) : (
              <ImagePlus className="size-6 text-brand-500" />
            )}
          </span>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-ink">
              {value ? altText || 'Imagen seleccionada' : 'Sin imagen'}
            </p>
            <p className="truncate text-xs text-ink-muted">
              {hint ?? 'Se sube al servidor y se convierte a WebP · hasta 5 MB'}
            </p>
          </div>

          <div className="flex w-full gap-2 sm:w-auto sm:shrink-0">
            <Button
              size="sm"
              variant="outline"
              className="min-w-0 flex-1 sm:flex-none"
              disabled={disabled}
              onClick={() => {
                setPendingAlt(altText);
                setPendingAspect(aspect);
                // Cada apertura arranca limpia: en la categoria del contexto,
                // sin busqueda previa y en la primera pagina.
                setBrowseCategory(category);
                setQuery('');
                setSearch('');
                setPage(1);
                setOpen(true);
              }}
            >
              {value ? 'Cambiar' : 'Elegir o subir'}
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
        onClose={closeModal}
        title="Biblioteca de imágenes"
        description="Sube una foto desde tu equipo o reutiliza un recurso ya publicado. Todo se guarda en el servidor."
        icon={Library}
        eyebrow="Contenido visual"
        maxWidth="xl"
      >
        {/* Dos columnas ya en `md`: saltar solo en `lg` dejaba el panel de subida
            (400-600 px) empujando la galeria fuera de vista en CUALQUIER tablet,
            con un scroll anidado dentro de un DialogContent que ya scrollea. */}
        <div className="grid gap-6 md:grid-cols-[300px_1fr]">
          <section className="grid h-fit gap-4 rounded-card border border-line bg-surface-muted/35 p-4">
            <div className="flex items-center gap-2 font-bold text-ink">
              <Upload className="size-4 text-brand-600" /> Nueva imagen
            </div>

            <Dropzone
              accept={ACCEPTED}
              maxSizeMb={MAX_SOURCE_MB}
              disabled={loading}
              onSelect={chooseFile}
              hint={`JPG, PNG o WebP · hasta ${MAX_SOURCE_MB} MB (se optimiza al subir)`}
            />

            {preview && (
              <div
                className="overflow-hidden rounded-card bg-white ring-1 ring-line"
                style={{ aspectRatio: pendingAspect }}
              >
                <img src={preview} alt="Previsualización del recorte" className="size-full object-cover" />
              </div>
            )}

            <Select
              id="media-picker-aspect"
              label="Formato del recorte"
              value={String(pendingAspect)}
              disabled={loading}
              onChange={(event) => setPendingAspect(Number(event.target.value))}
            >
              {ASPECTS.map((option) => (
                <SelectOption key={option.label} value={String(option.value)}>
                  {option.label}
                </SelectOption>
              ))}
            </Select>

            <Input
              label="Texto alternativo"
              value={pendingAlt}
              onChange={(event) => {
                setPendingAlt(event.target.value);
                setUploadError('');
              }}
              placeholder="Ej. Palta fresca en cubos"
              hint="Obligatorio: describe la imagen para accesibilidad y buscadores."
            />

            {uploadError && (
              <p role="alert" className="text-xs font-semibold leading-5 text-red-600">
                {uploadError}
              </p>
            )}

            <p className="text-xs leading-5 text-ink-muted">
              Se guardará en la categoría <span className="font-semibold text-ink">{uploadCategory}</span>.
            </p>

            <Button
              className="w-full"
              disabled={!pendingFile || !pendingAlt.trim()}
              isLoading={loading}
              onClick={() => void upload()}
            >
              Optimizar y usar
            </Button>

            <div className="flex items-center gap-2 py-1 text-xs font-bold uppercase tracking-wide text-ink-muted"><span className="h-px flex-1 bg-line" />o desde URL<span className="h-px flex-1 bg-line" /></div>
            <Input
              label="URL pública HTTPS"
              value={pendingUrl}
              onChange={(event) => { setPendingUrl(event.target.value); setUploadError(''); }}
              placeholder="https://sitio.com/imagen.jpg"
              hint="Se descarga y guarda localmente; no quedará enlazada al sitio externo."
            />
            <Button
              className="w-full"
              variant="secondary"
              disabled={!pendingUrl.trim() || !pendingAlt.trim()}
              isLoading={loading}
              leftIcon={<Link2 className="size-4" />}
              onClick={() => void importRemote()}
            >
              Importar URL y usar
            </Button>
          </section>

          <section>
            <div className="mb-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_180px]">
              <div className="flex min-w-0 items-center gap-2 rounded-field border border-line bg-white px-3">
                <Search className="size-4 text-ink-muted" />
                {/* `text-base`: los dialogos de MUI se portalan a document.body, asi
                    que la regla anti-zoom del shell no llega hasta aqui y iOS hacia
                    zoom al enfocar este buscador. */}
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Buscar por nombre o descripción"
                  aria-label="Buscar en la biblioteca"
                  className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none"
                />
              </div>
              {/* Sin este selector, una foto guardada en otra categoria era
                  inalcanzable desde el editor que la necesitaba. */}
              <Select
                id="media-picker-category"
                value={browseCategory}
                aria-label="Categoría de la biblioteca"
                onChange={(event) => { setBrowseCategory(event.target.value); setPage(1); }}
              >
                <SelectOption value="">Todas las categorías</SelectOption>
                {categoryOptions.map((option) => (
                  <SelectOption key={option} value={option}>{option}</SelectOption>
                ))}
              </Select>
            </div>

            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted">
              <span className="inline-flex items-center gap-1">
                <Library className="size-4" /> {isFetching ? 'Buscando…' : `${total} ${total === 1 ? 'recurso' : 'recursos'}`}
              </span>
              <Pagination page={page} totalPages={totalPages} onChange={setPage} />
            </div>

            {loadError ? (
              <LoadError message={loadError} onRetry={() => void load()} />
            ) : isFetching && !assets.length ? (
              <div className="flex h-64 items-center justify-center">
                <Loader2 className="size-6 animate-spin text-brand-600" />
              </div>
            ) : assets.length ? (
              // El `max-h` solo desde `md`: en una columna la galeria va debajo del
              // panel de subida y limitarla ahi crea el scroll anidado que se
              // queria evitar.
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:max-h-130 md:overflow-y-auto md:pr-1 xl:grid-cols-4">
                {assets.map((asset) => (
                  <button
                    key={asset.id}
                    type="button"
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
                      <img
                        src={asset.url}
                        alt={asset.altText ?? ''}
                        loading="lazy"
                        className="size-full object-cover transition group-hover:scale-105"
                      />
                      {value === asset.url && (
                        <span className="absolute right-2 top-2 rounded-pill bg-brand-600 p-1 text-white">
                          <Check className="size-3" />
                        </span>
                      )}
                    </span>
                    <span className="block truncate p-2 text-xs font-medium text-ink">
                      {asset.altText ?? asset.originalName}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-card border border-dashed border-line p-8 text-center text-sm text-ink-muted">
                {search || browseCategory
                  ? 'No hay imágenes que coincidan. Cambia la búsqueda o la categoría.'
                  : 'La biblioteca está vacía. Sube la primera desde el panel de la izquierda.'}
              </p>
            )}
          </section>
        </div>
      </Modal>
    </>
  );
};
