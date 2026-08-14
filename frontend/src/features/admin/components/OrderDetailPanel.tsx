import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { CalendarClock, ChefHat, CreditCard, FileCheck2, Phone, ReceiptText, Store, Undo2 } from 'lucide-react';
import toast from '@components/mui/MuiToast';
import { Badge } from '@components/ui/Badge';
import { Button } from '@components/ui/Button';
import { Drawer } from '@components/ui/Drawer';
import { Input } from '@components/ui/Input';
import { Spinner } from '@components/ui/Spinner';
import { useConfirm } from '@components/ui/ConfirmDialog';
import { LoadError } from '@components/common/LoadError';
import { OrderStatusBadge } from '@features/orders/components/OrderStatusBadge';
import { getApiErrorMessage } from '@services/api/client';
import { formatCurrency, formatDate } from '@lib/format';
import { usePermissions } from '@hooks/usePermissions';
import { PERM } from '@constants/permissions';
import { adminApi } from '../services/admin.service';
import { KitchenStatusBadge } from './StatusBadges';
import { DeliveryDestination } from './DeliveryDestination';
import { OrderReceiptModal } from './OrderReceiptModal';
import type { AdminOrderDetail, AdminOrderPayment } from '../types';

interface OrderDetailPanelProps {
  /** Numero del pedido a mostrar. `null` cierra el panel. */
  orderNumber: string | null;
  onClose: () => void;
  /** Se llama cuando la ficha cambia algo del pedido (un reembolso). */
  onChanged?: () => void;
}

const PAYMENT_STATUS_LABEL: Record<string, string> = {
  CREATED: 'Iniciado',
  PENDING: 'Pendiente',
  SUCCEEDED: 'Cobrado',
  FAILED: 'Rechazado',
  REFUNDED: 'Devuelto',
};

const REFUND_STATUS_LABEL: Record<string, string> = {
  PENDING: 'En curso',
  SUCCEEDED: 'Devuelto',
  FAILED: 'Fallido',
};

/** Lo que queda por devolver de un cobro: lo cobrado menos lo ya comprometido. */
const remainingToRefund = (payment: AdminOrderPayment): number => {
  const committed = payment.refunds
    .filter((refund) => refund.status !== 'FAILED')
    .reduce((total, refund) => total + Number(refund.amount), 0);
  return Math.round((Number(payment.amount) - committed) * 100) / 100;
};

/**
 * FICHA DEL PEDIDO
 * ---------------------------------------------------------------------------
 * Soporte atendia al cliente POR TELEFONO sin ver ni una personalizacion, ni el
 * historial de estados, ni el pago: solo la fila del tablero. El telefono, la
 * direccion y las notas ya viajaban en la respuesta de `/admin/orders` sin que
 * nadie los pintara; el resto lo trae `GET /admin/orders/:n`.
 *
 * Tambien es el unico sitio del producto donde `payment.refund` tiene interfaz:
 * el endpoint existia y no lo llamaba nadie.
 */
export const OrderDetailPanel = ({ orderNumber, onClose, onChanged }: OrderDetailPanelProps) => {
  const { can } = usePermissions();
  const confirm = useConfirm();

  const [detail, setDetail] = useState<AdminOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refundingId, setRefundingId] = useState<number | null>(null);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [showExternalFiscal, setShowExternalFiscal] = useState(false);
  const [amounts, setAmounts] = useState<Record<number, string>>({});
  const [invoiceForm, setInvoiceForm] = useState({ series: '', number: '', providerReference: '', pdfUrl: '', xmlUrl: '' });
  const [isRegisteringInvoice, setIsRegisteringInvoice] = useState(false);
  // Token de secuencia: abrir un pedido y cambiar a otro deja la primera peticion
  // en vuelo, y ganaba la ultima en RESOLVER, no la ultima pedida.
  const requestId = useRef(0);

  const load = useCallback(async () => {
    if (!orderNumber) return;
    const id = ++requestId.current;
    setIsLoading(true);
    try {
      const data = await adminApi.orderDetail(orderNumber);
      if (id !== requestId.current) return;
      setDetail(data);
      setError(null);
    } catch (fetchError) {
      if (id !== requestId.current) return;
      setDetail(null);
      setError(getApiErrorMessage(fetchError));
    } finally {
      if (id === requestId.current) setIsLoading(false);
    }
  }, [orderNumber]);

  useEffect(() => {
    // Al cambiar de pedido se limpia lo anterior: sin esto el panel muestra la
    // ficha del pedido previo mientras carga la nueva, con sus botones activos.
    setDetail(null);
    setError(null);
    setAmounts({});
    setInvoiceForm({ series: '', number: '', providerReference: '', pdfUrl: '', xmlUrl: '' });
    setShowExternalFiscal(false);
    if (!orderNumber) setReceiptOpen(false);
    void load();
  }, [load, orderNumber]);

  const handleRefund = async (payment: AdminOrderPayment) => {
    const remaining = remainingToRefund(payment);
    const raw = amounts[payment.id] ?? remaining.toFixed(2);
    const amount = Math.round(Number(raw.replace(',', '.')) * 100) / 100;

    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Escribe cuanto vas a devolver');
      return;
    }
    if (amount > remaining) {
      toast.error(`Solo quedan ${formatCurrency(remaining)} por devolver de este cobro`);
      return;
    }

    const { confirmed, reason } = await confirm({
      title: `Devolver ${formatCurrency(amount)}`,
      message:
        'El dinero sale de verdad hacia el medio de pago del cliente y la operacion no se deshace desde el panel.',
      confirmLabel: 'Devolver el dinero',
      tone: 'danger',
      reasonLabel: 'Motivo de la devolucion',
      reasonRequired: true,
    });
    if (!confirmed) return;

    setRefundingId(payment.id);
    try {
      await adminApi.refundPayment(payment.id, { amount, reason });
      toast.success('Devolucion registrada');
      await load();
      onChanged?.();
    } catch (refundError) {
      toast.error(getApiErrorMessage(refundError));
    } finally {
      setRefundingId(null);
    }
  };

  const handleRegisterInvoice = async () => {
    if (!detail) return;
    if (!invoiceForm.series.trim() || !invoiceForm.number.trim()) {
      toast.error('Completa la serie y el correlativo entregados por tu proveedor');
      return;
    }
    const answer = await confirm({
      title: 'Registrar comprobante emitido',
      message: `Se guardará ${invoiceForm.series.toUpperCase()}-${invoiceForm.number}. Hazlo solo después de que tu OSE o integrador confirme la emisión.`,
      confirmLabel: 'Registrar emisión',
      tone: 'default',
    });
    if (!answer.confirmed) return;

    setIsRegisteringInvoice(true);
    try {
      await adminApi.registerInvoice(detail.orderNumber, {
        series: invoiceForm.series,
        number: invoiceForm.number,
        providerReference: invoiceForm.providerReference || undefined,
        pdfUrl: invoiceForm.pdfUrl || undefined,
        xmlUrl: invoiceForm.xmlUrl || undefined,
      });
      toast.success('Comprobante emitido registrado');
      await load();
      onChanged?.();
    } catch (invoiceError) {
      toast.error(getApiErrorMessage(invoiceError));
    } finally {
      setIsRegisteringInvoice(false);
    }
  };

  const address = detail?.addressSnapshotJson ?? null;
  const scheduledReleaseAt = detail?.scheduledAt
    ? new Date(new Date(detail.scheduledAt).getTime() - (detail.branch?.prepMinutes ?? 20) * 60_000)
    : null;

  return (
    <>
    <Drawer
      isOpen={orderNumber !== null}
      onClose={onClose}
      title={orderNumber ?? 'Pedido'}
      description={detail ? `Recibido el ${formatDate(detail.placedAt)}` : undefined}
    >
      {isLoading && !detail && (
        <div className="grid place-items-center py-16">
          <Spinner />
        </div>
      )}

      {!isLoading && error && <LoadError message={error} onRetry={() => void load()} />}

      {detail && (
        <div className="grid gap-6">
          <section className="flex flex-wrap items-center gap-2">
            <OrderStatusBadge status={detail.status} />
            {detail.kitchenTicket && <KitchenStatusBadge status={detail.kitchenTicket.status} />}
            <Badge variant="outline">
              {detail.deliveryType === 'DELIVERY' ? 'Delivery' : detail.deliveryType === 'DINE_IN' ? 'Consumo en salón' : 'Recojo en tienda'}
            </Badge>
            {detail.serviceMode === 'SCHEDULED' && detail.scheduledAt && (
              <Badge variant="accent">Programado {formatDate(detail.scheduledAt)}</Badge>
            )}
            <Button className="ml-auto" size="sm" variant="outline" leftIcon={<ReceiptText className="size-4" />} onClick={() => setReceiptOpen(true)}>
              Ver ticket interno
            </Button>
          </section>

          <section className="flex items-start gap-3 rounded-card border border-accent-200 bg-accent-50 p-4">
            <span className="grid size-11 shrink-0 place-items-center rounded-card bg-accent-100 text-accent-700">
              {detail.kitchenTicket ? <ChefHat className="size-5" /> : <CalendarClock className="size-5" />}
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-wide text-accent-700">Estado operativo de Cocina</p>
              <p className="mt-1 font-extrabold text-ink">
                {detail.kitchenTicket
                  ? `Comanda ${detail.kitchenTicket.status}`
                  : detail.serviceMode === 'SCHEDULED'
                    ? 'Pedido programado confirmado'
                    : 'Aún sin comanda activa'}
              </p>
              <p className="mt-1 text-sm leading-5 text-ink-muted">
                {detail.kitchenTicket
                  ? 'La cocina ya puede gestionar este pedido desde su tablero.'
                  : detail.serviceMode === 'SCHEDULED' && detail.scheduledAt
                    ? `Ya aparece en Programados. Entrará automáticamente a En cola ${scheduledReleaseAt ? formatDate(scheduledReleaseAt) : 'cuando comience su margen de preparación'} para entregarse ${formatDate(detail.scheduledAt)}.`
                    : detail.status === 'CONFIRMED'
                      ? 'El pago está confirmado y la comanda debe aparecer en la cola activa de Cocina.'
                      : 'La comanda se creará cuando el pedido quede confirmado para producción.'}
              </p>
            </div>
          </section>

          {detail.receiptMode === 'INTERNAL_ONLY' && (
            <section className="rounded-card border border-brand-200 bg-brand-50 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wide text-brand-700">Ticket interno disponible</p>
                  <p className="mt-1 font-extrabold text-ink">Pedido {detail.orderNumber}</p>
                  <p className="mt-1 text-xs leading-5 text-ink-muted">Resumen operativo para la entrega. No es un comprobante de pago y no usa serie ni correlativo SUNAT.</p>
                </div>
                <Badge variant="brand">No fiscal</Badge>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-brand-200 pt-3">
                <Button size="sm" leftIcon={<ReceiptText className="size-4" />} onClick={() => setReceiptOpen(true)}>{detail.internalReceiptPrintCount > 0 ? 'Reimprimir ticket' : 'Ver e imprimir ticket'}</Button>
                {can(PERM.INVOICE_MANAGE) && <Button size="sm" variant="ghost" onClick={() => setShowExternalFiscal((value) => !value)}>{showExternalFiscal ? 'Ocultar contingencia fiscal' : 'Registrar CPE externo'}</Button>}
                <span className="text-xs text-ink-muted">{detail.internalReceiptPrintCount ? `${detail.internalReceiptPrintCount} impresion${detail.internalReceiptPrintCount === 1 ? '' : 'es'} registrada${detail.internalReceiptPrintCount === 1 ? '' : 's'}` : 'Todavia no impreso'}</span>
              </div>
            </section>
          )}

          {(detail.receiptMode !== 'INTERNAL_ONLY' || showExternalFiscal) && <section className="rounded-card border border-line bg-gradient-to-r from-surface-muted to-white p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Contingencia fiscal externa</p>
                <p className="mt-1 font-bold text-ink">{detail.documentType === 'FACTURA' ? 'Factura electrónica' : 'Boleta de venta electrónica'}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{detail.billingName || detail.contactName || 'Consumidor final'}{detail.billingDocNumber ? ` · ${detail.billingDocType} ${detail.billingDocNumber}` : ''}</p>
              </div>
              <Badge variant={detail.invoiceStatus === 'ISSUED' ? 'success' : detail.invoiceStatus === 'FAILED' ? 'danger' : 'accent'}>
                {detail.invoiceStatus === 'ISSUED' ? 'Emitido' : detail.invoiceStatus === 'FAILED' ? 'Falló la emisión' : detail.invoiceStatus === 'VOIDED' ? 'Anulado' : 'Pendiente de emisión'}
              </Badge>
            </div>
            {detail.invoiceStatus === 'ISSUED' ? (
              <div className="mt-3 border-t border-line pt-3 text-sm">
                <p className="font-extrabold text-ink">{detail.invoiceSeries}-{detail.invoiceNumber}</p>
                <p className="mt-1 text-xs text-ink-muted">Emitido {detail.invoiceIssuedAt ? formatDate(detail.invoiceIssuedAt) : ''}{detail.invoiceProviderReference ? ` · Ref. ${detail.invoiceProviderReference}` : ''}</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  {detail.invoicePdfUrl && <a className="text-xs font-bold text-brand-700 underline" href={detail.invoicePdfUrl} target="_blank" rel="noreferrer">Abrir PDF</a>}
                  {detail.invoiceXmlUrl && <a className="text-xs font-bold text-brand-700 underline" href={detail.invoiceXmlUrl} target="_blank" rel="noreferrer">Abrir XML</a>}
                </div>
              </div>
            ) : (
              <>
                <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-ink-muted">La vista imprimible es solo una previsualización. Registra la serie y correlativo únicamente después de emitir el CPE con tu OSE o integrador SUNAT.</p>
                {can(PERM.INVOICE_MANAGE) && !['PENDING_PAYMENT', 'CANCELLED', 'REFUNDED'].includes(detail.status) && (
                  <div className="mt-4 grid gap-3 rounded-card border border-brand-200 bg-brand-50/60 p-3 sm:grid-cols-2">
                    <Input label="Serie" placeholder={detail.documentType === 'FACTURA' ? 'F001' : 'B001'} value={invoiceForm.series} onChange={(event) => setInvoiceForm((current) => ({ ...current, series: event.target.value.toUpperCase() }))} />
                    <Input label="Correlativo" placeholder="00001234" inputMode="numeric" value={invoiceForm.number} onChange={(event) => setInvoiceForm((current) => ({ ...current, number: event.target.value.replace(/\D/g, '').slice(0, 8) }))} />
                    <Input label="Referencia OSE (opcional)" value={invoiceForm.providerReference} onChange={(event) => setInvoiceForm((current) => ({ ...current, providerReference: event.target.value }))} />
                    <Input label="URL del PDF (opcional)" value={invoiceForm.pdfUrl} onChange={(event) => setInvoiceForm((current) => ({ ...current, pdfUrl: event.target.value }))} />
                    <Input className="sm:col-span-2" label="URL del XML (opcional)" value={invoiceForm.xmlUrl} onChange={(event) => setInvoiceForm((current) => ({ ...current, xmlUrl: event.target.value }))} />
                    <Button className="sm:col-span-2" size="sm" leftIcon={<FileCheck2 className="size-4" />} isLoading={isRegisteringInvoice} onClick={() => void handleRegisterInvoice()}>Registrar constancia emitida</Button>
                  </div>
                )}
              </>
            )}
          </section>}

          {detail.cancelReason && (
            <p className="rounded-card border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              Motivo de la cancelacion: {detail.cancelReason}
            </p>
          )}

          {/* --- Contacto: lo primero que necesita quien atiende la llamada --- */}
          <section>
            <SectionTitle>Contacto y entrega</SectionTitle>
            <div className="grid gap-2.5 text-sm">
              <p className="flex items-center gap-2 rounded-field border border-line bg-surface-muted px-3 py-2 text-ink">
                <Store className="size-4 shrink-0 text-brand-700" />
                <span>
                  <span className="text-xs text-ink-muted">Sale de</span>{' '}
                  <strong>{detail.branch?.name ?? 'Sucursal no disponible'}</strong>
                </span>
              </p>
              <p className="font-medium text-ink">{detail.contactName ?? 'Sin nombre'}</p>
              {detail.contactPhone && (
                // `tel:` con area de toque de 44px: se atiende desde una tablet y
                // copiar el numero a mano era un paso mas en mitad de la llamada.
                <a
                  href={`tel:${detail.contactPhone.replace(/\s/g, '')}`}
                  className="inline-flex min-h-11 w-fit items-center gap-2 rounded-field border border-line px-3 font-medium text-brand-700 hover:border-brand-300"
                >
                  <Phone className="size-4" /> {detail.contactPhone}
                </a>
              )}
              {detail.deliveryType === 'DELIVERY' ? (
                <DeliveryDestination address={address} notes={detail.notes} />
              ) : detail.deliveryType === 'DINE_IN' ? (
                <div className="rounded-card border border-brand-200 bg-brand-50 p-3">
                  <p className="font-bold text-brand-900">{detail.diningTable?.code ?? 'Mesa del salón'}</p>
                  <p className="mt-1 text-xs text-brand-800">{detail.diningTable?.area ?? 'Área no especificada'} · comanda tomada dentro del local</p>
                  {detail.notes && <p className="mt-2 border-t border-brand-200 pt-2 text-sm text-brand-900">Nota: {detail.notes}</p>}
                </div>
              ) : detail.notes ? (
                <p className="rounded-card bg-amber-50 px-3 py-2 text-sm text-amber-900">
                  Nota del cliente: {detail.notes}
                </p>
              ) : null}
            </div>
          </section>

          {/* --- Lineas con su personalizacion completa --- */}
          <section>
            <SectionTitle>Platos ({detail.detailItems.length})</SectionTitle>
            <ul className="grid gap-3">
              {detail.detailItems.map((item) => (
                <li key={item.id} className="rounded-card border border-line p-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="font-medium text-ink">
                      {item.quantity}x {item.productNameSnapshot}
                      {item.variantNameSnapshot ? ` · ${item.variantNameSnapshot}` : ''}
                    </p>
                    <span className="shrink-0 text-sm font-medium">
                      {formatCurrency(item.lineTotal)}
                    </span>
                  </div>

                  {item.customizations.length > 0 && (
                    <ul className="mt-2 grid gap-0.5 text-sm text-ink-muted">
                      {item.customizations.map((customization, index) => (
                        <li key={`${item.id}-${index}`}>
                          {customization.group}: {customization.option}
                          {customization.quantity > 1 ? ` x${customization.quantity}` : ''}
                          {customization.priceDelta > 0
                            ? ` (+${formatCurrency(customization.priceDelta)})`
                            : ''}
                        </li>
                      ))}
                    </ul>
                  )}

                  {item.allergens.length > 0 && (
                    <p className="mt-2 flex flex-wrap gap-1">
                      {item.allergens.map((allergen) => (
                        <Badge key={allergen} variant="danger">
                          {allergen}
                        </Badge>
                      ))}
                    </p>
                  )}

                  {item.specialInstructions && (
                    <p className="mt-2 text-sm text-ink">
                      Indicaciones: {item.specialInstructions}
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {/* --- Importes --- */}
          <section>
            <SectionTitle>Importes</SectionTitle>
            <dl className="grid gap-1.5 text-sm">
              <Amount label="Subtotal" value={detail.subtotal} />
              {detail.deliveryFee > 0 && <Amount label="Delivery" value={detail.deliveryFee} />}
              {detail.discountTotal > 0 && (
                <Amount label="Descuentos" value={-detail.discountTotal} />
              )}
              {detail.walletAmount > 0 && (
                <Amount label="Pagado con saldo" value={-detail.walletAmount} />
              )}
              <Amount label="Total" value={detail.grandTotal} strong />
              {detail.taxTotal > 0 && (
                <p className="text-xs text-ink-muted">
                  Incluye IGV {formatCurrency(detail.taxTotal)}
                </p>
              )}
            </dl>
          </section>

          {/* --- Pago y devoluciones --- */}
          <section>
            <SectionTitle>Pago</SectionTitle>
            {detail.payments.length === 0 ? (
              <p className="text-sm text-ink-muted">
                {can(PERM.PAYMENT_READ) || can(PERM.PAYMENT_REFUND)
                  ? 'Este pedido no tiene ningun cobro registrado.'
                  : 'Tu rol no incluye el permiso para ver los cobros.'}
              </p>
            ) : (
              <ul className="grid gap-3">
                {detail.payments.map((payment) => {
                  const remaining = remainingToRefund(payment);
                  const canRefund =
                    can(PERM.PAYMENT_REFUND) && payment.status === 'SUCCEEDED' && remaining > 0;

                  return (
                    <li key={payment.id} className="rounded-card border border-line p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="inline-flex items-center gap-2 text-sm font-medium text-ink">
                          <CreditCard className="size-4" />
                          {payment.provider}
                          {payment.method ? ` · ${payment.method}` : ''}
                        </p>
                        <Badge
                          variant={
                            payment.status === 'SUCCEEDED'
                              ? 'success'
                              : payment.status === 'FAILED'
                                ? 'danger'
                                : 'neutral'
                          }
                        >
                          {PAYMENT_STATUS_LABEL[payment.status] ?? payment.status}
                        </Badge>
                      </div>

                      <p className="mt-1 text-sm text-ink-muted">
                        {formatCurrency(payment.amount)} · {formatDate(payment.createdAt)}
                      </p>
                      {payment.failureReason && (
                        <p className="mt-1 text-sm text-red-700">{payment.failureReason}</p>
                      )}

                      {payment.refunds.length > 0 && (
                        <ul className="mt-2 grid gap-1 border-t border-line pt-2 text-sm text-ink-muted">
                          {payment.refunds.map((refund) => (
                            <li key={refund.id}>
                              {formatCurrency(refund.amount)} ·{' '}
                              {REFUND_STATUS_LABEL[refund.status] ?? refund.status} ·{' '}
                              {refund.reason}
                            </li>
                          ))}
                        </ul>
                      )}

                      {canRefund && (
                        <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-line pt-3">
                          {/* El importe es OBLIGATORIO en el esquema del servidor:
                              no hay reembolso "total" implicito. Se precarga con lo
                              que queda para que el caso normal sea un solo toque. */}
                          <div className="w-32">
                            <Input
                              label="Importe"
                              inputMode="decimal"
                              value={amounts[payment.id] ?? remaining.toFixed(2)}
                              onChange={(event) =>
                                setAmounts((current) => ({
                                  ...current,
                                  [payment.id]: event.target.value,
                                }))
                              }
                            />
                          </div>
                          <Button
                            variant="danger"
                            leftIcon={<Undo2 className="size-4" />}
                            isLoading={refundingId === payment.id}
                            onClick={() => void handleRefund(payment)}
                          >
                            Devolver
                          </Button>
                          <p className="w-full text-xs text-ink-muted">
                            Quedan {formatCurrency(remaining)} por devolver de este cobro.
                          </p>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {/* --- Historial: quien lo movio, cuando y por que --- */}
          <section>
            <SectionTitle>Historial</SectionTitle>
            <ol className="grid gap-2 text-sm">
              {detail.statusHistory.map((entry) => (
                <li key={entry.id} className="border-l-2 border-line pl-3">
                  <p className="text-ink">
                    {entry.fromStatus ? `${entry.fromStatus} → ` : ''}
                    {entry.toStatus}
                  </p>
                  <p className="text-xs text-ink-muted">
                    {formatDate(entry.createdAt)} · {entry.source}
                    {entry.comment ? ` · ${entry.comment}` : ''}
                  </p>
                </li>
              ))}
              {detail.statusHistory.length === 0 && (
                <li className="text-ink-muted">Sin cambios de estado registrados.</li>
              )}
            </ol>
          </section>
        </div>
      )}
    </Drawer>
    <OrderReceiptModal order={detail} isOpen={receiptOpen && detail !== null} onClose={() => setReceiptOpen(false)} onPrinted={() => void load()} />
    </>
  );
};

const SectionTitle = ({ children }: { children: ReactNode }) => (
  <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">{children}</h3>
);

const Amount = ({ label, value, strong }: { label: string; value: number; strong?: boolean }) => (
  <div className="flex items-baseline justify-between gap-3">
    <dt className={strong ? 'font-semibold text-ink' : 'text-ink-muted'}>{label}</dt>
    <dd className={strong ? 'font-bold text-ink' : 'text-ink'}>{formatCurrency(value)}</dd>
  </div>
);
