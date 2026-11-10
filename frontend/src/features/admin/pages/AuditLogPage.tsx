import { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Download, Eraser, RefreshCw, ScrollText, ShieldCheck } from 'lucide-react';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Pagination } from '@components/ui/Pagination';
import { Select, SelectOption } from '@components/ui/Select';
import { EmptyState } from '@components/common/EmptyState';
import { LoadError } from '@components/common/LoadError';
import { PageHeader } from '@components/common/PageHeader';
import { PageLoader } from '@components/common/PageLoader';
import { PERM } from '@constants/permissions';
import { usePermissions } from '@hooks/usePermissions';
import { cn } from '@lib/cn';
import { formatDate, formatRelative } from '@lib/format';
import { getApiErrorMessage } from '@services/api/client';
import { adminApi } from '../services/admin.service';
import { accessApi, type StaffRow } from '../services/access.service';
import type { AuditLogRow } from '../types';
import type { PaginationMeta } from '@/types/api';

/**
 * BITACORA — /admin/bitacora
 * ---------------------------------------------------------------------------
 * El rol Auditor existe para "solo lectura de todo, incluida la bitacora", y la
 * bitacora era justo lo unico que no tenia pantalla: el endpoint estaba completo
 * (filtros, paginacion) y `audit.read` no tenia donde ejercerse. El backend ya
 * escribe aqui cada cambio sensible —precio, permiso, estado de pedido, zona de
 * reparto—, asi que lo que faltaba era el sitio donde leerlo.
 *
 * Los filtros viajan en la URL (`?entidad=&actor=&pagina=`) y no en estado local:
 * una revision se comparte pasando el enlace, no dictando por telefono los tres
 * filtros que hay que volver a poner.
 */
const PAGE_SIZE = 25;

/**
 * Entidades que el backend audita hoy, con nombre humano. La etiqueta lleva el
 * area delante ("Catálogo · Productos") porque el mismo desplegable mezcla siete
 * areas del panel y ordenado alfabeticamente por area se encuentra a la primera.
 *
 * Si apareciera una entidad nueva sin fila aqui, la lista sigue funcionando: el
 * registro se pinta con su codigo crudo (ver `entityLabel`).
 */
const ENTITY_OPTIONS: Array<{ value: string; label: string }> = [
  { value: 'orders', label: 'Pedidos · Estados de pedido' },
  { value: 'complaints', label: 'Pedidos · Libro de reclamaciones' },
  { value: 'products', label: 'Catálogo · Productos' },
  { value: 'product_variants', label: 'Catálogo · Presentaciones y precios' },
  { value: 'categories', label: 'Catálogo · Categorías' },
  { value: 'branch_product_availability', label: 'Catálogo · Disponibilidad por cocina' },
  { value: 'customization_groups', label: 'Constructor · Pasos del bowl' },
  { value: 'customization_options', label: 'Constructor · Ingredientes' },
  { value: 'option_incompatibilities', label: 'Constructor · Combinaciones prohibidas' },
  { value: 'branch_option_availability', label: 'Constructor · Disponibilidad de ingredientes' },
  { value: 'builder_presets', label: 'Constructor · Bowls sugeridos' },
  { value: 'coupons', label: 'Comercial · Cupones' },
  { value: 'plans', label: 'Comercial · Planes' },
  { value: 'plan_benefits', label: 'Comercial · Beneficios de plan' },
  { value: 'branches', label: 'Cobertura · Cocinas' },
  { value: 'branch_schedules', label: 'Cobertura · Horarios de atención' },
  { value: 'coverage_zones', label: 'Cobertura · Zonas' },
  { value: 'zone_branches', label: 'Cobertura · Zonas asignadas a una cocina' },
  { value: 'districts', label: 'Cobertura · Distritos' },
  { value: 'delivery_slots', label: 'Cobertura · Franjas horarias' },
  { value: 'users', label: 'Accesos · Usuarios' },
  { value: 'roles', label: 'Accesos · Roles y permisos' },
  { value: 'business_settings', label: 'Sistema · Datos del negocio' },
  { value: 'communication_settings', label: 'Sistema · Comunicaciones' },
];

/** Que hizo el responsable, en una frase. Las claves son las de `audit(req, ...)`. */
const ACTION_LABEL: Record<string, string> = {
  'order.update_status': 'Cambió el estado de un pedido',
  'complaint.respond': 'Respondió un reclamo',

  'catalog.product.create': 'Creó un producto',
  'catalog.product.update': 'Editó un producto',
  'catalog.product.publish': 'Publicó o despublicó un producto',
  'catalog.variant.create': 'Creó una presentación',
  'catalog.price.update': 'Cambió un precio',
  'catalog.allergens.update': 'Actualizó los alérgenos',
  'catalog.tags.update': 'Actualizó las etiquetas dietéticas',
  'catalog.availability.update': 'Cambió la disponibilidad en una cocina',
  'catalog.category.create': 'Creó una categoría',

  'builder.group.create': 'Creó un paso del constructor',
  'builder.group.update': 'Editó un paso del constructor',
  'builder.group.delete': 'Eliminó un paso del constructor',
  'builder.option.create': 'Creó un ingrediente',
  'builder.option.update': 'Editó un ingrediente',
  'builder.option.delete': 'Eliminó un ingrediente',
  'builder.option.duplicate': 'Duplicó un ingrediente',
  'builder.option.bulk_update': 'Editó varios ingredientes a la vez',
  'builder.option.schedule': 'Programó la disponibilidad de un ingrediente',
  'builder.incompatibility.add': 'Prohibió una combinación',
  'builder.incompatibility.remove': 'Permitió de nuevo una combinación',
  'builder.preset.create': 'Creó un bowl sugerido',
  'builder.preset.update': 'Editó un bowl sugerido',
  'builder.preset.delete': 'Eliminó un bowl sugerido',

  'promotion.coupon.create': 'Creó un cupón',
  'promotion.coupon.update': 'Editó un cupón',
  'promotion.coupon.archive': 'Archivó un cupón',
  'subscription.plan.create': 'Creó una caja mensual',
  'subscription.plan.update': 'Editó una caja mensual',
  'subscription.plan.archive': 'Archivó una caja mensual',
  'subscription.cancel': 'Canceló una suscripción',
  'plan.create': 'Creó un plan',
  'plan.update': 'Editó un plan',
  'plan.benefit.set': 'Configuró un beneficio de plan',
  'plan.benefit.remove': 'Quitó un beneficio de plan',

  'geo.branch.create': 'Creó una cocina',
  'geo.branch.update': 'Editó una cocina',
  'geo.schedule.update': 'Cambió un horario de atención',
  'geo.zone.create': 'Creó una zona de cobertura',
  'geo.zone.update': 'Editó una zona de cobertura',
  'geo.zone.assign_branch': 'Asignó una zona a una cocina',
  'geo.district.create': 'Creó un distrito',
  'geo.district.set_zone': 'Abrió o cerró un distrito',
  'geo.slots.generate': 'Generó franjas horarias',

  'role.create': 'Creó un rol',
  'role.update': 'Cambió los permisos de un rol',
  'role.delete': 'Eliminó un rol',
  'user.create': 'Creó un usuario del panel',
  'user.update_roles': 'Cambió los roles de un usuario',
  'user.set_superadmin': 'Concedió o retiró superadmin',
  'user.set_status': 'Bloqueó o reactivó un usuario',

  'settings.business.update': 'Actualizó los datos del negocio',
  'settings.communication.update': 'Actualizó la configuración de comunicaciones',
  'settings.communication.test': 'Envió un mensaje de prueba',
};

const entityLabel = (entity: string): string =>
  ENTITY_OPTIONS.find((option) => option.value === entity)?.label ?? entity;

/**
 * Tono del registro por el VERBO de la accion. Un borrado y una creacion no se
 * revisan con la misma prisa, y en una lista larga el color es lo primero que se
 * lee. `bulk_update` entra en el tono de aviso a proposito: toca varias filas.
 */
const actionTone = (action: string): 'danger' | 'create' | 'warn' | 'neutral' => {
  if (/\.(delete|remove)$/.test(action)) return 'danger';
  if (/\.(create|add|duplicate|generate)$/.test(action)) return 'create';
  if (/(set_superadmin|set_status|bulk_update|publish|price\.update)$/.test(action)) return 'warn';
  return 'neutral';
};

const TONE_CLASS: Record<ReturnType<typeof actionTone>, string> = {
  danger: 'border-red-200 bg-red-50 text-red-700',
  create: 'border-brand-200 bg-brand-50 text-brand-700',
  warn: 'border-accent-200 bg-accent-50 text-accent-700',
  neutral: 'border-line bg-surface-muted text-ink-muted',
};

/** Valor de un campo tal y como se guardó, legible sin abrir el JSON. */
const renderValue = (value: unknown): string => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'object') return JSON.stringify(value);
  if (value === '') return '(vacío)';
  return String(value);
};

interface DiffRow {
  key: string;
  before: unknown;
  after: unknown;
  changed: boolean;
}

const buildDiff = (
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): DiffRow[] => {
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].sort();

  return keys.map((key) => ({
    key,
    before: before?.[key],
    after: after?.[key],
    // Comparacion por serializacion: los valores anidados (arrays de permisos,
    // poligonos) son objetos distintos aunque digan lo mismo.
    changed: JSON.stringify(before?.[key] ?? null) !== JSON.stringify(after?.[key] ?? null),
  }));
};

/**
 * Diff de un registro. Mismo lenguaje visual que el historial del constructor
 * (antes en rojo, después en verde), pero campo a campo en vez de dos bloques de
 * JSON: lo que un auditor necesita ver es QUE cambio, no el objeto entero.
 * El JSON completo sigue estando, plegado, para el caso raro en que haga falta.
 */
const AuditDiff = ({ entry }: { entry: AuditLogRow }) => {
  const before = entry.beforeJson;
  const after = entry.afterJson;

  if (!before && !after) {
    return (
      <p className="mt-3 text-xs text-ink-muted">
        Sin valores registrados para este movimiento.
      </p>
    );
  }

  const rows = buildDiff(before, after);
  const changed = rows.filter((row) => row.changed);
  const unchanged = rows.length - changed.length;
  const visible = changed.length > 0 ? changed : rows;

  return (
    <div className="mt-3">
      <div className="hidden overflow-x-auto rounded-card border border-line sm:block">
        <table className="w-full min-w-[520px] text-left text-xs">
          <caption className="sr-only">Valores antes y después del cambio</caption>
          <thead className="border-b border-line bg-surface-muted text-[10px] uppercase tracking-wide text-ink-muted">
            <tr>
              <th scope="col" className="p-2 font-bold">Campo</th>
              <th scope="col" className="p-2 font-bold">Antes</th>
              <th scope="col" className="p-2 font-bold">Después</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr key={row.key} className="border-b border-line last:border-0 align-top">
                <td className="p-2 font-semibold text-ink">{row.key}</td>
                <td className="p-2">
                  <span className={cn('break-words', before ? 'text-red-700' : 'text-ink-muted')}>
                    {before ? renderValue(row.before) : '—'}
                  </span>
                </td>
                <td className="p-2">
                  <span className={cn('break-words', after ? 'text-brand-700' : 'text-ink-muted')}>
                    {after ? renderValue(row.after) : '—'}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-2 sm:hidden">
        {visible.map((row) => (
          <article key={row.key} className="min-w-0 rounded-card border border-line bg-white p-3">
            <p className="break-all text-[11px] font-extrabold uppercase tracking-wide text-ink-muted">{row.key}</p>
            <div className="mt-2 grid min-w-0 grid-cols-2 gap-2">
              <div className="min-w-0 rounded-card bg-red-50/60 p-2">
                <p className="text-[10px] font-bold uppercase text-red-700">Antes</p>
                <p className="mt-1 break-all text-xs leading-relaxed text-red-700">{before ? renderValue(row.before) : '—'}</p>
              </div>
              <div className="min-w-0 rounded-card bg-brand-50 p-2">
                <p className="text-[10px] font-bold uppercase text-brand-700">Después</p>
                <p className="mt-1 break-all text-xs leading-relaxed text-brand-700">{after ? renderValue(row.after) : '—'}</p>
              </div>
            </div>
          </article>
        ))}
      </div>

      {changed.length > 0 && unchanged > 0 && (
        <p className="mt-1.5 text-[11px] text-ink-muted">
          {unchanged === 1 ? '1 campo más se envió sin cambios.' : `${unchanged} campos más se enviaron sin cambios.`}
        </p>
      )}

      <details className="mt-2">
        <summary className="cursor-pointer text-[11px] font-semibold text-ink-muted hover:text-ink">
          Ver el registro completo
        </summary>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <div className="rounded-card bg-red-50/60 p-3">
            <p className="mb-1 text-[10px] font-bold uppercase text-red-700">Antes</p>
            <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-all text-[11px] text-ink-muted">
              {JSON.stringify(before ?? {}, null, 2)}
            </pre>
          </div>
          <div className="rounded-card bg-brand-50 p-3">
            <p className="mb-1 text-[10px] font-bold uppercase text-brand-700">Después</p>
            <pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-all text-[11px] text-ink-muted">
              {JSON.stringify(after ?? {}, null, 2)}
            </pre>
          </div>
        </div>
      </details>
    </div>
  );
};

const AuditLogPage = () => {
  const { can } = usePermissions();
  const canReadStaff = can(PERM.USER_READ);

  const [params, setParams] = useSearchParams();
  const entity = params.get('entidad') ?? '';
  const actor = params.get('actor') ?? '';
  const action = params.get('accion') ?? '';
  const entityId = params.get('entidadId') ?? '';
  const severity = params.get('severidad') ?? '';
  const outcome = params.get('resultado') ?? '';
  const search = params.get('buscar') ?? '';
  const correlationId = params.get('correlation') ?? '';
  const from = params.get('desde') ?? '';
  const to = params.get('hasta') ?? '';
  const page = Math.max(1, Number(params.get('pagina') ?? '1') || 1);

  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [summary, setSummary] = useState<{ today: number; critical: number; failures: number } | null>(null);
  const [integrity, setIntegrity] = useState<{ valid: boolean; checked: number; violations: Array<{ id: number; reason: string }>; checkedAt: string } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const canExport = can(PERM.AUDIT_EXPORT);
  const canVerify = can(PERM.AUDIT_VERIFY);
  // Token de secuencia: cambiar de filtro rapido deja peticiones en vuelo y sin
  // esto gana la ultima en RESOLVER, no la ultima SOLICITADA.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setIsLoading(true);
    try {
      const [result, counters] = await Promise.all([adminApi.auditLogPage({
        entity: entity || undefined,
        actorId: actor ? Number(actor) : undefined,
        action: action || undefined,
        entityId: entityId || undefined,
        severity: severity as 'INFO' | 'WARNING' | 'CRITICAL' || undefined,
        outcome: outcome as 'SUCCESS' | 'FAILURE' || undefined,
        search: search || undefined,
        correlationId: correlationId || undefined,
        from: from || undefined,
        to: to || undefined,
        page,
        pageSize: PAGE_SIZE,
      }), adminApi.auditSummary()]);
      if (id !== requestId.current) return;
      setRows(result.rows);
      setMeta(result.meta);
      setSummary(counters);
      setLoadError(null);
    } catch (error) {
      if (id !== requestId.current) return;
      // La lista se vacia a proposito: dejar en pantalla los registros del filtro
      // anterior con el filtro nuevo puesto es exactamente la mentira que esta
      // pantalla existe para no cometer.
      setRows([]);
      setMeta(null);
      setLoadError(getApiErrorMessage(error));
    } finally {
      if (id === requestId.current) {
        setIsLoading(false);
        setHasLoadedOnce(true);
      }
    }
  }, [entity, actor, action, entityId, severity, outcome, search, correlationId, from, to, page]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Nombres de los responsables. El endpoint de la bitacora devuelve `actorId` a
   * secas, asi que se resuelve contra el personal del panel; sin `user.read` no
   * se pide y cada fila muestra el id, que sigue siendo trazable.
   */
  useEffect(() => {
    if (!canReadStaff) return;
    let alive = true;
    accessApi
      .staff()
      .then((list) => {
        if (alive) setStaff(list);
      })
      .catch(() => {
        // Un fallo aqui solo cuesta los nombres: la bitacora se lee igual.
        if (alive) setStaff([]);
      });
    return () => {
      alive = false;
    };
  }, [canReadStaff]);

  const staffName = (actorId: number | null | undefined): string => {
    if (!actorId) return 'Sistema';
    const person = staff.find((row) => row.id === actorId);
    if (!person) return `Usuario #${actorId}`;
    const name = [person.firstName, person.lastName].filter(Boolean).join(' ');
    return name || person.email || `Usuario #${actorId}`;
  };

  /** Cualquier cambio de filtro vuelve a la primera pagina. */
  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('pagina');
    setParams(next, { replace: true });
  };

  const goToPage = (value: number) => {
    const next = new URLSearchParams(params);
    if (value > 1) next.set('pagina', String(value));
    else next.delete('pagina');
    setParams(next, { replace: true });
  };

  const hasFilters = [entity, actor, action, entityId, severity, outcome, search, correlationId, from, to].some(Boolean);

  const verifyIntegrity = async () => {
    setIsVerifying(true);
    try { setIntegrity(await adminApi.verifyAuditIntegrity()); }
    catch (error) { setLoadError(getApiErrorMessage(error)); }
    finally { setIsVerifying(false); }
  };

  const exportAudit = async () => {
    const end = to || new Date().toISOString().slice(0, 10);
    const start = from || new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10);
    const reason = window.prompt('Motivo de la exportación de bitácora:');
    if (!reason || reason.trim().length < 10) return;
    setIsExporting(true);
    try {
      const blob = await adminApi.exportAuditCsv({ entity: entity || undefined, actorId: actor ? Number(actor) : undefined, action: action || undefined, entityId: entityId || undefined, severity: severity as 'INFO' | 'WARNING' | 'CRITICAL' || undefined, outcome: outcome as 'SUCCESS' | 'FAILURE' || undefined, search: search || undefined, correlationId: correlationId || undefined, from: start, to: end, reason: reason.trim() });
      const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `bitacora-${end}.csv`; link.click(); URL.revokeObjectURL(url);
    } catch (error) { setLoadError(getApiErrorMessage(error)); } finally { setIsExporting(false); }
  };

  if (!hasLoadedOnce) return <PageLoader />;

  return (
    <div>
      <PageHeader
        eyebrow="Administración"
        icon={ScrollText}
        title="Bitácora"
        description="Cada cambio sensible queda registrado: quién lo hizo, cuándo y con qué valores antes y después."
        action={
          <div className="flex flex-wrap gap-2">
            {canVerify && <Button variant="outline" size="sm" isLoading={isVerifying} leftIcon={<ShieldCheck className="size-4" />} onClick={() => void verifyIntegrity()}>Verificar integridad</Button>}
            {canExport && <Button variant="outline" size="sm" isLoading={isExporting} leftIcon={<Download className="size-4" />} onClick={() => void exportAudit()}>Exportar</Button>}
            <Button variant="outline" size="sm" isLoading={isLoading} leftIcon={<RefreshCw className="size-4" />} onClick={() => void load()}>Actualizar</Button>
          </div>
        }
      />

      {summary && <div className="mt-4 grid grid-cols-3 gap-3"><Metric label="Eventos hoy" value={summary.today} /><Metric label="Críticos hoy" value={summary.critical} tone={summary.critical ? 'critical' : 'default'} /><Metric label="Fallidos hoy" value={summary.failures} tone={summary.failures ? 'critical' : 'default'} /></div>}
      {integrity && <div className={`mt-4 flex items-center gap-2 rounded-card border px-4 py-3 text-sm ${integrity.valid ? 'border-brand-200 bg-brand-50 text-brand-700' : 'border-red-200 bg-red-50 text-red-700'}`}><ShieldCheck className="size-4" />{integrity.valid ? `Cadena íntegra: ${integrity.checked} registros verificados.` : `Se encontraron ${integrity.violations.length} inconsistencias en ${integrity.checked} registros.`}</div>}

      <div className="flex flex-col gap-3 rounded-card border border-line bg-surface p-3 shadow-e1 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="sm:w-80">
          <Select
            label="Qué se cambió"
            size="small"
            value={entity}
            onChange={(event) => setFilter('entidad', event.target.value)}
          >
            <SelectOption value="">Todo</SelectOption>
            {ENTITY_OPTIONS.map((option) => (
              <SelectOption key={option.value} value={option.value}>
                {option.label}
              </SelectOption>
            ))}
            {/* Entidad que llega por la URL y aun no esta en la tabla de arriba:
                sin esta opcion el desplegable se queda en blanco filtrando. */}
            {entity !== '' && !ENTITY_OPTIONS.some((option) => option.value === entity) && (
              <SelectOption value={entity}>{entity}</SelectOption>
            )}
          </Select>
        </div>

        <div className="sm:w-64">
          {canReadStaff ? (
            <Select
              label="Quién lo hizo"
              size="small"
              value={actor}
              onChange={(event) => setFilter('actor', event.target.value)}
            >
              <SelectOption value="">Cualquiera</SelectOption>
              {/* El personal se carga aparte: hasta que llega —o si el responsable
                  ya no existe— el filtro de la URL debe seguir siendo visible. */}
              {actor !== '' && !staff.some((person) => String(person.id) === actor) && (
                <SelectOption value={actor}>Usuario #{actor}</SelectOption>
              )}
              {staff.map((person) => (
                <SelectOption key={person.id} value={String(person.id)}>
                  {[person.firstName, person.lastName].filter(Boolean).join(' ') || person.email}
                </SelectOption>
              ))}
            </Select>
          ) : (
            <Input
              label="Responsable (id)"
              type="number"
              min="1"
              value={actor}
              onChange={(event) => setFilter('actor', event.target.value)}
            />
          )}
        </div>

        <Input label="Acción" value={action} onChange={(event) => setFilter('accion', event.target.value)} placeholder="ej. role.update" />
        <Input label="Buscar" value={search} onChange={(event) => setFilter('buscar', event.target.value)} placeholder="Entidad, ID o correlación" />
        <div className="flex gap-2"><Input label="Desde" type="date" value={from} onChange={(event) => setFilter('desde', event.target.value)} /><Input label="Hasta" type="date" value={to} onChange={(event) => setFilter('hasta', event.target.value)} /></div>
        <div className="sm:w-40"><Select label="Severidad" size="small" value={severity} onChange={(event) => setFilter('severidad', event.target.value)}><SelectOption value="">Todas</SelectOption><SelectOption value="INFO">Info</SelectOption><SelectOption value="WARNING">Advertencia</SelectOption><SelectOption value="CRITICAL">Crítica</SelectOption></Select></div>
        <div className="sm:w-40"><Select label="Resultado" size="small" value={outcome} onChange={(event) => setFilter('resultado', event.target.value)}><SelectOption value="">Todos</SelectOption><SelectOption value="SUCCESS">Exitosos</SelectOption><SelectOption value="FAILURE">Fallidos</SelectOption></Select></div>

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            leftIcon={<Eraser className="size-4" />}
            onClick={() => setParams(new URLSearchParams(), { replace: true })}
          >
            Limpiar filtros
          </Button>
        )}

        {meta && (
          <p className="text-xs text-ink-muted sm:ml-auto">
            {meta.total === 1 ? '1 movimiento' : `${meta.total} movimientos`}
            {meta.totalPages > 1 && ` · página ${meta.page} de ${meta.totalPages}`}
          </p>
        )}
      </div>

      {loadError ? (
        <LoadError
          className="mt-4"
          title="No pudimos cargar la bitácora"
          message={loadError}
          onRetry={() => void load()}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          className="mt-4"
          icon={ScrollText}
          title="No hay movimientos"
          description={
            hasFilters
              ? 'Ningún cambio coincide con los filtros seleccionados.'
              : 'Todavía no se ha registrado ningún cambio sensible.'
          }
        />
      ) : (
        <div className="mt-4 grid gap-3">
          {rows.map((entry) => (
            <article key={entry.id} className="rounded-card border border-line bg-surface p-4 shadow-e1">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-ink">{ACTION_LABEL[entry.action] ?? entry.action}</p>
                  <p className="mt-0.5 text-xs text-ink-muted">
                    {staffName(entry.actorId)} · {formatDate(entry.createdAt)} ·{' '}
                    {formatRelative(entry.createdAt)}
                  </p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <span
                    className={cn(
                      'rounded-pill border px-2 py-1 text-[10px] font-bold',
                      TONE_CLASS[actionTone(entry.action)],
                    )}
                  >
                    {entry.action}
                  </span>
                  <span className={cn('rounded-pill border px-2 py-1 text-[10px] font-bold', entry.severity === 'CRITICAL' ? 'border-red-200 bg-red-50 text-red-700' : entry.severity === 'WARNING' ? 'border-accent-200 bg-accent-50 text-accent-700' : 'border-line bg-surface-muted text-ink-muted')}>{entry.severity}</span>
                  <span className="rounded-pill border border-line bg-surface-muted px-2 py-1 text-[10px] font-bold text-ink-muted">{entry.outcome === 'SUCCESS' ? 'OK' : 'FALLÓ'}</span>
                  <span className="rounded-pill border border-line bg-surface-muted px-2 py-1 text-[10px] font-bold text-ink-muted">
                    {entityLabel(entry.entity)}
                    {entry.entityId ? ` #${entry.entityId}` : ''}
                  </span>
                </div>
                {(entry.correlationId || entry.ip) && <p className="mt-2 text-[11px] text-ink-muted">{entry.ip ? `IP ${entry.ip}` : ''}{entry.correlationId ? ` · Correlación ${entry.correlationId}` : ''}</p>}
              </div>

              <AuditDiff entry={entry} />
            </article>
          ))}
        </div>
      )}

      {meta && meta.totalPages > 1 && (
        <div className="mt-5 flex justify-center">
          <Pagination page={meta.page} totalPages={meta.totalPages} onChange={goToPage} />
        </div>
      )}
    </div>
  );
};

const Metric = ({ label, value, tone = 'default' }: { label: string; value: number; tone?: 'default' | 'critical' }) => (
  <div className={cn('rounded-card border p-3', tone === 'critical' ? 'border-red-200 bg-red-50' : 'border-line bg-surface')}>
    <p className="text-xs text-ink-muted">{label}</p>
    <p className="mt-1 text-xl font-bold text-ink">{value}</p>
  </div>
);

export default AuditLogPage;
