import { useLiveRefresh } from '@services/realtime';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  Checkbox,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  TextField,
} from '@mui/material';
import {
  ArrowUpRight,
  Box,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardList,
  Clock3,
  Eye,
  History,
  Layers3,
  MessageSquare,
  Package,
  Palette,
  Pause,
  Plus,
  QrCode,
  RefreshCw,
  Rocket,
  Save,
  Search,
  Send,
  Video,
  X,
} from 'lucide-react';
import { PageHeader } from '@components/common/PageHeader';
import { Button } from '@components/ui/Button';
import { Tabs } from '@components/ui/Tabs';
import {
  ExperienceEmpty,
  ExperiencePanel,
  ExperienceProgress,
  ExperienceStatus,
} from './ExperienceUI';
import { ExperienceServiceEditor } from './ExperienceServiceEditor';
import { Alert } from '@components/ui/Alert';
import { Input } from '@components/ui/Input';
import { usePermissions } from '@/hooks/usePermissions';
import { PERM } from '@constants/permissions';
import { getApiErrorMessage } from '@services/api/client';
import { formatCurrency, formatDate } from '@lib/format';
import toast from '@components/mui/MuiToast';
import {
  experiencesApi as api,
  demoScene,
  EXPERIENCE_LABELS,
  EXPERIENCE_EVENT_LABELS,
  type ExperiencePackage,
  type ExperienceTemplate,
  type ExperienceProject,
  type ProjectDetail,
  type ExperienceAsset,
} from './experiences.service';
import { SceneEditor } from './SceneEditor';
import { useExperienceMedia } from './useExperienceMedia';
import { ExperienceViewer } from './ExperienceViewer';
import { publicCakeWebOrigin } from '../cakes/utils/cakePreviewLinks';

const blankPackage: ExperiencePackage = {
  id: 0,
  version: 1,
  name: '',
  description: '',
  mode: 'AR',
  price: 0,
  validityDays: 90,
  revisionsIncluded: 1,
  minLeadHours: 48,
  paymentRequirement: 'FULL',
  isActive: false,
  templateId: null,
  sortOrder: 0,
};
export default function ExperienceStudioPage() {
  const { can, branchIds, isSuperAdmin } = usePermissions();
  const global = isSuperAdmin || !branchIds.length;
  const write = can(PERM.EXPERIENCE_WRITE);
  const publish = can(PERM.EXPERIENCE_PUBLISH);
  const [params, setParams] = useSearchParams();
  const requestedTab = params.get('tab') ?? 'projects';
  const tab = ['projects', 'demo', ...(global ? ['services', 'templates'] : [])].includes(
    requestedTab,
  )
    ? requestedTab
    : 'projects';
  const [projects, setProjects] = useState<ExperienceProject[]>([]);
  const [config, setConfig] = useState<{
    packages: ExperiencePackage[];
    templates: ExperienceTemplate[];
    assets: ExperienceAsset[];
  }>({ packages: [], templates: [], assets: [] });
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [scene, setScene] = useState(demoScene);
  const [assigned, setAssigned] = useState('');
  const [pack, setPack] = useState<ExperiencePackage | null>(null);
  const [template, setTemplate] = useState<ExperienceTemplate | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editorBusy, setEditorBusy] = useState(false);
  const [preview, setPreview] = useState<{
    scene: typeof demoScene;
    base: string;
    url?: string;
    expiresAt?: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingProject, setLoadingProject] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const loadSequence = useRef(0);
  const [starts, setStarts] = useState('');
  const refresh = useCallback(async () => {
    setError('');
    try {
      const list = await api.projects();
      setProjects(list);
      if (global) {
        const next = await api.config();
        setConfig(next);
        setPack((old) => old ?? next.packages[0] ?? null);
        setTemplate((old) => old ?? next.templates[0] ?? null);
      }
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }, [global]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useLiveRefresh(['experiences'], refresh);
  const load = async (id: number) => {
    const sequence = ++loadSequence.current;
    setLoadingProject(true);
    setError('');
    try {
      const d = await api.project(id);
      if (sequence !== loadSequence.current) return;
      setDetail(d);
      setScene(d.project.sceneJson);
      setAssigned(d.project.assignedTo ? String(d.project.assignedTo) : '');
      setPreview(null);
    } catch (e) {
      if (sequence === loadSequence.current) setError(getApiErrorMessage(e));
    } finally {
      if (sequence === loadSequence.current) setLoadingProject(false);
    }
  };
  const appliedProject = useRef<number>();
  useEffect(() => {
    const id = Number(params.get('proyecto'));
    if (!id || appliedProject.current === id || !projects.some((project) => project.id === id)) return;
    appliedProject.current = id; void load(id);
    // The link opens once; subsequent server refreshes preserve the scene draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params, projects]);
  const run = async (task: () => Promise<unknown>, message: string) => {
    setBusy(true);
    setError('');
    try {
      await task();
      toast.success(message);
      await refresh();
    } catch (e) {
      setError(getApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const uploaded = (assets: ExperienceAsset[]) =>
    setConfig((old) => ({ ...old, assets: [...assets, ...old.assets] }));
  const media = useExperienceMedia(preview?.scene ?? null, preview?.base ?? '');
  const dirty = Boolean(
    detail &&
    (JSON.stringify(scene) !== JSON.stringify(detail.project.sceneJson) ||
      assigned !== (detail.project.assignedTo ? String(detail.project.assignedTo) : '')),
  );
  const filteredProjects = projects.filter(
    (p) =>
      (statusFilter === 'ALL' || p.status === statusFilter) &&
      [p.order?.orderNumber, p.packageSnapshotJson.name]
        .join(' ')
        .toLocaleLowerCase('es')
        .includes(search.trim().toLocaleLowerCase('es')),
  );
  const openSavedPreview = () => {
    if (detail)
      setPreview({
        scene: detail.project.sceneJson,
        base: '/experiences/admin/projects/' + detail.project.id,
        ...(detail.project.status === 'PUBLISHED'
          ? {
              url: publicCakeWebOrigin() + '/experiencias/' + detail.project.publicToken,
              expiresAt: detail.project.expiresAt,
            }
          : {}),
      });
  };
  const saveProject = () => {
    if (detail)
      void run(async () => {
        const p = await api.saveProject(detail.project.id, {
          expectedVersion: detail.project.version,
          scene,
          assignedTo: assigned ? Number(assigned) : null,
        });
        await load(p.id);
      }, 'Nueva versión guardada');
  };
  const projectAction = (action: 'REVIEW' | 'PUBLISH' | 'PAUSE') => {
    if (detail)
      void run(
        async () => {
          await api.action(detail.project.id, {
            expectedVersion: detail.project.version,
            action,
            ...(action === 'PUBLISH' && starts ? { startsAt: new Date(starts).toISOString() } : {}),
          });
          await load(detail.project.id);
        },
        action === 'REVIEW'
          ? 'Propuesta enviada a revisión'
          : action === 'PAUSE'
            ? 'Publicación pausada'
            : 'Publicación guardada',
      );
  };
  const tabItems = [
    { value: 'projects', label: 'Trabajos por pedido' },
    ...(global
      ? [
          { value: 'services', label: 'Servicios y precios' },
          { value: 'templates', label: 'Plantillas' },
        ]
      : []),
    { value: 'demo', label: 'Demostración' },
  ];
  return (
    <div className="min-w-0 space-y-6">
      <PageHeader
        eyebrow="Estudio creativo"
        title="Experiencias QR"
        icon={QrCode}
        description="Transforma una celebración en una experiencia. Crea, revisa y publica desde un solo lugar."
        action={
          <Button
            variant="outline"
            isLoading={loading}
            leftIcon={<RefreshCw size={15} />}
            disabled={busy || editorBusy}
            onClick={() => {
              setLoading(true);
              void refresh();
            }}
          >
            Actualizar
          </Button>
        }
      />
      <div className="grid grid-cols-3 gap-2 sm:gap-3" aria-label="Resumen de trabajos recientes">
        {[
          {
            label: 'En creación',
            value: projects.filter((p) => ['DRAFT', 'IN_PROGRESS'].includes(p.status)).length,
            icon: Palette,
            hint: 'Propuestas que está preparando el equipo',
          },
          {
            label: 'Por revisar',
            value: projects.filter((p) => p.status === 'AWAITING_APPROVAL').length,
            icon: MessageSquare,
            hint: 'Esperando la respuesta del cliente',
          },
          {
            label: 'Publicadas',
            value: projects.filter(
              (p) =>
                p.status === 'PUBLISHED' &&
                (!p.expiresAt || new Date(p.expiresAt).getTime() > Date.now()),
            ).length,
            icon: Rocket,
            hint: 'Experiencias con publicación vigente',
          },
        ].map(({ label, value, icon: Icon, hint }) => (
          <div
            key={label}
            className="flex min-w-0 items-start gap-3 rounded-card border border-line bg-white p-3 sm:p-5"
          >
            <span className="hidden sm:block">
              <span className="exp-icon">
                <Icon size={18} />
              </span>
            </span>
            <div>
              <p className="text-[10px] font-semibold text-ink-muted sm:text-xs">{label}</p>
              <p className="mt-1 text-2xl font-extrabold tracking-tight text-ink">
                {loading ? '—' : value}
              </p>
              <p className="mt-1 hidden text-[11px] leading-relaxed text-ink-muted sm:block">
                {hint}
              </p>
            </div>
          </div>
        ))}
      </div>
      <Tabs
        disabled={busy || editorBusy}
        items={tabItems}
        value={tab}
        onChange={(value) => {
          setParams({ tab: value });
          setPreview(null);
          setError('');
        }}
      />
      {error && (
        <Alert variant="danger" title="No se pudo completar la acción">
          {error}
        </Alert>
      )}
      {loading && !projects.length && tab !== 'demo' ? (
        <div
          role="status"
          aria-label="Cargando el estudio"
          className="grid gap-4 lg:grid-cols-[280px_1fr]"
        >
          <div className="h-64 animate-pulse rounded-card bg-surface-muted" />
          <div className="h-96 animate-pulse rounded-card bg-brand-50" />
        </div>
      ) : (
        <>
          {tab === 'demo' && (
            <div className="grid gap-5">
              <section className="exp-hero flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
                <div className="max-w-xl">
                  <p className="exp-kicker mb-3">De una tarjeta a una sorpresa</p>
                  <h2 className="text-2xl font-extrabold sm:text-3xl">
                    Una celebración de otro planeta
                  </h2>
                  <p className="mt-3 text-sm leading-7 text-white/75">
                    Descubre el recorrido que vivirá tu cliente: un alien animado, una dedicatoria,
                    su video y una tarjeta que cobra vida al enfocar la cámara.
                  </p>
                  <Button
                    component={Link}
                    to="/experiencias/demo"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-5"
                    leftIcon={<ArrowUpRight size={16} />}
                    sx={{
                      bgcolor: 'white',
                      color: 'primary.dark',
                      '&:hover': { bgcolor: 'primary.50' },
                    }}
                  >
                    Abrir demostración
                  </Button>
                  <p className="mt-3 text-[11px] text-white/60">
                    Demostración gratuita · No genera pedidos ni cobros
                  </p>
                </div>
                <img
                  src="/experiences/demo-poster.svg"
                  alt="Vista del saludo animado del alien"
                  className="w-full rounded-lg border border-white/15 md:w-72 xl:w-96"
                />
              </section>
              <div className="grid gap-4 md:grid-cols-3">
                {[
                  {
                    icon: Eye,
                    title: '1. Explora',
                    text: 'Abre la demostración, gira la escena 3D y reproduce el saludo.',
                  },
                  {
                    icon: QrCode,
                    title: '2. Comparte',
                    text: 'Descarga la tarjeta con QR e imprímela sin recortar la fotografía.',
                  },
                  {
                    icon: Box,
                    title: '3. Dale vida',
                    text: 'Escanea el QR desde tu celular y enfoca la imagen de la tarjeta.',
                  },
                ].map(({ icon: Icon, title, text }) => (
                  <ExperiencePanel key={title} icon={Icon} title={title}>
                    <p className="text-sm leading-relaxed text-ink-muted">{text}</p>
                  </ExperiencePanel>
                ))}
              </div>
              <Alert variant="info" title="Antes de ofrecer un servicio">
                Configura un precio y su alcance en Servicios y precios. La cámara en un celular
                necesita una dirección HTTPS pública.
              </Alert>
            </div>
          )}
          {tab === 'projects' && (
            <div className="grid items-start gap-5 xl:grid-cols-[290px_minmax(0,1fr)]">
              <div className="min-w-0 xl:sticky xl:top-24">
                <ExperiencePanel
                  icon={ClipboardList}
                  title="Trabajos recientes"
                  description="Busca un pedido y abre su propuesta."
                  action={
                    <span className="text-xs font-bold text-brand-700">{projects.length}</span>
                  }
                >
                  <div className="mb-4 grid gap-3">
                    <Input
                      label="Buscar pedido"
                      placeholder="Número o servicio"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      startAdornment={<Search size={15} />}
                    />
                    <TextField
                      select
                      label="Estado de trabajo"
                      size="small"
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                    >
                      <MenuItem value="ALL">Todos los estados</MenuItem>
                      {Object.entries(EXPERIENCE_LABELS)
                        .filter(([key]) => key !== 'EXPIRED')
                        .map(([key, label]) => (
                          <MenuItem key={key} value={key}>
                            {label}
                          </MenuItem>
                        ))}
                    </TextField>
                  </div>
                  {filteredProjects.length ? (
                    <div className="grid max-h-[540px] gap-2 overflow-y-auto pr-1">
                      {filteredProjects.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => void load(p.id)}
                          disabled={busy || editorBusy}
                          className="exp-choice"
                          aria-pressed={detail?.project.id === p.id}
                        >
                          <div className="min-w-0 flex-1">
                            <span className="block truncate text-xs font-extrabold text-ink">
                              {p.order?.orderNumber ?? 'Pedido ' + p.orderId}
                            </span>
                            <span className="my-2 block truncate text-[11px] text-ink-muted">
                              {p.packageSnapshotJson.name}
                            </span>
                            <ExperienceStatus status={p.status} />
                          </div>
                          <ChevronRight size={14} className="mt-0.5 shrink-0 text-ink-muted" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="py-5 text-center">
                      <ClipboardList size={25} className="mx-auto mb-3 text-brand-300" />
                      <p className="text-xs leading-relaxed text-ink-muted">
                        {projects.length
                          ? 'No hay trabajos que coincidan con los filtros.'
                          : 'Todavía no hay pedidos con un adicional QR.'}
                      </p>
                      {(search || statusFilter !== 'ALL') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSearch('');
                            setStatusFilter('ALL');
                          }}
                        >
                          Limpiar filtros
                        </Button>
                      )}
                    </div>
                  )}
                </ExperiencePanel>
              </div>
              {loadingProject ? (
                <div
                  role="status"
                  className="h-96 animate-pulse rounded-card bg-brand-50"
                  aria-label="Cargando propuesta"
                />
              ) : detail ? (
                <div className="grid min-w-0 gap-5">
                  <section className="exp-panel">
                    <div className="p-5 sm:p-6">
                      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="exp-kicker mb-2">Propuesta del pedido</p>
                          <h2 className="text-xl font-extrabold text-ink">
                            {detail.order.orderNumber}
                          </h2>
                          <p className="mt-1 text-xs text-ink-muted">
                            {detail.project.packageSnapshotJson.name} · Versión{' '}
                            {detail.project.version}
                          </p>
                        </div>
                        <ExperienceStatus status={detail.project.status} />
                      </div>
                      <ExperienceProgress status={detail.project.status} />
                      <dl className="exp-detail-grid mt-3">
                        <div>
                          <dt>Pago del pedido</dt>
                          <dd className="inline-flex items-center gap-1.5">
                            {detail.order.balancePaidAt || detail.order.depositPaidAt ? (
                              <CheckCircle2 size={13} className="text-[#527363]" />
                            ) : (
                              <Clock3 size={13} />
                            )}
                            {detail.order.balancePaidAt
                              ? 'Total verificado'
                              : detail.order.depositPaidAt
                                ? 'Anticipo verificado'
                                : 'Pendiente'}
                          </dd>
                        </div>
                        <div>
                          <dt>Revisiones utilizadas</dt>
                          <dd>
                            {detail.project.revisionsUsed} de{' '}
                            {detail.project.packageSnapshotJson.revisionsIncluded}
                          </dd>
                        </div>
                        <div>
                          <dt>Vigencia contratada</dt>
                          <dd>{detail.project.packageSnapshotJson.validityDays} días</dd>
                        </div>
                      </dl>
                    </div>
                    <div className="border-t border-line bg-[#fffcfa] px-5 py-4 sm:px-6">
                      <p className="mb-1 text-[11px] font-bold text-ink">La idea del cliente</p>
                      <p className="whitespace-pre-line break-words text-xs leading-relaxed text-ink-muted">
                        {detail.project.brief}
                      </p>
                    </div>
                  </section>
                  {detail.project.customerFeedback && (
                    <Alert variant="warning" title="Comentario del cliente">
                      {detail.project.customerFeedback}
                    </Alert>
                  )}
                  <ExperiencePanel
                    icon={Palette}
                    title="Diseña la propuesta"
                    description="Prepara el contenido que revisará el cliente."
                    action={
                      <Button
                        size="sm"
                        variant="ghost"
                        leftIcon={<Eye size={14} />}
                        disabled={editorBusy}
                        onClick={openSavedPreview}
                      >
                        Ver versión guardada
                      </Button>
                    }
                  >
                    {write ? (
                      <>
                        <fieldset disabled={busy || editorBusy} className="min-w-0">
                          <SceneEditor
                            value={scene}
                            onChange={setScene}
                            assets={detail.assets ?? config.assets}
                            onUploaded={(assets) =>
                              setDetail((old) =>
                                old
                                  ? {
                                      ...old,
                                      assets: [...assets, ...(old.assets ?? config.assets)],
                                    }
                                  : old,
                              )
                            }
                            projectId={detail.project.id}
                            onBusyChange={setEditorBusy}
                          />
                          <div className="mt-6 border-t border-line pt-6">
                            <TextField
                              fullWidth
                              select
                              label="Responsable (opcional)"
                              value={assigned}
                              onChange={(e) => setAssigned(e.target.value)}
                            >
                              <MenuItem value="">Sin asignar</MenuItem>
                              {detail.staff?.map((person) => (
                                <MenuItem key={person.id} value={String(person.id)}>
                                  {person.firstName} {person.lastName}
                                </MenuItem>
                              ))}
                            </TextField>
                          </div>
                        </fieldset>
                        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-5">
                          <p className="flex items-center gap-1.5 text-[11px] text-ink-muted">
                            {dirty ? (
                              <>
                                <span className="size-1.5 rounded-full bg-amber-600" />
                                Hay cambios sin guardar
                              </>
                            ) : (
                              <>
                                <Check size={13} className="text-[#527363]" />
                                Estás viendo la versión guardada
                              </>
                            )}
                          </p>
                          <div className="exp-primary-actions flex flex-wrap gap-2">
                            <Button
                              leftIcon={<Save size={15} />}
                              isLoading={busy}
                              disabled={editorBusy}
                              onClick={saveProject}
                            >
                              Guardar versión
                            </Button>
                            <Button
                              variant="outline"
                              leftIcon={<Send size={15} />}
                              disabled={
                                busy ||
                                editorBusy ||
                                dirty ||
                                !['DRAFT', 'IN_PROGRESS'].includes(detail.project.status)
                              }
                              onClick={() => projectAction('REVIEW')}
                            >
                              Solicitar revisión del cliente
                            </Button>
                          </div>
                        </div>
                        <p className="mt-3 text-[11px] leading-relaxed text-ink-muted">
                          Guarda los cambios antes de solicitar revisión. Una nueva versión necesita
                          otra aprobación del cliente.
                        </p>
                      </>
                    ) : (
                      <Alert variant="info">Tienes acceso de consulta a esta propuesta.</Alert>
                    )}
                  </ExperiencePanel>
                  {publish && (
                    <ExperiencePanel
                      icon={Rocket}
                      title="Publicación y vigencia"
                      description="Entrega el QR cuando la propuesta esté aprobada y el pago requerido esté verificado."
                    >
                      <TextField
                        fullWidth
                        label="Inicio programado (opcional, hora local)"
                        type="datetime-local"
                        value={starts}
                        onChange={(e) => setStarts(e.target.value)}
                        slotProps={{ inputLabel: { shrink: true } }}
                      />
                      <div className="mt-5 flex flex-wrap gap-2">
                        <Button
                          leftIcon={<Rocket size={15} />}
                          disabled={
                            busy ||
                            editorBusy ||
                            dirty ||
                            (!['APPROVED', 'PAUSED'].includes(detail.project.status) &&
                              !(
                                detail.project.status === 'PUBLISHED' &&
                                detail.project.expiresAt &&
                                new Date(detail.project.expiresAt).getTime() <= Date.now()
                              ))
                          }
                          onClick={() => projectAction('PUBLISH')}
                        >
                          {detail.project.status === 'PAUSED'
                            ? 'Reactivar y renovar vigencia'
                            : 'Publicar experiencia'}
                        </Button>
                        <Button
                          variant="outline"
                          leftIcon={<Pause size={15} />}
                          disabled={busy || editorBusy || detail.project.status !== 'PUBLISHED'}
                          onClick={() => projectAction('PAUSE')}
                        >
                          Pausar
                        </Button>
                      </div>
                      {detail.project.expiresAt ? (
                        <div className="mt-4 flex items-start gap-2 rounded-field border border-line bg-surface-muted p-3 text-xs leading-relaxed text-ink-muted">
                          <CalendarClock size={16} className="shrink-0 text-brand-600" />
                          <p>
                            {formatDate(detail.project.startsAt!)} –{' '}
                            {formatDate(detail.project.expiresAt)}. Pausar o renovar conserva el
                            mismo QR.
                          </p>
                        </div>
                      ) : (
                        <p className="mt-4 text-xs text-ink-muted">
                          La vigencia comienza en la fecha de publicación que elijas.
                        </p>
                      )}
                    </ExperiencePanel>
                  )}
                  <ExperiencePanel
                    icon={History}
                    title="Actividad del trabajo"
                    description="Cambios, revisiones y publicaciones en orden de registro."
                  >
                    <ol className="exp-timeline">
                      {detail.history.map((h) => (
                        <li key={h.id}>
                          <span className="exp-timeline__dot">
                            <Check size={11} />
                          </span>
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-ink">
                              {EXPERIENCE_EVENT_LABELS[h.action] ?? h.action}
                              <span className="ml-2 font-normal text-ink-muted">v{h.version}</span>
                            </p>
                            <p className="mt-1 text-[10px] text-ink-muted">
                              {formatDate(h.createdAt)}
                            </p>
                            {h.note && (
                              <p className="mt-2 break-words text-xs leading-relaxed text-ink-muted">
                                {h.note}
                              </p>
                            )}
                          </div>
                        </li>
                      ))}
                    </ol>
                  </ExperiencePanel>
                </div>
              ) : (
                <div className="exp-panel">
                  <ExperienceEmpty
                    icon={Layers3}
                    title={
                      projects.length
                        ? 'Cada celebración tiene su historia'
                        : 'Tu próximo proyecto empieza aquí'
                    }
                    description={
                      projects.length
                        ? 'Selecciona un pedido para preparar su escena, revisar los comentarios y gestionar su publicación.'
                        : 'Cuando un cliente añada una experiencia QR a su pedido, podrás crear y acompañar su propuesta desde este espacio.'
                    }
                    action={
                      <Button
                        variant="outline"
                        leftIcon={<Eye size={15} />}
                        onClick={() => setParams({ tab: 'demo' })}
                      >
                        Explorar la demostración
                      </Button>
                    }
                  />
                </div>
              )}
            </div>
          )}
          {tab === 'services' && global && (
            <div className="grid items-start gap-5 xl:grid-cols-[290px_minmax(0,1fr)]">
              <ExperiencePanel
                icon={Package}
                title="Servicios y precios"
                description="Adicionales disponibles para la web."
              >
                <div className="grid gap-3">
                  {config.packages.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="exp-choice"
                      aria-pressed={pack?.id === p.id}
                      disabled={busy || editorBusy}
                      aria-label={
                        p.name + ' · ' + (p.isActive ? formatCurrency(p.price) : 'Borrador')
                      }
                      onClick={() => setPack(p)}
                    >
                      <span className="exp-icon">
                        {p.mode === 'AR' ? <Box size={17} /> : <Video size={17} />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="mb-2 block text-xs font-bold text-ink">{p.name}</span>
                        <ExperienceStatus active={p.isActive} />
                        <span className="mt-2 block text-xs font-bold text-ink">
                          {Number(p.price) > 0 ? formatCurrency(p.price) : 'Precio por configurar'}
                        </span>
                      </span>
                    </button>
                  ))}
                  {write && (
                    <Button
                      variant="outline"
                      leftIcon={<Plus size={15} />}
                      disabled={busy || editorBusy}
                      onClick={() => setPack({ ...blankPackage })}
                    >
                      Nuevo servicio
                    </Button>
                  )}
                </div>
              </ExperiencePanel>
              {pack ? (
                <ExperienceServiceEditor
                  value={pack}
                  templates={config.templates}
                  onChange={setPack}
                  editable={write}
                  busy={busy}
                  onSave={() =>
                    void run(async () => {
                      setPack(
                        await api.savePackage({
                          ...pack,
                          id: pack.id || undefined,
                          expectedVersion: pack.version,
                        }),
                      );
                    }, 'Servicio guardado')
                  }
                />
              ) : (
                <div className="exp-panel">
                  <ExperienceEmpty
                    icon={Package}
                    title="Define tu primer servicio"
                    description="Establece su alcance, precio y condiciones antes de ofrecerlo en el checkout."
                  />
                </div>
              )}
            </div>
          )}
          {tab === 'templates' && global && (
            <div className="grid items-start gap-5 xl:grid-cols-[270px_minmax(0,1fr)]">
              <ExperiencePanel
                icon={Layers3}
                title="Biblioteca de plantillas"
                description="Una base para cada nueva celebración."
              >
                <div className="grid gap-3">
                  {config.templates.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      className="exp-choice"
                      aria-pressed={template?.id === t.id}
                      disabled={busy || editorBusy}
                      onClick={() => {
                        setTemplate(t);
                        setPreview(null);
                      }}
                    >
                      <span className="exp-icon">
                        <Palette size={17} />
                      </span>
                      <span className="min-w-0">
                        <span className="mb-2 block text-xs font-bold text-ink">{t.name}</span>
                        <span className="block text-[11px] text-ink-muted">
                          Versión {t.version} · {t.isActive ? 'Disponible' : 'Inactiva'}
                        </span>
                      </span>
                    </button>
                  ))}
                  {write && (
                    <Button
                      variant="outline"
                      leftIcon={<Plus size={15} />}
                      disabled={busy || editorBusy}
                      onClick={() => {
                        setTemplate({
                          id: 0,
                          version: 1,
                          name: 'Nueva plantilla',
                          isActive: true,
                          sceneJson: demoScene,
                        });
                        setPreview(null);
                      }}
                    >
                      Nueva plantilla
                    </Button>
                  )}
                </div>
              </ExperiencePanel>
              {template ? (
                <ExperiencePanel
                  icon={Palette}
                  title={template.id ? 'Editar plantilla' : 'Nueva plantilla'}
                  description="Los cambios se aplican a nuevos trabajos; cada pedido conserva su propia propuesta."
                >
                  <TextField
                    fullWidth
                    label="Nombre de plantilla"
                    value={template.name}
                    disabled={!write || busy || editorBusy}
                    onChange={(e) => setTemplate({ ...template, name: e.target.value })}
                  />
                  <div className="mt-6">
                    {write ? (
                      <fieldset disabled={busy || editorBusy}>
                        <SceneEditor
                          value={template.sceneJson}
                          onChange={(sceneJson) => setTemplate({ ...template, sceneJson })}
                          assets={config.assets}
                          onUploaded={uploaded}
                          onBusyChange={setEditorBusy}
                        />
                        <FormControlLabel
                          className="mt-5"
                          control={
                            <Checkbox
                              checked={template.isActive}
                              onChange={(e) =>
                                setTemplate({ ...template, isActive: e.target.checked })
                              }
                            />
                          }
                          label="Disponible para nuevos servicios"
                        />
                      </fieldset>
                    ) : (
                      <p className="text-sm text-ink-muted">
                        Puedes consultar y previsualizar esta plantilla.
                      </p>
                    )}
                  </div>
                  <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-line pt-5">
                    <Button
                      variant="outline"
                      leftIcon={<Eye size={15} />}
                      disabled={editorBusy}
                      onClick={() =>
                        setPreview({ scene: template.sceneJson, base: '/experiences/admin' })
                      }
                    >
                      Previsualizar plantilla
                    </Button>
                    {write && (
                      <Button
                        leftIcon={<Save size={15} />}
                        isLoading={busy}
                        disabled={editorBusy}
                        onClick={() =>
                          void run(async () => {
                            setTemplate(
                              await api.saveTemplate({
                                ...template,
                                id: template.id || undefined,
                                expectedVersion: template.version,
                              }),
                            );
                          }, 'Plantilla guardada')
                        }
                      >
                        Guardar plantilla
                      </Button>
                    )}
                  </div>
                </ExperiencePanel>
              ) : (
                <div className="exp-panel">
                  <ExperienceEmpty
                    icon={Palette}
                    title="Ideas listas para personalizar"
                    description="Crea una plantilla con una escena, dedicatoria y archivos para reutilizarla en futuros pedidos."
                  />
                </div>
              )}
            </div>
          )}
        </>
      )}
      <Dialog
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        fullWidth
        maxWidth="lg"
        aria-labelledby="experience-preview-title"
      >
        <DialogTitle
          id="experience-preview-title"
          sx={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 2,
            borderBottom: 1,
            borderColor: 'divider',
            py: 2,
          }}
        >
          <span className="flex items-center gap-2 text-base font-extrabold">
            <Eye size={17} className="text-brand-600" />
            Vista previa privada
          </span>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Cerrar vista previa"
            onClick={() => setPreview(null)}
            sx={{ minWidth: 40, px: 1 }}
          >
            <X size={18} />
          </Button>
        </DialogTitle>
        <DialogContent sx={{ py: 3, '&:first-of-type': { pt: 3 } }}>
          {media.loading ? (
            <p role="status" className="py-12 text-center text-sm text-ink-muted">
              Cargando archivos…
            </p>
          ) : media.error ? (
            <Alert variant="danger">{media.error}</Alert>
          ) : (
            preview && (
              <ExperienceViewer
                scene={preview.scene}
                media={media.media}
                mode={preview.scene.content === 'VIDEO' ? 'VIDEO' : 'AR'}
                url={preview.url}
                expiresAt={preview.expiresAt}
              />
            )
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
