import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  CheckCircle2,
  ClipboardCopy,
  Clock3,
  Expand,
  ImageIcon,
  RefreshCw,
  Smartphone,
  Upload,
} from 'lucide-react';
import { Button } from '@components/ui/Button';
import { Input } from '@components/ui/Input';
import { Modal } from '@components/ui/Modal';
import { Card } from '@components/ui/Card';
import { Alert } from '@components/ui/Alert';
import { Badge, type BadgeVariant } from '@components/ui/Badge';
import { FormGrid } from '@components/ui/FormSection';
import toast from '@components/mui/MuiToast';
import { formatCurrency, formatDate } from '@lib/format';
import { getApiErrorMessage } from '@services/api/client';
import { useBusinessInfo } from '@services/businessInfo';
import { whatsappLink } from '@lib/whatsapp';
import {
  directPaymentsApi,
  isDemoDirectQr,
  DIRECT_PAYMENT_LABELS,
  PAYMENT_STAGE_LABELS,
  type DirectPaymentDetail,
  type DirectPaymentState,
} from '../directPayments';

const HISTORY_LABELS: Record<string, string> = {
  CREATED: 'Pago habilitado',
  REPORTED: 'Pago reportado',
  OBSERVED: 'Corrección solicitada',
  APPROVED: 'Movimiento verificado',
  RECOVERY_REPORTED: 'Pago tardío registrado por caja',
  REJECTED: 'Reporte rechazado',
  REFUND_RECORDED: 'Devolución registrada',
  ORDER_CANCELLED: 'Pedido cancelado',
  EXPIRED: 'Plazo de pago vencido',
};

const STATUS_VARIANTS: Record<DirectPaymentState, BadgeVariant> = {
  AWAITING_PAYMENT: 'warning',
  REVIEW: 'brand',
  OBSERVED: 'warning',
  CONFIRMED: 'success',
  REJECTED: 'danger',
  EXPIRED: 'neutral',
  REFUND_PENDING: 'warning',
  REFUNDED: 'neutral',
};

const limaDateTime = (iso?: string | null) =>
  new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
    .format(new Date(iso ?? Date.now()))
    .replace(' ', 'T');

const prepareEvidence = async (file: File): Promise<string> => {
  if (
    !['image/jpeg', 'image/png', 'image/webp'].includes(file.type) ||
    file.size > 10 * 1024 * 1024
  )
    throw new Error('Elige una imagen JPG, PNG o WebP de hasta 10 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, 1200 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context)
      throw new Error('No pudimos preparar la imagen. Puedes reportar el pago sin adjuntarla.');
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const result = canvas.toDataURL('image/webp', 0.65);
    if (result.length > 699000)
      throw new Error('La imagen es demasiado grande. Recórtala o envía una de menor tamaño.');
    return result;
  } finally {
    bitmap.close();
  }
};

export const DirectPaymentEvidenceButton = ({
  paymentId,
  eventId,
}: {
  paymentId: number;
  eventId: number;
}) => {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(
    () => () => {
      if (url) URL.revokeObjectURL(url);
    },
    [url],
  );
  return (
    <>
      <Button
        size="sm"
        variant="ghost"
        leftIcon={<ImageIcon className="size-4" />}
        isLoading={loading}
        onClick={async () => {
          setLoading(true);
          try {
            setUrl(URL.createObjectURL(await directPaymentsApi.evidence(paymentId, eventId)));
          } catch (error) {
            toast.error(getApiErrorMessage(error));
          } finally {
            setLoading(false);
          }
        }}
      >
        Ver constancia
      </Button>
      <Modal
        isOpen={Boolean(url)}
        onClose={() => setUrl('')}
        title="Constancia reportada"
        description="La imagen acompaña el reporte. El taller verifica el movimiento recibido."
        maxWidth="md"
      >
        {url && (
          <img
            src={url}
            alt="Constancia del pago reportado"
            className="mx-auto max-h-[65vh] max-w-full object-contain"
          />
        )}
      </Modal>
    </>
  );
};

export const DirectPaymentCard = ({
  paymentId,
  initial,
  readOnly = false,
  onChange,
  onUpdate,
}: {
  paymentId: number;
  initial?: DirectPaymentDetail | null;
  readOnly?: boolean;
  onChange?: () => void;
  onUpdate?: (data: DirectPaymentDetail) => void;
}) => {
  const business = useBusinessInfo();
  const [data, setData] = useState<DirectPaymentDetail | null>(initial ?? null);
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [preparingFile, setPreparingFile] = useState(false);
  const [formError, setFormError] = useState('');
  const [operationCode, setOperationCode] = useState(initial?.claim?.operationCode ?? '');
  const [payerName, setPayerName] = useState(
    initial?.claim?.payerName ?? initial?.contactName ?? '',
  );
  const [payerPhone, setPayerPhone] = useState(initial?.claim?.payerPhone ?? '');
  const [paidAt, setPaidAt] = useState(limaDateTime(initial?.claim?.paidAt));
  const [amount, setAmount] = useState(
    String(initial?.claim?.declaredAmount ?? initial?.amount ?? ''),
  );
  const [evidence, setEvidence] = useState('');
  const [fileName, setFileName] = useState('');
  const [qrOpen, setQrOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  const refresh = useCallback(async () => {
    try {
      const result = await directPaymentsApi.detail(paymentId);
      setData(result);
      setLoadError('');
      onUpdate?.(result);
    } catch (error) {
      setLoadError(getApiErrorMessage(error));
    }
  }, [paymentId, onUpdate]);
  useEffect(() => {
    void refresh();
  }, [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!data || formOpen) return;
    setOperationCode(data.claim?.operationCode ?? '');
    setPayerName(data.claim?.payerName ?? data.contactName ?? '');
    setPayerPhone(data.claim?.payerPhone ?? '');
    setAmount(String(data.claim?.declaredAmount ?? data.amount));
    setPaidAt(limaDateTime(data.claim?.paidAt));
  }, [data, formOpen]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (sending || preparingFile || !canReport) return;
    setFormError('');
    if (!/^[A-Za-z0-9-]{3,24}$/.test(operationCode.trim()))
      return setFormError('Revisa la referencia de la operación: entre 3 y 24 letras o números.');
    if (
      payerName.trim().length < 2 ||
      !paidAt ||
      !Number.isFinite(Number(amount)) ||
      Number(amount) <= 0
    )
      return setFormError('Completa el nombre, la fecha y el importe que transferiste.');
    if (payerPhone && !/^\d{9}$/.test(payerPhone))
      return setFormError('El celular debe tener 9 dígitos.');
    setSending(true);
    try {
      const result = await directPaymentsApi.report(paymentId, {
        operationCode: operationCode.trim(),
        payerName: payerName.trim(),
        payerPhone: payerPhone || undefined,
        paidAt: new Date(`${paidAt}:00-05:00`).toISOString(),
        amount: Number(amount),
        evidenceDataUrl: evidence || undefined,
      });
      setData(result);
      onUpdate?.(result);
      setFormOpen(false);
      setEvidence('');
      setFileName('');
      onChange?.();
      toast.success('Reporte recibido. Puedes consultar su verificación aquí.');
    } catch (error) {
      setFormError(getApiErrorMessage(error));
    } finally {
      setSending(false);
    }
  };

  if (!data)
    return (
      <Card shadow="e1" role="status">
        {loadError ? (
          <Alert
            variant="warning"
            title="No pudimos consultar el pago"
            action={
              <Button size="sm" variant="outline" onClick={() => void refresh()}>
                Reintentar
              </Button>
            }
          >
            {loadError}
          </Alert>
        ) : (
          <p className="text-sm text-ink-muted">Cargando datos del pago…</p>
        )}
      </Card>
    );
  const name = data.provider === 'yape' ? 'Yape' : 'Plin';
  const seconds = data.recipient.expiresAt
    ? Math.max(0, Math.floor((Date.parse(data.recipient.expiresAt) - now) / 1000))
    : null;
  const canReport =
    data.canReport &&
    ['AWAITING_PAYMENT', 'OBSERVED'].includes(data.state) &&
    (data.state === 'OBSERVED' || seconds === null || seconds > 0);
  const state = data.state === 'AWAITING_PAYMENT' && seconds === 0 ? 'EXPIRED' : data.state;
  const demoQr = isDemoDirectQr(data.recipient.qrImageUrl);
  const showRecipient = readOnly || (state === 'AWAITING_PAYMENT' && canReport);
  const progress =
    state === 'CONFIRMED' ? 3 : state === 'REVIEW' ? 2 : state === 'OBSERVED' || formOpen ? 1 : 0;
  const amountMismatch =
    Number(amount) > 0 && Math.round(Number(amount) * 100) !== Math.round(data.amount * 100);
  const stage = PAYMENT_STAGE_LABELS[data.stage];
  return (
    <Card
      shadow="e1"
      role="region"
      className="grid min-w-0 gap-5 sm:p-6"
      aria-label={`Pago directo ${name}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-bold text-brand-800">
            <Smartphone className="size-4" />
            {name} · {stage}
          </h2>
          <p className="mt-2 text-xs text-ink-muted">Importe de este pago</p>
          <p className="mt-0.5 text-3xl font-bold tabular-nums text-ink">
            {formatCurrency(data.amount)}
          </p>
        </div>
        <div className="grid justify-items-end gap-2">
          <Badge variant={STATUS_VARIANTS[state]}>{DIRECT_PAYMENT_LABELS[state]}</Badge>
          {!readOnly && state === 'AWAITING_PAYMENT' && seconds !== null && (
            <p
              role="timer"
              aria-label="Tiempo disponible para pagar"
              aria-live="off"
              className="flex items-center gap-1.5 text-xs font-semibold tabular-nums text-amber-800"
            >
              <Clock3 className="size-3.5" aria-hidden="true" />
              {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')} para pagar
            </p>
          )}
        </div>
      </div>
      {!readOnly && ['AWAITING_PAYMENT', 'OBSERVED', 'REVIEW', 'CONFIRMED'].includes(state) && (
        <ol
          aria-label="Pasos del pago"
          className="grid grid-cols-3 gap-2 border-y border-line py-3"
        >
          {['Transfiere', 'Reporta tu pago', 'Verificación'].map((label, index) => (
            <li
              key={label}
              aria-current={progress === index ? 'step' : undefined}
              className="flex min-w-0 items-center gap-2 text-[11px] sm:text-xs"
            >
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full text-[10px] font-bold ${index <= progress ? 'bg-brand-700 text-white' : 'bg-surface-muted text-ink-muted'}`}
              >
                {index < progress ? (
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                ) : (
                  index + 1
                )}
              </span>
              <span className={index <= progress ? 'font-semibold text-ink' : 'text-ink-muted'}>
                {label}
              </span>
            </li>
          ))}
        </ol>
      )}
      {loadError && <Alert variant="warning">{loadError} Conservamos los datos del pago.</Alert>}
      {data.state === 'REVIEW' && (
        <Alert title="Reporte recibido" className="text-sm leading-6">
          Recibimos tu reporte. El taller comprobará el movimiento antes de confirmar el pago. No
          necesitas volver a transferir.
          {['CANCELLED', 'REFUNDED'].includes(data.orderStatus) &&
            ' El pedido está cancelado: si el dinero fue recibido, el taller coordinará su devolución.'}
        </Alert>
      )}
      {data.state === 'OBSERVED' && (
        <Alert variant="warning" title="Revisa tu reporte" className="text-sm leading-6">
          {data.claim?.reason} Puedes corregir la información del mismo pago, sin volver a
          transferir.{' '}
          {['CANCELLED', 'REFUNDED'].includes(data.orderStatus) &&
            'El pedido seguirá cancelado; el taller verificará el ingreso para coordinar la devolución.'}
        </Alert>
      )}
      {['CONFIRMED', 'REFUND_PENDING', 'REFUNDED', 'REJECTED', 'EXPIRED'].includes(state) && (
        <Alert
          variant={
            state === 'CONFIRMED' || state === 'REFUNDED'
              ? 'success'
              : state === 'REJECTED'
                ? 'danger'
                : 'warning'
          }
          className="text-sm leading-6"
        >
          {state === 'CONFIRMED'
            ? 'El taller verificó este pago. Puedes seguir el estado del pedido.'
            : data.state === 'REFUND_PENDING'
              ? `Este ingreso está confirmado y requiere devolución. Quedan ${formatCurrency(data.refundableAmount)} por devolver; el taller debe realizar y registrar la devolución.`
              : data.state === 'REFUNDED'
                ? `Devolución registrada: ${formatCurrency(data.refundedAmount)}.`
                : data.state === 'REJECTED'
                  ? (data.claim?.reason ??
                    'El negocio rechazó el reporte. Consulta el motivo antes de volver a pagar.')
                  : 'El plazo para este pago terminó. Si ya transferiste, contacta al taller con tu número de pedido; no vuelvas a pagar.'}
        </Alert>
      )}
      {showRecipient && (
        <div
          className={`grid min-w-0 items-start gap-4 rounded-card border border-line bg-surface-muted/40 p-4 sm:p-5 ${data.recipient.qrImageUrl ? 'sm:grid-cols-[minmax(0,1fr)_224px]' : ''}`}
        >
          <h3 className="text-sm font-bold text-ink sm:col-span-full">
            {readOnly ? 'Cuenta de destino' : '1. Realiza la transferencia'}
          </h3>
          <div className="min-w-0">
            <p className="text-xs text-ink-muted">Titular de la cuenta de {name}</p>
            <p className="mt-1 break-words text-sm font-bold text-ink">
              {data.recipient.recipient}
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold text-ink">{data.recipient.phone}</span>
              <Button
                size="sm"
                variant="ghost"
                leftIcon={<ClipboardCopy className="size-3.5" />}
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(data.recipient.phone);
                    toast.success('Número copiado');
                  } catch {
                    toast.error('No se pudo copiar. Puedes seleccionar el número.');
                  }
                }}
              >
                Copiar número
              </Button>
            </div>
            <p className="mt-3 text-xs leading-5 text-ink-muted">
              {data.recipient.instructions ||
                'Verifica el titular y el número antes de transferir.'}
            </p>
            {!readOnly && (
              <p className="mt-3 text-xs font-medium leading-5 text-ink">
                Transfiere una sola vez el importe exacto. Después, reporta tu operación en esta
                página.
              </p>
            )}
          </div>
          {data.recipient.qrImageUrl && (
            <div className="mx-auto w-56 max-w-full">
              <button
                type="button"
                aria-label={`Ampliar QR de ${name}`}
                onClick={() => setQrOpen(true)}
                className="group relative block w-full rounded-card border border-line bg-white p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-600"
              >
                <img
                  src={data.recipient.qrImageUrl}
                  alt={
                    isDemoDirectQr(data.recipient.qrImageUrl)
                      ? `QR de demostración de ${name}`
                      : `QR de ${name} del taller`
                  }
                  className="aspect-square w-full object-contain"
                />
                <span className="absolute bottom-2 right-2 grid size-7 place-items-center rounded-card border border-line bg-white text-brand-700">
                  <Expand className="size-3.5" aria-hidden="true" />
                </span>
              </button>
              {isDemoDirectQr(data.recipient.qrImageUrl) && (
                <p className="mt-2 text-center text-xs leading-5 text-amber-800">
                  QR de demostración. Para pagar, usa el número {data.recipient.phone}.
                </p>
              )}
            </div>
          )}
        </div>
      )}
      {!readOnly && canReport && (
        <div className="border-t border-line pt-4">
          <h3 className="text-sm font-bold text-ink">
            2. {state === 'OBSERVED' ? 'Corrige tu reporte' : 'Reporta tu pago'}
          </h3>
          <p className="mt-1 text-xs leading-5 text-ink-muted">
            Completa estos datos después de transferir. El taller verificará el movimiento recibido.
          </p>
        </div>
      )}
      {!readOnly && canReport && !formOpen && (
        <Button
          className="sm:justify-self-start"
          leftIcon={<CheckCircle2 className="size-4" />}
          onClick={() => {
            setFormOpen(true);
            setPaidAt(limaDateTime(data.claim?.paidAt));
            window.requestAnimationFrame(() => {
              const form = document.getElementById(`direct-payment-report-${paymentId}`);
              form?.scrollIntoView({
                behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
                  ? 'auto'
                  : 'smooth',
                block: 'start',
              });
              form?.querySelector<HTMLInputElement>('input')?.focus({ preventScroll: true });
            });
          }}
        >
          {data.state === 'OBSERVED' ? 'Corregir reporte' : 'Ya pagué · reportar pago'}
        </Button>
      )}
      {!readOnly && canReport && formOpen && (
        <form
          id={`direct-payment-report-${paymentId}`}
          aria-label="Reporte de transferencia"
          onSubmit={submit}
          className="grid min-w-0 scroll-mt-28 gap-4"
        >
          <FormGrid>
            <Input
              label="Referencia o código de operación"
              value={operationCode}
              onChange={(event) => setOperationCode(event.target.value)}
              maxLength={24}
              hint="Lo encuentras en el detalle de tu operación."
              required
            />
            <Input
              label="Nombre de quien pagó"
              value={payerName}
              onChange={(event) => setPayerName(event.target.value)}
              maxLength={120}
              autoComplete="name"
              required
            />
          </FormGrid>
          <FormGrid>
            <Input
              label="Fecha y hora del pago (Perú)"
              type="datetime-local"
              value={paidAt}
              onChange={(event) => setPaidAt(event.target.value)}
              required
            />
            <Input
              label="Importe transferido"
              type="number"
              min="0.01"
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              required
            />
          </FormGrid>
          {amountMismatch && (
            <Alert variant="warning">
              El importe ingresado es distinto de {formatCurrency(data.amount)}. Reporta el monto
              que realmente transferiste; el taller revisará la diferencia.
            </Alert>
          )}
          <FormGrid>
            <Input
              label="Celular de quien pagó (opcional)"
              inputMode="numeric"
              maxLength={9}
              value={payerPhone}
              onChange={(event) => setPayerPhone(event.target.value.replace(/\D/g, ''))}
            />
            <label className="flex min-h-14 min-w-0 cursor-pointer items-center gap-3 rounded-card border border-dashed border-line bg-surface-muted/40 px-3 py-2 focus-within:outline focus-within:outline-2 focus-within:outline-brand-600">
              <Upload className="size-4 shrink-0 text-brand-700" aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-ink">
                  Constancia del pago (opcional)
                </span>
                <span className="mt-0.5 block text-[11px] text-ink-muted">
                  JPG, PNG o WebP · hasta 10 MB
                </span>
              </span>
              <input
                type="file"
                aria-label="Constancia del pago (opcional)"
                className="sr-only"
                accept="image/png,image/jpeg,image/webp"
                disabled={sending || preparingFile}
                onChange={async (event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  setPreparingFile(true);
                  setFormError('');
                  try {
                    setEvidence(await prepareEvidence(file));
                    setFileName(file.name);
                  } catch (error) {
                    setEvidence('');
                    setFileName('');
                    setFormError((error as Error).message);
                  } finally {
                    setPreparingFile(false);
                    event.target.value = '';
                  }
                }}
              />
            </label>
          </FormGrid>
          {preparingFile && (
            <p role="status" className="text-xs text-ink-muted">
              Preparando constancia…
            </p>
          )}
          {fileName && evidence && (
            <div className="flex min-w-0 items-center gap-3 rounded-card border border-line p-3">
              <img
                src={evidence}
                alt="Vista previa de la constancia adjunta"
                className="size-14 shrink-0 rounded-card bg-surface-muted object-contain"
              />
              <p className="min-w-0 flex-1 truncate text-xs text-ink-muted">{fileName}</p>
              <Button
                variant="ghost"
                size="sm"
                disabled={sending}
                onClick={() => {
                  setEvidence('');
                  setFileName('');
                }}
              >
                Quitar adjunto
              </Button>
            </div>
          )}
          {formError && <Alert variant="danger">{formError}</Alert>}
          <div className="flex flex-col-reverse gap-2 border-t border-line pt-4 sm:flex-row sm:justify-end">
            <Button
              variant="ghost"
              type="button"
              disabled={sending || preparingFile}
              onClick={() => setFormOpen(false)}
            >
              Cancelar edición
            </Button>
            <Button
              type="submit"
              sx={{ whiteSpace: 'normal' }}
              isLoading={sending || preparingFile}
            >
              Enviar reporte para verificar
            </Button>
          </div>
        </form>
      )}
      {data.claim && (
        <div className="grid min-w-0 gap-2 rounded-card border border-line bg-surface-muted/40 p-4">
          <h3 className="text-xs font-bold text-ink">Reporte de la transferencia</h3>
          <p className="text-xs leading-5 text-ink-muted">
            Operación {data.claim.operationCode} · {data.claim.payerName} · Reportado:{' '}
            {formatDate(data.claim.submittedAt)}
            {data.claim.declaredAmount !== data.amount
              ? ` · Importe reportado: ${formatCurrency(data.claim.declaredAmount)}`
              : ''}
          </p>
          <p className="text-xs leading-5 text-ink-muted">
            Fecha del pago declarada:{' '}
            {data.claim.paidAt ? formatDate(data.claim.paidAt) : 'Sin fecha'}
            {data.claim.payerPhone ? ` · Celular: ${data.claim.payerPhone}` : ''}
          </p>
        </div>
      )}
      {!readOnly &&
        ['EXPIRED', 'REJECTED', 'REFUND_PENDING'].includes(state) &&
        whatsappLink(business.whatsappPhone ?? business.phone, '') && (
          <Button
            component="a"
            href={
              whatsappLink(
                business.whatsappPhone ?? business.phone,
                `Hola, necesito ayuda con el pago ${name} del pedido ${data.orderNumber}.`,
              ) ?? undefined
            }
            target="_blank"
            rel="noopener noreferrer"
            variant="outline"
          >
            Consultar al taller
          </Button>
        )}
      <details className="border-t border-line pt-3">
        <summary className="min-h-8 cursor-pointer content-center text-xs font-semibold text-brand-800">
          Historial del pago ({data.history.length})
        </summary>
        <ol className="mt-3 grid gap-3">
          {data.history.map((event) => (
            <li key={event.id} className="border-l-2 border-brand-100 pl-3 text-xs">
              <p className="font-bold text-ink">{HISTORY_LABELS[event.kind] ?? event.kind}</p>
              <p className="mt-0.5 text-ink-muted">
                {formatDate(event.createdAt)}
                {readOnly && event.actorName ? ` · ${event.actorName}` : ''}
              </p>
              {typeof event.details?.reason === 'string' && (
                <p className="mt-1 text-ink-muted">{event.details.reason}</p>
              )}
              {typeof event.details?.operationCode === 'string' && (
                <p className="mt-1 text-ink-muted">
                  Operación: {event.details.operationCode}
                  {typeof event.details.payerName === 'string'
                    ? ` · ${event.details.payerName}`
                    : ''}
                </p>
              )}
              {typeof event.details?.declaredAmount === 'number' && (
                <p className="text-ink-muted">
                  Importe reportado: {formatCurrency(event.details.declaredAmount)}
                </p>
              )}
              {event.kind === 'REFUND_RECORDED' && typeof event.details?.reference === 'string' && (
                <p className="mt-1 text-ink-muted">
                  Referencia de devolución: {event.details.reference}
                  {typeof event.details.amount === 'number'
                    ? ` · ${formatCurrency(event.details.amount)}`
                    : ''}
                </p>
              )}
              {event.hasEvidence && (
                <DirectPaymentEvidenceButton paymentId={paymentId} eventId={event.id} />
              )}
            </li>
          ))}
        </ol>
      </details>
      <Button
        variant="ghost"
        size="sm"
        className="justify-self-end"
        leftIcon={<RefreshCw className="size-3.5" />}
        isLoading={refreshing}
        onClick={async () => {
          setRefreshing(true);
          await refresh();
          setRefreshing(false);
        }}
      >
        Actualizar pago
      </Button>
      <Modal
        isOpen={qrOpen && showRecipient}
        onClose={() => setQrOpen(false)}
        title={`QR de ${name}`}
        description={
          demoQr
            ? `QR de demostración. Para pagar, usa el número ${data.recipient.phone}.`
            : `Verifica que el destinatario sea ${data.recipient.recipient}.`
        }
        maxWidth="sm"
        actions={
          <Button variant="outline" onClick={() => setQrOpen(false)}>
            Cerrar QR
          </Button>
        }
      >
        <img
          src={data.recipient.qrImageUrl}
          alt={demoQr ? `QR de demostración de ${name} ampliado` : `QR de ${name} ampliado`}
          className="mx-auto aspect-square w-full max-w-80 rounded-card border border-line bg-white p-4 object-contain"
        />
      </Modal>
    </Card>
  );
};
