import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BookText, Download, Inbox, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Card } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { Modal } from '@components/ui/Modal';
import { Textarea } from '@components/ui/Textarea';
import { Select, SelectOption } from '@components/ui/Select';
import { Pagination } from '@components/ui/Pagination';
import { FilterPills } from '@components/ui/FilterPills';
import { PageLoader } from '@components/common/PageLoader';
import { PageHeader } from '@components/common/PageHeader';
import { EmptyState } from '@components/common/EmptyState';
import { LoadError } from '@components/common/LoadError';
import {
  ComplaintOverdueBadge,
  ComplaintStatusBadge,
  isComplaintOverdue,
} from '../components/ComplaintStatusBadge';
import { getApiErrorMessage } from '@services/api/client';
import { formatCurrency, formatDate } from '@lib/format';
import { useDebounce } from '@hooks/useDebounce';
import {
  complaintsAdminApi,
  type ComplaintDetail,
  type ComplaintRow,
  type ComplaintSummary,
} from '../services/complaintsAdmin.service';
import type { PaginationMeta } from '@/types/api';

/**
 * Valores del filtro. "overdue" no es un estado del reclamo sino un cruce de
 * estado y fecha, pero para quien atiende es una bandeja mas: la de lo que ya
 * incumple el plazo legal.
 */
type FilterValue = '' | 'RECEIVED' | 'IN_PROGRESS' | 'RESOLVED' | 'overdue';

const TYPE_LABEL: Record<string, string> = { RECLAMO: 'Reclamo', QUEJA: 'Queja' };

const isFilterValue = (value: string): value is FilterValue =>
  ['', 'RECEIVED', 'IN_PROGRESS', 'RESOLVED', 'overdue'].includes(value);

const AdminComplaintsPage = () => {
  /*
   * Los filtros viven en la URL, no en el estado local.
   *
   * Antes eran cuatro `useState`: al abrir un reclamo, volver y encontrarse de
   * nuevo "Todos" en la pagina 1 obligaba a rehacer el camino, y el enlace no se
   * podia pasar a un companero ("mira los vencidos"). El banner de vencidos, que
   * ahora es un boton, tampoco tendria adonde llevar.
   */
  const [params, setParams] = useSearchParams();
  const rawFilter = params.get('estado') ?? '';
  const filter: FilterValue = isFilterValue(rawFilter) ? rawFilter : '';
  const search = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('pagina')) || 1);
  const debouncedSearch = useDebounce(search, 400);

  const [rows, setRows] = useState<ComplaintRow[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [summary, setSummary] = useState<ComplaintSummary | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isExporting, setIsExporting] = useState(false);
  // Token de secuencia: cada carga se numera y solo la ULTIMA lanzada puede escribir
  // el estado. Sin esto, cambiar de filtro o pagina rapido deja peticiones en vuelo
  // y gana la ultima en RESOLVER, no la ultima SOLICITADA.
  const requestId = useRef(0);

  /** Lo que se manda al servidor: el chip "Vencidos" es un filtro aparte, no un estado. */
  const query = useMemo(
    () => ({
      status: filter && filter !== 'overdue' ? filter : undefined,
      overdue: filter === 'overdue' ? true : undefined,
      search: debouncedSearch || undefined,
    }),
    [filter, debouncedSearch],
  );

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setIsLoading(true);
    try {
      const [{ rows: data, meta: pageMeta }, counters] = await Promise.all([
        complaintsAdminApi.list({ ...query, page }),
        // Los contadores son GLOBALES, no de la pagina: se piden aparte.
        complaintsAdminApi.summary(),
      ]);
      if (id !== requestId.current) return; // llego una carga mas nueva: se descarta esta
      setRows(data);
      setMeta(pageMeta);
      setSummary(counters);
      setLoadError(null);
    } catch (error) {
      // El fallo se queda en pantalla: un toast que se va en tres segundos deja
      // una tabla vacia que se lee como "no hay reclamos", justo lo contrario.
      if (id === requestId.current) setLoadError(getApiErrorMessage(error));
    } finally {
      if (id === requestId.current) {
        setIsLoading(false);
        setHasLoadedOnce(true);
      }
    }
  }, [query, page]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Escribe un filtro en la URL. Cambiar de filtro o buscar vuelve a la primera pagina. */
  const patchParams = (changes: Record<string, string>, resetPage = true) => {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        Object.entries(changes).forEach(([key, value]) => {
          if (value) next.set(key, value);
          else next.delete(key);
        });
        if (resetPage) next.delete('pagina');
        return next;
      },
      { replace: true },
    );
  };

  const changeFilter = (value: FilterValue) => patchParams({ estado: value });
  const changeSearch = (value: string) => patchParams({ q: value });
  const changePage = (value: number) => patchParams({ pagina: String(value) }, false);

  const exportCsv = async () => {
    setIsExporting(true);
    try {
      const blob = await complaintsAdminApi.exportCsv(query);
      // Enlace efimero: el archivo ya viene del servidor, aqui solo se dispara la
      // descarga. Sin revoke, cada exportacion deja el blob retenido en memoria.
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `libro-reclamaciones-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success('Exportación descargada');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsExporting(false);
    }
  };

  // --- Modal de detalle / respuesta ---
  const [selected, setSelected] = useState<ComplaintDetail | null>(null);
  // Id de la fila cuyo detalle se esta cargando: asi solo gira SU boton, no todos.
  const [loadingId, setLoadingId] = useState<number | null>(null);
  const [response, setResponse] = useState('');
  const [responseStatus, setResponseStatus] = useState<'IN_PROGRESS' | 'RESOLVED'>('RESOLVED');
  const [isSaving, setIsSaving] = useState(false);

  const openDetail = async (id: number) => {
    setLoadingId(id);
    try {
      const detail = await complaintsAdminApi.detail(id);
      setSelected(detail);
      setResponse(detail.response ?? '');
      setResponseStatus(detail.status === 'RESOLVED' ? 'RESOLVED' : 'IN_PROGRESS');
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setLoadingId(null);
    }
  };

  const submitResponse = async () => {
    if (!selected) return;
    if (response.trim().length < 5) {
      toast.error('Escribe la respuesta al consumidor');
      return;
    }
    setIsSaving(true);
    try {
      await complaintsAdminApi.respond(selected.id, { response: response.trim(), status: responseStatus });
      toast.success('Respuesta registrada. Le avisamos al consumidor por correo.');
      setSelected(null);
      await load();
    } catch (error) {
      toast.error(getApiErrorMessage(error));
    } finally {
      setIsSaving(false);
    }
  };

  const filters: Array<{ value: FilterValue; label: string; count?: number }> = [
    { value: '', label: 'Todos' },
    { value: 'RECEIVED', label: 'Recibidos', count: summary?.received },
    { value: 'IN_PROGRESS', label: 'En proceso', count: summary?.inProgress },
    { value: 'RESOLVED', label: 'Atendidos', count: summary?.resolved },
    { value: 'overdue', label: 'Vencidos', count: summary?.overdue },
  ];

  const overdueTotal = summary?.overdue ?? 0;

  // Solo en la PRIMERA carga se ocupa toda la pantalla: en recargas (filtro, pagina)
  // se conserva la barra de filtros para no dejar al usuario sin controles.
  if (!hasLoadedOnce) return <PageLoader />;

  const list = loadError ? (
    <LoadError className="mt-4" message={loadError} onRetry={() => void load()} />
  ) : rows.length === 0 ? (
    <EmptyState
      className="mt-4"
      icon={Inbox}
      title="No hay reclamos"
      description="No encontramos reclamos con los filtros seleccionados."
    />
  ) : null;

  return (
    <div>
      <PageHeader
        eyebrow="Administración"
        icon={BookText}
        title="Libro de Reclamaciones"
        description="Atiende cada reclamo dentro del plazo legal. El consumidor recibe tu respuesta por correo."
        action={
          <>
            <Button
              variant="outline"
              size="sm"
              isLoading={isExporting}
              leftIcon={<Download className="size-4" />}
              onClick={() => void exportCsv()}
            >
              Exportar CSV
            </Button>
            <Button variant="outline" size="sm" isLoading={isLoading} leftIcon={<RefreshCw className="size-4" />} onClick={() => void load()}>
              Actualizar
            </Button>
          </>
        }
      />

      {overdueTotal > 0 && filter !== 'overdue' && (
        // El aviso es un BOTON: antes anunciaba los vencidos y no llevaba a ellos,
        // asi que la unica forma de encontrarlos era recorrer pagina por pagina
        // mirando las fechas en rojo.
        <button
          type="button"
          onClick={() => changeFilter('overdue')}
          className="mt-4 flex min-h-11 w-full items-center gap-2 rounded-card border border-red-200 bg-red-50 px-4 py-2.5 text-left text-sm font-medium text-red-700 transition-colors hover:bg-red-100"
        >
          {overdueTotal === 1
            ? 'Hay 1 reclamo con el plazo de respuesta vencido.'
            : `Hay ${overdueTotal} reclamos con el plazo de respuesta vencido.`}
          <span className="ml-auto shrink-0 font-bold underline">Ver los vencidos</span>
        </button>
      )}

      <div className="mt-5 flex flex-col gap-3 rounded-card border border-line bg-surface p-3 shadow-e1 sm:flex-row sm:items-center">
        <FilterPills
          options={filters}
          value={filter}
          onChange={changeFilter}
          ariaLabel="Filtrar reclamos por estado"
        />

        <div className="relative sm:ml-auto">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input
            value={search}
            onChange={(event) => changeSearch(event.target.value)}
            placeholder="Código, nombre o documento"
            aria-label="Buscar reclamos"
            className="h-11 w-full rounded-field border border-line bg-surface-muted pl-9 pr-3 text-sm outline-none transition-colors focus:border-brand-500 focus:bg-surface sm:w-64"
          />
        </div>
      </div>

      {list ?? (
        <>
          {/* Escritorio: tabla */}
          <div className="mt-4 hidden overflow-x-auto rounded-card border border-line bg-surface shadow-e1 md:block">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">
                Reclamos del Libro de Reclamaciones con su estado y su plazo de respuesta
              </caption>
              <thead className="border-b border-line bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-muted">
                <tr>
                  <th scope="col" className="p-3">Código</th>
                  <th scope="col" className="p-3">Tipo</th>
                  <th scope="col" className="p-3">Consumidor</th>
                  <th scope="col" className="p-3">Estado</th>
                  <th scope="col" className="p-3">Vence</th>
                  <th scope="col" className="p-3"><span className="sr-only">Acciones</span></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="border-b border-line last:border-0">
                    <td className="p-3 font-medium text-brand-700">{row.code}</td>
                    <td className="p-3 text-xs text-ink-muted">
                      {TYPE_LABEL[row.type] ?? row.type}
                      <span className="block text-[11px]">{row.itemType === 'SERVICIO' ? 'Servicio' : 'Producto'}</span>
                    </td>
                    <td className="p-3">
                      <p className="text-ink">{row.consumerName}</p>
                      <p className="text-xs text-ink-muted">{row.email}</p>
                    </td>
                    <td className="p-3"><ComplaintStatusBadge status={row.status} /></td>
                    <td className={`p-3 text-xs ${isComplaintOverdue(row) ? 'font-semibold text-red-700' : 'text-ink-muted'}`}>
                      {formatDate(row.dueAt)}
                      {isComplaintOverdue(row) && <ComplaintOverdueBadge className="mt-1 flex w-fit" />}
                    </td>
                    <td className="p-3 text-right">
                      <Button size="sm" variant="ghost" isLoading={loadingId === row.id} onClick={() => void openDetail(row.id)}>
                        {row.status === 'RESOLVED' ? 'Ver' : 'Responder'}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Móvil: tarjetas apiladas con la acción dentro */}
          <div className="mt-4 grid gap-3 md:hidden">
            {rows.map((row) => (
              <Card key={row.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-bold text-brand-700">{row.code}</p>
                    <p className="mt-0.5 text-xs text-ink-muted">
                      {TYPE_LABEL[row.type] ?? row.type} · {row.consumerName}
                    </p>
                  </div>
                  <ComplaintStatusBadge status={row.status} />
                </div>
                <div className="my-3 border-t border-line" />
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-xs text-ink-muted">Vence</p>
                    <p className={`mt-0.5 text-sm font-semibold ${isComplaintOverdue(row) ? 'text-red-700' : 'text-ink'}`}>
                      {formatDate(row.dueAt)}
                    </p>
                    {isComplaintOverdue(row) && <ComplaintOverdueBadge className="mt-1" />}
                  </div>
                  <Button size="sm" variant="ghost" isLoading={loadingId === row.id} onClick={() => void openDetail(row.id)}>
                    {row.status === 'RESOLVED' ? 'Ver' : 'Responder'}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        </>
      )}

      {meta && meta.totalPages > 1 && !loadError && (
        <div className="mt-5 flex justify-center">
          <Pagination page={meta.page} totalPages={meta.totalPages} onChange={changePage} />
        </div>
      )}

      <Modal
        isOpen={selected !== null}
        onClose={() => setSelected(null)}
        icon={BookText}
        eyebrow={selected?.code ?? ''}
        title={selected ? `${TYPE_LABEL[selected.type] ?? selected.type} de ${selected.consumerName}` : ''}
        description={selected ? `Presentado el ${formatDate(selected.createdAt)} · responder antes del ${formatDate(selected.dueAt)}` : ''}
        maxWidth="md"
      >
        {selected && (
          <div className="grid gap-5">
            <section className="grid gap-3 sm:grid-cols-2">
              <Field label="Documento" value={`${selected.docType} ${selected.docNumber}`} />
              <Field label="Correo" value={selected.email} />
              {selected.phone && <Field label="Teléfono" value={selected.phone} />}
              {selected.address && <Field label="Dirección" value={selected.address} />}
              {selected.isMinor && <Field label="Apoderado" value={selected.guardianName ?? '—'} />}
              {selected.itemDescription && (
                <Field label="Bien o servicio" value={selected.itemDescription} />
              )}
              {selected.claimedAmount != null && (
                <Field label="Monto reclamado" value={formatCurrency(Number(selected.claimedAmount))} />
              )}
            </section>

            <section>
              <FieldLabel>Detalle</FieldLabel>
              <p className="whitespace-pre-line rounded-card bg-surface-muted p-3 text-sm text-ink">{selected.detail}</p>
            </section>
            <section>
              <FieldLabel>Lo que pide el consumidor</FieldLabel>
              <p className="whitespace-pre-line rounded-card bg-surface-muted p-3 text-sm text-ink">{selected.request}</p>
            </section>

            {selected.status === 'RESOLVED' ? (
              // Un reclamo ya atendido se muestra en solo lectura: reabrir el formulario
              // y reenviar sobrescribiria la respuesta legal y volveria a notificar al
              // consumidor. El boton de la fila dice "Ver", coherente con esto.
              <div className="border-t border-line pt-4">
                <FieldLabel>Respuesta enviada{selected.respondedAt ? ` · ${formatDate(selected.respondedAt)}` : ''}</FieldLabel>
                <p className="whitespace-pre-line rounded-card border border-brand-100 bg-brand-50/60 p-3 text-sm text-ink">
                  {selected.response ?? '—'}
                </p>
              </div>
            ) : (
              <div className="border-t border-line pt-4">
                <FieldLabel>Tu respuesta</FieldLabel>
                <Textarea
                  value={response}
                  onChange={(event) => setResponse(event.target.value)}
                  rows={4}
                  placeholder="Explica al consumidor cómo se atiende su caso."
                />
                <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                  <div className="sm:w-56">
                    <Select
                      label="Marcar como"
                      value={responseStatus}
                      onChange={(event) => setResponseStatus(event.target.value as 'IN_PROGRESS' | 'RESOLVED')}
                    >
                      <SelectOption value="IN_PROGRESS">En proceso</SelectOption>
                      <SelectOption value="RESOLVED">Atendido</SelectOption>
                    </Select>
                  </div>
                  <Button leftIcon={<ShieldCheck className="size-4" />} isLoading={isSaving} onClick={() => void submitResponse()}>
                    Enviar respuesta
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};

const FieldLabel = ({ children }: { children: React.ReactNode }) => (
  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted">{children}</p>
);

const Field = ({ label, value }: { label: string; value: string }) => (
  <div>
    <FieldLabel>{label}</FieldLabel>
    <p className="text-sm text-ink">{value}</p>
  </div>
);

export default AdminComplaintsPage;
