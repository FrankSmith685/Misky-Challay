import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link, useBeforeUnload, useBlocker, useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CalendarClock,
  Download,
  Eye,
  Globe,
  History,
  Image,
  LayoutTemplate,
  Link2,
  ListOrdered,
  Plus,
  RefreshCw,
  Save,
  Search,
  Sparkles,
  Star,
  Trash2,
  Upload,
} from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { PageHeader } from '@components/common/PageHeader';
import { PageLoader } from '@components/common/PageLoader';
import { LoadError } from '@components/common/LoadError';
import { Alert } from '@components/ui/Alert';
import { Button } from '@components/ui/Button';
import { FormGrid, FormSection, FormStack } from '@components/ui/FormSection';
import { Input } from '@components/ui/Input';
import { Textarea } from '@components/ui/Textarea';
import { Switch } from '@components/ui/Switch';
import { Select, SelectOption } from '@components/ui/Select';
import { Modal } from '@components/ui/Modal';
import { useConfirm } from '@components/ui/ConfirmDialog';
import { ROUTES } from '@constants/routes';
import { cn } from '@lib/cn';
import { getApiErrorMessage } from '@services/api/client';
import { HomeEditorial } from '@features/home/components/HomeLearningContent';
import { catalogApi } from '@features/catalog/services/catalog.service';
import type { Product } from '@features/catalog/types';
import { useStorefront } from '@features/home/content/StorefrontContext';
import { storefrontApi, type StorefrontHistoryEntry, type StorefrontState } from '@features/home/content/storefront.service';
import { storefrontSchema, type StorefrontContent } from '@features/home/content/storefront.schema';
import { MediaPicker } from '../components/MediaPicker';

const TABS = [
  { id: 'sections', label: 'Secciones y orden', icon: ListOrdered },
  { id: 'hero', label: 'Presentación', icon: LayoutTemplate },
  { id: 'benefits', label: 'Beneficios', icon: Sparkles },
  { id: 'links', label: 'Enlaces y destinos', icon: Link2 },
  { id: 'featured', label: 'Destacados', icon: Star },
  { id: 'abc', label: 'El ABC del pedido', icon: BookOpen },
  { id: 'walkthrough', label: 'Personalizador', icon: Image },
  { id: 'choices', label: 'Opciones de compra', icon: LayoutTemplate },
  { id: 'extras', label: 'Otros servicios', icon: LayoutTemplate },
  { id: 'faqs', label: 'Preguntas frecuentes', icon: BookOpen },
  { id: 'guide', label: 'Guía completa', icon: BookOpen },
  { id: 'seo', label: 'Buscadores y enlaces', icon: Search },
] as const;
type TabId = (typeof TABS)[number]['id'];
type LinkAction = StorefrontContent['quickLinks'][number]['action'];
type Copy = { title: string; description: string; label?: string };
const FIELD_LABELS: Record<string, string> = {
  sections: 'Secciones',
  hero: 'Presentación',
  abc: 'ABC del pedido',
  walkthrough: 'Personalizador',
  choices: 'Opciones de compra',
  extras: 'Otros servicios',
  faqs: 'Preguntas frecuentes',
  guide: 'Guía',
  seo: 'Buscadores',
  benefits: 'Beneficios',
  quickLinks: 'Enlaces rápidos',
  featuredProductIds: 'Productos destacados',
  title: 'Título',
  description: 'Descripción',
  imageUrl: 'Imagen',
  imageAlt: 'Descripción de imagen',
  label: 'Texto del enlace',
  videoUrl: 'Video',
  question: 'Pregunta',
  answer: 'Respuesta',
  steps: 'Pasos',
  homeTitle: 'Título SEO del inicio',
  homeDescription: 'Descripción SEO del inicio',
  guideTitle: 'Título SEO de la guía',
  guideDescription: 'Descripción SEO de la guía',
  socialImageUrl: 'Imagen para compartir',
};
const toDateTimeLocal = (value: string | null | undefined): string => {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  const pad = (part: number) => String(part).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const CopyFields = ({
  value,
  onChange,
}: {
  value: Copy;
  onChange: (patch: Partial<Copy>) => void;
}) => (
  <FormStack>
    <Input
      label="Título"
      value={value.title}
      maxLength={100}
      required
      onChange={(e) => onChange({ title: e.target.value })}
    />
    <Textarea
      label="Descripción"
      value={value.description}
      maxLength={700}
      rows={3}
      required
      onChange={(e) => onChange({ description: e.target.value })}
    />
    {value.label !== undefined && (
      <Input
        label="Texto del enlace"
        value={value.label}
        maxLength={60}
        required
        onChange={(e) => onChange({ label: e.target.value })}
      />
    )}
  </FormStack>
);

const HomeContentPage = () => {
  const { replace } = useStorefront();
  const confirm = useConfirm();
  const [params, setParams] = useSearchParams();
  const requested = params.get('tab');
  const tab: TabId = TABS.find((item) => item.id === requested)?.id ?? 'sections';
  const [saved, setSaved] = useState<StorefrontState | null>(null);
  const [draft, setDraft] = useState<StorefrontContent | null>(null);
  const [draftStatus, setDraftStatus] = useState<'DRAFT' | 'SCHEDULED' | null>(null);
  const [publishAt, setPublishAt] = useState('');
  const [savedPublishAt, setSavedPublishAt] = useState('');
  const [history, setHistory] = useState<StorefrontHistoryEntry[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [products, setProducts] = useState<Product[]>([]);
  const importInput = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);
  const errorSummary = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!error) return;
    errorSummary.current?.scrollIntoView({ block: 'center' });
    errorSummary.current?.focus({ preventScroll: true });
  }, [error]);
  const dirty = Boolean((draft && saved && JSON.stringify(draft) !== JSON.stringify(saved.content)) || publishAt !== savedPublishAt);
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty && !saving && currentLocation.pathname !== nextLocation.pathname,
  );
  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        if (dirty) {
          event.preventDefault();
          event.returnValue = '';
        }
      },
      [dirty],
    ),
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIssues([]);
    try {
      const state = await storefrontApi.getAdmin();
      setSaved(state.published);
      setDraft(structuredClone(state.draft?.content ?? state.published.content));
      setDraftStatus(state.draft?.status ?? null);
      setPublishAt(toDateTimeLocal(state.draft?.publishAt));
      setSavedPublishAt(toDateTimeLocal(state.draft?.publishAt));
      replace(state.published);
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [replace]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (tab !== 'featured' || products.length > 0) return;
    void catalogApi.getProducts({ sort: 'RECOMMENDED' }).then(setProducts).catch(() => setProducts([]));
  }, [products.length, tab]);

  const update = (mutate: (content: StorefrontContent) => void) =>
    setDraft((current) => {
      if (!current) return current;
      const next = structuredClone(current);
      mutate(next);
      return next;
    });
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || !saved || saving) return;
    const parsed = storefrontSchema.safeParse(draft);
    if (!parsed.success) {
      const first = String(parsed.error.issues[0]?.path[0]);
      if (TABS.some((item) => item.id === first)) setParams({ tab: first }, { replace: true });
      setIssues(
        parsed.error.issues.map(
          (issue) =>
            `${issue.path.map((part) => (typeof part === 'number' ? `Elemento ${part + 1}` : (FIELD_LABELS[part] ?? 'Campo'))).join(' → ')}: ${issue.message}`,
        ),
      );
      setError('Revisa los campos indicados antes de publicar.');
      return;
    }
    setSaving(true);
    setError(null);
    setIssues([]);
    try {
      const state = await storefrontApi.saveDraft({
        content: parsed.data,
        version: saved.version,
        publishAt: publishAt ? new Date(publishAt).toISOString() : null,
      });
      setSaved(state.published);
      setDraft(structuredClone(state.draft?.content ?? parsed.data));
      setDraftStatus(state.draft?.status ?? null);
      setPublishAt(toDateTimeLocal(state.draft?.publishAt));
      setSavedPublishAt(toDateTimeLocal(state.draft?.publishAt));
      toast.success(publishAt ? 'Borrador guardado y publicación programada.' : 'Borrador guardado. Publícalo cuando lo hayas revisado.');
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };
  const publish = async () => {
    if (!draft || !saved || saving || !dirty) return;
    setSaving(true);
    setError(null);
    try {
      const state = await storefrontApi.publishDraft(crypto.randomUUID());
      setSaved(state);
      setDraft(structuredClone(state.content));
      setDraftStatus(null);
      setPublishAt('');
      setSavedPublishAt('');
      replace(state);
      toast.success('Contenido publicado. La portada y la guía ya están actualizadas.');
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setSaving(false);
    }
  };
  const discard = async () => {
    if (!(await confirm({ title: 'Descartar borrador', message: 'Se eliminará el borrador guardado y se conservará la versión publicada.', confirmLabel: 'Descartar borrador' })).confirmed) return;
    setSaving(true);
    try {
      const state = await storefrontApi.discardDraft();
      setSaved(state.published);
      setDraft(structuredClone(state.published.content));
      setDraftStatus(null);
      setPublishAt('');
      setSavedPublishAt('');
      replace(state.published);
      toast.success('Borrador descartado.');
    } catch (cause) { setError(getApiErrorMessage(cause)); }
    finally { setSaving(false); }
  };
  const loadHistory = async () => {
    setHistoryLoading(true);
    try { setHistory(await storefrontApi.history(30)); }
    catch (cause) { setError(getApiErrorMessage(cause)); }
    finally { setHistoryLoading(false); }
  };
  const rollback = async (entry: StorefrontHistoryEntry) => {
    if (!(await confirm({ title: 'Restaurar versión', message: 'Se publicará una nueva versión con el contenido seleccionado.', confirmLabel: 'Restaurar y publicar' })).confirmed) return;
    setSaving(true);
    try {
      const state = await storefrontApi.rollback(entry.id, crypto.randomUUID());
      setSaved(state);
      setDraft(structuredClone(state.content));
      setDraftStatus(null);
      setPublishAt('');
      setSavedPublishAt('');
      replace(state);
      toast.success('Versión restaurada y publicada.');
      await loadHistory();
    } catch (cause) { setError(getApiErrorMessage(cause)); }
    finally { setSaving(false); }
  };
  const exportContent = () => {
    if (!draft) return;
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `misky-portada-v${saved?.version ?? 'borrador'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const importContent = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const parsed = storefrontSchema.safeParse(JSON.parse(await file.text()));
      if (!parsed.success) throw new Error('El archivo no coincide con el esquema de contenido de la portada.');
      setDraft(structuredClone(parsed.data));
      setError(null);
      toast.success('Contenido importado como borrador local. Guárdalo para persistirlo.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo importar el contenido.');
    }
  };
  const reload = async () => {
    if (
      dirty &&
      !(
        await confirm({
          title: 'Recargar contenido publicado',
          message: 'Se descartarán los cambios que todavía no has publicado.',
          confirmLabel: 'Descartar y recargar',
        })
      ).confirmed
    )
      return;
    await load();
  };
  const moveSection = (index: number, delta: number) =>
    update((next) => {
      const target = index + delta;
      if (target < 0 || target >= next.sections.length) return;
      [next.sections[index], next.sections[target]] = [next.sections[target], next.sections[index]];
    });

  if (loading) return <PageLoader />;
  if (!draft || !saved)
    return (
      <LoadError
        title="No pudimos cargar el contenido del inicio"
        message={error ?? 'Reintenta la consulta.'}
        onRetry={() => void load()}
      />
    );

  return (
    <div className="min-w-0">
      <PageHeader
        eyebrow="Contenido y ayuda"
        title="Contenido del inicio"
        icon={LayoutTemplate}
        description="Presenta tu pastelería, orienta al cliente y mantén la guía de compra al día."
        action={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setPreview(true)}
              leftIcon={<Eye className="size-4" />}
            >
              Vista previa
            </Button>
            <Button
              component={Link}
              to={ROUTES.home}
              variant="outline"
              leftIcon={<Globe className="size-4" />}
            >
              Ver inicio
            </Button>
          </>
        }
      />
      <div className="mb-6 flex flex-col justify-between gap-3 rounded-card border border-line bg-white p-5 sm:flex-row sm:items-center">
        <div>
          <p className="text-sm font-semibold text-ink">{dirty ? 'Tienes cambios sin publicar' : 'Contenido publicado'}</p>
          <p className="mt-1 text-xs leading-6 text-ink-muted">
            {saved.updatedAt ? `Última actualización: ${new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Lima' }).format(new Date(saved.updatedAt))}` : 'Contenido inicial listo para personalizar'}{' '}· Versión {saved.version}
          </p>
          {draftStatus && <p className="mt-1 text-xs font-semibold text-accent-700">{draftStatus === 'SCHEDULED' ? `Publicación programada${publishAt ? ` para ${new Date(publishAt).toLocaleString('es-PE')}` : ''}` : 'Borrador guardado en el servidor'}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="ghost" onClick={() => void reload()} disabled={saving} leftIcon={<RefreshCw className="size-4" />}>Recargar</Button>
          <Button type="button" variant="ghost" onClick={() => void discard()} disabled={saving || !draftStatus} leftIcon={<Trash2 className="size-4" />}>Descartar borrador</Button>
          <Button type="button" variant="ghost" onClick={() => { setHistoryOpen(true); void loadHistory(); }} disabled={saving} leftIcon={<History className="size-4" />}>Historial</Button>
          <Button type="button" variant="ghost" onClick={exportContent} disabled={saving} leftIcon={<Download className="size-4" />}>Exportar</Button>
          <Button type="button" variant="ghost" onClick={() => importInput.current?.click()} disabled={saving} leftIcon={<Upload className="size-4" />}>Importar</Button>
          <input ref={importInput} type="file" accept="application/json,.json" className="hidden" onChange={(event) => void importContent(event)} />
        </div>
      </div>
      {error && (
        <div className="mb-6 outline-none" ref={errorSummary} tabIndex={-1}>
          <Alert variant="danger" title={error}>
            {issues.length > 0 && (
              <ul className="mt-2 list-inside list-disc text-sm">
                {issues.slice(0, 8).map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
          </Alert>
        </div>
      )}
      <div className="grid items-start gap-6 lg:grid-cols-[230px_minmax(0,1fr)]">
        <nav
          aria-label="Editar contenido"
          className="flex flex-wrap gap-2 rounded-card border border-line bg-white p-3 lg:sticky lg:top-5 lg:flex-col"
        >
          {TABS.map(({ id, label, icon: Icon }) => (
            <button
              type="button"
              key={id}
              aria-pressed={tab === id}
              onClick={() => setParams({ tab: id }, { replace: true })}
              className={cn(
                'flex min-h-11 items-center gap-3 rounded-card px-3 py-2 text-left text-sm transition-colors',
                tab === id
                  ? 'bg-brand-700 font-semibold text-white'
                  : 'text-ink-muted hover:bg-brand-50 hover:text-brand-800',
              )}
            >
              <Icon className="size-4 shrink-0" aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>
        <form id="home-content-form" onSubmit={(event) => void save(event)} className="min-w-0">
          <fieldset disabled={saving} className="min-w-0 space-y-6">
            {tab === 'sections' && (
              <FormSection
                title="Secciones de la portada"
                description="Ordena los bloques con las flechas. Puedes ocultarlos y conservar sus textos para volver a mostrarlos después."
                icon={ListOrdered}
              >
                <p className="mb-5 text-xs leading-6 text-ink-muted">
                  La presentación principal siempre aparece primero. La guía de compra conserva su
                  propia URL pública, aunque ocultes un bloque del inicio.
                </p>
                <div className="space-y-4">
                  {draft.sections.map((section, i) => (
                    <article
                      key={section.id}
                      className="rounded-card border border-line bg-surface-muted/40 p-4 sm:p-5"
                    >
                      <div className="mb-5 flex items-center justify-between gap-3">
                        <span className="text-xs font-bold uppercase tracking-wide text-brand-700">
                          {i + 1}.{' '}
                          {section.id === 'contact'
                            ? 'Ayuda y contacto'
                            : (TABS.find((item) => item.id === section.id)?.label ??
                              (section.id === 'featured'
                                ? 'Productos destacados'
                                : 'Preguntas frecuentes'))}
                        </span>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label={`Subir ${section.title}`}
                            disabled={i === 0}
                            onClick={() => moveSection(i, -1)}
                          >
                            <ArrowUp className="size-4" />
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-label={`Bajar ${section.title}`}
                            disabled={i === draft.sections.length - 1}
                            onClick={() => moveSection(i, 1)}
                          >
                            <ArrowDown className="size-4" />
                          </Button>
                        </div>
                      </div>
                      <FormStack>
                        <Switch
                          label={`Mostrar ${section.title}`}
                          checked={section.enabled}
                          onChange={(enabled) =>
                            update((next) => {
                              next.sections[i].enabled = enabled;
                            })
                          }
                        />
                        <Input
                          label="Encabezado de la sección"
                          value={section.title}
                          maxLength={120}
                          required
                          onChange={(e) =>
                            update((next) => {
                              next.sections[i].title = e.target.value;
                            })
                          }
                        />
                        <Textarea
                          label="Introducción de la sección"
                          value={section.description}
                          rows={2}
                          maxLength={500}
                          required
                          onChange={(e) =>
                            update((next) => {
                              next.sections[i].description = e.target.value;
                            })
                          }
                        />
                      </FormStack>
                    </article>
                  ))}
                </div>
              </FormSection>
            )}
            {tab === 'hero' && (
              <FormSection
                title="Presentación principal"
                description="Explica qué ofreces y ayuda al cliente a elegir su primer paso."
                icon={LayoutTemplate}
              >
                <FormStack>
                  <Input
                    label="Texto superior"
                    value={draft.hero.eyebrow}
                    maxLength={70}
                    required
                    onChange={(e) =>
                      update((next) => {
                        next.hero.eyebrow = e.target.value;
                      })
                    }
                  />
                  <Input
                    label="Título principal (H1)"
                    value={draft.hero.title}
                    maxLength={130}
                    required
                    onChange={(e) =>
                      update((next) => {
                        next.hero.title = e.target.value;
                      })
                    }
                  />
                  <Textarea
                    label="Descripción principal"
                    value={draft.hero.description}
                    rows={3}
                    maxLength={500}
                    required
                    onChange={(e) =>
                      update((next) => {
                        next.hero.description = e.target.value;
                      })
                    }
                  />
                  <FormGrid>
                    <Input
                      label="Botón para personalizar"
                      value={draft.hero.primaryLabel}
                      maxLength={60}
                      required
                      onChange={(e) =>
                        update((next) => {
                          next.hero.primaryLabel = e.target.value;
                        })
                      }
                    />
                    <Input
                      label="Botón del catálogo"
                      value={draft.hero.secondaryLabel}
                      maxLength={60}
                      required
                      onChange={(e) =>
                        update((next) => {
                          next.hero.secondaryLabel = e.target.value;
                        })
                      }
                    />
                  </FormGrid>
                  <FormGrid>
                    <Select
                      label="Destino del botón principal"
                      value={draft.hero.primaryAction}
                      onChange={(e) => update((next) => { next.hero.primaryAction = e.target.value as typeof next.hero.primaryAction; })}
                    >
                      <SelectOption value="custom">Personalizador</SelectOption>
                      <SelectOption value="catalog">Catálogo</SelectOption>
                      <SelectOption value="business">Empresas</SelectOption>
                      <SelectOption value="guide">Guía</SelectOption>
                    </Select>
                    <Select
                      label="Destino del botón secundario"
                      value={draft.hero.secondaryAction}
                      onChange={(e) => update((next) => { next.hero.secondaryAction = e.target.value as typeof next.hero.secondaryAction; })}
                    >
                      <SelectOption value="catalog">Catálogo</SelectOption>
                      <SelectOption value="custom">Personalizador</SelectOption>
                      <SelectOption value="coverage">Cobertura</SelectOption>
                      <SelectOption value="guide">Guía</SelectOption>
                    </Select>
                  </FormGrid>
                  <MediaPicker
                    label="Imagen de presentación"
                    category="marketing"
                    layout="stacked"
                    value={draft.hero.imageUrl}
                    altText={draft.hero.imageAlt}
                    onChange={({ url, altText }) =>
                      update((next) => {
                        next.hero.imageUrl = url;
                        next.hero.imageAlt = altText;
                      })
                    }
                  />
                  <Input
                    label="Descripción accesible de la imagen principal"
                    value={draft.hero.imageAlt}
                    maxLength={180}
                    required
                    onChange={(e) =>
                      update((next) => {
                        next.hero.imageAlt = e.target.value;
                      })
                    }
                  />
                  <div className="space-y-4 border-t border-line pt-5">
                    <div className="flex items-center justify-between gap-3">
                      <div><p className="text-sm font-semibold text-ink">Diapositivas adicionales</p><p className="text-xs text-ink-muted">Edita las imágenes y textos del carrusel. Máximo 4.</p></div>
                      <Button type="button" variant="outline" size="sm" disabled={draft.hero.slides.length >= 4} onClick={() => update((next) => { next.hero.slides.push({ eyebrow: '', title: '', description: '', imageUrl: next.hero.imageUrl, imageAlt: next.hero.imageAlt }); })}><Plus className="mr-1 size-4" />Agregar</Button>
                    </div>
                    {draft.hero.slides.map((slide, i) => (
                      <article key={i} className="space-y-4 rounded-card border border-line bg-surface-muted/40 p-4">
                        <div className="flex items-center justify-between gap-3"><span className="text-xs font-bold uppercase tracking-wide text-brand-700">Diapositiva {i + 2}</span><Button type="button" variant="ghost" size="sm" disabled={draft.hero.slides.length <= 1} onClick={() => update((next) => { next.hero.slides.splice(i, 1); })}><Trash2 className="size-4" /></Button></div>
                        <Input label="Texto superior" value={slide.eyebrow} maxLength={70} required onChange={(e) => update((next) => { next.hero.slides[i].eyebrow = e.target.value; })} />
                        <Input label="Título" value={slide.title} maxLength={130} required onChange={(e) => update((next) => { next.hero.slides[i].title = e.target.value; })} />
                        <Textarea label="Descripción" value={slide.description} maxLength={500} rows={2} required onChange={(e) => update((next) => { next.hero.slides[i].description = e.target.value; })} />
                        <MediaPicker label="Imagen" category="marketing" layout="stacked" value={slide.imageUrl} altText={slide.imageAlt} onChange={({ url, altText }) => update((next) => { next.hero.slides[i].imageUrl = url; next.hero.slides[i].imageAlt = altText; })} />
                        <Input label="Texto alternativo" value={slide.imageAlt} maxLength={180} required onChange={(e) => update((next) => { next.hero.slides[i].imageAlt = e.target.value; })} />
                      </article>
                    ))}
                  </div>
                </FormStack>
              </FormSection>
            )}
            {tab === 'benefits' && (
              <FormSection title="Beneficios de la portada" description="Edita los tres mensajes de valor que aparecen bajo el carrusel." icon={Sparkles}>
                <FormStack>
                  {draft.benefits.map((benefit, i) => (
                    <article key={i} className="space-y-4 rounded-card border border-line bg-surface-muted/40 p-4">
                      <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Beneficio {i + 1}</p>
                      <Select label="Icono" value={benefit.icon ?? 'cake'} onChange={(e) => update((next) => { next.benefits[i].icon = e.target.value as typeof next.benefits[number]['icon']; })}>
                        <SelectOption value="cake">Torta</SelectOption><SelectOption value="flame">Precio</SelectOption><SelectOption value="calendar">Calendario</SelectOption><SelectOption value="map-pin">Ubicación</SelectOption><SelectOption value="chef-hat">Chef</SelectOption><SelectOption value="truck">Entrega</SelectOption>
                      </Select>
                      <Input label="Título" value={benefit.title} maxLength={100} required onChange={(e) => update((next) => { next.benefits[i].title = e.target.value; })} />
                      <Textarea label="Descripción" value={benefit.description} maxLength={400} rows={2} required onChange={(e) => update((next) => { next.benefits[i].description = e.target.value; })} />
                    </article>
                  ))}
                </FormStack>
              </FormSection>
            )}
            {tab === 'links' && (
              <FormSection title="Enlaces y destinos" description="Los destinos se eligen de una lista segura de rutas internas y WhatsApp." icon={Link2}>
                <FormStack>
                  {draft.quickLinks.map((item, i) => (
                    <article key={item.id} className="space-y-4 rounded-card border border-line bg-surface-muted/40 p-4">
                      <Input label={`Enlace ${i + 1}`} value={item.label} maxLength={60} required onChange={(e) => update((next) => { next.quickLinks[i].label = e.target.value; })} />
                      <Select label="Destino" value={item.action} onChange={(e) => update((next) => { next.quickLinks[i].action = e.target.value as typeof next.quickLinks[number]['action']; })}>
                        <SelectOption value="catalog">Catálogo</SelectOption><SelectOption value="custom">Personalizador</SelectOption><SelectOption value="business">Empresas</SelectOption><SelectOption value="plans">Cajas mensuales</SelectOption><SelectOption value="experiences">Experiencias QR</SelectOption><SelectOption value="coverage">Cobertura</SelectOption><SelectOption value="guide">Guía</SelectOption><SelectOption value="orders">Mis pedidos</SelectOption><SelectOption value="whatsapp">WhatsApp</SelectOption>
                      </Select>
                    </article>
                  ))}
                </FormStack>
              </FormSection>
            )}
            {tab === 'featured' && (
              <FormSection title="Productos destacados" description="Selecciona hasta 12 productos publicados. Se mostrarán en el orden elegido; si no eliges ninguno se usan los más vendidos." icon={Star}>
                <FormStack>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {products.map((product) => {
                      const checked = draft.featuredProductIds.includes(product.id);
                      return <label key={product.id} className="flex items-start gap-3 rounded-card border border-line p-3 text-sm"><input type="checkbox" checked={checked} onChange={() => update((next) => { next.featuredProductIds = checked ? next.featuredProductIds.filter((id) => id !== product.id) : [...next.featuredProductIds, product.id].slice(0, 12); })} /><span><strong className="block">{product.name}</strong><span className="text-xs text-ink-muted">{product.isAvailable ? 'Disponible' : 'No disponible'}</span></span></label>;
                    })}
                  </div>
                  {products.length === 0 && <Alert title="No se pudieron cargar los productos">Recarga la página para elegir productos publicados.</Alert>}
                  <p className="text-xs text-ink-muted">Seleccionados: {draft.featuredProductIds.length}/12. El catálogo seguirá verificando disponibilidad por sucursal.</p>
                </FormStack>
              </FormSection>
            )}
            {tab === 'abc' &&
              draft.abc.map((step, i) => (
                <FormSection key={i} title={`${['A', 'B', 'C'][i]}. ${step.title}`}>
                  <CopyFields
                    value={step}
                    onChange={(patch) =>
                      update((next) => {
                        Object.assign(next.abc[i], patch);
                      })
                    }
                  />
                </FormSection>
              ))}
            {tab === 'walkthrough' &&
              draft.walkthrough.map((step, i) => (
                <FormSection
                  key={i}
                  title={`0${i + 1}. ${step.title}`}
                  description="Utiliza una captura clara del personalizador. El texto alternativo describe su contenido."
                >
                  <FormStack>
                    <CopyFields
                      value={step}
                      onChange={(patch) =>
                        update((next) => {
                          Object.assign(next.walkthrough[i], patch);
                        })
                      }
                    />
                    <MediaPicker
                      label={`Captura del paso ${i + 1}`}
                      category="marketing"
                      layout="stacked"
                      value={step.imageUrl}
                      altText={step.imageAlt}
                      onChange={({ url, altText }) =>
                        update((next) => {
                          next.walkthrough[i].imageUrl = url;
                          next.walkthrough[i].imageAlt = altText;
                        })
                      }
                    />
                    <Input
                      label={`Descripción accesible de la captura ${i + 1}`}
                      value={step.imageAlt}
                      maxLength={180}
                      required
                      onChange={(e) =>
                        update((next) => {
                          next.walkthrough[i].imageAlt = e.target.value;
                        })
                      }
                    />
                  </FormStack>
                </FormSection>
              ))}
            {(tab === 'choices' || tab === 'extras') &&
              draft[tab].map((item, i) => (
                <FormSection
                  key={i}
                  title={item.title}
                  description={
                    tab === 'choices'
                      ? [
                          'Destino: catálogo',
                          'Destino: personalizador de tortas',
                          'Destino: para empresas',
                        ][i]
                      : ['Destino: cajas mensuales', 'Destino: experiencias QR'][i]
                  }
                >
                  <CopyFields
                    value={item}
                    onChange={(patch) =>
                      update((next) => {
                        Object.assign(next[tab][i], patch);
                      })
                    }
                  />
                  <Select
                    label="Destino del enlace"
                    value={item.action ?? (tab === 'choices' ? ['catalog', 'custom', 'business'][i] : ['plans', 'experiences'][i])}
                    onChange={(e) => update((next) => { next[tab][i].action = e.target.value as LinkAction; })}
                  >
                    <SelectOption value="catalog">Catálogo</SelectOption><SelectOption value="custom">Personalizador</SelectOption><SelectOption value="business">Empresas</SelectOption><SelectOption value="plans">Cajas mensuales</SelectOption><SelectOption value="experiences">Experiencias QR</SelectOption><SelectOption value="guide">Guía</SelectOption><SelectOption value="orders">Mis pedidos</SelectOption>
                  </Select>
                </FormSection>
              ))}
            {tab === 'faqs' && (
              <FormSection
                title="Preguntas frecuentes"
                description="Se comparten entre el inicio y la guía. Mantén las respuestas alineadas con tus condiciones reales de compra."
                icon={BookOpen}
              >
                <FormStack>
                  {draft.faqs.map((faq, i) => (
                    <article
                      key={faq.id}
                      className="space-y-5 rounded-card border border-line bg-surface-muted/40 p-4 sm:p-5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-sm font-semibold">Pregunta {i + 1}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          aria-label={`Eliminar pregunta ${i + 1}`}
                          disabled={draft.faqs.length === 1}
                          onClick={() =>
                            update((next) => {
                              next.faqs.splice(i, 1);
                            })
                          }
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                      <Input
                        label={`Pregunta ${i + 1}`}
                        value={faq.question}
                        required
                        maxLength={180}
                        onChange={(e) =>
                          update((next) => {
                            next.faqs[i].question = e.target.value;
                          })
                        }
                      />
                      <Textarea
                        label={`Respuesta ${i + 1}`}
                        value={faq.answer}
                        required
                        maxLength={1400}
                        rows={4}
                        onChange={(e) =>
                          update((next) => {
                            next.faqs[i].answer = e.target.value;
                          })
                        }
                      />
                    </article>
                  ))}
                  <Button
                    type="button"
                    variant="outline"
                    disabled={draft.faqs.length >= 20}
                    onClick={() =>
                      update((next) => {
                        next.faqs.push({ id: crypto.randomUUID(), question: '', answer: '' });
                      })
                    }
                  >
                    <Plus className="mr-2 size-4" />
                    Agregar pregunta
                  </Button>
                </FormStack>
              </FormSection>
            )}
            {tab === 'guide' && (
              <>
                <FormSection
                  title="Guía de compra"
                  description="Disponible sin iniciar sesión en /como-hacer-tu-pedido. Puedes agregar un enlace a un video propio, si lo tienes."
                >
                  <FormStack>
                    <Input
                      label="Título de la guía"
                      value={draft.guide.title}
                      maxLength={130}
                      required
                      onChange={(e) =>
                        update((next) => {
                          next.guide.title = e.target.value;
                        })
                      }
                    />
                    <Textarea
                      label="Introducción de la guía"
                      value={draft.guide.description}
                      maxLength={500}
                      rows={3}
                      required
                      onChange={(e) =>
                        update((next) => {
                          next.guide.description = e.target.value;
                        })
                      }
                    />
                    <Input
                      label="Video explicativo (opcional, HTTPS)"
                      value={draft.guide.videoUrl}
                      type="url"
                      maxLength={700}
                      onChange={(e) =>
                        update((next) => {
                          next.guide.videoUrl = e.target.value;
                        })
                      }
                    />
                  </FormStack>
                </FormSection>
                {draft.guide.steps.map((step, i) => (
                  <FormSection key={i} title={`Paso ${i + 1}`}>
                    <FormStack>
                      <CopyFields
                        value={step}
                        onChange={(patch) =>
                          update((next) => {
                            Object.assign(next.guide.steps[i], patch);
                          })
                        }
                      />
                      <Select
                        label="Destino del enlace"
                        value={step.action}
                        onChange={(e) =>
                          update((next) => {
                            next.guide.steps[i].action = e.target.value as typeof step.action;
                          })
                        }
                      >
                        {Object.entries({
                          catalog: 'Catálogo',
                          custom: 'Crea tu torta',
                          cart: 'Carrito',
                          coverage: 'Zonas de entrega',
                          orders: 'Mis pedidos',
                        }).map(([id, label]) => (
                          <SelectOption key={id} value={id}>
                            {label}
                          </SelectOption>
                        ))}
                      </Select>
                    </FormStack>
                  </FormSection>
                ))}
              </>
            )}
            {tab === 'seo' && (
              <>
                <FormSection
                  title="Buscadores y enlaces compartidos"
                  description="Escribe títulos y descripciones útiles. Evita repetir palabras clave o prometer cobertura que no ofreces."
                  icon={Search}
                >
                  <FormStack>
                    <Input
                      label="Título SEO del inicio"
                      value={draft.seo.homeTitle}
                      maxLength={80}
                      required
                      hint={`${draft.seo.homeTitle.length}/80 caracteres`}
                      onChange={(e) =>
                        update((next) => {
                          next.seo.homeTitle = e.target.value;
                        })
                      }
                    />
                    <Textarea
                      label="Descripción SEO del inicio"
                      value={draft.seo.homeDescription}
                      minLength={50}
                      maxLength={180}
                      rows={3}
                      required
                      hint={`${draft.seo.homeDescription.length}/180 caracteres`}
                      onChange={(e) =>
                        update((next) => {
                          next.seo.homeDescription = e.target.value;
                        })
                      }
                    />
                    <Input
                      label="Título SEO de la guía"
                      value={draft.seo.guideTitle}
                      maxLength={80}
                      required
                      onChange={(e) =>
                        update((next) => {
                          next.seo.guideTitle = e.target.value;
                        })
                      }
                    />
                    <Textarea
                      label="Descripción SEO de la guía"
                      value={draft.seo.guideDescription}
                      minLength={50}
                      maxLength={180}
                      rows={3}
                      required
                      onChange={(e) =>
                        update((next) => {
                          next.seo.guideDescription = e.target.value;
                        })
                      }
                    />
                    <MediaPicker
                      label="Imagen para compartir enlaces"
                      category="marketing"
                      layout="stacked"
                      value={draft.seo.socialImageUrl}
                      onChange={({ url }) =>
                        update((next) => {
                          next.seo.socialImageUrl = url;
                        })
                      }
                    />
                  </FormStack>
                </FormSection>
                <Alert title="Publicación e indexación">
                  El sitemap está en /sitemap.xml. La indexación depende de publicar el sitio en un
                  dominio accesible y de los buscadores. No se incluyen cuentas, pagos ni enlaces
                  privados de experiencias.
                </Alert>
              </>
            )}
          </fieldset>
          <div className="sticky bottom-4 z-10 mt-6 flex flex-col justify-between gap-4 rounded-card border border-line bg-white/95 p-4 shadow-e2 backdrop-blur sm:flex-row sm:items-center">
            <div className="flex flex-col gap-2">
              <p className="text-xs leading-6 text-ink-muted">{dirty ? 'Guarda el borrador y publícalo cuando lo hayas revisado.' : 'La portada está al día. Puedes revisar la vista previa.'}</p>
              <label className="flex items-center gap-2 text-xs text-ink-muted"><CalendarClock className="size-4" />Programar publicación <input type="datetime-local" value={publishAt} onChange={(event) => setPublishAt(event.target.value)} className="rounded border border-line px-2 py-1 text-xs text-ink" /></label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={!dirty} isLoading={saving} leftIcon={<Save className="size-4 shrink-0" />}>Guardar borrador</Button>
              <Button type="button" disabled={!dirty || !draftStatus} isLoading={saving} onClick={() => void publish()} leftIcon={<Globe className="size-4 shrink-0" />}>Publicar ahora</Button>
            </div>
          </div>
        </form>
      </div>
      <Modal
        isOpen={preview}
        onClose={() => setPreview(false)}
        title="Vista previa de la portada"
        description="Incluye los cambios sin publicar. Los enlaces de esta vista previa no navegan."
        maxWidth="xl"
      >
        <div
          className="overflow-hidden border border-line"
          onClickCapture={(event) => {
            if ((event.target as HTMLElement).closest('a')) event.preventDefault();
          }}
        >
          <HomeEditorial content={draft} preview />
        </div>
      </Modal>
      <Modal isOpen={historyOpen} onClose={() => setHistoryOpen(false)} title="Historial de publicaciones" description="Cada restauración crea una nueva versión auditada." maxWidth="lg">
        {historyLoading ? <PageLoader /> : history.length === 0 ? <p className="text-sm text-ink-muted">Todavía no hay publicaciones registradas.</p> : (
          <div className="space-y-3">
            {history.map((entry) => (
              <article key={entry.id} className="flex flex-col gap-3 rounded-card border border-line p-4 sm:flex-row sm:items-center sm:justify-between">
                <div><p className="text-sm font-semibold text-ink">{entry.action}</p><p className="text-xs text-ink-muted">{new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(entry.createdAt))} · Versión {entry.after?.version ?? '—'}</p></div>
                <Button type="button" variant="outline" size="sm" disabled={saving || !entry.after} onClick={() => void rollback(entry)}>Restaurar</Button>
              </article>
            ))}
          </div>
        )}
      </Modal>
      <Modal
        isOpen={blocker.state === 'blocked'}
        onClose={() => {
          if (blocker.state === 'blocked') blocker.reset();
        }}
        title="Tienes cambios sin publicar"
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (blocker.state === 'blocked') blocker.reset();
              }}
            >
              Seguir editando
            </Button>
            <Button
              type="button"
              onClick={() => {
                if (blocker.state === 'blocked') blocker.proceed();
              }}
            >
              Salir sin publicar
            </Button>
          </>
        }
      >
        <p className="text-sm leading-7 text-ink-muted">
          Publica los cambios antes de salir si quieres que aparezcan en la web.
        </p>
      </Modal>
    </div>
  );
};
export default HomeContentPage;
