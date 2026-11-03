import { useLiveRefresh } from '@services/realtime';
import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AlertCircle, CheckCircle2, RefreshCw, Smartphone } from 'lucide-react';
import { PageHeader } from '@components/common/PageHeader';
import { LoadError } from '@components/common/LoadError';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Modal } from '@components/ui/Modal';
import { useConfirm } from '@components/ui/ConfirmDialog';
import toast from '@components/mui/MuiToast';
import { usePermissions } from '@/hooks/usePermissions';
import { PERM } from '@constants/permissions';
import { ROUTES } from '@constants/routes';
import { formatCurrency, formatDate } from '@lib/format';
import { getApiErrorMessage } from '@services/api/client';
import { DirectPaymentCard } from '@features/checkout/components/DirectPaymentCard';
import {
  directPaymentsApi,
  DIRECT_PAYMENT_LABELS,
  PAYMENT_STAGE_LABELS,
  type DirectPaymentDetail,
  type DirectPaymentList,
} from '@features/checkout/directPayments';
import { BranchSelector } from '../components/BranchSelector';
import { useActiveBranch } from '../hooks/useActiveBranch';
import { ORDER_STATUS } from '@features/orders/components/OrderStatusBadge';

const DirectPaymentsPage = () => {
  const [params] = useSearchParams();
  const { can, isSuperAdmin } = usePermissions();
  const confirm = useConfirm();
  const { branchId, branches, setBranchId, isLoadingBranches, branchesError, reloadBranches } =
    useActiveBranch();
  const [state, setState] = useState(params.get('pedido') ? '' : 'REVIEW');
  const [provider, setProvider] = useState('');
  const [search, setSearch] = useState(params.get('pedido') ?? '');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<DirectPaymentList | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<DirectPaymentDetail | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [refundOpen, setRefundOpen] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [payerName, setPayerName] = useState('');
  const [paidAt, setPaidAt] = useState('');
  const [formError, setFormError] = useState('');
  useEffect(() => { const order = params.get('pedido'); if (order) { setSearch(order); setState(''); setPage(1); setDetail(null); } }, [params]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!branchId) return;
      setLoading(true);
      try {
        const result = await directPaymentsApi.list(
          branchId,
          {
            state: state || undefined,
            provider: provider || undefined,
            search: search || undefined,
            page,
          },
          signal,
        );
        if (!signal?.aborted) {
          setData(result);
          setError('');
        }
      } catch (cause) {
        if (!signal?.aborted) setError(getApiErrorMessage(cause));
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [branchId, state, provider, search, page],
  );
  useLiveRefresh(['payments', 'orders'], () => load(), { intervalMs: 0 });
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void load(controller.signal), 250);
    const poll = window.setInterval(() => {
      if (document.visibilityState === 'visible') void load(controller.signal);
    }, 15000);
    return () => {
      controller.abort();
      clearTimeout(timer);
      clearInterval(poll);
    };
  }, [load]);
  useEffect(() => {
    setData(null);
    setDetail(null);
  }, [branchId]);

  const applyDetail = (result: DirectPaymentDetail) => {
    setDetail(result);
    setVersion((value) => value + 1);
    void load();
  };
  const open = async (id: number) => {
    setBusy(true);
    try {
      setDetail(await directPaymentsApi.detail(id));
      setRefundOpen(false);
      setRecoveryOpen(false);
      setFormError('');
      setVersion((value) => value + 1);
    } catch (cause) {
      toast.error(getApiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const review = async (decision: 'APPROVE' | 'OBSERVE' | 'REJECT') => {
    if (!detail) return;
    const approve = decision === 'APPROVE';
    const observe = decision === 'OBSERVE';
    const answer = await confirm({
      title: approve
        ? 'Confirmar movimiento recibido'
        : observe
          ? 'Solicitar corrección'
          : 'Rechazar reporte',
      message: approve
        ? `Verifica en la cuenta real la operación ${detail.claim?.operationCode} por ${formatCurrency(detail.amount)}. ${['CANCELLED', 'REFUNDED'].includes(detail.orderStatus) ? 'El pedido seguirá cancelado y se mostrará la devolución pendiente.' : 'La aprobación confirmará este pago.'}`
        : observe
          ? `El cliente podrá corregir el reporte del mismo pago. ${['CANCELLED', 'REFUNDED'].includes(detail.orderStatus) ? 'El pedido seguirá cancelado.' : 'Se conservará la reserva del pedido.'}`
          : 'Usa esta opción solo si el reporte es inválido. Un pedido pendiente de pago se cancelará y liberará sus reservas; para corregir datos elige Solicitar corrección.',
      confirmLabel: approve
        ? 'Sí, recibimos el importe'
        : observe
          ? 'Solicitar corrección'
          : 'Rechazar reporte',
      tone: decision === 'REJECT' ? 'danger' : 'default',
      reasonLabel: approve ? undefined : 'Motivo visible para el cliente',
      reasonRequired: !approve,
      reasonMinLength: approve ? undefined : 3,
      reasonMaxLength: 255,
    });
    if (!answer.confirmed) return;
    setBusy(true);
    try {
      applyDetail(
        await directPaymentsApi.review(detail.paymentId, decision, answer.reason || undefined),
      );
      toast.success('Revisión registrada');
    } catch (cause) {
      toast.error(getApiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const submitRecord = async (event: FormEvent) => {
    event.preventDefault();
    if (!detail) return;
    setFormError('');
    if (!(Number(amount) > 0) || reference.trim().length < 3 || reason.trim().length < 3)
      return setFormError('Completa el importe, la referencia y el motivo.');
    if (recoveryOpen && (!paidAt || payerName.trim().length < 2))
      return setFormError('Completa el nombre y la fecha del pago recibido.');
    const answer = await confirm({
      title: refundOpen
        ? 'Registrar devolución realizada'
        : 'Registrar pago recibido fuera del flujo',
      message: refundOpen
        ? `Confirma que ya devolviste ${formatCurrency(Number(amount))} al cliente por fuera de la web. Esta acción registra la devolución; no transfiere dinero.`
        : 'El pago quedará pendiente de verificación. Si el pedido está cancelado, seguirá cancelado y se coordinará la devolución después de verificar el ingreso.',
      confirmLabel: refundOpen ? 'Ya devolví el dinero' : 'Registrar para verificar',
    });
    if (!answer.confirmed) return;
    setBusy(true);
    try {
      const result = refundOpen
        ? await directPaymentsApi.refund(
            detail.paymentId,
            Number(amount),
            reference.trim(),
            reason.trim(),
          )
        : await directPaymentsApi.recoveryReport(detail.paymentId, {
            amount: Number(amount),
            operationCode: reference.trim(),
            reason: reason.trim(),
            payerName: payerName.trim(),
            paidAt: new Date(`${paidAt}:00-05:00`).toISOString(),
          });
      applyDetail(result);
      setRefundOpen(false);
      setRecoveryOpen(false);
      toast.success('Registro guardado');
    } catch (cause) {
      setFormError(getApiErrorMessage(cause));
    } finally {
      setBusy(false);
    }
  };
  const openRecord = (refund: boolean) => {
    if (!detail) return;
    setRefundOpen(refund);
    setRecoveryOpen(!refund);
    setAmount(String(refund ? detail.refundableAmount : detail.amount));
    setReference('');
    setReason('');
    setPayerName(detail.contactName ?? '');
    setPaidAt('');
    setFormError('');
  };
  const header = (
    <PageHeader
      eyebrow="Cobros directos"
      title="Yape y Plin"
      description="Verifica los ingresos en la cuenta del negocio y consulta cada reporte, corrección y devolución."
      icon={Smartphone}
      action={
        <div className="flex flex-wrap items-center gap-2">
          {isSuperAdmin && (
            <Link to={`${ROUTES.adminBusiness}?tab=payments`} className="rounded-card border border-line px-3 py-2 text-sm font-semibold text-brand-800 hover:bg-surface-muted">
              Configurar cuentas
            </Link>
          )}
          <BranchSelector
            value={branchId}
            branches={branches}
            onChange={setBranchId}
            hasError={Boolean(branchesError)}
          />
        </div>
      }
    />
  );
  if (branchesError)
    return (
      <div>
        {header}
        <LoadError message={branchesError} onRetry={() => void reloadBranches()} />
      </div>
    );
  return (
    <div>
      {header}
      <div className="mt-5 flex flex-wrap gap-2" aria-label="Resumen de pagos directos">
        {(['REVIEW', 'OBSERVED', 'REFUND_PENDING'] as const).map((value) => (
          <Button
            key={value}
            size="sm"
            variant={state === value ? 'primary' : 'outline'}
            onClick={() => {
              setState(value);
              setPage(1);
            }}
          >
            {DIRECT_PAYMENT_LABELS[value]} · {data?.counts[value] ?? '—'}
          </Button>
        ))}
      </div>
      <div className="mt-4 grid gap-3 rounded-card border border-line bg-white p-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_2fr_auto]">
        <label className="grid gap-1 text-xs font-semibold text-ink-muted">
          Estado
          <select
            aria-label="Estado del pago"
            className="min-h-11 rounded-field border border-line bg-white px-3 text-sm text-ink"
            value={state}
            onChange={(event) => {
              setState(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Todos los estados</option>
            {Object.entries(DIRECT_PAYMENT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs font-semibold text-ink-muted">
          Método
          <select
            aria-label="Método de pago"
            className="min-h-11 rounded-field border border-line bg-white px-3 text-sm text-ink"
            value={provider}
            onChange={(event) => {
              setProvider(event.target.value);
              setPage(1);
            }}
          >
            <option value="">Yape y Plin</option>
            <option value="yape">Yape</option>
            <option value="plin">Plin</option>
          </select>
        </label>
        <div className="self-end">
          <Input
            label="Buscar pedido o cliente"
            value={search}
            maxLength={80}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
          />
        </div>
        <Button
          variant="outline"
          className="self-end"
          isLoading={loading}
          leftIcon={<RefreshCw className="size-4" />}
          onClick={() => void load()}
        >
          Actualizar
        </Button>
      </div>
      {error && (
        <div className="mt-4">
          <LoadError message={error} onRetry={() => void load()} />
        </div>
      )}
      <div
        className="mt-4 overflow-hidden rounded-card border border-line bg-white"
        aria-busy={loading || isLoadingBranches}
      >
        {!data ? (
          <p className="p-6 text-sm text-ink-muted">
            {loading || isLoadingBranches
              ? 'Cargando pagos…'
              : 'Selecciona una sede para consultar sus pagos.'}
          </p>
        ) : data.items.length === 0 ? (
          <div className="flex items-center gap-3 p-6 text-sm text-ink-muted">
            <CheckCircle2 className="size-5 text-brand-700" />
            No hay pagos con estos filtros.
          </div>
        ) : (
          <div className="divide-y divide-line">
            {data.items.map((row) => (
              <article
                key={row.paymentId}
                className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
              >
                <div className="min-w-0">
                  <p className="font-bold text-ink">
                    {row.orderNumber}{' '}
                    <span className="ml-2 text-xs uppercase text-brand-700">{row.provider}</span>
                  </p>
                  <p className="mt-1 text-sm text-ink-muted">
                    {row.contactName} · {PAYMENT_STAGE_LABELS[row.stage]}
                  </p>
                  <p className="mt-1 text-xs text-ink-muted">
                    {row.claim
                      ? `Operación ${row.claim.operationCode} · ${formatDate(row.claim.submittedAt)}`
                      : `Creado ${formatDate(row.createdAt)}`}
                  </p>
                  {row.overdue && (
                    <p className="mt-1 flex items-center gap-1 text-xs font-bold text-amber-800">
                      <AlertCircle className="size-3.5" />
                      Revisión demorada
                    </p>
                  )}
                </div>
                <div className="sm:text-right">
                  <p className="font-black text-ink">{formatCurrency(row.amount)}</p>
                  <p className="mt-1 text-xs font-bold text-brand-800">
                    {DIRECT_PAYMENT_LABELS[row.state]}
                  </p>
                  {row.claim && row.claim.declaredAmount !== row.amount && (
                    <p className="text-xs text-red-700">
                      Reportado: {formatCurrency(row.claim.declaredAmount)}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => void open(row.paymentId)}
                >
                  Ver pago
                </Button>
              </article>
            ))}
          </div>
        )}
        {data && data.total > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line p-3">
            <p className="text-xs text-ink-muted">
              {data.total} pagos · página {page} de {Math.ceil(data.total / data.pageSize)}
            </p>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={page <= 1 || loading}
                onClick={() => setPage((value) => value - 1)}
              >
                Anterior
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={page * data.pageSize >= data.total || loading}
                onClick={() => setPage((value) => value + 1)}
              >
                Siguiente
              </Button>
            </div>
          </div>
        )}
      </div>
      <p className="mt-3 text-xs leading-5 text-ink-muted">
        Se actualiza cada 15 segundos. Una constancia acompaña el reporte; confirma siempre el
        movimiento en la cuenta real del negocio.
      </p>
      <Modal
        isOpen={Boolean(detail)}
        onClose={() => {
          if (!busy) setDetail(null);
        }}
        title={detail ? `Pago · ${detail.orderNumber}` : 'Pago directo'}
        description={
          detail
            ? `Pedido: ${ORDER_STATUS[detail.orderStatus]?.label ?? detail.orderStatus} · ${detail.contactName ?? ''} · ${detail.contactPhone ?? ''}`
            : undefined
        }
        icon={Smartphone}
        maxWidth="md"
        disableBackdropClose
      >
        {detail && (
          <div className="grid gap-4">
            <DirectPaymentCard
              key={`${detail.paymentId}-${version}`}
              paymentId={detail.paymentId}
              initial={detail}
              readOnly
              onUpdate={setDetail}
            />
            {can(PERM.PAYMENT_VERIFY) && ['REVIEW', 'OBSERVED'].includes(detail.state) && (
              <div className="grid gap-2 sm:grid-cols-3">
                <Button disabled={busy} variant="outline" onClick={() => void review('OBSERVE')}>
                  Solicitar corrección
                </Button>
                <Button disabled={busy} variant="outline" onClick={() => void review('REJECT')}>
                  Rechazar reporte
                </Button>
                <Button isLoading={busy} onClick={() => void review('APPROVE')}>
                  Confirmar ingreso
                </Button>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {can(PERM.PAYMENT_REFUND) && detail.refundableAmount > 0 && (
                <Button variant="outline" disabled={busy} onClick={() => openRecord(true)}>
                  Registrar devolución
                </Button>
              )}
              {can(PERM.PAYMENT_VERIFY) && ['EXPIRED', 'REJECTED'].includes(detail.state) && (
                <Button variant="outline" disabled={busy} onClick={() => openRecord(false)}>
                  Registrar pago tardío recibido
                </Button>
              )}
              {can(PERM.ORDER_READ) && (
                <Button
                  component={Link}
                  to={`${ROUTES.adminOrders}?pedido=${encodeURIComponent(detail.orderNumber)}`}
                  variant="ghost"
                >
                  Ver pedido
                </Button>
              )}
            </div>
            {(refundOpen || recoveryOpen) && (
              <form
                onSubmit={submitRecord}
                className="grid gap-3 rounded-card border border-line bg-surface-muted/50 p-4"
              >
                <h3 className="text-sm font-bold text-ink">
                  {refundOpen
                    ? 'Devolución ya realizada al cliente'
                    : 'Transferencia recibida fuera del plazo'}
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input
                    label="Importe"
                    type="number"
                    min="0.01"
                    step="0.01"
                    max={refundOpen ? detail.refundableAmount : undefined}
                    value={amount}
                    onChange={(event) => setAmount(event.target.value)}
                    required
                  />
                  <Input
                    label="Referencia de la operación"
                    maxLength={refundOpen ? 120 : 24}
                    value={reference}
                    onChange={(event) => setReference(event.target.value)}
                    required
                  />
                  {recoveryOpen && (
                    <>
                      <Input
                        label="Nombre de quien pagó"
                        value={payerName}
                        maxLength={120}
                        onChange={(event) => setPayerName(event.target.value)}
                        required
                      />
                      <Input
                        label="Fecha y hora del pago (Perú)"
                        type="datetime-local"
                        value={paidAt}
                        onChange={(event) => setPaidAt(event.target.value)}
                        required
                      />
                    </>
                  )}
                </div>
                <Input
                  label="Motivo del registro"
                  maxLength={255}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  required
                />
                {formError && (
                  <p role="alert" className="text-xs text-red-700">
                    {formError}
                  </p>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => {
                      setRefundOpen(false);
                      setRecoveryOpen(false);
                    }}
                  >
                    Cerrar formulario
                  </Button>
                  <Button isLoading={busy} type="submit">
                    {refundOpen ? 'Registrar devolución realizada' : 'Registrar para verificar'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
export default DirectPaymentsPage;
