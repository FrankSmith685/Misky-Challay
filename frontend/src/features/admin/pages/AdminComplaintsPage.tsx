import { useCallback, useEffect, useRef, useState } from 'react';
import { BookText, Inbox, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { Card } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { Modal } from '@components/ui/Modal';
import { Textarea } from '@components/ui/Textarea';
import { Select, SelectOption } from '@components/ui/Select';
import { Pagination } from '@components/ui/Pagination';
import { PageLoader } from '@components/common/PageLoader';
import { PageHeader } from '@components/common/PageHeader';
import { EmptyState } from '@components/common/EmptyState';
import { ComplaintStatusBadge } from '../components/ComplaintStatusBadge';
import { getApiErrorMessage } from '@services/api/client';
import { formatCurrency, formatDate } from '@lib/format';
import { useDebounce } from '@hooks/useDebounce';
import {
  complaintsAdminApi,
  type ComplaintDetail,
  type ComplaintRow,
} from '../services/complaintsAdmin.service';
import type { PaginationMeta } from '@/types/api';

const STATUS_FILTERS = [
  { value: '', label: 'Todos' },
  { value: 'RECEIVED', label: 'Recibidos' },
  { value: 'IN_PROGRESS', label: 'En proceso' },
  { value: 'RESOLVED', label: 'Atendidos' },
];

const TYPE_LABEL: Record<string, string> = { RECLAMO: 'Reclamo', QUEJA: 'Queja' };

/** Un reclamo esta vencido si paso su plazo legal y aun no se responde. */
const isOverdue = (row: Pick<ComplaintRow, 'status' | 'dueAt'>): boolean =>
  row.status !== 'RESOLVED' && new Date(row.dueAt).getTime() < Date.now();

const AdminComplaintsPage = () => {
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 400);
  const [page, setPage] = useState(1);

  const [rows, setRows] = useState<ComplaintRow[]>([]);
  const [meta, setMeta] = useState<PaginationMeta | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const [overdueTotal, setOverdueTotal] = useState(0);
  // Token de secuencia: cada carga se numera y solo la ULTIMA lanzada puede escribir
  // el estado. Sin esto, cambiar de filtro o pagina rapido deja peticiones en vuelo
  // y gana la ultima en RESOLVER, no la ultima SOLICITADA.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    const id = ++requestId.current;
    setIsLoading(true);
    try {
      const [{ rows: data, meta: pageMeta }, summary] = await Promise.all([
        complaintsAdminApi.list({
          status: status || undefined,
          search: debouncedSearch || undefined,
          page,
        }),
        // El conteo de vencidos es GLOBAL, no de la pagina: se pide aparte.
        complaintsAdminApi.summary(),
      ]);
      if (id !== requestId.current) return; // llego una carga mas nueva: se descarta esta
      setRows(data);
      setMeta(pageMeta);
      setOverdueTotal(summary.overdue);
    } catch (error) {
      if (id === requestId.current) toast.error(getApiErrorMessage(error));
    } finally {
      if (id === requestId.current) {
        setIsLoading(false);
        setHasLoadedOnce(true);
      }
    }
  }, [status, debouncedSearch, page]);

  useEffect(() => {
    void load();
  }, [load]);

  // Cambiar de filtro o buscar vuelve a la primera pagina.
  const changeStatus = (value: string) => {
    setStatus(value);
    setPage(1);
  };
  const changeSearch = (value: string) => {
    setSearch(value);
    setPage(1);
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

  // Solo en la PRIMERA carga se ocupa toda la pantalla: en recargas (filtro, pagina)
  // se conserva la barra de filtros para no dejar al usuario sin controles.
  if (!hasLoadedOnce) return <PageLoader />;

  return (
    <div>
      <PageHeader
        eyebrow="Administración"
        icon={BookText}
        title="Libro de Reclamaciones"
        description="Atiende cada reclamo dentro del plazo legal. El consumidor recibe tu respuesta por correo."
        action={
          <Button variant="outline" size="sm" isLoading={isLoading} leftIcon={<RefreshCw className="size-4" />} onClick={() => void load()}>
            Actualizar
          </Button>
        }
      />

      {overdueTotal > 0 && (
        <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-sm text-red-700">
          {overdueTotal === 1
            ? 'Hay 1 reclamo con el plazo de respuesta vencido.'
            : `Hay ${overdueTotal} reclamos con el plazo de respuesta vencido.`}
        </div>
      )}

      <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3 shadow-sm sm:flex-row sm:flex-wrap sm:items-center">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.label}
            type="button"
            onClick={() => changeStatus(filter.value)}
            className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${
              status === filter.value
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-line text-ink-muted hover:border-brand-300'
            }`}
          >
            {filter.label}
          </button>
        ))}

        <div className="relative sm:ml-auto">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input
            value={search}
            onChange={(event) => changeSearch(event.target.value)}
            placeholder="Código, nombre o documento"
            className="h-10 w-full rounded-xl border border-line bg-surface-muted pl-9 pr-3 text-sm outline-none transition-colors focus:border-brand-500 focus:bg-surface sm:w-64"
          />
        </div>
      </div>

      {/* Escritorio: tabla */}
      <div className="mt-4 hidden overflow-x-auto rounded-card border border-line bg-surface shadow-sm md:block">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-line bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-muted">
            <tr>
              <th className="p-3">Código</th>
              <th className="p-3">Tipo</th>
              <th className="p-3">Consumidor</th>
              <th className="p-3">Estado</th>
              <th className="p-3">Vence</th>
              <th className="p-3"></th>
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
                <td className={`p-3 text-xs ${isOverdue(row) ? 'font-semibold text-red-600' : 'text-ink-muted'}`}>
                  {formatDate(row.dueAt)}
                  {isOverdue(row) && <span className="block text-[11px]">Vencido</span>}
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
        {rows.length === 0 && (
          <EmptyState icon={Inbox} title="No hay reclamos" description="No encontramos reclamos con los filtros seleccionados." className="m-4" />
        )}
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
                <p className={`mt-0.5 text-sm font-semibold ${isOverdue(row) ? 'text-red-600' : 'text-ink'}`}>
                  {formatDate(row.dueAt)}
                  {isOverdue(row) && ' · Vencido'}
                </p>
              </div>
              <Button size="sm" variant="ghost" isLoading={loadingId === row.id} onClick={() => void openDetail(row.id)}>
                {row.status === 'RESOLVED' ? 'Ver' : 'Responder'}
              </Button>
            </div>
          </Card>
        ))}
        {rows.length === 0 && (
          <EmptyState icon={Inbox} title="No hay reclamos" description="No encontramos reclamos con los filtros seleccionados." />
        )}
      </div>

      {meta && meta.totalPages > 1 && (
        <div className="mt-5 flex justify-center">
          <Pagination page={meta.page} totalPages={meta.totalPages} onChange={setPage} />
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
          <div className="space-y-5">
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
              <p className="whitespace-pre-line rounded-xl bg-surface-muted p-3 text-sm text-ink">{selected.detail}</p>
            </section>
            <section>
              <FieldLabel>Lo que pide el consumidor</FieldLabel>
              <p className="whitespace-pre-line rounded-xl bg-surface-muted p-3 text-sm text-ink">{selected.request}</p>
            </section>

            {selected.status === 'RESOLVED' ? (
              // Un reclamo ya atendido se muestra en solo lectura: reabrir el formulario
              // y reenviar sobrescribiria la respuesta legal y volveria a notificar al
              // consumidor. El boton de la fila dice "Ver", coherente con esto.
              <div className="border-t border-line pt-4">
                <FieldLabel>Respuesta enviada{selected.respondedAt ? ` · ${formatDate(selected.respondedAt)}` : ''}</FieldLabel>
                <p className="whitespace-pre-line rounded-xl border border-brand-100 bg-brand-50/60 p-3 text-sm text-ink">
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
