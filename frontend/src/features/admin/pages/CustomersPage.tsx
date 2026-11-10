import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, Search, ShieldCheck, UserRound, UserRoundX } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Card } from '@components/ui/Card';
import { Button } from '@components/ui/Button';
import { PageHeader } from '@components/common/PageHeader';
import { PageLoader } from '@components/common/PageLoader';
import { LoadError } from '@components/common/LoadError';
import { StatusBadge } from '@components/ui/StatusBadge';
import { useConfirm } from '@components/ui/ConfirmDialog';
import { formatCurrency, formatDate } from '@lib/format';
import { getApiErrorMessage } from '@services/api/client';
import { usePermissions } from '@hooks/usePermissions';
import { PERM } from '@constants/permissions';
import { accessApi, type CustomerRow } from '../services/access.service';

const fullName = (customer: CustomerRow): string =>
  [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.email || `Cliente #${customer.id}`;

const CustomersPage = () => {
  const { can } = usePermissions();
  const canManage = can(PERM.CUSTOMER_MANAGE);
  const confirm = useConfirm();
  const [rows, setRows] = useState<CustomerRow[]>([]);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await accessApi.customers({ search: search.trim() || undefined, status: status || undefined }));
      setError('');
    } catch (cause) {
      setError(getApiErrorMessage(cause));
    } finally {
      setLoading(false);
    }
  }, [search, status]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  const toggleStatus = async (customer: CustomerRow) => {
    const next = customer.status === 'ACTIVE' ? 'BLOCKED' : 'ACTIVE';
    const result = await confirm({
      title: next === 'BLOCKED' ? `¿Bloquear a ${fullName(customer)}?` : `¿Reactivar a ${fullName(customer)}?`,
      message: next === 'BLOCKED' ? 'Se revocarán sus sesiones y no podrá iniciar nuevos pedidos hasta reactivarlo.' : 'El cliente podrá volver a iniciar sesión y comprar.',
      confirmLabel: next === 'BLOCKED' ? 'Bloquear cliente' : 'Reactivar cliente',
      tone: next === 'BLOCKED' ? 'danger' : 'default',
    });
    if (!result.confirmed) return;
    setBusyId(customer.id);
    try {
      await accessApi.setCustomerStatus(customer.id, next, customer.version, next === 'BLOCKED' ? 'Bloqueo solicitado desde Clientes' : 'Reactivación solicitada desde Clientes');
      toast.success(next === 'BLOCKED' ? 'Cliente bloqueado' : 'Cliente reactivado');
      await load();
    } catch (cause) {
      toast.error(getApiErrorMessage(cause));
    } finally {
      setBusyId(null);
    }
  };

  if (loading && rows.length === 0) return <PageLoader />;

  return (
    <div>
      <PageHeader
        eyebrow="Gobierno y CRM"
        title="Clientes"
        description="Consulta el comportamiento de compra de tus clientes sin mezclarlo con el personal interno del panel."
        icon={UserRound}
        action={<Button variant="outline" leftIcon={<RefreshCw className="size-4" />} isLoading={loading} onClick={() => void load()}>Actualizar</Button>}
      />

      <Card className="mb-5 border-brand-100 bg-brand-50/40 p-4">
        <div className="flex items-start gap-3">
          <span className="grid size-9 shrink-0 place-items-center rounded-card bg-white text-brand-700"><ShieldCheck className="size-4" /></span>
          <p className="text-sm leading-6 text-ink-muted">Este módulo muestra cuentas de clientes. Los accesos del equipo, roles, sucursales y MFA se gestionan en Personal interno.</p>
        </div>
      </Card>

      <div className="mb-5 flex flex-wrap items-end gap-3 rounded-card border border-line bg-white p-3">
        <label className="relative min-w-[240px] flex-1">
          <span className="sr-only">Buscar cliente</span>
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted" />
          <input className="h-11 w-full rounded-field border border-line bg-white pl-9 pr-3 text-sm outline-none focus:border-brand-500" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nombre, correo o teléfono" />
        </label>
        <label className="grid gap-1 text-xs font-semibold text-ink-muted">Estado<select className="h-11 rounded-field border border-line bg-white px-3 text-sm text-ink" value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos</option><option value="ACTIVE">Activos</option><option value="BLOCKED">Bloqueados</option></select></label>
      </div>

      {error ? <LoadError message={error} onRetry={() => void load()} /> : (
        <div className="overflow-x-auto rounded-card border border-line bg-white">
          <table className="w-full min-w-[820px] text-sm">
            <caption className="sr-only">Clientes registrados y su actividad de compra</caption>
            <thead className="border-b border-line bg-surface-muted text-left text-xs uppercase tracking-wide text-ink-muted">
              <tr><th className="p-3">Cliente</th><th className="p-3">Estado</th><th className="p-3">Pedidos</th><th className="p-3">Total comprado</th><th className="p-3">Último pedido</th><th className="p-3"><span className="sr-only">Acciones</span></th></tr>
            </thead>
            <tbody>
              {rows.map((customer) => (
                <tr key={customer.id} className="border-b border-line last:border-0">
                  <td className="p-3"><p className="font-semibold text-ink">{fullName(customer)}</p><p className="text-xs text-ink-muted">{customer.email ?? 'Sin correo'}{customer.phone ? ` · ${customer.phone}` : ''}</p><p className="mt-1 text-[11px] text-ink-muted">Registrado {formatDate(customer.createdAt)}</p></td>
                  <td className="p-3"><StatusBadge status={customer.status} map={{ ACTIVE: { label: 'Activo', variant: 'brand' } }} fallback={{ label: 'Bloqueado', variant: 'danger' }} /></td>
                  <td className="p-3 font-semibold text-ink">{customer.orderCount}</td>
                  <td className="p-3 font-semibold text-ink">{formatCurrency(customer.totalSpent)}</td>
                  <td className="p-3 text-xs text-ink-muted">{customer.lastOrderAt ? formatDate(customer.lastOrderAt) : 'Sin pedidos'}</td>
                  <td className="p-3 text-right">{canManage && <Button size="sm" variant="ghost" className={customer.status === 'ACTIVE' ? 'text-red-700' : 'text-brand-700'} isLoading={busyId === customer.id} leftIcon={customer.status === 'ACTIVE' ? <UserRoundX className="size-4" /> : <UserRound className="size-4" />} onClick={() => void toggleStatus(customer)}>{customer.status === 'ACTIVE' ? 'Bloquear' : 'Reactivar'}</Button>}</td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={6} className="p-8 text-center text-sm text-ink-muted">No hay clientes con estos filtros.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default CustomersPage;
